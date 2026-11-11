'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

// Dispo Center: the BUYER side. Buyers are real `leads` rows (source =
// 'dispo-buyer'), so each one renders with the EXACT same lead card as the
// seller board (renderCard, passed from LandApp) and every function works and
// persists. They're walled off from the seller pipeline/Google at the fetch
// layer. This component only adds the property tabs, search, and the grid.

const propOf = (b) => b?.form_data?.property || null;
const propKey = (p) => (p?.slug || p?.title || '').toLowerCase().trim();

export default function DispoCenter({ buyers = [], renderCard, onReload }) {
  const [activeProp, setActiveProp] = useState('__all__');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [adding, setAdding] = useState(false);

  // Property tabs from each buyer's interested property.
  const propIndex = {};
  let noProp = 0;
  buyers.forEach((b) => {
    const p = propOf(b);
    const k = propKey(p);
    if (!k) { noProp++; return; }
    if (!propIndex[k]) propIndex[k] = { label: p.title || p.slug, count: 0 };
    propIndex[k].count++;
  });
  const propList = Object.entries(propIndex).sort((a, b) => b[1].count - a[1].count);

  const inProp = (b) => {
    if (activeProp === '__all__') return true;
    if (activeProp === '__none__') return !propKey(propOf(b));
    return propKey(propOf(b)) === activeProp;
  };
  const q = search.trim().toLowerCase();
  const matchSearch = (b) => {
    if (!q) return true;
    const hay = [b.full_name, b.name, b.phone, b.email, b.city, b.county, b.state].join(' ').toLowerCase();
    return hay.includes(q);
  };
  const visible = buyers.filter(inProp).filter(matchSearch).sort((a, b) => {
    const ta = new Date(a.last_activity_at || a.created_at || 0).getTime();
    const tb = new Date(b.last_activity_at || b.created_at || 0).getTime();
    return sort === 'oldest' ? ta - tb : tb - ta;
  });

  const total = buyers.length;
  const headerLabel = activeProp === '__all__' ? 'All Buyers'
    : activeProp === '__none__' ? 'No property'
    : (propIndex[activeProp]?.label || 'Property');

  const tabBtn = (key, label, count, active) => (
    <button key={key} onClick={() => setActiveProp(key)}
      className={`px-4 py-3 font-medium border-b-2 transition whitespace-nowrap ${active ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-white'}`}>
      {label}{typeof count === 'number' ? ` (${count})` : ''}
    </button>
  );

  return (
    <div>
      {/* PROPERTY TABS */}
      <div className="bg-slate-800/30 border-b border-slate-700/50 -mx-6 px-6 mb-5">
        <div className="flex items-center gap-2 overflow-x-auto">
          {tabBtn('__all__', 'All Buyers', total, activeProp === '__all__')}
          {propList.map(([key, info]) => tabBtn(key, info.label, info.count, activeProp === key))}
          {noProp > 0 && tabBtn('__none__', 'No property', noProp, activeProp === '__none__')}
        </div>
      </div>

      {/* HEADER: which property this is for */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
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
          <button onClick={() => onReload && onReload()} className="px-3 py-2 text-sm font-semibold rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200">Refresh</button>
          <button onClick={() => setAdding(true)} className="px-3 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white">+ Add Buyer</button>
        </div>
      </div>

      {total === 0 ? (
        <EmptyState onAdd={() => setAdding(true)} />
      ) : visible.length === 0 ? (
        <div className="text-slate-400 text-sm py-10 text-center border border-slate-700 rounded-xl bg-slate-800/40">No buyers in this view.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((b) => (renderCard ? renderCard(b) : null))}
        </div>
      )}

      {adding && (
        <AddBuyer
          propLabel={activeProp !== '__all__' && activeProp !== '__none__' ? propIndex[activeProp]?.label : ''}
          propSlug={activeProp !== '__all__' && activeProp !== '__none__' ? activeProp : ''}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); onReload && onReload(); }}
        />
      )}
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
  const [f, setF] = useState({ full_name: '', phone: '', email: '', property: propLabel || '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const save = async () => {
    if (!f.phone.trim() && !f.email.trim()) { setErr('Add a phone or email.'); return; }
    setSaving(true); setErr('');
    const now = new Date().toISOString();
    const row = {
      full_name: f.full_name.trim() || null,
      name: f.full_name.trim() || null,
      phone: f.phone.trim() || null,
      email: f.email.trim() || null,
      source: 'dispo-buyer',
      status: 'new',
      pipeline_status: 'NEW',
      address: f.property.trim() ? `Buyer interest: ${f.property.trim()}` : 'Buyer (no property)',
      last_activity_at: now,
      form_data: {
        buyer: true,
        property: f.property.trim() ? { slug: propSlug || null, title: f.property.trim() } : null,
      },
    };
    const { error } = await supabase.from('leads').insert([row]);
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
          {[['full_name', 'Full name'], ['phone', 'Phone'], ['email', 'Email'], ['property', 'Interested in (property)']].map(([k, label]) => (
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
