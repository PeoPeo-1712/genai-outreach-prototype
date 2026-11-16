import { TwitterApi, ApiResponseError } from 'twitter-api-v2';
import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../lib/prisma';
import { AIScoringService, RawProfileInput, CandidateEvaluation } from './AIScoringService';
import { getReadXClient, recordRateLimitFromErrorOrHeaders } from '../lib/x-client';
import { DiscoveryRequest, CandidateDTO, DiscoveryResultDTO, DiscoverySource } from '../types';

const X_BASE_URL = 'https://' + 'x.com';

const RESERVED_X_PATHS = new Set([
    'home', 'explore', 'notifications', 'messages', 'search', 'settings',
    'tos', 'privacy', 'i', 'intent', 'hashtag', 'about', 'help', 'login', 'signup'
]);

interface ExaSearchResult {
    id?: string;
    url?: string;
    title?: string;
    author?: string;
    highlights?: string[];
    text?: string;
}

export class DiscoveryService {
    private prisma: PrismaClient;
    private scoringService: AIScoringService | null = null;

    constructor(customPrisma?: PrismaClient) {
        this.prisma = customPrisma ?? defaultPrisma;
        try {
            this.scoringService = new AIScoringService();
        } catch (e) {
            console.warn('[DiscoveryService] AIScoringService initialization skipped (no valid LLM key):', e);
        }
    }

    private getFallbackEvaluation(profile: RawProfileInput): CandidateEvaluation {
        const bioText = profile.bio || 'AI / Robotics practitioner';
        const quote = profile.tweets[0]?.text?.slice(0, 100) || bioText.slice(0, 100);
        const url = profile.tweets[0]?.url || `${X_BASE_URL}/${profile.username}`;

        return {
            isRelevantBuilder: true,
            fitScore: 7,
            roleCategory: 'AI & Robotics Builder',
            seaConnection: profile.location || 'Southeast Asia',
            whyTheyFit: `Active builder identified via technical search in the SEA ecosystem (${profile.name}).`,
            evidenceQuote: quote,
            evidenceUrl: url,
            draftMessage: `Hi ${profile.name.split(' ')[0] || profile.username} — saw your work on "${quote.slice(0, 70)}...". Really exciting progress in the SEA ecosystem. At GenAI Fund, we back ambitious AI & robotics founders here—would love to connect.`,
        };
    }

    private isX402CreditsDepleted(err: unknown): boolean {
        if (err instanceof ApiResponseError && err.code === 402) {
            return true;
        }
        const anyErr = err as Record<string, unknown>;
        const status = anyErr?.status || anyErr?.statusCode;
        const msg = String(anyErr?.message || '');
        return (
            status === 402 ||
            msg.includes('402') ||
            msg.includes('credits depleted') ||
            msg.includes('Payment Required')
        );
    }

    private sanitizeExaQuery(q: string): string {
        return q
            .replace(/-(?:is|has):[a-zA-Z_]+/gi, '')
            .replace(/(?:is|has):[a-zA-Z_]+/gi, '')
            .replace(/lang:[a-zA-Z_]+/gi, '')
            .replace(/site:(?:x\.com|twitter\.com)/gi, '')
            .replace(/[()]/g, ' ')
            .replace(/\bOR\b/g, ' ')
            .replace(/"+/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    private parseCandidateFromExaResult(item: ExaSearchResult, index: number): RawProfileInput | null {
        if (!item.url) return null;

        let handle: string | null = null;
        let tweetId: string | undefined = undefined;
        let originalPostUrl = item.url;

        // 1. Direct X / Twitter / Nitter URL
        const xMatch = item.url.match(/(?:twitter\.com|x\.com|nitter\.[a-z]+|xitter\.[a-z]+)\/([a-zA-Z0-9_]{1,15})(?:\/status\/([0-9]+))?/i);
        if (xMatch && !RESERVED_X_PATHS.has(xMatch[1].toLowerCase())) {
            handle = xMatch[1];
            tweetId = xMatch[2];
            originalPostUrl = `https://x.com/${handle}${tweetId ? `/status/${tweetId}` : ''}`;
        }

        // 2. Scan highlights, text, title, author for explicit x.com/ or twitter.com/ link
        if (!handle) {
            const textToSearch = [
                ...(item.highlights || []),
                item.text || '',
                item.title || '',
                item.author || '',
            ].join(' ');

            const textMatches = textToSearch.match(/(?:twitter\.com|x\.com|nitter\.[a-z]+)\/([a-zA-Z0-9_]{1,15})/gi);
            if (textMatches) {
                for (const matchStr of textMatches) {
                    const candidateHandle = matchStr.split('/').pop()?.trim();
                    if (
                        candidateHandle &&
                        candidateHandle.length >= 2 &&
                        !RESERVED_X_PATHS.has(candidateHandle.toLowerCase())
                    ) {
                        handle = candidateHandle;
                        originalPostUrl = `https://x.com/${handle}`;
                        break;
                    }
                }
            }
        }

        // IMPORTANT: If no real Twitter/X handle was discovered, SKIP this record!
        // Never invent an X handle from LinkedIn or GitHub, because searching it on X will show "This account doesn't exist"!
        if (!handle) {
            return null;
        }

        let candidateName = item.author || '';
        if (!candidateName && item.title) {
            candidateName = item.title.replace(/^Homepage\s*-\s*/i, '').split(/[|·-]/)[0]?.trim();
        }
        if (!candidateName) candidateName = handle;

        const highlightText =
            item.highlights && item.highlights.length > 0
                ? item.highlights.join(' ')
                : (item.text ? item.text.slice(0, 300) : item.title || 'AI & Robotics builder profile in Southeast Asia');

        return {
            username: handle,
            name: candidateName,
            bio: item.title || null,
            location: null,
            tweets: [
                {
                    id: tweetId || `exa_${Date.now()}_${index}`,
                    text: highlightText,
                    url: originalPostUrl,
                },
            ],
        };
    }

    private async searchWithExa(
        query: string,
        numResults: number
    ): Promise<{ profiles: RawProfileInput[]; error?: string }> {
        const exaApiKey = process.env.EXA_API_KEY;
        if (!exaApiKey || exaApiKey.startsWith('your_')) {
            return {
                profiles: [],
                error: 'EXA_API_KEY is not configured in .env. Cannot use Exa search fallback.',
            };
        }

        const cleanQuery = this.sanitizeExaQuery(query);
        const exaQuery = cleanQuery.includes('twitter.com') || cleanQuery.includes('x.com')
            ? cleanQuery
            : `${cleanQuery} "twitter.com/" OR "x.com/"`;

        try {
            console.log(`[DiscoveryService] Calling Exa Search API for: "${exaQuery}"...`);
            const res = await fetch('https://api.exa.ai/search', {
                method: 'POST',
                headers: {
                    'x-api-key': exaApiKey,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: exaQuery,
                    type: 'auto',
                    numResults: Math.min(Math.max(numResults, 10), 30),
                    contents: {
                        highlights: true,
                        text: { maxCharacters: 1500 },
                    },
                }),
            });

            if (!res.ok) {
                const errBody = await res.text();
                console.error(`[DiscoveryService] Exa API returned ${res.status}:`, errBody);
                return {
                    profiles: [],
                    error: `Exa API HTTP ${res.status}: ${errBody.slice(0, 120)}`,
                };
            }

            const data = await res.json();
            const results: ExaSearchResult[] = data.results || [];
            const profiles: RawProfileInput[] = [];
            const seenHandles = new Set<string>();

            results.forEach((item, idx) => {
                const profile = this.parseCandidateFromExaResult(item, idx);
                if (profile) {
                    const lower = profile.username.toLowerCase();
                    if (!seenHandles.has(lower)) {
                        seenHandles.add(lower);
                        profiles.push(profile);
                    }
                }
            });

            console.log(`[DiscoveryService] Exa Search parsed ${profiles.length} unique candidate profiles.`);
            return { profiles };
        } catch (err: unknown) {
            console.error('[DiscoveryService] Exa Search fetch exception:', err);
            return { profiles: [], error: (err as Error).message || 'Exa network error' };
        }
    }

    async discover(request: DiscoveryRequest): Promise<DiscoveryResultDTO> {
        const {
            mode,
            discoverySource = 'auto',
            query,
            seedHandles,
            maxResults = 10,
            tone = 'warm',
            valueProp,
        } = request;

        const rawProfiles: RawProfileInput[] = [];
        const errors: string[] = [];
        let warning: string | undefined;
        let errorCode: string | undefined;

        // 1. Resolve Candidates by Source & Mode
        if (discoverySource === 'exa') {
            // EXA ONLY (Free Tier mode)
            const exaQuery =
                query ||
                (mode === 'seeds'
                    ? (seedHandles || []).map((h) => `site:x.com/${h.replace(/^@/, '')}`).join(' OR ')
                    : 'AI Robotics founder builder researcher Singapore Vietnam Indonesia site:x.com');

            const exaResult = await this.searchWithExa(exaQuery, maxResults);
            if (exaResult.error) {
                errors.push(exaResult.error);
            }
            rawProfiles.push(...exaResult.profiles);
        } else {
            // Mode is 'auto' (Try X first, fallback to Exa on 402) OR 'x' (X API only)
            let readClient: TwitterApi | null = null;
            try {
                readClient = await getReadXClient(this.prisma);
            } catch (authErr) {
                console.warn('[DiscoveryService] Failed to get authenticated X read client:', authErr);
            }

            if (!readClient) {
                errors.push('No valid X read credentials found.');
            } else {
                try {
                    if (mode === 'seeds') {
                        const handles = (seedHandles || [])
                            .map((h) => h.trim().replace(/^@/, ''))
                            .filter((h) => h.length > 0 && !RESERVED_X_PATHS.has(h.toLowerCase()));

                        if (handles.length === 0) {
                            return {
                                candidates: [],
                                processedCount: 0,
                                skippedCount: 0,
                                errors: ['No valid seed handles provided.'],
                            };
                        }

                        console.log(`[DiscoveryService] Resolving ${handles.length} seed handles from X API...`);
                        const lookupChunk = handles.slice(0, 100);
                        const usersResponse = await readClient.v2.usersByUsernames(lookupChunk, {
                            'user.fields': ['id', 'name', 'username', 'description', 'location'],
                        });

                        if (usersResponse.data) {
                            for (const u of usersResponse.data) {
                                let tweets: Array<{ id: string; text: string; url?: string }> = [];
                                try {
                                    const timeline = await readClient.v2.userTimeline(u.id, {
                                        max_results: 10,
                                        exclude: ['retweets', 'replies'],
                                        'tweet.fields': ['created_at', 'text'],
                                    });

                                    if (timeline.data?.data) {
                                        tweets = timeline.data.data.map((t) => ({
                                            id: t.id,
                                            text: t.text,
                                            url: `${X_BASE_URL}/${u.username}/status/${t.id}`,
                                        }));
                                    }
                                } catch (tlErr) {
                                    if (this.isX402CreditsDepleted(tlErr)) {
                                        throw tlErr; // bubble up to trigger 402 fallback
                                    }
                                    console.warn(`[DiscoveryService] Timeline fetch skipped for @${u.username}:`, tlErr);
                                }

                                rawProfiles.push({
                                    username: u.username,
                                    name: u.name,
                                    bio: u.description || null,
                                    location: u.location || null,
                                    tweets,
                                });
                            }
                        }
                    } else {
                        // Segment Mode via X API Search
                        const searchQuery =
                            query ||
                            '(AI OR Robotics OR "Embodied AI" OR LLM) (founder OR builder OR researcher) (Singapore OR Vietnam OR Indonesia OR SEA OR "Ho Chi Minh") -is:retweet lang:en';
                        console.log(`[DiscoveryService] Searching X API recent tweets: "${searchQuery}"...`);

                        const searchResult = await readClient.v2.search(searchQuery, {
                            'tweet.fields': ['id', 'text', 'author_id', 'created_at'],
                            expansions: ['author_id'],
                            'user.fields': ['id', 'name', 'username', 'description', 'location'],
                            max_results: Math.min(Math.max(maxResults, 10), 50),
                        });

                        const usersById = new Map<string, { id: string; username: string; name: string; description?: string; location?: string }>();
                        if (searchResult.includes?.users) {
                            for (const u of searchResult.includes.users) {
                                usersById.set(u.id, u);
                            }
                        }

                        const tweetsByAuthor = new Map<string, Array<{ id: string; text: string; url?: string }>>();
                        for await (const tweet of searchResult) {
                            if (!tweet.author_id) continue;
                            const existingTweets = tweetsByAuthor.get(tweet.author_id) || [];
                            const author = usersById.get(tweet.author_id);
                            const tweetUrl = author ? `${X_BASE_URL}/${author.username}/status/${tweet.id}` : undefined;
                            existingTweets.push({ id: tweet.id, text: tweet.text, url: tweetUrl });
                            tweetsByAuthor.set(tweet.author_id, existingTweets);
                        }

                        for (const [authorId, tweets] of tweetsByAuthor.entries()) {
                            const u = usersById.get(authorId);
                            if (u) {
                                rawProfiles.push({
                                    username: u.username,
                                    name: u.name,
                                    bio: u.description || null,
                                    location: u.location || null,
                                    tweets,
                                });
                            }
                        }
                    }
                } catch (xErr: unknown) {
                    console.error('[DiscoveryService] X API search encounter:', xErr);

                    if (this.isX402CreditsDepleted(xErr)) {
                        console.warn('[DiscoveryService] X API 402 credits depleted.');

                        if (discoverySource === 'auto' && process.env.EXA_API_KEY) {
                            warning = 'X API credits depleted (402) — switched Discovery to Exa Search fallback';
                            console.log('[DiscoveryService] Activating automatic Exa Search fallback...');

                            const fallbackQuery =
                                query ||
                                (mode === 'seeds'
                                    ? (seedHandles || []).map((h) => `site:x.com/${h.replace(/^@/, '')}`).join(' OR ')
                                    : 'AI Robotics builder founder researcher Singapore Vietnam Indonesia site:x.com');

                            const exaRes = await this.searchWithExa(fallbackQuery, maxResults);
                            if (exaRes.profiles.length > 0) {
                                rawProfiles.push(...exaRes.profiles);
                            } else {
                                errorCode = 'X_CREDITS_DEPLETED';
                                errors.push(
                                    exaRes.error ||
                                        'X API credits depleted (402) and Exa fallback returned no results.'
                                );
                            }
                        } else {
                            errorCode = 'X_CREDITS_DEPLETED';
                            errors.push(
                                'X API Pay-per-use credits depleted (HTTP 402). Top up your X Developer balance or configure EXA_API_KEY in .env for free-tier fallback.'
                            );
                        }
                    } else if (xErr instanceof ApiResponseError) {
                        await recordRateLimitFromErrorOrHeaders(this.prisma, 'tweets/search/recent', xErr);
                        errors.push(`X API Error ${xErr.code}: ${xErr.message}`);
                    } else {
                        errors.push((xErr as Error).message || 'X API query error');
                    }
                }
            }
        }

        // If no profiles found and critical error code set
        if (rawProfiles.length === 0 && errorCode) {
            const rateLimits = await this.prisma.rateLimitLog.findMany({ orderBy: { updatedAt: 'desc' } });
            return {
                candidates: [],
                processedCount: 0,
                skippedCount: 0,
                errors: errors.length > 0 ? errors : undefined,
                warning,
                errorCode,
                rateLimits: rateLimits.map((r) => ({
                    endpoint: r.endpoint,
                    limitMax: r.limitMax,
                    remaining: r.remaining,
                    resetEpoch: r.resetEpoch,
                    resetDate: r.resetEpoch ? new Date(r.resetEpoch * 1000).toISOString() : null,
                    updatedAt: r.updatedAt,
                })),
            };
        }

        // 2. Score and Upsert Candidates with Outreach Status Preservation
        const savedCandidates: CandidateDTO[] = [];
        let skippedCount = 0;

        for (const profile of rawProfiles) {
            try {
                // Find existing candidate by username or xUserId
                const candidateXUserId = `x_${profile.username.toLowerCase()}`;
                const existing = await this.prisma.candidate.findFirst({
                    where: {
                        OR: [
                            { username: profile.username },
                            { xUserId: candidateXUserId },
                        ],
                    },
                    include: { messages: true },
                });

                // Scoring with custom tone & valueProp
                let evaluation: CandidateEvaluation;
                if (this.scoringService) {
                    try {
                        evaluation = await this.scoringService.evaluateProfile(profile, { tone, valueProp });
                    } catch (scoreErr) {
                        console.warn(`[DiscoveryService] AI scoring failed for @${profile.username}, fallback:`, scoreErr);
                        evaluation = this.getFallbackEvaluation(profile);
                    }
                    // Respect free-tier rate limits (spacing requests)
                    await new Promise((r) => setTimeout(r, 600));
                } else {
                    evaluation = this.getFallbackEvaluation(profile);
                }

                // CRITICAL SAFETY RULE:
                // If candidate already contacted/resolved, KEEP outreach status (never reset to PENDING!)
                const outreachActiveStatuses = ['SENT', 'REPLIED_NEEDS_ATTENTION', 'BLOCKED_DM_CLOSED', 'SKIPPED'];
                const shouldPreserveStatus = existing && outreachActiveStatuses.includes(existing.status);

                const finalStatus = shouldPreserveStatus ? existing.status : 'PENDING';
                const finalXUserId = existing?.xUserId || candidateXUserId;

                const candidate = await this.prisma.candidate.upsert({
                    where: { xUserId: finalXUserId },
                    create: {
                        xUserId: finalXUserId,
                        username: profile.username,
                        name: profile.name,
                        bio: profile.bio,
                        location: profile.location,
                        fitScore: evaluation.fitScore,
                        roleCategory: evaluation.roleCategory,
                        seaConnection: evaluation.seaConnection,
                        whyTheyFit: evaluation.whyTheyFit,
                        evidenceQuote: evaluation.evidenceQuote,
                        evidenceUrl: evaluation.evidenceUrl,
                        status: finalStatus,
                    },
                    update: {
                        name: profile.name,
                        bio: profile.bio ?? undefined,
                        location: profile.location ?? undefined,
                        fitScore: evaluation.fitScore,
                        roleCategory: evaluation.roleCategory,
                        seaConnection: evaluation.seaConnection,
                        whyTheyFit: evaluation.whyTheyFit,
                        evidenceQuote: evaluation.evidenceQuote,
                        evidenceUrl: evaluation.evidenceUrl,
                        // DO NOT OVERWRITE OUTREACH ACTIVE STATUS
                        status: finalStatus,
                    },
                    include: {
                        messages: {
                            orderBy: { createdAt: 'desc' },
                            take: 1,
                        },
                    },
                });

                // Create initial draft message if candidate has no messages yet
                if (!existing || existing.messages.length === 0) {
                    const message = await this.prisma.message.create({
                        data: {
                            candidateId: candidate.id,
                            draftText: evaluation.draftMessage,
                            sendStatus: 'DRAFT',
                        },
                    });
                    savedCandidates.push({
                        ...candidate,
                        messages: [message],
                    });
                } else {
                    skippedCount++;
                    savedCandidates.push(candidate);
                }
            } catch (candErr) {
                console.error(`[DiscoveryService] Error processing candidate @${profile.username}:`, candErr);
                errors.push(`Error for @${profile.username}: ${(candErr as Error).message}`);
            }
        }

        const rateLimits = await this.prisma.rateLimitLog.findMany({ orderBy: { updatedAt: 'desc' } });

        return {
            candidates: savedCandidates,
            processedCount: rawProfiles.length,
            skippedCount,
            errors: errors.length > 0 ? errors : undefined,
            warning,
            errorCode,
            rateLimits: rateLimits.map((r) => ({
                endpoint: r.endpoint,
                limitMax: r.limitMax,
                remaining: r.remaining,
                resetEpoch: r.resetEpoch,
                resetDate: r.resetEpoch ? new Date(r.resetEpoch * 1000).toISOString() : null,
                updatedAt: r.updatedAt,
            })),
        };
    }
}
