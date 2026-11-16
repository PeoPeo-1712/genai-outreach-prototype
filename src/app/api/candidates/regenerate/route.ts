import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AIScoringService } from '@/services/AIScoringService';
import { OutreachTone } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { candidateId, tone, valueProp } = body;

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

    const scorer = new AIScoringService();
    const newDraft = await scorer.regenerateDraft(
      {
        name: candidate.name,
        username: candidate.username,
        evidenceQuote: candidate.evidenceQuote,
        evidenceUrl: candidate.evidenceUrl,
        whyTheyFit: candidate.whyTheyFit,
      },
      {
        tone: (tone as OutreachTone) || 'warm',
        valueProp: typeof valueProp === 'string' ? valueProp : undefined,
      }
    );

    // Update draft message in database
    const latestMsg = candidate.messages[0];
    if (latestMsg && latestMsg.sendStatus === 'DRAFT') {
      await prisma.message.update({
        where: { id: latestMsg.id },
        data: { draftText: newDraft },
      });
    } else {
      await prisma.message.create({
        data: {
          candidateId: candidate.id,
          draftText: newDraft,
          sendStatus: 'DRAFT',
        },
      });
    }

    return NextResponse.json({
      success: true,
      draftText: newDraft,
    });
  } catch (err: unknown) {
    console.error('[API /api/candidates/regenerate] Error:', err);
    const anyErr = err as Record<string, unknown>;
    const isQuota = anyErr?.code === 'LLM_QUOTA_EXHAUSTED';

    return NextResponse.json(
      {
        error: (err as Error).message || 'Failed to regenerate draft DM',
        code: isQuota ? 'LLM_QUOTA_EXHAUSTED' : undefined,
      },
      { status: isQuota ? 429 : 500 }
    );
  }
}
