'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Compass, Inbox, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { XAuthStatusDTO, RateLimitStatusDTO } from '@/types';
import { RateLimitBadge } from './RateLimitBadge';

export function HeaderNav() {
  const pathname = usePathname();
  const [authStatus, setAuthStatus] = useState<XAuthStatusDTO | null>(null);
  const [needsAttentionCount, setNeedsAttentionCount] = useState<number>(0);
  const [rateLimits, setRateLimits] = useState<RateLimitStatusDTO[]>([]);
  const [sandboxMode, setSandboxMode] = useState<boolean>(false);
  const [allowedHandles, setAllowedHandles] = useState<string | null>(null);
  const [sentToday, setSentToday] = useState<number>(0);
  const [dailyLimit, setDailyLimit] = useState<number>(25);

  const fetchStatusAndStats = async () => {
    try {
      // 1. Fetch Auth Status
      const authRes = await fetch('/api/auth/x/status');
      if (authRes.ok) {
        const authData: XAuthStatusDTO = await authRes.json();
        setAuthStatus(authData);
      }

      // 2. Fetch Candidates stats for badge & rate limits
      const candRes = await fetch('/api/candidates?limit=1');
      if (candRes.ok) {
        const candData = await candRes.json();
        setNeedsAttentionCount(candData.stats?.needsAttention || 0);
        setRateLimits(candData.rateLimits || []);
        setSandboxMode(Boolean(candData.sandboxMode));
        setAllowedHandles(candData.allowedHandles || null);
        if (candData.stats?.sentToday !== undefined) {
          setSentToday(candData.stats.sentToday);
        }
        if (candData.stats?.dailyLimit !== undefined) {
          setDailyLimit(candData.stats.dailyLimit);
        }
      }
    } catch (e) {
      console.error('Failed to load header status:', e);
    }
  };

  useEffect(() => {
    fetchStatusAndStats();
    const interval = setInterval(fetchStatusAndStats, 20000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Logo and Nav links */}
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-500 to-sky-500 flex items-center justify-center text-zinc-950 font-black text-sm shadow-sm group-hover:scale-105 transition-transform">
              G
            </div>
            <div>
              <span className="font-bold text-zinc-100 text-sm tracking-tight">GenAI Fund</span>
              <span className="text-[10px] text-zinc-400 block -mt-1 font-mono">Outreach Prototype</span>
            </div>
          </Link>

          <nav className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/dashboard"
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                pathname === '/dashboard' || pathname === '/'
                  ? 'bg-zinc-800 text-zinc-100 font-semibold shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </Link>

            <Link
              href="/inbox"
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors relative ${
                pathname === '/inbox'
                  ? 'bg-zinc-800 text-zinc-100 font-semibold shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              <Inbox className="w-3.5 h-3.5" />
              <span>Inbox</span>
              {needsAttentionCount > 0 && (
                <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold leading-none text-white bg-rose-600 rounded-full animate-pulse">
                  {needsAttentionCount}
                </span>
              )}
            </Link>
          </nav>
        </div>

        {/* Right side: Rate limits + X Auth Connection */}
        <div className="flex items-center gap-3">
          <div className="hidden md:flex">
            <RateLimitBadge
              rateLimits={rateLimits}
              sandboxMode={sandboxMode}
              allowedHandles={allowedHandles}
              sentToday={sentToday}
              dailyLimit={dailyLimit}
            />
          </div>

          {authStatus?.connected ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-mono">
                {authStatus.username ? `@${authStatus.username}` : 'X Connected (OAuth 1.0a)'}
              </span>
            </div>
          ) : (
            <a
              href="/api/auth/x/connect"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-sm transition-all hover:shadow-sky-500/20 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Connect X Account</span>
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
