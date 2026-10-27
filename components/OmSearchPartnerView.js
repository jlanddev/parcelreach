'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import OmSearch from '@/components/OmSearch';

// Restricted view for partner accounts: a read-only copy of the CRM's top tab
// bar (pipeline stages + live counts, UNCLICKABLE) with a year window, then the
// OM Search tool in partner mode (no paid detailed runs). Counts come from a
// server endpoint that returns numbers only — no lead data is exposed here.
const STAGES = [
  ['ppc_inflow', 'PPC Inflow'],
  ['appt_set', 'Mapped & Appointment Set'],
  ['offer_curated', 'Offer Curated'],
  ['offer_made', 'Offer Made'],
  ['signed_contracts', 'Signed Contracts'],
];

export default function OmSearchPartnerView({ userName }) {
  const router = useRouter();
  const thisYear = new Date().getFullYear();
  const [win, setWin] = useState(thisYear);        // year window; default current year
  const [counts, setCounts] = useState(null);

  useEffect(() => {
    let live = true;
    const qs = win === 'all' ? '' : `?year=${win}`;
    fetch(`/api/stats/pipeline${qs}`)
      .then((r) => r.json())
      .then((d) => { if (live) setCounts(d?.ok ? d.counts : {}); })
      .catch(() => { if (live) setCounts({}); });
    return () => { live = false; };
  }, [win]);

  const signOut = async () => {
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
    router.push('/login');
  };

  const years = [thisYear, thisYear - 1, thisYear - 2];
  const val = (k) => (counts ? (counts[k] ?? 0) : '…');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Top bar — mirrors the CRM pipeline tabs, but read-only (no clicks). */}
      <header className="border-b border-slate-700/60 bg-slate-900/90 backdrop-blur sticky top-0 z-30">
        <div className="px-4 sm:px-6 flex items-center gap-1 flex-wrap">
          {/* Year window selector sits where the CRM would start its tabs. */}
          <div className="flex items-center gap-2 pr-3 mr-1 border-r border-slate-700/60 py-2">
            <select
              value={win}
              onChange={(e) => setWin(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="bg-slate-800 border border-slate-600 rounded-lg text-sm font-semibold text-emerald-300 px-2.5 py-1.5 focus:outline-none focus:border-emerald-500"
              aria-label="Pipeline window"
            >
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
              <option value="all">All time</option>
            </select>
          </div>

          {/* Read-only stage "tabs": label + live count, not clickable. */}
          {STAGES.map(([key, label]) => (
            <div key={key} className="px-4 py-3 border-b-2 border-transparent text-slate-300 font-medium whitespace-nowrap select-none cursor-default" title="View only">
              {label} <span className="tabular-nums text-slate-400">({val(key)})</span>
            </div>
          ))}

          <div className="ml-auto flex items-center gap-3 py-2">
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
