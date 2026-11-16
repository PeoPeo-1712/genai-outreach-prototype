import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const statusParam = searchParams.get('status');
    const searchParam = searchParams.get('search')?.trim();
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 100);

    const where: Prisma.CandidateWhereInput = {};

    if (statusParam && statusParam !== 'ALL') {
      if (statusParam === 'NEEDS_ATTENTION') {
        where.messages = { some: { needsAttention: true } };
      } else if (statusParam === 'BLOCKED') {
        where.status = { in: ['BLOCKED_DM_CLOSED', 'RATE_LIMITED'] };
      } else {
        where.status = statusParam;
      }
    }

    if (searchParam) {
      where.OR = [
        { username: { contains: searchParam } },
        { name: { contains: searchParam } },
        { bio: { contains: searchParam } },
        { whyTheyFit: { contains: searchParam } },
      ];
    }

    const [candidates, allCount, pendingCount, sentCount, blockedCount, needsAttentionCount, skippedCount, rateLimits] =
      await Promise.all([
        prisma.candidate.findMany({
          where,
          orderBy: [{ fitScore: 'desc' }, { createdAt: 'desc' }],
          take: limit,
          include: {
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 5,
            },
          },
        }),
        prisma.candidate.count(),
        prisma.candidate.count({ where: { status: 'PENDING' } }),
        prisma.candidate.count({ where: { status: 'SENT' } }),
        prisma.candidate.count({ where: { status: { in: ['BLOCKED_DM_CLOSED', 'RATE_LIMITED'] } } }),
        prisma.candidate.count({ where: { messages: { some: { needsAttention: true } } } }),
        prisma.candidate.count({ where: { status: 'SKIPPED' } }),
        prisma.rateLimitLog.findMany({ orderBy: { updatedAt: 'desc' } }),
      ]);

    const isSandboxMode = Boolean(
      process.env.NODE_ENV !== 'production' && process.env.ALLOWED_TEST_HANDLES
    );

    return NextResponse.json({
      candidates,
      stats: {
        all: allCount,
        pending: pendingCount,
        sent: sentCount,
        blocked: blockedCount,
        needsAttention: needsAttentionCount,
        skipped: skippedCount,
      },
      rateLimits: rateLimits.map((r) => ({
        endpoint: r.endpoint,
        limitMax: r.limitMax,
        remaining: r.remaining,
        resetEpoch: r.resetEpoch,
        resetDate: r.resetEpoch ? new Date(r.resetEpoch * 1000).toISOString() : null,
        updatedAt: r.updatedAt,
      })),
      sandboxMode: isSandboxMode,
      allowedHandles: process.env.ALLOWED_TEST_HANDLES || null,
    });
  } catch (err: unknown) {
    console.error('[API /api/candidates GET] Error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Failed to fetch candidates' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { candidateId, draftText, status, resolveAttention } = body;

    if (!candidateId) {
      return NextResponse.json({ error: 'candidateId is required' }, { status: 400 });
    }

    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    // 1. Resolve Attention
    if (resolveAttention) {
      if (candidate.messages.length > 0) {
        await prisma.message.updateMany({
          where: { candidateId, needsAttention: true },
          data: { needsAttention: false },
        });
      }

      const updated = await prisma.candidate.update({
        where: { id: candidateId },
        data: { status: 'SENT' },
        include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
      });

      return NextResponse.json({ success: true, candidate: updated });
    }

    // 2. Update Draft Text
    if (draftText !== undefined) {
      if (draftText.length > 450) {
        return NextResponse.json(
          { error: 'Draft message exceeds maximum length of 450 characters' },
          { status: 400 }
        );
      }

      let message = candidate.messages[0];
      if (message && message.sendStatus === 'DRAFT') {
        message = await prisma.message.update({
          where: { id: message.id },
          data: { draftText },
        });
      } else {
        message = await prisma.message.create({
          data: {
            candidateId,
            draftText,
            sendStatus: 'DRAFT',
          },
        });
      }

      return NextResponse.json({ success: true, message });
    }

    // 3. Update Status (e.g. SKIPPED)
    if (status) {
      const updated = await prisma.candidate.update({
        where: { id: candidateId },
        data: { status },
      });
      return NextResponse.json({ success: true, candidate: updated });
    }

    return NextResponse.json({ error: 'No valid action specified' }, { status: 400 });
  } catch (err: unknown) {
    console.error('[API /api/candidates PATCH] Error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Failed to update candidate' },
      { status: 500 }
    );
  }
}
