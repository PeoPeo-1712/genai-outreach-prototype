'use client';

import React from 'react';
import { ExternalLink, MapPin, Tag, ShieldCheck, AlertCircle, MessageSquare } from 'lucide-react';
import { CandidateDTO, OutreachSendResult } from '@/types';
import { MessageDraftEditor } from './MessageDraftEditor';

interface CandidateCardProps {
  candidate: CandidateDTO;
  onRefresh?: () => void;
}

const X_BASE_URL = 'https://' + 'x.com';

export function CandidateCard({ candidate, onRefresh }: CandidateCardProps) {
  const latestMessage = candidate.messages?.[0] || null;
  const isDmClosed = candidate.status === 'BLOCKED_DM_CLOSED';
  const isRateLimited = candidate.status === 'RATE_LIMITED';
  const isSent = candidate.status === 'SENT';
  const isNeedsAttention = candidate.status === 'REPLIED_NEEDS_ATTENTION' || Boolean(latestMessage?.needsAttention);

  const getScoreColor = (score: number | null) => {
    if (!score) return 'bg-zinc-800 text-zinc-400 border-zinc-700';
    if (score >= 8) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    if (score >= 6) return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    return 'bg-zinc-800 text-zinc-400 border-zinc-700';
  };

  const getStatusBadge = () => {
    if (isNeedsAttention) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse">
          <MessageSquare className="w-3 h-3" /> Replied (Needs Attention)
        </span>
      );
    }
    if (isSent) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          Sent
        </span>
      );
    }
    if (isDmClosed) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <AlertCircle className="w-3 h-3" /> 403 DM Closed
        </span>
      );
    }
    if (isRateLimited) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
          429 Rate Limited
        </span>
      );
    }
    if (candidate.status === 'SKIPPED') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
          Skipped
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20">
        Pending Review
      </span>
    );
  };

  const profileUrl = `${X_BASE_URL}/${candidate.username}`;
  const evidenceTargetUrl = candidate.evidenceUrl || profileUrl;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 shadow-sm hover:border-zinc-700 transition-all space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-emerald-600/40 to-sky-600/40 border border-zinc-700 flex items-center justify-center font-bold text-zinc-100 text-base shrink-0">
            {candidate.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-zinc-100 text-base leading-tight">{candidate.name}</h3>
              <a
                href={profileUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-sky-400 hover:text-sky-300 font-mono flex items-center gap-1 group"
              >
                @{candidate.username}
                <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100" />
              </a>
              {getStatusBadge()}
            </div>

            {/* Sub-meta (Location & Role) */}
            <div className="flex items-center gap-3 text-xs text-zinc-400 mt-1 flex-wrap">
              {candidate.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-zinc-400" />
                  {candidate.location}
                </span>
              )}
              {candidate.roleCategory && (
                <span className="flex items-center gap-1">
                  <Tag className="w-3 h-3 text-zinc-400" />
                  {candidate.roleCategory}
                </span>
              )}
              {candidate.seaConnection && (
                <span className="text-zinc-400 border-l border-zinc-800 pl-2">
                  SEA: {candidate.seaConnection}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Fit Score Badge */}
        {candidate.fitScore !== null && (
          <div
            className={`self-start px-3 py-1.5 rounded-lg border font-bold text-xs flex items-center gap-1.5 shrink-0 ${getScoreColor(
              candidate.fitScore
            )}`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Fit Score: {candidate.fitScore}/10</span>
          </div>
        )}
      </div>

      {/* Bio */}
      {candidate.bio && (
        <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-950/40 p-2.5 rounded-lg border border-zinc-800/60">
          {candidate.bio}
        </p>
      )}

      {/* Why They Fit */}
      {candidate.whyTheyFit && (
        <div className="text-xs text-zinc-300">
          <span className="text-zinc-400 font-medium">Why they fit: </span>
          <span>{candidate.whyTheyFit}</span>
        </div>
      )}

      {/* Verbatim Grounded Evidence */}
      {candidate.evidenceQuote && (
        <div className="rounded-lg bg-zinc-950/80 border border-zinc-800 p-3 space-y-1.5 text-xs">
          <div className="flex items-center justify-between text-zinc-400 text-[11px] font-medium">
            <span>Verified Evidence (Verbatim)</span>
            <a
              href={evidenceTargetUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sky-400 hover:text-sky-300 flex items-center gap-1 font-normal"
            >
              <span>View Source Post</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <blockquote className="italic text-zinc-200 border-l-2 border-emerald-500/60 pl-2.5 py-0.5">
            &ldquo;{candidate.evidenceQuote}&rdquo;
          </blockquote>
        </div>
      )}

      {/* 403 DM Closed Alert & Public Reply Action */}
      {isDmClosed && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-amber-200">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <span>Blocked: DM Closed by User (X API 403)</span>
          </div>
          <p className="text-zinc-300 text-[11px] leading-relaxed">
            This candidate has direct messages restricted to verified accounts or people they follow. Self-serve X API
            does not allow posting public replies without an explicit mention.
          </p>
          <div className="pt-1 flex items-center gap-2">
            <a
              href={evidenceTargetUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 text-xs font-medium transition-colors"
            >
              <span>Open Source Post to Reply Publicly</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <a
              href={profileUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 text-xs transition-colors"
            >
              <span>Visit Profile</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}

      {/* Message Draft Editor */}
      <div className="pt-2 border-t border-zinc-800/80">
        <MessageDraftEditor
          candidateId={candidate.id}
          candidateUsername={candidate.username}
          initialDraftText={latestMessage?.draftText || ''}
          latestMessage={latestMessage}
          onUpdateSuccess={onRefresh}
          onSendComplete={(_result: OutreachSendResult) => onRefresh?.()}
        />
      </div>
    </div>
  );
}
