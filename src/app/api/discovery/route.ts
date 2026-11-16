import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { DiscoveryService } from '@/services/DiscoveryService';

const DiscoverySchema = z.object({
  mode: z.enum(['segment', 'seeds']).default('segment'),
  discoverySource: z.enum(['auto', 'exa', 'x']).default('auto'),
  query: z.string().optional(),
  seedHandles: z.array(z.string()).optional(),
  maxResults: z.number().int().min(1).max(50).optional(),
  useExa: z.boolean().optional(),
  tone: z.enum(['warm', 'direct', 'formal']).optional(),
  valueProp: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json().catch(() => ({}));
    const parseResult = DiscoverySchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid discovery parameters',
          details: parseResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const discoveryService = new DiscoveryService();
    const result = await discoveryService.discover(parseResult.data);

    return NextResponse.json({
      success: !result.errorCode,
      ...result,
    });
  } catch (err: unknown) {
    console.error('[API /api/discovery] Internal error:', err);
    return NextResponse.json(
      {
        error: (err as Error).message || 'Failed to execute discovery',
      },
      { status: 500 }
    );
  }
}
