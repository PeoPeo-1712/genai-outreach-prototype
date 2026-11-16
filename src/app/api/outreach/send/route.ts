import { NextRequest, NextResponse } from 'next/server';
import { OutreachService } from '@/services/OutreachService';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { candidateId, messageText } = body;

    if (!candidateId || !messageText) {
      return NextResponse.json(
        { error: 'Both candidateId and messageText are required.' },
        { status: 400 }
      );
    }

    if (typeof messageText !== 'string' || messageText.length > 450) {
      return NextResponse.json(
        { error: `Message text must be 450 characters or less (currently ${messageText?.length || 0}).` },
        { status: 400 }
      );
    }

    const outreachService = new OutreachService();
    const result = await outreachService.sendSafeDM(candidateId, messageText);

    let httpStatus = 200;
    if (!result.success) {
      switch (result.status) {
        case 'X_CREDITS_DEPLETED':
          httpStatus = 402;
          break;
        case 'SANDBOX_BLOCKED':
        case 'BLOCKED_DM_CLOSED':
          httpStatus = 403;
          break;
        case 'DUPLICATE_BLOCKED':
          httpStatus = 409;
          break;
        case 'RATE_LIMITED':
        case 'DAILY_LIMIT_REACHED':
          httpStatus = 429;
          break;
        case 'FAILED':
        default:
          httpStatus = 500;
          break;
      }
    }

    return NextResponse.json(result, { status: httpStatus });
  } catch (err: unknown) {
    console.error('[API /api/outreach/send] Error:', err);
    return NextResponse.json(
      {
        success: false,
        status: 'FAILED',
        error: (err as Error).message || 'Internal error sending DM',
      },
      { status: 500 }
    );
  }
}
