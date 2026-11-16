'use client';

import React from 'react';
import { ShieldAlert, Zap, Clock } from 'lucide-react';
import { RateLimitStatusDTO } from '@/types';

interface RateLimitBadgeProps {
  rateLimits?: RateLimitStatusDTO[];
  sandboxMode?: boolean;
  allowedHandles?: string | null;
}

export function RateLimitBadge({ rateLimits = [], sandboxMode = false, allowedHandles }: RateLimitBadgeProps) {
  const dmLimit = rateLimits.find((r) => r.endpoint.includes('dm') || r.endpoint.includes('messages'));
  const searchLimit = rateLimits.find((r) => r.endpoint.includes('search'));

  const primaryLimit = dmLimit || searchLimit || rateLimits[0];

  const getResetTimeFormatted = (epoch: number | null | undefined) => {
    if (!epoch) return 'Unknown';
    const date = new Date(epoch * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex items-center gap-2 text-xs">
      {/* Sandbox Mode Badge */}
      {sandboxMode ? (
        <div
          title={`Sandbox Safety Active: Outbound DMs only allowed to handles: ${allowedHandles || 'None configured'}`}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 font-medium"
        >
          <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
          <span>Sandbox Mode ({allowedHandles ? `@${allowedHandles}` : 'Active'})</span>
        </div>
      ) : (
        <div
          title="Production mode: Outreach will message approved candidates directly"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-medium"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Live Safety</span>
        </div>
      )}

      {/* Rate Limit Badge */}
      {primaryLimit && primaryLimit.remaining !== null ? (
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-medium ${
            primaryLimit.remaining === 0
              ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
              : (primaryLimit.remaining || 0) < 5
              ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
              : 'bg-zinc-800 text-zinc-300 border-zinc-700'
          }`}
          title={`X API Quota for ${primaryLimit.endpoint}: ${primaryLimit.remaining}/${primaryLimit.limitMax || 'N/A'}. Resets at ${getResetTimeFormatted(
            primaryLimit.resetEpoch
          )}`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>
            API Quota: <strong>{primaryLimit.remaining}</strong>
            {primaryLimit.limitMax ? `/${primaryLimit.limitMax}` : ''}
          </span>
          {primaryLimit.resetEpoch && (
            <span className="flex items-center gap-1 text-zinc-400 pl-1 border-l border-zinc-700">
              <Clock className="w-3 h-3" />
              {getResetTimeFormatted(primaryLimit.resetEpoch)}
            </span>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-800/80 text-zinc-400 border border-zinc-700/60">
          <Zap className="w-3.5 h-3.5 text-zinc-400" />
          <span>X API Ready</span>
        </div>
      )}
    </div>
  );
}
