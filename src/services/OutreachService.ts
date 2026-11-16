import { TwitterApi, ApiResponseError } from 'twitter-api-v2';
import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../lib/prisma';
import { OutreachSendResult } from '../types';

export type SendDMResult = OutreachSendResult;

const X_BASE_URL = 'https://' + 'x.com';

export class OutreachService {
    private prisma: PrismaClient;
    private customTwitterClient?: TwitterApi;
    private myUserId: string | null = null;

    constructor(customPrisma?: PrismaClient, customTwitterClient?: TwitterApi) {
        this.prisma = customPrisma ?? defaultPrisma;
        this.customTwitterClient = customTwitterClient;
    }

    /**
     * Resolve a valid authenticated TwitterApi client:
     * 1) Custom TwitterApi client injected via constructor (for tests/mocking)
     * 2) OAuth 2.0 connection stored in SQLite (auto-refreshed when < 10 min before expiry)
     * 3) OAuth 1.0a 4-key credentials from .env (optional fallback for app owner)
     * 4) Static X_USER_ACCESS_TOKEN from .env (for CLI smoke tests)
     */
    private async getTwitterClient(): Promise<TwitterApi> {
        if (this.customTwitterClient) {
            return this.customTwitterClient;
        }

        // 1) OAuth 2.0 connection stored in SQLite
        const conn = await this.prisma.xAuthConnection.findFirst({
            orderBy: { updatedAt: 'desc' },
        });

        if (conn) {
            // Auto-refresh token if within 10 minutes of expiry
            const isNearExpiry = conn.expiresAt.getTime() - Date.now() < 10 * 60 * 1000;
            if (isNearExpiry && conn.refreshToken) {
                const clientId = process.env.X_CLIENT_ID;
                const clientSecret = process.env.X_CLIENT_SECRET;

                if (clientId && clientSecret) {
                    try {
                        console.log(`[OutreachService] Refreshing OAuth 2.0 token for @${conn.username}...`);
                        const oauthClient = new TwitterApi({ clientId, clientSecret });
                        const { client: refreshedClient, accessToken, refreshToken: newRefreshToken, expiresIn } =
                            await oauthClient.refreshOAuth2Token(conn.refreshToken);

                        const newExpiresAt = new Date(Date.now() + (expiresIn ?? 7200) * 1000);

                        await this.prisma.xAuthConnection.update({
                            where: { id: conn.id },
                            data: {
                                accessToken,
                                refreshToken: newRefreshToken ?? conn.refreshToken,
                                expiresAt: newExpiresAt,
                            },
                        });

                        console.log(`[OutreachService] Token refreshed successfully for @${conn.username}`);
                        if (conn.xUserId) this.myUserId = conn.xUserId;
                        return refreshedClient;
                    } catch (refreshErr) {
                        console.error('[OutreachService] Failed to refresh OAuth 2.0 token, using existing token:', refreshErr);
                    }
                }
            }

            if (conn.xUserId) this.myUserId = conn.xUserId;
            return new TwitterApi(conn.accessToken);
        }

        // 2) OAuth 1.0a 4-key credentials from .env (fallback for app owner)
        const appKey = process.env.X_API_KEY;
        const appSecret = process.env.X_API_SECRET;
        const accessToken = process.env.X_ACCESS_TOKEN;
        const accessSecret = process.env.X_ACCESS_SECRET;

        if (appKey && appSecret && accessToken && accessSecret) {
            return new TwitterApi({
                appKey,
                appSecret,
                accessToken,
                accessSecret,
            });
        }

        // 3) Static X_USER_ACCESS_TOKEN from .env (for CLI smoke tests)
        const staticToken = process.env.X_USER_ACCESS_TOKEN;
        if (staticToken) {
            return new TwitterApi(staticToken);
        }

        throw new Error(
            'No valid X (Twitter) authentication found. Please connect your X account via /api/auth/x/connect or configure OAuth credentials in .env.'
        );
    }

    private async getMyUserId(client?: TwitterApi): Promise<string> {
        if (!this.myUserId) {
            const twitterClient = client ?? (await this.getTwitterClient());
            console.log('[OutreachService] Fetching authenticated X user ID...');
            const me = await twitterClient.v2.me();
            this.myUserId = me.data.id;
            console.log(`[OutreachService] Authenticated as userId=${this.myUserId}`);
        }

        return this.myUserId;
    }

    async getDailyStats(): Promise<{ sentToday: number; dailyLimit: number }> {
        const dailyLimit = Number(process.env.DAILY_DM_LIMIT) || 25;
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const sentToday = await this.prisma.message.count({
            where: {
                sendStatus: 'SENT',
                sentAt: { gte: startOfToday },
            },
        });

        return { sentToday, dailyLimit };
    }

    async checkDuplicate(xUserId: string): Promise<boolean> {
        const existingCandidate = await this.prisma.candidate.findUnique({
            where: { xUserId },
            include: {
                messages: {
                    where: {
                        sendStatus: { in: ['SENT', 'RATE_LIMITED'] },
                    },
                },
            },
        });

        if (!existingCandidate) return false;

        const isDup =
            existingCandidate.status === 'SENT' ||
            existingCandidate.status === 'REPLIED_NEEDS_ATTENTION' ||
            existingCandidate.messages.length > 0;

        if (isDup) {
            console.warn(
                `[OutreachService] Duplicate check triggered for xUserId=${xUserId} (@${existingCandidate.username}, status=${existingCandidate.status})`
            );
        }
        return isDup;
    }

    async sendSafeDM(candidateId: string, text: string): Promise<SendDMResult> {
        const candidate = await this.prisma.candidate.findUnique({
            where: { id: candidateId },
        });

        if (!candidate) {
            throw new Error(`Candidate not found with ID: ${candidateId}`);
        }

        // 1. Deduplication Gate
        const isDuplicate = await this.checkDuplicate(candidate.xUserId);
        if (isDuplicate) {
            const msg = `Candidate @${candidate.username} (${candidate.xUserId}) has already been messaged. Aborting to prevent duplicate outreach.`;
            console.warn(`[OutreachService] DUPLICATE_BLOCKED: ${msg}`);
            return {
                success: false,
                status: 'DUPLICATE_BLOCKED',
                error: msg,
            };
        }

        // 2. Sandbox Safety Gate
        const testWhitelist =
            process.env.ALLOWED_TEST_HANDLES?.split(',')
                .map((h) => h.trim().toLowerCase().replace(/^@/, ''))
                .filter(Boolean) ?? [];
        const isTestMode = process.env.NODE_ENV !== 'production';

        if (isTestMode && testWhitelist.length > 0 && !testWhitelist.includes(candidate.username.toLowerCase())) {
            const msg = `Sandbox safety gate blocked @${candidate.username}. Not in ALLOWED_TEST_HANDLES (${testWhitelist.join(', ')}).`;
            console.warn(`[OutreachService] SANDBOX_BLOCKED: ${msg}`);
            return {
                success: false,
                status: 'SANDBOX_BLOCKED',
                error: msg,
            };
        }

        // 3. Daily Send Cap
        const { sentToday, dailyLimit } = await this.getDailyStats();
        if (sentToday >= dailyLimit) {
            const msg = `Daily outreach limit reached (${sentToday}/${dailyLimit} sent today). To protect your X account, wait until tomorrow or increase DAILY_DM_LIMIT in .env.`;
            console.warn(`[OutreachService] DAILY_LIMIT_REACHED: ${msg}`);
            return {
                success: false,
                status: 'DAILY_LIMIT_REACHED',
                error: msg,
            };
        }

        const messageRecord = await this.prisma.message.create({
            data: {
                candidateId: candidate.id,
                draftText: text,
                sendStatus: 'DRAFT',
            },
        });

        console.log(`[OutreachService] Sending DM to @${candidate.username} (xUserId=${candidate.xUserId})...`);

        try {
            const twitterClient = await this.getTwitterClient();
            const response = await twitterClient.v2.sendDmToParticipant(candidate.xUserId, { text });

            const dmEventId = response.dm_event_id;
            const conversationId = response.dm_conversation_id;

            await this.prisma.$transaction([
                this.prisma.message.update({
                    where: { id: messageRecord.id },
                    data: {
                        sendStatus: 'SENT',
                        sentText: text,
                        xDmEventId: dmEventId,
                        xConversationId: conversationId,
                        sentAt: new Date(),
                    },
                }),

                this.prisma.candidate.update({
                    where: { id: candidate.id },
                    data: { status: 'SENT' },
                }),
            ]);

            console.log(
                `[OutreachService] DM sent to @${candidate.username} (dmEventId=${dmEventId}, conversationId=${conversationId})`
            );

            return {
                success: true,
                status: 'SENT',
                dmEventId,
                conversationId,
            };
        } catch (err: unknown) {
            if (err instanceof ApiResponseError) {
                const txId = err.headers?.['x-transaction-id'] ?? 'N/A';
                const errorData = err.data as Record<string, unknown> | undefined;
                const reason = typeof errorData?.reason === 'string' ? errorData.reason : 'unknown';

                // HTTP 402: Credits Depleted
                if (err.code === 402) {
                    const detailMessage = 'X API Pay-per-use credits depleted — cannot send/sync DMs until topped up';
                    console.error(`[OutreachService] X API 402 Credits Depleted for @${candidate.username}: ${detailMessage}`);

                    await this.prisma.message.update({
                        where: { id: messageRecord.id },
                        data: {
                            sendStatus: 'FAILED',
                            errorReason: 'X API credits depleted (402)',
                        },
                    });

                    return {
                        success: false,
                        status: 'X_CREDITS_DEPLETED',
                        error: detailMessage,
                    };
                }

                // HTTP 403: DM Closed
                if (err.code === 403) {
                    const detailMessage =
                        err.data?.detail ||
                        'Recipient has closed DMs, does not follow the sender, or the token/account lacks permission.';

                    console.error(
                        `[OutreachService] X API 403 Forbidden for @${candidate.username} (reason=${reason}, txId=${txId}): ${detailMessage}`
                    );

                    await this.prisma.$transaction([
                        this.prisma.message.update({
                            where: { id: messageRecord.id },
                            data: {
                                sendStatus: 'BLOCKED_DM_CLOSED',
                                errorReason: detailMessage,
                            },
                        }),
                        this.prisma.candidate.update({
                            where: { id: candidate.id },
                            data: { status: 'BLOCKED_DM_CLOSED' },
                        }),
                    ]);

                    return {
                        success: false,
                        status: 'BLOCKED_DM_CLOSED',
                        error: detailMessage,
                        suggestedAction: candidate.evidenceUrl
                            ? `Reply publicly on their post instead: ${candidate.evidenceUrl}`
                            : `Visit ${X_BASE_URL}/${candidate.username} to engage publicly.`,
                    };
                }

                // HTTP 429: Rate Limited
                if (err.code === 429) {
                    const resetEpoch = err.rateLimit?.reset;
                    const resetDate = resetEpoch ? new Date(resetEpoch * 1000).toISOString() : 'Unknown';
                    console.error(
                        `[OutreachService] X API 429 Rate Limit exhausted while messaging @${candidate.username} (limit=${err.rateLimit?.limit ?? 'N/A'}, reset=${resetDate}, txId=${txId})`
                    );

                    await this.prisma.rateLimitLog.upsert({
                        where: { endpoint: 'dm_conversations/with/:id/messages' },
                        create: {
                            endpoint: 'dm_conversations/with/:id/messages',
                            limitMax: err.rateLimit?.limit,
                            remaining: 0,
                            resetEpoch: resetEpoch,
                        },
                        update: {
                            limitMax: err.rateLimit?.limit,
                            remaining: 0,
                            resetEpoch: resetEpoch,
                        },
                    });

                    await this.prisma.message.update({
                        where: { id: messageRecord.id },
                        data: {
                            sendStatus: 'RATE_LIMITED',
                            errorReason: `X API rate limit exhausted. Resets at: ${resetDate}`,
                        },
                    });

                    return {
                        success: false,
                        status: 'RATE_LIMITED',
                        error: `X API rate limit reached. Cooldown until ${resetDate}`,
                        rateLimitResetEpoch: resetEpoch,
                    };
                }

                console.error(
                    `[OutreachService] X API error ${err.code} for @${candidate.username} (txId=${txId}):`,
                    err.data ?? err.message
                );
            } else {
                console.error(`[OutreachService] Unexpected error sending DM to @${candidate.username}:`, err);
            }

            const genericError = (err as Error).message || 'Unknown network or X API error';
            await this.prisma.message.update({
                where: { id: messageRecord.id },
                data: {
                    sendStatus: 'FAILED',
                    errorReason: genericError,
                },
            });

            return {
                success: false,
                status: 'FAILED',
                error: genericError,
            };
        }
    }

    async syncReplies(): Promise<{ syncedCount: number; newReplies: string[] }> {
        console.log('[OutreachService] Syncing incoming DM replies from X API...');

        try {
            const twitterClient = await this.getTwitterClient();
            const myId = await this.getMyUserId(twitterClient);

            const eventTimeline = await twitterClient.v2.listDmEvents({
                'dm_event.fields': ['id', 'text', 'sender_id', 'created_at', 'dm_conversation_id'],
                max_results: 50,
            });
            let syncedCount = 0;

            const newReplies: string[] = [];

            for (const event of eventTimeline.events) {
                if (event.event_type !== 'MessageCreate') continue;
                if (!event.sender_id || event.sender_id === myId) continue;

                const candidate = await this.prisma.candidate.findUnique({
                    where: { xUserId: event.sender_id },
                    include: {
                        messages: {
                            where: { sendStatus: 'SENT' },
                            orderBy: { sentAt: 'desc' },
                            take: 1,
                        },
                    },
                });

                const lastSentMessage = candidate?.messages.at(0);

                if (candidate && lastSentMessage) {
                    const eventCreatedAt = event.created_at ? new Date(event.created_at) : new Date();
                    const replyText = event.text ?? '';

                    if (!lastSentMessage.sentAt || eventCreatedAt > lastSentMessage.sentAt) {
                        await this.prisma.$transaction([
                            this.prisma.message.update({
                                where: { id: lastSentMessage.id },
                                data: {
                                    latestReplyText: replyText,
                                    repliedAt: eventCreatedAt,
                                    needsAttention: true,
                                },
                            }),
                            this.prisma.candidate.update({
                                where: { id: candidate.id },
                                data: { status: 'REPLIED_NEEDS_ATTENTION' },
                            }),
                        ]);

                        syncedCount++;
                        newReplies.push(`@${candidate.username}: "${replyText}"`);
                        console.log(
                            `[OutreachService] Reply detected from @${candidate.username} (dmEventId=${event.id}) -> flagged NEEDS_ATTENTION`
                        );
                    }
                }
            }

            console.log(`[OutreachService] Reply sync complete. New replies synced: ${syncedCount}`);

            return {
                syncedCount,
                newReplies,
            };
        } catch (err) {
            if (err instanceof ApiResponseError) {
                const txId = err.headers?.['x-transaction-id'] ?? 'N/A';
                if (err.code === 402) {
                    console.error('[OutreachService] X API 402 credits depleted during syncReplies');
                    throw new Error('X API Pay-per-use credits depleted — cannot sync DMs until topped up');
                }
                console.error(
                    `[OutreachService] Failed to sync DM replies (HTTP ${err.code}, txId=${txId}):`,
                    err.data ?? err.message
                );
            } else {
                console.error('[OutreachService] Unexpected error during syncReplies:', err);
            }
            throw err;
        }
    }
}
