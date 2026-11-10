'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Dispo Center: the BUYER side of the business, fully isolated from the seller
// pipeline. Reads the `buyer_leads` table (RLS: authenticated only). Buyers
// arrive from the Haven Ground property pages via /api/buyer-lead, or are added
// here by hand.

const STAGES = ['New', 'Contacted', 'Matched', 'Offer Out', 'Sold', 'Dead'];

const STAGE_STYLE = {
  'New':      { dot: 'bg-emerald-400', text: 'text-emerald-300', ring: 'border-emerald-500/40' },
  'Contacted':{ dot: 'bg-sky-400',     text: 'text-sky-300',     ring: 'border-sky-500/40' },
  'Matched':  { dot: 'bg-amber-400',   text: 'text-amber-300',   ring: 'border-amber-500/40' },
  'Offer Out':{ dot: 'bg-purple-400',  text: 'text-purple-300',  ring: 'border-purple-500/40' },
  'Sold':     { dot: 'bg-green-500',   text: 'text-green-300',   ring: 'border-green-500/40' },
  'Dead':     { dot: 'bg-slate-500',   text: 'text-slate-400',   ring: 'border-slate-600/40' },
};

const fmtMoney = (n) => {
  if (n == null || n === '' || isNaN(Number(n))) return '';
  return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
};
const fmtWhen = (ts) => {
  if (!ts) return '';
  const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};
const telHref = (p) => 'tel:' + (p || '').replace(/[^\d+]/g, '');

export default function DispoCenter() {
  const [buyers, setBuyers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState(null); // buyer id whose activity is open
  const [activities, setActivities] = useState({}); // buyerId -> [activity]
  const [noteDraft, setNoteDraft] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('buyer_leads')
      .select('*')
      .order('last_activity_at', { ascending: false });
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

  const moveStage = async (buyer, stage) => {
    if (stage === buyer.stage) return;
    const now = new Date().toISOString();
    const history = [...(buyer.stage_history || []), { stage, at: now }];
    setBuyers((bs) => bs.map((b) => (b.id === buyer.id ? { ...b, stage, stage_history: history, last_activity_at: now } : b)));
    const { error } = await supabase.from('buyer_leads')
      .update({ stage, stage_history: history, last_activity_at: now, updated_at: now })
      .eq('id', buyer.id);
    if (error) { setError(error.message); load(); return; }
    await supabase.from('buyer_activities').insert([{
      buyer_lead_id: buyer.id, type: 'stage_change',
      body: `Moved to ${stage}`, meta: { from: buyer.stage, to: stage },
    }]).then(() => {}, () => {});
    if (expanded === buyer.id) loadActivities(buyer.id);
  };

  const loadActivities = async (buyerId) => {
    const { data } = await supabase.from('buyer_activities')
      .select('*').eq('buyer_lead_id', buyerId).order('created_at', { ascending: false });
    setActivities((a) => ({ ...a, [buyerId]: data || [] }));
  };

  const toggleExpand = (buyerId) => {
    if (expanded === buyerId) { setExpanded(null); return; }
    setExpanded(buyerId); setNoteDraft('');
    if (!activities[buyerId]) loadActivities(buyerId);
  };

  const addNote = async (buyer) => {
    const text = noteDraft.trim();
    if (!text) return;
    const now = new Date().toISOString();
    setNoteDraft('');
    await supabase.from('buyer_activities').insert([{ buyer_lead_id: buyer.id, type: 'note', body: text }]);
    await supabase.from('buyer_leads').update({ last_activity_at: now, updated_at: now }).eq('id', buyer.id);
    loadActivities(buyer.id);
    setBuyers((bs) => bs.map((b) => (b.id === buyer.id ? { ...b, last_activity_at: now } : b)));
  };

  const byStage = (stage) => buyers.filter((b) => (b.stage || 'New') === stage);
  const total = buyers.length;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            Dispo Center
            <span className="text-sm font-semibold text-slate-400">{total} buyer{total === 1 ? '' : 's'}</span>
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">Buyers interested in Haven Ground property. Separate from seller leads.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load}
            className="px-3 py-2 text-sm font-semibold rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200">
            Refresh
          </button>
          <button onClick={() => setAdding(true)}
            className="px-3 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white">
            + Add Buyer
          </button>
        </div>
      </div>

      {error && <div className="mb-4 px-4 py-2 rounded-lg bg-red-500/15 border border-red-500/40 text-red-300 text-sm">{error}</div>}

      {loading ? (
        <div className="text-slate-400 text-sm py-10 text-center">Loading buyers…</div>
      ) : total === 0 ? (
        <div className="border border-slate-700 rounded-xl bg-slate-800/40 py-14 px-6 text-center">
          <div className="text-slate-200 font-semibold">No buyers yet</div>
          <div className="text-slate-400 text-sm mt-1 max-w-md mx-auto">
            Buyers show up here automatically as they inquire from your property pages, or add one by hand with the button above.
          </div>
          <button onClick={() => setAdding(true)}
            className="mt-4 px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white">
            + Add your first buyer
          </button>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {STAGES.map((stage) => {
            const list = byStage(stage);
            const st = STAGE_STYLE[stage];
            return (
              <div key={stage} className="flex-shrink-0 w-[300px]">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className={`w-2 h-2 rounded-full ${st.dot}`} />
                  <span className={`text-sm font-semibold ${st.text}`}>{stage}</span>
                  <span className="text-xs text-slate-500">{list.length}</span>
                </div>
                <div className="space-y-2 min-h-[60px]">
                  {list.map((b) => (
                    <BuyerCard
                      key={b.id} b={b} st={st}
                      expanded={expanded === b.id}
                      activities={activities[b.id]}
                      noteDraft={noteDraft} setNoteDraft={setNoteDraft}
                      onToggle={() => toggleExpand(b.id)}
                      onMove={(s) => moveStage(b, s)}
                      onNote={() => addNote(b)}
                    />
                  ))}
                  {list.length === 0 && <div className="text-xs text-slate-600 px-1 py-2">Empty</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {adding && <AddBuyer onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </div>
  );
}

function BuyerCard({ b, st, expanded, activities, noteDraft, setNoteDraft, onToggle, onMove, onNote }) {
  const props = b.properties || [];
  return (
    <div className={`rounded-xl bg-slate-800/70 border ${st.ring} p-3`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-white truncate">{b.full_name || 'Unnamed buyer'}</div>
          <div className="text-xs text-slate-400 mt-0.5">{b.source}</div>
        </div>
        {b.sale_price != null && <div className="text-xs font-semibold text-green-300 whitespace-nowrap">{fmtMoney(b.sale_price)}</div>}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs">
        {b.phone && <a href={telHref(b.phone)} className="text-sky-300 hover:underline">{b.phone}</a>}
        {b.email && <a href={`mailto:${b.email}`} className="text-slate-300 hover:underline truncate max-w-[160px]">{b.email}</a>}
      </div>

      {props.length > 0 && (
        <div className="mt-2 text-xs text-slate-300">
          <span className="text-slate-500">Interested in: </span>
          {props.map((p, i) => (
            <span key={i}>{p.title || p.slug || 'a property'}{i < props.length - 1 ? ', ' : ''}</span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-3">
        <select value={b.stage || 'New'} onChange={(e) => onMove(e.target.value)}
          className="text-xs bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 outline-none">
          {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={onToggle} className="text-xs text-slate-400 hover:text-white">
          {expanded ? 'Hide' : 'Notes'}
        </button>
      </div>
      <div className="text-[11px] text-slate-500 mt-1.5">{fmtWhen(b.last_activity_at)}</div>

      {expanded && (
        <div className="mt-3 border-t border-slate-700/70 pt-2">
          <div className="flex gap-2">
            <input value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onNote(); }}
              placeholder="Add a note…"
              className="flex-1 text-xs bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 outline-none" />
            <button onClick={onNote} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200">Add</button>
          </div>
          <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
            {(activities || []).map((a) => (
              <div key={a.id} className="text-xs text-slate-300">
                <span className="text-slate-500">{fmtWhen(a.created_at)} · </span>{a.body}
              </div>
            ))}
            {(activities || []).length === 0 && <div className="text-xs text-slate-600">No activity yet.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function AddBuyer({ onClose, onSaved }) {
  const [f, setF] = useState({ full_name: '', phone: '', email: '', source: 'Added by hand', property: '', sale_price: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const save = async () => {
    if (!f.phone.trim() && !f.email.trim()) { setErr('Add a phone or email.'); return; }
    setSaving(true); setErr('');
    const now = new Date().toISOString();
    const row = {
      full_name: f.full_name.trim() || null,
      phone: f.phone.trim() || null,
      email: f.email.trim() || null,
      source: f.source.trim() || 'Added by hand',
      stage: 'New',
      stage_history: [{ stage: 'New', at: now }],
      status: 'active',
      properties: f.property.trim() ? [{ title: f.property.trim(), at: now }] : [],
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
        <div className="text-lg font-bold text-white mb-3">Add Buyer</div>
        {err && <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/15 border border-red-500/40 text-red-300 text-sm">{err}</div>}
        <div className="space-y-2.5">
          {[
            ['full_name', 'Full name'],
            ['phone', 'Phone'],
            ['email', 'Email'],
            ['property', 'Interested in (property)'],
            ['sale_price', 'Target price (optional)'],
            ['source', 'Source'],
          ].map(([k, label]) => (
            <div key={k}>
              <label className="block text-xs text-slate-400 mb-1">{label}</label>
              <input value={f[k]} onChange={set(k)}
                className="w-full text-sm bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-emerald-500" />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-2 text-sm font-semibold rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-60">
            {saving ? 'Saving…' : 'Add Buyer'}
          </button>
        </div>
      </div>
    </div>
  );
}
