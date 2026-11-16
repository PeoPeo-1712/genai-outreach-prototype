import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const statusParam = searchParams.get('status');
    const searchParam = searchParams.get('search')?.trim();

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

    const candidates = await prisma.candidate.findMany({
      where,
      orderBy: [{ fitScore: 'desc' }, { createdAt: 'desc' }],
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const headers = [
      'Username',
      'Name',
      'FitScore',
      'RoleCategory',
      'SEAConnection',
      'Status',
      'EvidenceQuote',
      'EvidenceUrl',
      'DraftText',
      'SentText',
      'LatestReplyText',
      'CreatedAt',
    ];

    const rows = candidates.map((c) => {
      const msg = c.messages[0];
      return [
        escapeCsvField(c.username),
        escapeCsvField(c.name),
        escapeCsvField(c.fitScore),
        escapeCsvField(c.roleCategory),
        escapeCsvField(c.seaConnection),
        escapeCsvField(c.status),
        escapeCsvField(c.evidenceQuote),
        escapeCsvField(c.evidenceUrl),
        escapeCsvField(msg?.draftText),
        escapeCsvField(msg?.sentText),
        escapeCsvField(msg?.latestReplyText),
        escapeCsvField(c.createdAt ? new Date(c.createdAt).toISOString() : ''),
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const dateStr = new Date().toISOString().slice(0, 10);

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="genai-fund-candidates-${dateStr}.csv"`,
      },
    });
  } catch (err: unknown) {
    console.error('[API /api/candidates/export] Error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Failed to export candidates' },
      { status: 500 }
    );
  }
}
