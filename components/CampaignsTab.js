'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Campaigns tab: create and edit nurture sequences. A campaign is a list of
// steps (text or call) each with a day offset. Enrolling a lead (from the lead
// card / note screen) drips the texts and schedules the calls.
export default function CampaignsTab({ onToast }) {
  const [campaigns, setCampaigns] = useState(null);
  const [editing, setEditing] = useState(null); // campaign being edited/created
  const [err, setErr] = useState('');

  const load = async () => {
    const { data, error } = await supabase.from('campaigns').select('*').order('created_at', { ascending: true });
    if (error) { setErr(error.message); return; }
    setCampaigns(data || []);
  };
  useEffect(() => { load(); }, []);

  const blank = () => ({ name: '', description: '', active: true, steps: [{ value: 0, unit: 'minutes', type: 'text', message: '' }] });

  const save = async (c) => {
    const toMins = (v, u) => (Number(v) || 0) * (u === 'days' ? 1440 : u === 'hours' ? 60 : 1);
    const steps = (c.steps || []).map((s) => ({
      delayMins: toMins(s.value, s.unit),
      value: Number(s.value) || 0,
      unit: s.unit || 'minutes',
      type: s.type === 'call' ? 'call' : 'text',
      ...(s.type === 'call' ? { label: s.label || 'Call' } : { message: s.message || '' }),
    })).sort((a, b) => a.delayMins - b.delayMins);
    const payload = { name: c.name?.trim(), description: c.description || '', active: c.active !== false, steps };
    if (!payload.name) { setErr('Name is required'); return; }
    try {
      if (c.id) {
        const { error } = await supabase.from('campaigns').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', c.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('campaigns').insert(payload);
        if (error) throw error;
      }
      setEditing(null); setErr(''); load();
      onToast && onToast('Campaign saved', 'success');
    } catch (e) { setErr(e.message); }
  };

  const remove = async (id) => {
    if (!confirm('Delete this campaign? Leads already enrolled keep their scheduled steps.')) return;
    await supabase.from('campaigns').delete().eq('id', id);
    load();
  };
  const toggleActive = async (c) => {
    await supabase.from('campaigns').update({ active: !c.active }).eq('id', c.id);
    load();
  };

  if (editing) return <Editor initial={editing} onSave={save} onCancel={() => { setEditing(null); setErr(''); }} err={err} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Campaigns</h2>
          <p className="text-sm text-slate-400">Nurture sequences that drip texts and schedule calls so leads never sit.</p>
        </div>
        <button onClick={() => setEditing(blank())} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium">+ New Campaign</button>
      </div>
      {err && <p className="text-rose-400 text-sm">{err}</p>}
      {!campaigns && <p className="text-slate-500">Loading…</p>}
      {campaigns && campaigns.length === 0 && (
        <div className="text-slate-400 text-sm bg-slate-800/40 border border-slate-700/50 rounded-xl p-6">
          No campaigns yet. Run the campaigns migration in Supabase to load the 3 presets, or create one now.
        </div>
      )}
      <div className="grid gap-3">
        {campaigns && campaigns.map((c) => {
          const texts = (c.steps || []).filter((s) => s.type === 'text').length;
          const calls = (c.steps || []).filter((s) => s.type === 'call').length;
          const span = (c.steps || []).reduce((m, s) => Math.max(m, Number(s.day) || 0), 0);
          return (
            <div key={c.id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium">{c.name}</span>
                  {!c.active && <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-400">Paused</span>}
                </div>
                <div className="text-sm text-slate-400 truncate">{c.description}</div>
                <div className="text-xs text-slate-500 mt-1">{(c.steps || []).length} steps · {texts} texts · {calls} calls · over {span} days</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => toggleActive(c)} className="px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-600 text-slate-200 text-xs">{c.active ? 'Pause' : 'Activate'}</button>
                <button onClick={() => setEditing(c)} className="px-3 py-1.5 rounded-lg bg-blue-600/80 hover:bg-blue-500 text-white text-xs font-medium">Edit</button>
                <button onClick={() => remove(c.id)} className="px-2.5 py-1.5 rounded-lg bg-rose-900/30 hover:bg-rose-800/40 text-rose-300 text-xs">Delete</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const MERGE_FIELDS = [['First name', '{{first}}'], ['County', '{{county}}'], ['State', '{{state}}'], ['Acres', '{{acres}}'], ['Sender', '{{sender}}']];

function Editor({ initial, onSave, onCancel, err }) {
  // Normalize steps to value+unit (from delayMins, or legacy day).
  const normalize = (steps) => (steps || []).map((s) => {
    if (s.value != null && s.unit) return s;
    const mins = Number.isFinite(s.delayMins) ? s.delayMins : (Number(s.day) || 0) * 1440;
    const d = mins >= 1440 && mins % 1440 === 0 ? { value: mins / 1440, unit: 'days' } : mins >= 60 && mins % 60 === 0 ? { value: mins / 60, unit: 'hours' } : { value: mins, unit: 'minutes' };
    return { ...s, value: d.value, unit: d.unit };
  });
  const [c, setC] = useState(() => { const x = JSON.parse(JSON.stringify(initial)); x.steps = normalize(x.steps); return x; });
  const msgRefs = useRef({});
  const setField = (k, v) => setC((p) => ({ ...p, [k]: v }));
  const setStep = (i, k, v) => setC((p) => ({ ...p, steps: p.steps.map((s, idx) => idx === i ? { ...s, [k]: v } : s) }));
  const addStep = () => setC((p) => ({ ...p, steps: [...(p.steps || []), { value: 1, unit: 'days', type: 'text', message: '' }] }));
  const removeStep = (i) => setC((p) => ({ ...p, steps: p.steps.filter((_, idx) => idx !== i) }));
  // Insert a merge token at the cursor of a step's message box.
  const insertToken = (i, token) => {
    const el = msgRefs.current[i];
    const cur = c.steps[i]?.message || '';
    if (el && typeof el.selectionStart === 'number') {
      const pos = el.selectionStart;
      setStep(i, 'message', cur.slice(0, pos) + token + cur.slice(el.selectionEnd));
      setTimeout(() => { try { el.focus(); el.selectionStart = el.selectionEnd = pos + token.length; } catch {} }, 0);
    } else {
      setStep(i, 'message', (cur ? cur + ' ' : '') + token);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">{c.id ? 'Edit campaign' : 'New campaign'}</h2>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg bg-slate-700/60 hover:bg-slate-600 text-slate-200 text-sm">Cancel</button>
          <button onClick={() => onSave(c)} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium">Save</button>
        </div>
      </div>
      {err && <p className="text-rose-400 text-sm">{err}</p>}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Name</label>
          <input value={c.name || ''} onChange={(e) => setField('name', e.target.value)} className="w-full bg-slate-900/70 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100" placeholder="Talking to Family" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Description</label>
          <input value={c.description || ''} onChange={(e) => setField('description', e.target.value)} className="w-full bg-slate-900/70 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100" placeholder="When to use this sequence" />
        </div>
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-slate-200">Steps</span>
          <span className="text-xs text-slate-500">Timed from when a lead is enrolled</span>
        </div>
        <div className="space-y-2">
          {(c.steps || []).map((s, i) => (
            <div key={i} className="bg-slate-900/50 border border-slate-700/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-xs text-slate-400">Send after</span>
                <input type="number" min="0" value={s.value ?? 0} onChange={(e) => setStep(i, 'value', e.target.value)} className="w-16 bg-slate-900/70 border border-slate-700 rounded-md px-2 py-1 text-sm text-slate-100" />
                <select value={s.unit || 'minutes'} onChange={(e) => setStep(i, 'unit', e.target.value)} className="bg-slate-900/70 border border-slate-700 rounded-md px-2 py-1 text-sm text-slate-100">
                  <option value="minutes">minutes</option>
                  <option value="hours">hours</option>
                  <option value="days">days</option>
                </select>
                <span className="text-xs text-slate-500">of enrollment</span>
                <select value={s.type} onChange={(e) => setStep(i, 'type', e.target.value)} className="bg-slate-900/70 border border-slate-700 rounded-md px-2 py-1 text-sm text-slate-100">
                  <option value="text">Send text</option>
                  <option value="call">Schedule call</option>
                </select>
                <button onClick={() => removeStep(i)} className="ml-auto text-rose-400 hover:text-rose-300 text-sm">Remove</button>
              </div>
              {s.type === 'call' ? (
                <input value={s.label || ''} onChange={(e) => setStep(i, 'label', e.target.value)} placeholder="Call reason, e.g. Follow up on offer" className="w-full bg-slate-900/70 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-100" />
              ) : (
                <div>
                  <textarea ref={(el) => { msgRefs.current[i] = el; }} value={s.message || ''} onChange={(e) => setStep(i, 'message', e.target.value)} rows={2} placeholder="Hi {{first}}, this is {{sender}} with Haven Ground..." className="w-full resize-none bg-slate-900/70 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-100" />
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {MERGE_FIELDS.map(([label, token]) => (
                      <button key={token} type="button" onClick={() => insertToken(i, token)} className="px-2 py-0.5 rounded-md bg-slate-700/60 hover:bg-blue-600/40 text-slate-300 text-[11px]">+ {label}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <button onClick={addStep} className="mt-3 px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-600 text-slate-200 text-sm">+ Add step</button>
      </div>
    </div>
  );
}
