import Link from 'next/link';
import { Compass, Inbox, Sparkles, Shield, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="py-10 max-w-4xl mx-auto space-y-8">
      {/* Hero */}
      <div className="space-y-3 text-center sm:text-left">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5" />
          <span>GenAI Fund — Talent Intelligence Prototype</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-zinc-100 tracking-tight">
          AI &amp; Robotics Talent Scout &amp; Outreach
        </h1>
        <p className="text-zinc-400 text-sm max-w-2xl leading-relaxed">
          Evidence-grounded scout and outreach platform for discovering SEA founders, builders, and researchers on X.
          Review AI-generated personalized DMs with safety gates before sending.
        </p>
      </div>

      {/* Quick Launch Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/dashboard"
          className="group rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 hover:border-emerald-500/40 hover:bg-zinc-900/80 transition-all space-y-4"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-100 flex items-center justify-between">
              <span>Talent Discovery &amp; Review</span>
              <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
            </h2>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              Run target segment queries or seed accounts, inspect verifiable evidence quotes, and approve outreach DMs.
            </p>
          </div>
        </Link>

        <Link
          href="/inbox"
          className="group rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 hover:border-rose-500/40 hover:bg-zinc-900/80 transition-all space-y-4"
        >
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 group-hover:scale-105 transition-transform">
            <Inbox className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-100 flex items-center justify-between">
              <span>Outreach Inbox</span>
              <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-rose-400 group-hover:translate-x-0.5 transition-all" />
            </h2>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              Sync incoming replies directly from X API v2 and handle conversations needing attention.
            </p>
          </div>
        </Link>
      </div>

      {/* System Status Summary */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6 space-y-4">
        <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-400" />
          <span>Active Safety &amp; Compliance Controls</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3.5 space-y-1">
            <div className="font-semibold text-zinc-200 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>OAuth 2.0 PKCE</span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              5 scopes (dm.read, dm.write, users.read, tweet.read, offline.access) with automatic token refresh.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3.5 space-y-1">
            <div className="font-semibold text-zinc-200 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Sandbox Safety</span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Non-production sends restricted strictly to ALLOWED_TEST_HANDLES to prevent accidental outreach.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3.5 space-y-1">
            <div className="font-semibold text-zinc-200 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Deduplication Gate</span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Unique X user IDs and relational message logs guarantee no candidate is ever messaged twice.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
