import { NextRequest } from 'next/server';
import { TwitterApi, ApiResponseError } from 'twitter-api-v2';
import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from './prisma';

/**
 * Dynamically computes the X OAuth 2.0 callback URL from the incoming NextRequest.
 * Complies with reverse proxy / forwarding headers (x-forwarded-proto, x-forwarded-host).
 * Avoids depending on a hardcoded X_REDIRECT_URI environment variable.
 */
export function getXRedirectUri(req: NextRequest): string {
    const proto =
        req.headers.get('x-forwarded-proto') ||
        (req.nextUrl.protocol ? req.nextUrl.protocol.replace(':', '') : 'http');
    const host =
        req.headers.get('x-forwarded-host') ||
        req.headers.get('host') ||
        req.nextUrl.host ||
        'localhost:3000';

    return `${proto}://${host}/api/auth/x/callback`;
}

/**
 * Resolve a valid authenticated TwitterApi client for user actions (DM send/sync):
 * 1) OAuth 2.0 connection from SQLite (auto-refreshed if < 10 mins before expiry)
 * 2) OAuth 1.0a 4-key credentials from .env (fallback for developer/app owner)
 * 3) Static X_USER_ACCESS_TOKEN from .env (for CLI testing)
 */
export async function getValidUserXClient(prismaClient?: PrismaClient): Promise<TwitterApi> {
    const db = prismaClient ?? defaultPrisma;

    // 1) OAuth 2.0 connection stored in SQLite
    const conn = await db.xAuthConnection.findFirst({
        orderBy: { updatedAt: 'desc' },
    });

    if (conn) {
        // Auto-refresh if token expires within 10 minutes (600,000 ms)
        const isNearExpiry = conn.expiresAt.getTime() - Date.now() < 10 * 60 * 1000;

        if (isNearExpiry && conn.refreshToken) {
            const clientId = process.env.X_CLIENT_ID;
            const clientSecret = process.env.X_CLIENT_SECRET;

            if (clientId && clientSecret) {
                try {
                    console.log(`[x-client] Refreshing OAuth 2.0 token for @${conn.username}...`);
                    const oauthClient = new TwitterApi({ clientId, clientSecret });
                    const { client: refreshedClient, accessToken, refreshToken: newRefreshToken, expiresIn } =
                        await oauthClient.refreshOAuth2Token(conn.refreshToken);

                    const newExpiresAt = new Date(Date.now() + (expiresIn ?? 7200) * 1000);

                    await db.xAuthConnection.update({
                        where: { id: conn.id },
                        data: {
                            accessToken,
                            refreshToken: newRefreshToken ?? conn.refreshToken,
                            expiresAt: newExpiresAt,
                        },
                    });

                    console.log(`[x-client] OAuth 2.0 token refreshed successfully for @${conn.username}`);
                    return refreshedClient;
                } catch (refreshErr) {
                    console.error('[x-client] Token refresh failed, falling back to existing token:', refreshErr);
                }
            }
        }

        return new TwitterApi(conn.accessToken);
    }

    // 2) OAuth 1.0a 4-key credentials from .env
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

    // 3) Static X_USER_ACCESS_TOKEN from .env
    const staticToken = process.env.X_USER_ACCESS_TOKEN;
    if (staticToken) {
        return new TwitterApi(staticToken);
    }

    throw new Error(
        'No valid X (Twitter) authentication found. Please connect your X account via /api/auth/x/connect or configure OAuth credentials in .env.'
    );
}

/**
 * Resolve a client for public reading operations (e.g. searching tweets, fetching profiles):
 * Prefers X_BEARER_TOKEN (App-only / higher rate limit) if available,
 * otherwise falls back to the user-authenticated client.
 */
export async function getReadXClient(prismaClient?: PrismaClient): Promise<TwitterApi> {
    const bearerToken = process.env.X_BEARER_TOKEN;
    if (bearerToken && !bearerToken.startsWith('your_')) {
        return new TwitterApi(bearerToken);
    }

    return getValidUserXClient(prismaClient);
}

/**
 * Record rate limit status into RateLimitLog from an ApiResponseError or raw HTTP headers.
 */
export async function recordRateLimitFromErrorOrHeaders(
    prismaClient: PrismaClient,
    endpoint: string,
    errorOrHeaders: unknown
): Promise<void> {
    const db = prismaClient ?? defaultPrisma;
    let limit: number | undefined;
    let remaining: number | undefined;
    let resetEpoch: number | undefined;

    if (errorOrHeaders instanceof ApiResponseError) {
        limit = errorOrHeaders.rateLimit?.limit;
        remaining = errorOrHeaders.rateLimit?.remaining;
        resetEpoch = errorOrHeaders.rateLimit?.reset;

        if (!resetEpoch && errorOrHeaders.headers) {
            const h = errorOrHeaders.headers;
            limit = limit ?? (h['x-rate-limit-limit'] ? Number(h['x-rate-limit-limit']) : undefined);
            remaining = remaining ?? (h['x-rate-limit-remaining'] ? Number(h['x-rate-limit-remaining']) : undefined);
            resetEpoch = resetEpoch ?? (h['x-rate-limit-reset'] ? Number(h['x-rate-limit-reset']) : undefined);
        }
    } else if (errorOrHeaders && typeof errorOrHeaders === 'object') {
        const headers = errorOrHeaders as Record<string, string | number | undefined>;
        limit = headers['x-rate-limit-limit'] ? Number(headers['x-rate-limit-limit']) : undefined;
        remaining = headers['x-rate-limit-remaining'] !== undefined ? Number(headers['x-rate-limit-remaining']) : undefined;
        resetEpoch = headers['x-rate-limit-reset'] ? Number(headers['x-rate-limit-reset']) : undefined;
    }

    if (endpoint) {
        await db.rateLimitLog.upsert({
            where: { endpoint },
            create: {
                endpoint,
                limitMax: limit,
                remaining,
                resetEpoch,
            },
            update: {
                limitMax: limit,
                remaining,
                resetEpoch,
            },
        });
    }
}
