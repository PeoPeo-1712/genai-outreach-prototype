import { NextRequest, NextResponse } from 'next/server';
import { TwitterApi } from 'twitter-api-v2';
import { getXRedirectUri } from '@/lib/x-client';

const SCOPES = ['dm.read', 'dm.write', 'users.read', 'tweet.read', 'offline.access'];

export async function GET(req: NextRequest) {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  const redirectUri = getXRedirectUri(req);

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Missing X_CLIENT_ID or X_CLIENT_SECRET in environment variables.' },
      { status: 500 }
    );
  }

  const oauthClient = new TwitterApi({ clientId, clientSecret });

  const { url, codeVerifier, state } = oauthClient.generateOAuth2AuthLink(redirectUri, {
    scope: SCOPES,
  });

  const response = NextResponse.redirect(url);

  const cookieOpts = {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 10, // 10 minutes
  };

  response.cookies.set('x_oauth_state', state, cookieOpts);
  response.cookies.set('x_oauth_verifier', codeVerifier, cookieOpts);

  return response;
}
