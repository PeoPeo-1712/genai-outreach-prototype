import { NextResponse } from 'next/server';
import { OutreachService } from '@/services/OutreachService';

export async function POST() {
  try {
    const outreachService = new OutreachService();
    const result = await outreachService.syncReplies();

    return NextResponse.json({
      success: true,
      syncedCount: result.syncedCount,
      newReplies: result.newReplies,
    });
  } catch (err: unknown) {
    console.error('[API /api/outreach/sync] Error:', err);
    const msg = (err as Error).message || '';
    const is402 = msg.includes('credits depleted') || msg.includes('402');
    return NextResponse.json(
      {
        success: false,
        errorCode: is402 ? 'X_CREDITS_DEPLETED' : 'SYNC_FAILED',
        error: is402
          ? 'X API Pay-per-use credits depleted (HTTP 402). Cannot sync DMs until account balance is topped up at developer.x.com.'
          : msg || 'Failed to sync DM replies from X API',
      },
      { status: is402 ? 402 : 500 }
    );
  }
}
