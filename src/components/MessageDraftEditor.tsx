'use client';

import React, { useState } from 'react';
import { Send, Save, SkipForward, Loader2, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { MessageDTO, OutreachSendResult } from '@/types';

interface MessageDraftEditorProps {
  candidateId: string;
  candidateUsername: string;
  initialDraftText: string;
  latestMessage?: MessageDTO | null;
  onUpdateSuccess?: () => void;
  onSendComplete?: (result: OutreachSendResult) => void;
}

export function MessageDraftEditor({
  candidateId,
  candidateUsername,
  initialDraftText,
  latestMessage,
  onUpdateSuccess,
  onSendComplete,
}: MessageDraftEditorProps) {
  const [text, setText] = useState(latestMessage?.draftText || initialDraftText || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);

  const charCount = text.length;
  const isOverLimit = charCount > 450;
  const isSent = latestMessage?.sendStatus === 'SENT';

  const handleSaveDraft = async () => {
    if (isOverLimit) {
      setFeedback({ type: 'error', message: 'Cannot save: message exceeds 450 characters limit.' });
      return;
    }
    setIsSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/candidates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId, draftText: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save draft');
      setFeedback({ type: 'success', message: 'Draft saved successfully.' });
      onUpdateSuccess?.();
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: (err as Error).message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleApproveAndSend = async () => {
    if (isOverLimit || charCount === 0) return;
    setIsSending(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/outreach/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId, messageText: text }),
      });
      const data: OutreachSendResult = await res.json();

      if (data.success) {
        setFeedback({ type: 'success', message: `DM sent successfully to @${candidateUsername}!` });
      } else {
        if (data.status === 'SANDBOX_BLOCKED') {
          setFeedback({
            type: 'warning',
            message: `Sandbox blocked: @${candidateUsername} is not in ALLOWED_TEST_HANDLES.`,
          });
        } else if (data.status === 'BLOCKED_DM_CLOSED') {
          setFeedback({
            type: 'warning',
            message: 'Recipient has closed DMs or does not accept messages from non-followed accounts.',
          });
        } else if (data.status === 'RATE_LIMITED') {
          setFeedback({
            type: 'warning',
            message: 'X API rate limit reached. Outreach will cool down until reset epoch.',
          });
        } else if (data.status === 'DUPLICATE_BLOCKED') {
          setFeedback({
            type: 'warning',
            message: 'Duplicate prevention triggered: Candidate was already messaged previously.',
          });
        } else {
          setFeedback({ type: 'error', message: data.error || 'Failed to send DM' });
        }
      }

      onSendComplete?.(data);
      onUpdateSuccess?.();
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: (err as Error).message || 'Network error sending DM' });
    } finally {
      setIsSending(false);
    }
  };

  const handleSkip = async () => {
    setIsSkipping(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/candidates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId, status: 'SKIPPED' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to skip candidate');
      setFeedback({ type: 'success', message: 'Candidate marked as skipped.' });
      onUpdateSuccess?.();
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: (err as Error).message });
    } finally {
      setIsSkipping(false);
    }
  };

  if (isSent) {
    return (
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-400">
        <div className="flex items-center gap-2 font-medium mb-1">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          <span>Outreach Message Sent</span>
        </div>
        <p className="text-zinc-300 italic text-xs">&ldquo;{latestMessage?.sentText || text}&rdquo;</p>
        {latestMessage?.sentAt && (
          <span className="text-[11px] text-zinc-400 mt-2 block">
            Sent at: {new Date(latestMessage.sentAt).toLocaleString()}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Personalized DM draft..."
          className={`w-full rounded-lg bg-zinc-900 border p-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 transition-all ${
            isOverLimit
              ? 'border-rose-500 focus:ring-rose-500'
              : 'border-zinc-800 focus:ring-emerald-500 focus:border-zinc-700'
          }`}
        />
        <div
          className={`absolute bottom-2.5 right-3 text-[11px] font-mono font-medium ${
            isOverLimit ? 'text-rose-400 font-bold' : charCount > 400 ? 'text-amber-400' : 'text-zinc-400'
          }`}
        >
          {charCount}/450
        </div>
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-2 p-2.5 rounded-lg text-xs ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : feedback.type === 'warning'
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : feedback.type === 'warning' ? (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={handleSkip}
          disabled={isSkipping || isSending || isSaving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 transition-colors disabled:opacity-50"
        >
          {isSkipping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SkipForward className="w-3.5 h-3.5" />}
          <span>Skip</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isSaving || isSending || isSkipping || isOverLimit}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors border border-zinc-700 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>Save Draft</span>
          </button>

          <button
            type="button"
            onClick={handleApproveAndSend}
            disabled={isSending || isSaving || isSkipping || isOverLimit || charCount === 0}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Approve &amp; Send</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
