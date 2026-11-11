'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Dispo Center: the BUYER side, isolated from the seller pipeline. Reads
// `buyer_leads` (RLS: authenticated only). Laid out like PPC Inflow: a row of
// PROPERTY tabs across the top (each property a tab), the property named as the
// header, and a grid of buyer cards that look and act like the lead cards.

const STAGES = ['New', 'Contacted', 'Matched', 'Offer Out', 'Sold', 'Dead'];

const STAGE_PILL = {
  'New':      'bg-green-500/20 text-green-300 border-green-500/40',
  'Contacted':'bg-sky-500/20 text-sky-300 border-sky-500/40',
  'Matched':  'bg-amber-500/20 text-amber-300 border-amber-500/40',
  'Offer Out':'bg-purple-500/20 text-purple-300 border-purple-500/40',
  'Sold':     'bg-green-600/25 text-green-200 border-green-500/50',
  'Dead':     'bg-slate-600/30 text-slate-400 border-slate-600/50',
};

const fmtMoney = (n) => {
  if (n == null || n === '' || isNaN(Number(n))) return '';
  return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
};
const fmtAge = (ts) => {
  if (!ts) return '';
  const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

// A buyer rendered as the lead-shaped object the real Call/Message modals expect
// (they key off phone + id, so texting sends via Project Blue by phone exactly
// like the seller cards).
const asLead = (b) => ({
  id: b.id, phone: b.phone, owner_phone: b.phone,
  full_name: b.full_name, name: b.full_name, email: b.email, source: b.source,
});

export default function DispoCenter({ onText, onCall }) {
  const [buyers, setBuyers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeProp, setActiveProp] = useState('__all__'); // property key or '__all__' / '__none__'
  const [stageFilter, setStageFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [activities, setActivities] = useState({});
  const [noteDraft, setNoteDraft] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('buyer_leads').select('*').order('last_activity_at', { ascending: false });
    if (error) setError(error.message);
    else { setError(''); setBuyers(data || []); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  // Build the property tab index from the buyers' property interests.
  const propKey = (p) => (p.slug || p.title || '').toLowerCase().trim();
  const propIndex = {};
  let noProp = 0;
  buyers.forEach((b) => {
    const props = b.properties || [];
    if (props.length === 0) { noProp++; return; }
    const seen = new Set();
    props.forEach((p) => {
      const k = propKey(p);
      if (!k || seen.has(k)) return;
      seen.add(k);
      if (!propIndex[k]) propIndex[k] = { label: p.title || p.slug, count: 0 };
      propIndex[k].count++;
    });
  });
  const propList = Object.entries(propIndex).sort((a, b) => b[1].count - a[1].count);

  const inProp = (b) => {
    if (activeProp === '__all__') return true;
    if (activeProp === '__none__') return (b.properties || []).length === 0;
    return (b.properties || []).some((p) => propKey(p) === activeProp);
  };
  const q = search.trim().toLowerCase();
  const matchSearch = (b) => {
    if (!q) return true;
    const hay = [b.full_name, b.phone, b.email, b.source, b.stage,
      ...(b.properties || []).map((p) => p.title || p.slug)].join(' ').toLowerCase();
    return hay.includes(q);
  };
  const visible = buyers
    .filter(inProp)
    .filter((b) => stageFilter === 'All' || (b.stage || 'New') === stageFilter)
    .filter(matchSearch)
    .sort((a, b) => {
      const ta = new Date(a.last_activity_at || a.created_at || 0).getTime();
      const tb = new Date(b.last_activity_at || b.created_at || 0).getTime();
      return sort === 'oldest' ? ta - tb : tb - ta;
    });

  const headerLabel = activeProp === '__all__' ? 'All Buyers'
    : activeProp === '__none__' ? 'No property'
    : (propIndex[activeProp]?.label || 'Property');

  const moveStage = async (buyer, stage) => {
    if (stage === buyer.stage) return;
    const now = new Date().toISOString();
    const history = [...(buyer.stage_history || []), { stage, at: now }];
    setBuyers((bs) => bs.map((b) => (b.id === buyer.id ? { ...b, stage, stage_history: history, last_activity_at: now } : b)));
    const { error } = await supabase.from('buyer_leads')
      .update({ stage, stage_history: history, last_activity_at: now, updated_at: now }).eq('id', buyer.id);
    if (error) { setError(error.message); load(); return; }
    await supabase.from('buyer_activities').insert([{ buyer_lead_id: buyer.id, type: 'stage_change', body: `Moved to ${stage}`, meta: { from: buyer.stage, to: stage } }]).then(() => {}, () => {});
    if (expanded === buyer.id) loadActivities(buyer.id);
  };

  const loadActivities = async (buyerId) => {
    const { data } = await supabase.from('buyer_activities')
      .select('*').eq('buyer_lead_id', buyerId).order('created_at', { ascending: false });
    setActivities((a) => ({ ...a, [buyerId]: data || [] }));
  };
  const toggleExpand = (id) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id); setNoteDraft('');
    if (!activities[id]) loadActivities(id);
  };
  const addNote = async (buyer) => {
    const text = noteDraft.trim(); if (!text) return;
    const now = new Date().toISOString();
    setNoteDraft('');
    await supabase.from('buyer_activities').insert([{ buyer_lead_id: buyer.id, type: 'note', body: text }]);
    await supabase.from('buyer_leads').update({ last_activity_at: now, updated_at: now }).eq('id', buyer.id);
    loadActivities(buyer.id);
    setBuyers((bs) => bs.map((b) => (b.id === buyer.id ? { ...b, last_activity_at: now } : b)));
  };

  const total = buyers.length;
  const tabBtn = (key, label, count, active) => (
    <button key={key} onClick={() => { setActiveProp(key); setStageFilter('All'); }}
      className={`px-4 py-3 font-medium border-b-2 transition whitespace-nowrap ${active ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-white'}`}>
      {label}{typeof count === 'number' ? ` (${count})` : ''}
    </button>
  );

  return (
    <div>
      {/* PROPERTY TABS (like the main CRM tab row) */}
      <div className="bg-slate-800/30 border-b border-slate-700/50 -mx-6 px-6 mb-5">
        <div className="flex items-center gap-2 overflow-x-auto">
          {tabBtn('__all__', 'All Buyers', total, activeProp === '__all__')}
          {propList.map(([key, info]) => tabBtn(key, info.label, info.count, activeProp === key))}
          {noProp > 0 && tabBtn('__none__', 'No property', noProp, activeProp === '__none__')}
        </div>
      </div>

      {/* HEADER: which property this is for */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-2xl font-bold text-white">{headerLabel}</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            {visible.length} buyer{visible.length === 1 ? '' : 's'}
            {activeProp !== '__all__' && activeProp !== '__none__' ? ' interested in this property' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, email…"
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white w-56 outline-none focus:border-blue-500" />
          <select value={sort} onChange={(e) => setSort(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-sm text-slate-200 outline-none">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
          <button onClick={load} className="px-3 py-2 text-sm font-semibold rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200">Refresh</button>
          <button onClick={() => setAdding(true)} className="px-3 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white">+ Add Buyer</button>
        </div>
      </div>

      {/* STAGE FILTER CHIPS */}
      <div className="flex flex-wrap gap-2 mb-5">
        {['All', ...STAGES].map((s) => {
          const n = s === 'All' ? buyers.filter(inProp).length : buyers.filter(inProp).filter((b) => (b.stage || 'New') === s).length;
          const active = stageFilter === s;
          return (
            <button key={s} onClick={() => setStageFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${active ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'}`}>
              {s} <span className="opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      {error && <div className="mb-4 px-4 py-2 rounded-lg bg-red-500/15 border border-red-500/40 text-red-300 text-sm">{error}</div>}

      {loading ? (
        <div className="text-slate-400 text-sm py-10 text-center">Loading buyers…</div>
      ) : total === 0 ? (
        <EmptyState onAdd={() => setAdding(true)} />
      ) : visible.length === 0 ? (
        <div className="text-slate-400 text-sm py-10 text-center border border-slate-700 rounded-xl bg-slate-800/40">No buyers in this view.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((b) => (
            <BuyerCard key={b.id} b={b}
              expanded={expanded === b.id} activities={activities[b.id]}
              noteDraft={noteDraft} setNoteDraft={setNoteDraft}
              onText={onText} onCall={onCall}
              onToggle={() => toggleExpand(b.id)} onMove={(s) => moveStage(b, s)} onNote={() => addNote(b)} />
          ))}
        </div>
      )}

      {adding && <AddBuyer propLabel={activeProp !== '__all__' && activeProp !== '__none__' ? propIndex[activeProp]?.label : ''}
        propSlug={activeProp !== '__all__' && activeProp !== '__none__' ? activeProp : ''}
        onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </div>
  );
}

function BuyerCard({ b, expanded, activities, noteDraft, setNoteDraft, onText, onCall, onToggle, onMove, onNote }) {
  const props = b.properties || [];
  const isNew = (b.stage || 'New') === 'New';
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden hover:border-blue-500/50 hover:shadow-xl hover:shadow-blue-500/10 transition-all">
      {/* NEW BUYER banner, mirrors the seller card's NEW LEAD banner */}
      {isNew && (
        <div className="bg-green-500/30 border-b border-green-500/50 px-4 py-2.5 flex items-center gap-2">
          <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
          <span className="text-sm font-semibold text-green-300">NEW BUYER</span>
        </div>
      )}

      <div className="p-5">
        {/* Tag row: stage + source */}
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          <span className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border ${STAGE_PILL[b.stage || 'New']}`}>{b.stage || 'New'}</span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-700/60 text-slate-300">{b.source}</span>
          {b.sale_price != null && <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-green-600/20 text-green-300">{fmtMoney(b.sale_price)}</span>}
        </div>

        {/* Name */}
        <div className="text-xl font-bold text-white leading-tight">{b.full_name || 'Unnamed buyer'}</div>

        {/* Interested property */}
        {props.length > 0 && (
          <div className="text-xs text-slate-400 mt-1">
            Interested in: <span className="text-slate-200">{props.map((p) => p.title || p.slug).join(', ')}</span>
          </div>
        )}

        {/* Contact */}
        <div className="mt-3 space-y-1 text-sm">
          {b.phone && <div className="text-slate-300">{b.phone}</div>}
          {b.email && <div className="text-slate-400 truncate">{b.email}</div>}
        </div>

        {/* Real actions: same Call + Messages modals as the seller lead card */}
        <div className="flex items-center gap-1.5 flex-wrap mt-3">
          {b.phone && (
            <button onClick={() => onCall && onCall(asLead(b))} title="Call"
              className="px-3 py-1.5 rounded-lg bg-green-600/20 hover:bg-green-600/40 text-green-300 text-xs font-medium flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" /></svg>
              Call
            </button>
          )}
          {b.phone && (
            <button onClick={() => onText && onText(asLead(b))} title="Open conversation"
              className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 text-xs font-medium flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" /></svg>
              Messages
            </button>
          )}
          {b.email && (
            <a href={`mailto:${b.email}`} title="Email"
              className="px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-600 text-slate-200 text-xs font-medium flex items-center gap-1.5">
              Email
            </a>
          )}
        </div>

        {/* Stage control + age */}
        <div className="flex items-center justify-between gap-2 mt-3">
          <select value={b.stage || 'New'} onChange={(e) => onMove(e.target.value)}
            className="text-xs bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 outline-none">
            {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={onToggle} className="text-xs font-semibold text-slate-400 hover:text-white">{expanded ? 'Hide notes' : 'Notes & activity'}</button>
        </div>
        <div className="text-[11px] text-slate-500 mt-1.5">Updated {fmtAge(b.last_activity_at)}</div>

        {/* Expanded notes/activity */}
        {expanded && (
          <div className="mt-3 border-t border-slate-700/70 pt-3">
            <div className="flex gap-2">
              <input value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onNote(); }}
                placeholder="Add a note…"
                className="flex-1 text-xs bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 outline-none" />
              <button onClick={onNote} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200">Add</button>
            </div>
            <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
              {(activities || []).map((a) => (
                <div key={a.id} className="text-xs text-slate-300">
                  <span className="text-slate-500">{fmtAge(a.created_at)} · </span>
                  {a.type === 'note' ? '' : <span className="text-slate-500">{a.type} · </span>}{a.body}
                </div>
              ))}
              {(activities || []).length === 0 && <div className="text-xs text-slate-600">No activity yet.</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onAdd }) {
  return (
    <div className="border border-slate-700 rounded-xl bg-slate-800/40 py-14 px-6 text-center">
      <div className="text-slate-200 font-semibold">No buyers yet</div>
      <div className="text-slate-400 text-sm mt-1 max-w-md mx-auto">Buyers show up here as they inquire from your property pages, or add one by hand.</div>
      <button onClick={onAdd} className="mt-4 px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white">+ Add your first buyer</button>
    </div>
  );
}

function AddBuyer({ propLabel, propSlug, onClose, onSaved }) {
  const [f, setF] = useState({ full_name: '', phone: '', email: '', source: 'Added by hand', property: propLabel || '', sale_price: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const save = async () => {
    if (!f.phone.trim() && !f.email.trim()) { setErr('Add a phone or email.'); return; }
    setSaving(true); setErr('');
    const now = new Date().toISOString();
    const props = f.property.trim()
      ? [{ slug: propSlug || null, title: f.property.trim(), at: now }]
      : [];
    const row = {
      full_name: f.full_name.trim() || null,
      phone: f.phone.trim() || null,
      email: f.email.trim() || null,
      source: f.source.trim() || 'Added by hand',
      stage: 'New',
      stage_history: [{ stage: 'New', at: now }],
      status: 'active',
      properties: props,
      sale_price: f.sale_price.trim() ? Number(f.sale_price.replace(/[^\d.]/g, '')) : null,
      last_activity_at: now,
    };
    const { error } = await supabase.from('buyer_leads').insert([row]);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-bold text-white mb-3">Add Buyer{propLabel ? ` to ${propLabel}` : ''}</div>
        {err && <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/15 border border-red-500/40 text-red-300 text-sm">{err}</div>}
        <div className="space-y-2.5">
          {[['full_name', 'Full name'], ['phone', 'Phone'], ['email', 'Email'], ['property', 'Interested in (property)'], ['sale_price', 'Target price (optional)'], ['source', 'Source']].map(([k, label]) => (
            <div key={k}>
              <label className="block text-xs text-slate-400 mb-1">{label}</label>
              <input value={f[k]} onChange={set(k)}
                className="w-full text-sm bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-emerald-500" />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-2 text-sm font-semibold rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-60">{saving ? 'Saving…' : 'Add Buyer'}</button>
        </div>
      </div>
    </div>
  );
}
