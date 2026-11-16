import { NextRequest, NextResponse } from 'next/server';
import { TwitterApi } from 'twitter-api-v2';
import { prisma } from '@/lib/prisma';
import { getXRedirectUri } from '@/lib/x-client';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const oauthError = searchParams.get('error');

  const storedState = req.cookies.get('x_oauth_state')?.value;
  const codeVerifier = req.cookies.get('x_oauth_verifier')?.value;

  if (oauthError) {
    return NextResponse.redirect(
      new URL(`/?x_auth_error=${encodeURIComponent(oauthError)}`, req.nextUrl.origin)
    );
  }

  if (!code || !state || !storedState || !codeVerifier || state !== storedState) {
    return NextResponse.redirect(
      new URL('/?x_auth_error=invalid_state_or_expired_session', req.nextUrl.origin)
    );
  }

  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  const redirectUri = getXRedirectUri(req);

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL('/?x_auth_error=missing_x_client_credentials', req.nextUrl.origin)
    );
  }

  try {
    const oauthClient = new TwitterApi({ clientId, clientSecret });

    const { client: loggedClient, accessToken, refreshToken, expiresIn } = await oauthClient.loginWithOAuth2({
      code,
      codeVerifier,
      redirectUri,
    });

    const me = await loggedClient.v2.me();
    const expiresAt = new Date(Date.now() + (expiresIn ?? 7200) * 1000);

    await prisma.xAuthConnection.upsert({
      where: { xUserId: me.data.id },
      create: {
        xUserId: me.data.id,
        username: me.data.username,
        accessToken,
        refreshToken: refreshToken ?? null,
        expiresAt,
      },
      update: {
        username: me.data.username,
        accessToken,
        refreshToken: refreshToken ?? undefined,
        expiresAt,
      },
    });

    console.log(`[XAuthCallback] Connected X account @${me.data.username} (id=${me.data.id})`);

    const res = NextResponse.redirect(new URL('/?x_connected=true', req.nextUrl.origin));
    res.cookies.delete('x_oauth_state');
    res.cookies.delete('x_oauth_verifier');
    return res;
  } catch (err) {
    console.error('[XAuthCallback] OAuth2 token exchange failed:', err);
    return NextResponse.redirect(
      new URL('/?x_auth_error=token_exchange_failed', req.nextUrl.origin)
    );
  }
}
