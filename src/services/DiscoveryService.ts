import { TwitterApi, ApiResponseError } from 'twitter-api-v2';
import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../lib/prisma';
import { AIScoringService, RawProfileInput, CandidateEvaluation } from './AIScoringService';
import { getReadXClient, recordRateLimitFromErrorOrHeaders } from '../lib/x-client';
import { DiscoveryRequest, CandidateDTO, DiscoveryResultDTO } from '../types';

const X_BASE_URL = 'https://' + 'x.com';

const RESERVED_X_PATHS = new Set([
    'home', 'explore', 'notifications', 'messages', 'search', 'settings',
    'tos', 'privacy', 'i', 'intent', 'hashtag', 'about', 'help', 'login', 'signup'
]);

export class DiscoveryService {
    private prisma: PrismaClient;
    private scoringService: AIScoringService | null = null;

    constructor(customPrisma?: PrismaClient) {
        this.prisma = customPrisma ?? defaultPrisma;
        try {
            const hasGeminiKey =
                process.env.GEMINI_API_KEY ||
                process.env.GOOGLE_API_KEY ||
                process.env.GOOGLE_GENAI_API_KEY;

            if (hasGeminiKey && !hasGeminiKey.startsWith('your_')) {
                this.scoringService = new AIScoringService();
            }
        } catch (e) {
            console.warn('[DiscoveryService] AIScoringService initialization skipped (Gemini key not configured):', e);
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

    async discover(request: DiscoveryRequest): Promise<DiscoveryResultDTO> {
        const { mode, query, seedHandles, maxResults = 10, useExa } = request;
        const readClient = await getReadXClient(this.prisma);
        const rawProfiles: RawProfileInput[] = [];
        const userMap = new Map<string, { id: string; username: string; name: string; bio: string | null; location: string | null }>();
        const errors: string[] = [];

        try {
            if (mode === 'seeds') {
                const handles = (seedHandles || [])
                    .map((h) => h.trim().replace(/^@/, ''))
                    .filter((h) => h.length > 0 && !RESERVED_X_PATHS.has(h.toLowerCase()));

                if (handles.length === 0) {
                    return { candidates: [], processedCount: 0, skippedCount: 0, errors: ['No valid seed handles provided.'] };
                }

                console.log(`[DiscoveryService] Resolving ${handles.length} seed handles from X API...`);
                const lookupChunk = handles.slice(0, 100);
                const usersResponse = await readClient.v2.usersByUsernames(lookupChunk, {
                    'user.fields': ['id', 'name', 'username', 'description', 'location'],
                });

                if (usersResponse.data) {
                    for (const u of usersResponse.data) {
                        userMap.set(u.id, {
                            id: u.id,
                            username: u.username,
                            name: u.name,
                            bio: u.description || null,
                            location: u.location || null,
                        });

                        // Fetch recent 5-10 tweets for each seed user
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
                            console.warn(`[DiscoveryService] Failed to fetch timeline for @${u.username}:`, tlErr);
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
                // Segment Mode
                let extractedHandles: string[] = [];

                if (useExa && process.env.EXA_API_KEY && !process.env.EXA_API_KEY.startsWith('your_')) {
                    console.log('[DiscoveryService] Calling Exa API for Hybrid Discovery...');
                    try {
                        const exaQuery = query || 'AI Robotics founder engineer researcher Singapore Vietnam Indonesia site:x.com';
                        const exaRes = await fetch('https://api.exa.ai/search', {
                            method: 'POST',
                            headers: {
                                'x-api-key': process.env.EXA_API_KEY,
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                query: exaQuery,
                                numResults: Math.min(maxResults, 25),
                                type: 'auto',
                            }),
                        });

                        if (exaRes.ok) {
                            const exaData = await exaRes.json();
                            const results: Array<{ url?: string }> = exaData.results || [];
                            const handleRegex = /(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]{1,15})(?:\/status|\/|$|\?)/i;

                            for (const item of results) {
                                if (item.url) {
                                    const match = item.url.match(handleRegex);
                                    if (match && match[1]) {
                                        const h = match[1].toLowerCase();
                                        if (!RESERVED_X_PATHS.has(h)) {
                                            extractedHandles.push(match[1]);
                                        }
                                    }
                                }
                            }
                            extractedHandles = Array.from(new Set(extractedHandles)).slice(0, 100);
                        } else {
                            const errBody = await exaRes.text();
                            console.warn('[DiscoveryService] Exa API error response:', errBody);
                            errors.push(`Exa API error: ${exaRes.status}`);
                        }
                    } catch (exaErr) {
                        console.error('[DiscoveryService] Exa fetch failed, falling back to X API search:', exaErr);
                        errors.push(`Exa search failed: ${(exaErr as Error).message}`);
                    }
                }

                if (extractedHandles.length > 0) {
                    console.log(`[DiscoveryService] Resolving ${extractedHandles.length} handles found via Exa...`);
                    const usersResponse = await readClient.v2.usersByUsernames(extractedHandles, {
                        'user.fields': ['id', 'name', 'username', 'description', 'location'],
                    });

                    if (usersResponse.data) {
                        for (const u of usersResponse.data) {
                            rawProfiles.push({
                                username: u.username,
                                name: u.name,
                                bio: u.description || null,
                                location: u.location || null,
                                tweets: [],
                            });
                        }
                    }
                } else {
                    // Fallback or default X API search
                    const searchQuery = query || '(AI OR Robotics OR "Embodied AI" OR LLM) (founder OR builder OR researcher) (Singapore OR Vietnam OR Indonesia OR SEA OR "Ho Chi Minh") -is:retweet lang:en';
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
            }
        } catch (apiErr) {
            console.error('[DiscoveryService] X API search error:', apiErr);
            if (apiErr instanceof ApiResponseError) {
                await recordRateLimitFromErrorOrHeaders(this.prisma, 'tweets/search/recent', apiErr);
                errors.push(`X API Error ${apiErr.code}: ${apiErr.message}`);
            } else {
                errors.push((apiErr as Error).message || 'X API query error');
            }
        }

        // Process each discovered candidate through scoring and DB persistence
        const savedCandidates: CandidateDTO[] = [];
        let skippedCount = 0;

        for (const profile of rawProfiles) {
            try {
                // Find existing candidate by username
                const existing = await this.prisma.candidate.findFirst({
                    where: { username: profile.username },
                    include: { messages: true },
                });

                // Check LLM evaluation
                let evaluation: CandidateEvaluation;
                if (this.scoringService) {
                    try {
                        evaluation = await this.scoringService.evaluateProfile(profile);
                    } catch (scoreErr) {
                        console.warn(`[DiscoveryService] AI scoring failed for @${profile.username}, using fallback:`, scoreErr);
                        evaluation = this.getFallbackEvaluation(profile);
                    }
                } else {
                    evaluation = this.getFallbackEvaluation(profile);
                }

                // If candidate was already messaged or resolved, KEEP THEIR OUTREACH STATUS
                const outreachActiveStatuses = ['SENT', 'REPLIED_NEEDS_ATTENTION', 'BLOCKED_DM_CLOSED', 'SKIPPED'];
                const shouldPreserveStatus = existing && outreachActiveStatuses.includes(existing.status);

                const finalStatus = shouldPreserveStatus ? existing.status : 'PENDING';

                // Look up xUserId: either from existing or placeholder
                const candidateXUserId = existing?.xUserId || `x_discovered_${profile.username}`;

                const candidate = await this.prisma.candidate.upsert({
                    where: { xUserId: candidateXUserId },
                    create: {
                        xUserId: candidateXUserId,
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
                        // NEVER overwrite outreach-active statuses back to PENDING!
                        status: finalStatus,
                    },
                    include: {
                        messages: {
                            orderBy: { createdAt: 'desc' },
                            take: 1,
                        },
                    },
                });

                // Create initial draft message if candidate has no draft/sent message yet
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

        // Fetch latest rate limits
        const rateLimits = await this.prisma.rateLimitLog.findMany({
            orderBy: { updatedAt: 'desc' },
        });

        return {
            candidates: savedCandidates,
            processedCount: rawProfiles.length,
            skippedCount,
            errors: errors.length > 0 ? errors : undefined,
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
