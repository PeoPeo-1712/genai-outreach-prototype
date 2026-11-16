'use client';

import React, { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Compass,
  Users,
  Search,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  RefreshCw,
  Send,
  Zap,
} from 'lucide-react';
import {
  CandidateDTO,
  CandidateStatsDTO,
  DiscoveryResultDTO,
  DiscoverySource,
  OutreachTone,
} from '@/types';
import { CandidateCard } from '@/components/CandidateCard';

function DashboardContent() {
  const searchParams = useSearchParams();

  // URL Banner state
  const xConnected = searchParams.get('x_connected');
  const xAuthError = searchParams.get('x_auth_error');

  // Discovery form state
  const [mode, setMode] = useState<'segment' | 'seeds'>('segment');
  const [discoverySource, setDiscoverySource] = useState<DiscoverySource>('auto');
  const [query, setQuery] = useState(
    '(AI OR Robotics OR "Embodied AI" OR LLM) (founder OR builder OR researcher) (Singapore OR Vietnam OR Indonesia OR SEA) -is:retweet'
  );
  const [seedHandlesText, setSeedHandlesText] = useState('sea_robotics_test, builder_sg, vn_ai_founder');
  const [maxResults, setMaxResults] = useState(10);
  const [tone, setTone] = useState<OutreachTone>('warm');
  const [valueProp, setValueProp] = useState(
    'At GenAI Fund, we back ambitious AI & robotics builders across Southeast Asia with early capital, GPU compute, and global network.'
  );
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoverySummary, setDiscoverySummary] = useState<string | null>(null);
  const [discoveryWarning, setDiscoveryWarning] = useState<string | null>(null);
  const [discoveryErrorCode, setDiscoveryErrorCode] = useState<string | null>(null);

  // Candidates list state
  const [candidates, setCandidates] = useState<CandidateDTO[]>([]);
  const [stats, setStats] = useState<CandidateStatsDTO>({
    all: 0,
    pending: 0,
    sent: 0,
    blocked: 0,
    needsAttention: 0,
    skipped: 0,
    sentToday: 0,
    dailyLimit: 25,
  });
  const [activeTab, setActiveTab] = useState<'PENDING' | 'SENT' | 'NEEDS_ATTENTION' | 'BLOCKED' | 'SKIPPED' | 'ALL'>(
    'PENDING'
  );
  const [searchFilter, setSearchFilter] = useState('');
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(true);

  const fetchCandidates = useCallback(async () => {
    setIsLoadingCandidates(true);
    try {
      const params = new URLSearchParams();
      params.set('status', activeTab);
      if (searchFilter.trim()) {
        params.set('search', searchFilter.trim());
      }
      params.set('limit', '50');

      const res = await fetch(`/api/candidates?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCandidates(data.candidates || []);
        if (data.stats) {
          setStats(data.stats);
        }
      }
    } catch (err) {
      console.error('Failed to fetch candidates:', err);
    } finally {
      setIsLoadingCandidates(false);
    }
  }, [activeTab, searchFilter]);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  const handleRunDiscovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsDiscovering(true);
    setDiscoverySummary(null);
    setDiscoveryWarning(null);
    setDiscoveryErrorCode(null);

    try {
      const seedHandles =
        mode === 'seeds'
          ? seedHandlesText
              .split(/[\n,]+/)
              .map((h) => h.trim())
              .filter(Boolean)
          : undefined;

      const res = await fetch('/api/discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          discoverySource,
          query: mode === 'segment' ? query : undefined,
          seedHandles,
          maxResults: Number(maxResults),
          tone,
          valueProp,
        }),
      });

      const data: DiscoveryResultDTO = await res.json();

      if (data.warning) {
        setDiscoveryWarning(data.warning);
      }
      if (data.errorCode) {
        setDiscoveryErrorCode(data.errorCode);
      }

      if (!res.ok && !data.candidates?.length) {
        throw new Error(data.errors?.[0] || 'Discovery run failed');
      }

      setDiscoverySummary(
        `Discovered ${data.processedCount} profile(s). Saved: ${data.candidates.length}, Skipped: ${data.skippedCount}.`
      );
      fetchCandidates();
    } catch (err: unknown) {
      setDiscoverySummary(`Error: ${(err as Error).message}`);
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleExportCsv = () => {
    const params = new URLSearchParams();
    params.set('status', activeTab);
    if (searchFilter.trim()) {
      params.set('search', searchFilter.trim());
    }
    window.location.href = `/api/candidates/export?${params.toString()}`;
  };

  return (
    <div className="space-y-8">
      {/* OAuth Banner Feedback */}
      {xConnected && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-300 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <div className="text-xs">
            <span className="font-bold">X Account Connected!</span> You can now approve and send DMs directly via
            OAuth 2.0 PKCE user context.
          </div>
        </div>
      )}

      {xAuthError && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-300 flex items-center gap-3">
          <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <div className="text-xs">
            <span className="font-bold">X Authorization Error:</span> {xAuthError}. Please ensure client credentials
            are set and callback URL matches.
          </div>
        </div>
      )}

      {/* 402 Fallback Warning Banner */}
      {discoveryWarning && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-300 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <div className="font-bold text-amber-200">Notice: {discoveryWarning}</div>
            <p className="text-zinc-300 text-[11px] leading-relaxed">
              Your X Developer Pay-per-use credits are depleted. The system successfully routed through Exa Search API
              to fetch technical post links and verbatim quotes so you can continue outreach uninterrupted.
            </p>
          </div>
        </div>
      )}

      {/* 402 Depleted Hard Stop Banner */}
      {discoveryErrorCode === 'X_CREDITS_DEPLETED' && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-rose-300 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1.5">
            <div className="font-bold text-rose-200">X API Credits Depleted (HTTP 402 Payment Required)</div>
            <p className="text-zinc-300 text-[11px] leading-relaxed">
              Your X Developer Pay-per-use account has no balance remaining. To resolve this:
            </p>
            <ul className="list-disc list-inside text-zinc-300 text-[11px] space-y-0.5">
              <li>
                Option A: Add a credit card and top up balance in the{' '}
                <a
                  href="https://developer.x.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-400 underline"
                >
                  X Developer Portal
                </a>
                .
              </li>
              <li>
                Option B: Add <code className="bg-zinc-800 px-1 py-0.5 rounded text-zinc-200">EXA_API_KEY</code> to{' '}
                <code className="bg-zinc-800 px-1 py-0.5 rounded text-zinc-200">.env</code> (Free 1,000 searches/mo at{' '}
                <a href="https://exa.ai" target="_blank" rel="noreferrer" className="text-sky-400 underline">
                  exa.ai
                </a>
                ) and select <strong>Exa Only</strong> or <strong>Auto</strong> mode.
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Hero Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2.5">
            <Compass className="w-6 h-6 text-emerald-400" />
            <span>Talent Discovery &amp; Outreach</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Scout SEA AI &amp; Robotics builders on X, ground evaluations in verifiable evidence, and review personalized
            DMs with safety controls.
          </p>
        </div>

        {/* Daily Send Cap & Actions */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs">
            <Send className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-zinc-400">Sent Today:</span>
            <span className="font-bold text-zinc-200">
              {stats.sentToday} / {stats.dailyLimit}
            </span>
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 hover:border-zinc-700 text-xs font-medium transition-colors cursor-pointer"
            title="Export candidates to CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Discovery Control Panel */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-800 pb-4 gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <h2 className="font-semibold text-sm text-zinc-200">Run Talent Discovery</h2>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Source Selector */}
            <div className="flex items-center gap-1.5 text-xs text-zinc-400">
              <span>Source:</span>
              <select
                value={discoverySource}
                onChange={(e) => setDiscoverySource(e.target.value as DiscoverySource)}
                className="bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="auto">Auto: X API ➔ Exa Fallback</option>
                <option value="exa">Exa Only (Free Tier)</option>
                <option value="x">X API Only</option>
              </select>
            </div>

            {/* Mode Toggle */}
            <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-xs">
              <button
                type="button"
                onClick={() => setMode('segment')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  mode === 'segment'
                    ? 'bg-zinc-800 text-zinc-100 font-semibold shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Target Segment
              </button>
              <button
                type="button"
                onClick={() => setMode('seeds')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  mode === 'seeds'
                    ? 'bg-zinc-800 text-zinc-100 font-semibold shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Seed Accounts
              </button>
            </div>
          </div>
        </div>

        <form onSubmit={handleRunDiscovery} className="space-y-4">
          {mode === 'segment' ? (
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-300">
                Search Query (Technical Builders &amp; Researchers in SEA)
              </label>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Query..."
                className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3.5 py-2 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-300">
                Seed Accounts (Comma-separated or newline-separated X handles)
              </label>
              <textarea
                rows={3}
                value={seedHandlesText}
                onChange={(e) => setSeedHandlesText(e.target.value)}
                placeholder="e.g. sea_robotics_test, minh_ai, vn_robotics"
                className="w-full rounded-lg bg-zinc-900 border border-zinc-800 p-3 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
              />
            </div>
          )}

          {/* Outreach Configuration (Tone & Value Prop & Limit) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 text-xs">
            <div>
              <label className="text-zinc-400 text-[11px] block mb-1">Outreach Tone:</label>
              <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                {(['warm', 'direct', 'formal'] as OutreachTone[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTone(t)}
                    className={`flex-1 py-1 rounded capitalize text-[11px] transition-colors ${
                      tone === t ? 'bg-emerald-600 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="text-zinc-400 text-[11px]">GenAI Fund Value Proposition:</label>
                <div className="flex items-center gap-1 text-[11px] text-zinc-400">
                  <span>Batch limit:</span>
                  <select
                    value={maxResults}
                    onChange={(e) => setMaxResults(Number(e.target.value))}
                    className="bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-zinc-200"
                  >
                    <option value={10}>10 profiles</option>
                    <option value={20}>20 profiles</option>
                    <option value={30}>30 profiles</option>
                  </select>
                </div>
              </div>
              <input
                type="text"
                value={valueProp}
                onChange={(e) => setValueProp(e.target.value)}
                placeholder="Fund pitch..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-zinc-400">
              {discoverySummary && <span>{discoverySummary}</span>}
            </div>

            <button
              type="submit"
              disabled={isDiscovering}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              {isDiscovering ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Discovering &amp; Scoring...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Find &amp; Score Candidates</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Review & Outreach Pipeline */}
      <div className="space-y-4">
        {/* Filter Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('PENDING')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'PENDING'
                  ? 'bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>Pending Review</span>
              <span className="px-1.5 py-0.2 rounded-full bg-zinc-800 text-[10px] font-mono">
                {stats.pending}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('SENT')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'SENT'
                  ? 'bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>Sent</span>
              <span className="px-1.5 py-0.2 rounded-full bg-zinc-800 text-[10px] font-mono">
                {stats.sent}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('NEEDS_ATTENTION')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'NEEDS_ATTENTION'
                  ? 'bg-rose-500/10 text-rose-400 font-semibold border border-rose-500/20'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>Needs Attention</span>
              {stats.needsAttention > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-mono font-bold">
                  {stats.needsAttention}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('BLOCKED')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'BLOCKED'
                  ? 'bg-amber-500/10 text-amber-400 font-semibold border border-amber-500/20'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>Blocked / Rate Limited</span>
              <span className="px-1.5 py-0.2 rounded-full bg-zinc-800 text-[10px] font-mono">
                {stats.blocked}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('SKIPPED')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'SKIPPED'
                  ? 'bg-zinc-800 text-zinc-100 font-semibold border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>Skipped</span>
              <span className="px-1.5 py-0.2 rounded-full bg-zinc-800 text-[10px] font-mono">
                {stats.skipped}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('ALL')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'ALL'
                  ? 'bg-zinc-800 text-zinc-100 font-semibold border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>All ({stats.all})</span>
            </button>
          </div>

          {/* Search box & Refresh */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search candidates..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-48 sm:w-64"
              />
            </div>

            <button
              type="button"
              onClick={fetchCandidates}
              className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
              title="Refresh list"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCandidates ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Candidate Cards Grid */}
        {isLoadingCandidates ? (
          <div className="py-16 text-center text-zinc-400 text-xs flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
            <span>Loading candidates from SQLite...</span>
          </div>
        ) : candidates.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/20 p-12 text-center text-zinc-400 text-xs space-y-2">
            <Users className="w-8 h-8 text-zinc-400 mx-auto" />
            <p className="font-medium text-zinc-300">No candidates found in &quot;{activeTab}&quot; view.</p>
            <p>Run discovery above to find and score builders across SEA.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {candidates.map((cand) => (
              <CandidateCard key={cand.id} candidate={cand} onRefresh={fetchCandidates} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-zinc-400 text-xs flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
          <span>Loading Dashboard...</span>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
