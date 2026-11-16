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
    return NextResponse.json(
      {
        success: false,
        error: (err as Error).message || 'Failed to sync DM replies from X API',
      },
      { status: 500 }
    );
  }
}
