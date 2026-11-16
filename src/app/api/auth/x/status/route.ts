import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const conn = await prisma.xAuthConnection.findFirst({
    orderBy: { updatedAt: 'desc' },
    select: {
      xUserId: true,
      username: true,
      expiresAt: true,
      updatedAt: true,
    },
  });

  if (conn) {
    return NextResponse.json({
      connected: true,
      mode: 'oauth2',
      username: conn.username,
      xUserId: conn.xUserId,
      expiresAt: conn.expiresAt,
    });
  }

  const hasOAuth1 = Boolean(
    process.env.X_API_KEY &&
      process.env.X_API_SECRET &&
      process.env.X_ACCESS_TOKEN &&
      process.env.X_ACCESS_SECRET
  );

  return NextResponse.json({
    connected: hasOAuth1,
    mode: hasOAuth1 ? 'oauth1_env' : 'none',
    username: null,
  });
}
