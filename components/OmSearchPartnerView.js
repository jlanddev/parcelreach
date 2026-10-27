'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import OmSearch from '@/components/OmSearch';

// Restricted view for partner accounts (role 'om_search'): a read-only
// "Signed Contracts" stat with a selectable window, then the OM Search tool
// in partner mode (search only — no paid detailed runs, no push-to-CRM).
export default function OmSearchPartnerView({ userName }) {
  const router = useRouter();
  const thisYear = new Date().getFullYear();
  const [win, setWin] = useState('all');          // 'all' | a year
  const [count, setCount] = useState(null);
  const [loadingStat, setLoadingStat] = useState(true);

  useEffect(() => {
    let live = true;
    setLoadingStat(true);
    const qs = win === 'all' ? '' : `?year=${win}`;
    fetch(`/api/stats/signed-contracts${qs}`)
      .then((r) => r.json())
      .then((d) => { if (live) { setCount(d?.ok ? d.count : null); setLoadingStat(false); } })
      .catch(() => { if (live) { setCount(null); setLoadingStat(false); } });
    return () => { live = false; };
  }, [win]);

  const signOut = async () => {
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
    router.push('/login');
  };

  const years = [thisYear, thisYear - 1, thisYear - 2];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <header className="border-b border-slate-700/60 bg-slate-900/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight">Go West Lands</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5">OM Search</span>
          </div>

          {/* Read-only Signed Contracts stat with a window selector (not a nav tab). */}
          <div className="flex items-center gap-2 rounded-xl border border-slate-700/70 bg-slate-800/60 px-3 py-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Signed Contracts</span>
            <span className="text-xl font-bold tabular-nums text-emerald-300 min-w-[2ch] text-center">{loadingStat ? '…' : (count ?? '—')}</span>
            <select
              value={win}
              onChange={(e) => setWin(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 px-2 py-1 focus:outline-none focus:border-emerald-500"
              aria-label="Signed contracts window"
            >
              <option value="all">All time</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {userName && <span className="text-sm text-slate-400 hidden sm:inline">{userName}</span>}
            <button onClick={signOut} className="text-sm font-medium px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700">Sign out</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <OmSearch partner />
      </main>
    </div>
  );
}
