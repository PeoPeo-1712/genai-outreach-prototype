'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Inbox, RefreshCw, Loader2, MessageSquare, CheckCircle2, Clock } from 'lucide-react';
import { CandidateDTO } from '@/types';
import { ReplyFeed } from '@/components/ReplyFeed';

export default function InboxPage() {
  const [candidates, setCandidates] = useState<CandidateDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  const fetchInboxCandidates = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/candidates?limit=100');
      if (res.ok) {
        const data = await res.json();
        const allCandidates: CandidateDTO[] = data.candidates || [];
        // Filter for candidates who have sent messages or replies
        const inboxList = allCandidates.filter(
          (c) =>
            c.status === 'SENT' ||
            c.status === 'REPLIED_NEEDS_ATTENTION' ||
            (c.messages && c.messages.some((m) => m.sendStatus === 'SENT' || m.latestReplyText))
        );
        setCandidates(inboxList);
      }
    } catch (err) {
      console.error('Failed to load inbox:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInboxCandidates();
  }, [fetchInboxCandidates]);

  const handleSyncReplies = async () => {
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      const res = await fetch('/api/outreach/sync', {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to sync replies');
      }

      setLastSyncedAt(new Date().toLocaleTimeString());
      setSyncFeedback(
        `Sync completed: ${data.syncedCount || 0} new replies found.`
      );
      fetchInboxCandidates();
    } catch (err: unknown) {
      setSyncFeedback(`Sync failed: ${(err as Error).message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const needsAttentionList = candidates.filter(
    (c) => c.status === 'REPLIED_NEEDS_ATTENTION' || c.messages?.some((m) => m.needsAttention)
  );
  const sentHistoryList = candidates.filter(
    (c) => !needsAttentionList.some((na) => na.id === c.id)
  );

  return (
    <div className="space-y-8">
      {/* Header & Sync Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2.5">
            <Inbox className="w-6 h-6 text-rose-400" />
            <span>Outreach Inbox &amp; Replies</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time synchronization of candidate direct messages from X API v2.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {lastSyncedAt && (
            <span className="text-[11px] text-zinc-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Synced at {lastSyncedAt}
            </span>
          )}

          <button
            type="button"
            onClick={handleSyncReplies}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50 cursor-pointer"
          >
            {isSyncing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            <span>Sync Replies</span>
          </button>
        </div>
      </div>

      {syncFeedback && (
        <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-3 text-xs text-zinc-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{syncFeedback}</span>
        </div>
      )}

      {isLoading ? (
        <div className="py-20 text-center text-zinc-400 text-xs flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
          <span>Fetching inbox conversations...</span>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Section 1: Needs Attention */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                <h2 className="font-semibold text-sm text-zinc-100">
                  Needs Attention ({needsAttentionList.length})
                </h2>
              </div>
              <span className="text-xs text-zinc-400">
                Candidates who have replied to your outreach
              </span>
            </div>

            {needsAttentionList.length === 0 ? (
              <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-8 text-center text-xs text-zinc-400 space-y-1">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-1" />
                <p className="font-medium text-zinc-300">All caught up!</p>
                <p>No candidates currently waiting for a follow-up.</p>
              </div>
            ) : (
              <ReplyFeed candidates={needsAttentionList} onRefresh={fetchInboxCandidates} />
            )}
          </div>

          {/* Section 2: Sent History */}
          <div className="space-y-4 pt-6 border-t border-zinc-800">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm text-zinc-200">
                Sent History ({sentHistoryList.length})
              </h2>
              <span className="text-xs text-zinc-400">
                Previously sent DMs awaiting reply
              </span>
            </div>

            {sentHistoryList.length === 0 ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-8 text-center text-xs text-zinc-400">
                <MessageSquare className="w-6 h-6 text-zinc-400 mx-auto mb-1" />
                <p>No sent messages in history.</p>
              </div>
            ) : (
              <ReplyFeed candidates={sentHistoryList} onRefresh={fetchInboxCandidates} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
