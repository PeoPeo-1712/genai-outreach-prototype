'use client';

import React, { useState } from 'react';
import { Check, MessageSquare, ExternalLink, Calendar, Loader2 } from 'lucide-react';
import { CandidateDTO } from '@/types';

interface ReplyFeedProps {
  candidates: CandidateDTO[];
  onRefresh?: () => void;
}

const X_BASE_URL = 'https://' + 'x.com';

export function ReplyFeed({ candidates, onRefresh }: ReplyFeedProps) {
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const handleResolve = async (candidateId: string) => {
    setResolvingId(candidateId);
    try {
      const res = await fetch('/api/candidates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId, resolveAttention: true }),
      });
      if (!res.ok) throw new Error('Failed to resolve attention');
      onRefresh?.();
    } catch (err) {
      console.error('Error resolving attention:', err);
    } finally {
      setResolvingId(null);
    }
  };

  if (candidates.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-zinc-400 text-sm">
        <MessageSquare className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
        <p>No conversations found in this view.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {candidates.map((cand) => {
        const latestMsg = cand.messages?.[0];
        const isNeedsAttention = cand.status === 'REPLIED_NEEDS_ATTENTION' || Boolean(latestMsg?.needsAttention);

        return (
          <div
            key={cand.id}
            className={`rounded-xl border p-5 transition-all ${
              isNeedsAttention
                ? 'bg-rose-950/20 border-rose-500/40 ring-1 ring-rose-500/20'
                : 'bg-zinc-900/60 border-zinc-800'
            }`}
          >
            {/* Candidate Header */}
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-zinc-100 text-sm">{cand.name}</span>
                <a
                  href={`${X_BASE_URL}/${cand.username}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-sky-400 hover:text-sky-300 font-mono flex items-center gap-0.5"
                >
                  @{cand.username}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="flex items-center gap-2">
                {isNeedsAttention && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse">
                    Needs Attention
                  </span>
                )}
                {isNeedsAttention && (
                  <button
                    type="button"
                    onClick={() => handleResolve(cand.id)}
                    disabled={resolvingId === cand.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors cursor-pointer"
                  >
                    {resolvingId === cand.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                    <span>Mark Resolved</span>
                  </button>
                )}
              </div>
            </div>

            {/* Conversation Flow */}
            <div className="space-y-3">
              {/* Sent Outreach Message */}
              {latestMsg?.sentText && (
                <div className="flex flex-col items-end pl-8">
                  <div className="rounded-2xl rounded-tr-sm bg-emerald-600/20 border border-emerald-500/30 px-4 py-2.5 text-xs text-zinc-100 max-w-xl">
                    <p className="leading-relaxed">{latestMsg.sentText}</p>
                  </div>
                  {latestMsg.sentAt && (
                    <span className="text-[10px] text-zinc-400 mt-1 flex items-center gap-1">
                      <Calendar className="w-2.5 h-2.5" />
                      {new Date(latestMsg.sentAt).toLocaleString()}
                    </span>
                  )}
                </div>
              )}

              {/* Incoming Candidate Reply */}
              {latestMsg?.latestReplyText ? (
                <div className="flex flex-col items-start pr-8">
                  <div className="rounded-2xl rounded-tl-sm bg-zinc-800 border border-zinc-700 px-4 py-2.5 text-xs text-zinc-100 max-w-xl">
                    <div className="text-[11px] font-medium text-rose-400 mb-1">
                      Reply from @{cand.username}:
                    </div>
                    <p className="leading-relaxed">{latestMsg.latestReplyText}</p>
                  </div>
                  {latestMsg.repliedAt && (
                    <span className="text-[10px] text-zinc-400 mt-1 flex items-center gap-1">
                      <Calendar className="w-2.5 h-2.5" />
                      {new Date(latestMsg.repliedAt).toLocaleString()}
                    </span>
                  )}
                </div>
              ) : (
                <div className="text-xs text-zinc-400 italic pt-1">
                  Awaiting reply from candidate...
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
