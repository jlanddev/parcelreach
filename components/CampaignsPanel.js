'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Follow-Up Campaigns: create drip sequences, enroll leads (manually or by
// auto-scanning silent inflow leads), and preview exactly what would send. Real
// sending stays OFF until CAMPAIGNS_LIVE=true is set in the environment; until
// then "Preview sends" shows the dry-run.

const BLANK_STEP = () => ({ day: 0, type: 'text', message: '', label: '' });

export default function CampaignsPanel({ leads = [], currentUserId, renderLeadCard, scheduledTasks = [], onOpenLead, onManageReminders }) {
  const [campaigns, setCampaigns] = useState(null);
  const [counts, setCounts] = useState({}); // campaignId -> { active, pending }
  const [openCampaign, setOpenCampaign] = useState(null); // campaign being viewed in detail
  const [enrolledIds, setEnrolledIds] = useState(new Set());
  const [enrollByCampaign, setEnrollByCampaign] = useState({}); // campaignId -> Set(leadId)
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null); // campaign being edited (or new)
  const [enrollFor, setEnrollFor] = useState(null); // campaign for the enroll modal
  const [enrollSearch, setEnrollSearch] = useState('');
  const [enrollSel, setEnrollSel] = useState(() => new Set());
  const [preview, setPreview] = useState(null);
  const [testPhone, setTestPhone] = useState('');

  const say = (msg, kind = 'success') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 2800); };

  const load = async () => {
    const { data: camps } = await supabase.from('campaigns').select('*').order('created_at', { ascending: true });
    // Hide the hidden settings row (used to store the appointment reminder config).
    setCampaigns((camps || []).filter(c => !String(c.name || '').startsWith('__settings')));
    const { data: enr } = await supabase.from('campaign_enrollments').select('lead_id, campaign_id, status');
    const { data: q } = await supabase.from('campaign_queue').select('campaign_id, status');
    const c = {};
    const byCamp = {};
    (camps || []).forEach(cp => { c[cp.id] = { active: 0, pending: 0 }; });
    (enr || []).forEach(e => { if (e.status === 'active' && c[e.campaign_id]) { c[e.campaign_id].active += 1; (byCamp[e.campaign_id] = byCamp[e.campaign_id] || new Set()).add(e.lead_id); } });
    (q || []).forEach(x => { if (x.status === 'pending' && c[x.campaign_id]) c[x.campaign_id].pending += 1; });
    setCounts(c);
    setEnrollByCampaign(byCamp);
  };
  useEffect(() => { load(); }, []);

  const leadsById = useMemo(() => Object.fromEntries(leads.map(l => [l.id, l])), [leads]);
  const openDetail = async (cp) => {
    setOpenCampaign(cp);
    setEnrolledIds(new Set());
    const { data } = await supabase.from('campaign_enrollments').select('lead_id, status').eq('campaign_id', cp.id).eq('status', 'active');
    setEnrolledIds(new Set((data || []).map(e => e.lead_id)));
  };
  // refresh enrolled set when campaigns reload while a detail is open
  useEffect(() => { if (openCampaign) { const cp = (campaigns || []).find(c => c.id === openCampaign.id); if (cp) openDetail(cp); } /* eslint-disable-next-line */ }, [campaigns]);

  const startNew = () => { setEditing({ id: null, name: '', description: '', steps: [BLANK_STEP()], active: true }); setShowCreate(true); };
  const startEdit = (cp) => { setEditing({ id: cp.id, name: cp.name, description: cp.description || '', steps: (Array.isArray(cp.steps) && cp.steps.length ? cp.steps : [BLANK_STEP()]).map(s => ({ day: s.day ?? 0, type: s.type || 'text', message: s.message || '', label: s.label || '' })), active: cp.active !== false }); setShowCreate(true); };

  const saveCampaign = async () => {
    if (!editing?.name.trim()) { say('Name is required', 'error'); return; }
    setBusy(true);
    const steps = editing.steps.map(s => {
      const base = { day: Number(s.day) || 0, type: s.type };
      if (s.type === 'call') base.label = s.label || 'Call';
      else base.message = s.message || '';
      return base;
    });
    const payload = { name: editing.name.trim(), description: editing.description.trim(), steps, active: editing.active };
    let err;
    if (editing.id) ({ error: err } = await supabase.from('campaigns').update(payload).eq('id', editing.id));
    else ({ error: err } = await supabase.from('campaigns').insert(payload));
    setBusy(false);
    if (err) { say('Could not save: ' + err.message, 'error'); return; }
    setShowCreate(false); setEditing(null); say('Campaign saved'); load();
  };

  const toggleActive = async (cp) => {
    setCampaigns(prev => prev.map(c => c.id === cp.id ? { ...c, active: !c.active } : c));
    const { error } = await supabase.from('campaigns').update({ active: !cp.active }).eq('id', cp.id);
    if (error) { say('Could not update', 'error'); load(); }
  };
  const deleteCampaign = async (cp) => {
    if (!window.confirm(`Delete "${cp.name}"? This removes its enrollments and queued texts.`)) return;
    const { error } = await supabase.from('campaigns').delete().eq('id', cp.id);
    if (error) { say('Could not delete', 'error'); return; }
    say('Campaign deleted'); load();
  };

  const doEnroll = async (campaignId, leadIds) => {
    setBusy(true);
    try {
      const res = await fetch('/api/campaigns/enroll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaignId, leadIds, userId: currentUserId }) });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'failed');
      say(`Enrolled ${j.enrolled}${j.already ? `, ${j.already} already in` : ''}, ${j.queued} texts queued`);
      setEnrollFor(null); setEnrollSel(new Set()); setEnrollSearch(''); load();
    } catch (e) { say('Enroll failed: ' + e.message, 'error'); }
    setBusy(false);
  };
  const scanSilent = async (cp) => {
    if (!window.confirm(`Find inflow leads with no reply in 7 days and enroll them into "${cp.name}" (they move out of inflow onto the drip)?`)) return;
    setBusy(true);
    try {
      const res = await fetch('/api/campaigns/enroll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaignId: cp.id, rule: 'silent-inflow', days: 7, moveOut: true, userId: currentUserId }) });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'failed');
      say(`Scanned ${j.considered}, enrolled ${j.enrolled}, ${j.queued} texts queued`);
      load();
    } catch (e) { say('Scan failed: ' + e.message, 'error'); }
    setBusy(false);
  };
  const sendTest = async () => {
    if (!testPhone.trim()) { say('Enter a phone number', 'error'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/campaigns/test-send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: testPhone.trim(), message: 'Test from Haven Ground campaigns, this is Jordan.' }) });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'failed');
      say('Test text sent, check that phone');
    } catch (e) { say('Test failed: ' + e.message, 'error'); }
    setBusy(false);
  };
  const runPreview = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/campaigns/run?dry=1', { method: 'POST' });
      const j = await res.json();
      setPreview(j);
    } catch (e) { say('Preview failed: ' + e.message, 'error'); }
    setBusy(false);
  };

  const stepSummary = (steps) => {
    if (!Array.isArray(steps) || !steps.length) return 'No steps';
    const t = steps.filter(s => s.type !== 'call').length, c = steps.filter(s => s.type === 'call').length;
    return `${steps.length} steps · ${t} text${t === 1 ? '' : 's'}, ${c} call${c === 1 ? '' : 's'} · over ${Math.max(...steps.map(s => Number(s.day) || 0))} days`;
  };

  // Needs-attention count for a campaign: due calls + leads who replied and owe us.
  const campaignNotif = (cp) => {
    const set = enrollByCampaign[cp.id] || new Set();
    if (!set.size) return 0;
    const replies = leads.filter(l => set.has(l.id) && l.last_contact_dir === 'inbound').length;
    const calls = (scheduledTasks || []).filter(t => t.status === 'pending' && (t.source === 'campaign' || /^campaign:/i.test(t.description || '')) && set.has(t.lead_id) && new Date(t.due_at) <= new Date()).length;
    return replies + calls;
  };

  const enrollList = useMemo(() => {
    const q = enrollSearch.trim().toLowerCase();
    return leads.filter(l => {
      if (!l.phone) return false;
      if (!q) return true;
      return [l.full_name, l.name, l.phone, l.property_county, l.county].filter(Boolean).join(' ').toLowerCase().includes(q);
    }).slice(0, 80);
  }, [leads, enrollSearch]);

  // ---- Campaign detail view data ----
  const enrolledLeads = openCampaign ? leads.filter(l => enrolledIds.has(l.id)).sort((a, b) => new Date(b.last_activity_at || b.created_at) - new Date(a.last_activity_at || a.created_at)) : [];
  const campaignCalls = openCampaign ? (scheduledTasks || []).filter(t => t.status === 'pending' && (t.source === 'campaign' || /^campaign:/i.test(t.description || '')) && enrolledIds.has(t.lead_id)).sort((a, b) => new Date(a.due_at) - new Date(b.due_at)) : [];
  const repliesWaiting = enrolledLeads.filter(l => l.last_contact_dir === 'inbound').length;
  const detailItems = openCampaign ? [
    ...enrolledLeads.filter(l => l.last_contact_dir === 'inbound').map(l => ({ kind: 'message', lead: l, ts: l.last_contact_at, text: l.last_contact_preview })),
    ...campaignCalls.map(t => ({ kind: 'call', lead: leadsById[t.lead_id], ts: t.due_at, overdue: new Date(t.due_at) < new Date() })),
  ].filter(it => it.lead).sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0)) : [];
  const fmtWhen = (iso) => { const d = new Date(iso); const today = new Date().toDateString() === d.toDateString(); return (today ? 'Today' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })) + ' ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };

  const detailView = openCampaign ? (
    <div className="space-y-5">
      <div>
        <button onClick={() => setOpenCampaign(null)} className="text-sm text-slate-300 hover:text-white inline-flex items-center gap-1.5 mb-3">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          All campaigns
        </button>
        <div className="bg-gradient-to-br from-rose-500/10 to-rose-600/5 border border-rose-500/40 rounded-xl p-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-2xl font-bold text-rose-300">{openCampaign.name}</h2>
              {openCampaign.description && <p className="text-slate-400 text-sm mt-1">{openCampaign.description}</p>}
              <div className="mt-2 flex items-center gap-4 text-sm text-slate-300">
                <span><span className="font-bold text-white">{enrolledLeads.length}</span> enrolled</span>
                <span><span className="font-bold text-white">{campaignCalls.length}</span> calls to make</span>
                {repliesWaiting > 0 && <span className="text-cyan-300"><span className="font-bold">{repliesWaiting}</span> replied, owe a response</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setEnrollFor(openCampaign); setEnrollSel(new Set()); setEnrollSearch(''); }} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white">Enroll leads</button>
              <button onClick={() => scanSilent(openCampaign)} disabled={busy} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:opacity-50">Scan silent (7d)</button>
              <button onClick={() => startEdit(openCampaign)} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200">Edit sequence</button>
            </div>
          </div>
        </div>
      </div>

      {/* Needs attention (new messages + due calls), like the inflow panel */}
      {detailItems.length > 0 && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-700/70 bg-slate-800 flex items-center gap-2 text-sm font-semibold text-white">
            <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1 rounded-full bg-red-500 text-white text-[11px] font-bold">{detailItems.length}</span>
            Needs attention in this campaign
          </div>
          <div className="max-h-56 overflow-y-auto divide-y divide-slate-700/50">
            {detailItems.map((it, i) => (
              <button key={i} onClick={() => onOpenLead && onOpenLead(it.lead)} className="w-full text-left px-4 py-2.5 hover:bg-slate-700/40 flex items-center gap-3">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${it.kind === 'call' ? 'bg-amber-400' : 'bg-cyan-400'}`} />
                <span className={`text-xs font-semibold uppercase tracking-wide flex-shrink-0 ${it.kind === 'call' ? 'text-amber-300' : 'text-cyan-300'}`}>{it.kind === 'call' ? 'Call' : 'New message'}</span>
                <span className="text-sm text-white truncate">{it.lead.full_name || it.lead.name || 'Lead'}</span>
                {it.kind === 'message' && it.text && <span className="text-xs text-slate-400 truncate hidden md:inline">“{it.text}”</span>}
                <span className="ml-auto text-xs text-slate-500 flex-shrink-0">{it.kind === 'call' ? (it.overdue ? 'Overdue' : 'Due') + ' ' + fmtWhen(it.ts) : (it.ts ? fmtWhen(it.ts) : '')}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sequence */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400 mb-3">Message &amp; follow-up sequence</h3>
        <div className="space-y-2">
          {(Array.isArray(openCampaign.steps) ? openCampaign.steps : []).map((s, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="flex-shrink-0 text-xs font-bold text-slate-400 w-14">Day {s.day ?? 0}</span>
              <span className={`flex-shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${s.type === 'call' ? 'bg-amber-500/20 text-amber-300' : 'bg-cyan-500/20 text-cyan-300'}`}>{s.type === 'call' ? 'Call' : 'Text'}</span>
              <span className="text-sm text-slate-200">{s.type === 'call' ? (s.label || 'Call') : s.message}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Enrolled leads */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400 mb-3">Enrolled leads ({enrolledLeads.length})</h3>
        {enrolledLeads.length === 0 ? (
          <div className="text-center py-12 text-slate-500 border border-dashed border-slate-700 rounded-xl">No leads enrolled yet. Use "Enroll leads" or "Scan silent".</div>
        ) : renderLeadCard ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">{enrolledLeads.map(l => <div key={l.id}>{renderLeadCard(l)}</div>)}</div>
        ) : (
          <div className="space-y-2">{enrolledLeads.map(l => (
            <button key={l.id} onClick={() => onOpenLead && onOpenLead(l)} className="w-full text-left bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 hover:bg-slate-700/60">
              <div className="text-sm text-white">{l.full_name || l.name}</div>
              <div className="text-xs text-slate-400">{l.phone}{l.last_contact_dir === 'inbound' ? ' · replied, owe a response' : ''}</div>
            </button>
          ))}</div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className="space-y-5">
      {openCampaign ? detailView : (<>
      <div className="bg-gradient-to-br from-rose-500/10 to-rose-600/5 border border-rose-500/40 rounded-xl p-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-rose-300">Follow-Up Campaigns</h2>
          <p className="text-slate-400 text-sm mt-1">Drip sequences that keep silent leads warm. Create a campaign, enroll leads, and preview exactly what goes out.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={runPreview} disabled={busy} className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 text-sm font-semibold disabled:opacity-50">Preview sends</button>
          <button onClick={startNew} className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold">+ New campaign</button>
        </div>
      </div>

      {/* Live/dry-run banner */}
      <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl px-4 py-3 text-sm text-amber-200">
        <p><span className="font-semibold">Sending is in safe mode (dry-run).</span> No automated texts go out until <code className="text-amber-100">CAMPAIGNS_LIVE=true</code> is set in Netlify. Use <span className="font-semibold">Preview sends</span> to see exactly what would go. Quiet hours (10am-8pm Central), one text per lead per day, opt-out, and auto-stop on reply are always enforced.</p>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-amber-100/80">Test sending works, text your own phone:</span>
          <input value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="(555) 555-5555" className="bg-slate-800 border border-slate-600 rounded-lg px-2.5 py-1 text-white text-sm w-40" />
          <button onClick={sendTest} disabled={busy} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50">Send test text</button>
        </div>
      </div>

      {/* Appointment reminders: an always-on automation, managed on the Appointments tab */}
      {(() => {
        const upcoming = (scheduledTasks || []).filter(t => t.task_type === 'meeting' && t.status === 'pending' && !/^BLOCKED/i.test(t.title || '') && t.lead_id && new Date(t.due_at) > new Date());
        const sent = upcoming.filter(t => /\[reminded/.test(t.description || '')).length;
        return (
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white">Appointment Reminders</h3>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">Always on</span>
              </div>
              <p className="text-sm text-slate-400 mt-1">Automatic texts before each scheduled appointment. You can set several (e.g. a day before and a few hours before).</p>
              <p className="text-xs text-slate-500 mt-2"><span className="font-bold text-white">{upcoming.length}</span> upcoming appointment{upcoming.length === 1 ? '' : 's'} · <span className="font-bold text-emerald-300">{sent}</span> already have a reminder sent</p>
            </div>
            {onManageReminders && <button onClick={onManageReminders} className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200">Manage reminders</button>}
          </div>
        );
      })()}

      {campaigns === null ? (
        <div className="text-slate-400">Loading campaigns…</div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-12 text-slate-400 border border-dashed border-slate-700 rounded-xl">No campaigns yet. Create your first drip.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {campaigns.map(cp => (
            <div key={cp.id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 cursor-pointer" onClick={() => openDetail(cp)}>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-white hover:text-rose-200">{cp.name}</h3>
                    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${cp.active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-600/40 text-slate-400'}`}>{cp.active ? 'Active' : 'Paused'}</span>
                    {campaignNotif(cp) > 0 && <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[11px] font-bold">{campaignNotif(cp)}</span>}
                  </div>
                  {cp.description && <p className="text-sm text-slate-400 mt-1">{cp.description}</p>}
                  <p className="text-xs text-slate-500 mt-2">{stepSummary(cp.steps)}</p>
                </div>
                <button onClick={() => toggleActive(cp)} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 flex-shrink-0">{cp.active ? 'Pause' : 'Activate'}</button>
              </div>
              <div className="mt-3 flex items-center gap-4 text-sm">
                <span className="text-slate-300"><span className="font-bold text-white">{counts[cp.id]?.active || 0}</span> enrolled</span>
                <span className="text-slate-300"><span className="font-bold text-white">{counts[cp.id]?.pending || 0}</span> texts queued</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => { setEnrollFor(cp); setEnrollSel(new Set()); setEnrollSearch(''); }} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-rose-600/20 text-rose-200 border border-rose-500/40 hover:bg-rose-600/40">Enroll leads</button>
                <button onClick={() => scanSilent(cp)} disabled={busy} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-700/60 text-slate-200 hover:bg-slate-600/60 disabled:opacity-50">Scan silent inflow (7d)</button>
                <button onClick={() => startEdit(cp)} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-700/60 text-slate-200 hover:bg-slate-600/60">Edit steps</button>
                <button onClick={() => deleteCampaign(cp)} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-700/40 text-slate-400 hover:text-red-300">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
      </>)}

      {/* Create / edit modal */}
      {showCreate && editing && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <h3 className="font-bold text-white">{editing.id ? 'Edit campaign' : 'New campaign'}</h3>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto">
              <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Campaign name" className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500" />
              <input value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} placeholder="Short description (optional)" className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 text-sm" />
              <div className="text-xs text-slate-400">Steps. Day = how many days after enrollment. Use <code>{'{{first}}'}</code> for the seller's first name.</div>
              <div className="space-y-2">
                {editing.steps.map((s, i) => (
                  <div key={i} className="bg-slate-900/50 border border-slate-700 rounded-lg p-2.5 flex gap-2 items-start">
                    <div className="flex flex-col items-center">
                      <label className="text-[10px] text-slate-500 uppercase">Day</label>
                      <input type="number" min="0" value={s.day} onChange={e => { const st = [...editing.steps]; st[i] = { ...s, day: e.target.value }; setEditing({ ...editing, steps: st }); }} className="w-14 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm text-center" />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-[10px] text-slate-500 uppercase">Type</label>
                      <select value={s.type} onChange={e => { const st = [...editing.steps]; st[i] = { ...s, type: e.target.value }; setEditing({ ...editing, steps: st }); }} className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm">
                        <option value="text">Text</option>
                        <option value="call">Call</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-slate-500 uppercase">{s.type === 'call' ? 'Call note' : 'Message'}</label>
                      {s.type === 'call'
                        ? <input value={s.label} onChange={e => { const st = [...editing.steps]; st[i] = { ...s, label: e.target.value }; setEditing({ ...editing, steps: st }); }} placeholder="e.g. Call new lead" className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm" />
                        : <textarea value={s.message} onChange={e => { const st = [...editing.steps]; st[i] = { ...s, message: e.target.value }; setEditing({ ...editing, steps: st }); }} rows="2" placeholder="Hi {{first}}, ..." className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm" />}
                    </div>
                    <button onClick={() => setEditing({ ...editing, steps: editing.steps.filter((_, j) => j !== i) })} className="text-slate-500 hover:text-red-300 mt-4">✕</button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <button onClick={() => setEditing({ ...editing, steps: [...editing.steps, BLANK_STEP()] })} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200">+ Add step</button>
                  <button onClick={() => { const maxDay = Math.max(0, ...editing.steps.map(s => Number(s.day) || 0)); const d = maxDay + 30; setEditing({ ...editing, steps: [...editing.steps, { day: d, type: 'text', message: 'Hi {{first}}, just checking in. Still happy to help with your land whenever the timing is right, no rush at all.', label: '' }, { day: d, type: 'call', label: 'Monthly check-in call', message: '' }] }); }} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40">+ Monthly touch (warm text + call)</button>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-700 flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg bg-slate-700 text-slate-200 text-sm">Cancel</button>
              <button onClick={saveCampaign} disabled={busy} className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold disabled:opacity-50">Save campaign</button>
            </div>
          </div>
        </div>
      )}

      {/* Enroll modal */}
      {enrollFor && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setEnrollFor(null)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <h3 className="font-bold text-white">Enroll leads into {enrollFor.name}</h3>
              <button onClick={() => setEnrollFor(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="p-4"><input autoFocus value={enrollSearch} onChange={e => setEnrollSearch(e.target.value)} placeholder="Search leads…" className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500" /></div>
            <div className="px-4 pb-2 overflow-y-auto space-y-1 flex-1">
              {enrollList.map(l => {
                const on = enrollSel.has(l.id);
                return (
                  <button key={l.id} onClick={() => { const n = new Set(enrollSel); on ? n.delete(l.id) : n.add(l.id); setEnrollSel(n); }} className={`w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left ${on ? 'bg-rose-600/20 border border-rose-500/40' : 'bg-slate-700/40 border border-transparent hover:bg-slate-700/60'}`}>
                    <div className="min-w-0"><div className="text-sm text-white truncate">{l.full_name || l.name || 'Unnamed'}</div><div className="text-xs text-slate-400 truncate">{l.phone}{(l.property_county || l.county) ? ` · ${l.property_county || l.county}` : ''}</div></div>
                    <span className={`w-4 h-4 rounded border flex-shrink-0 ${on ? 'bg-rose-500 border-rose-500' : 'border-slate-500'}`} />
                  </button>
                );
              })}
            </div>
            <div className="p-4 border-t border-slate-700 flex justify-between items-center">
              <span className="text-sm text-slate-400">{enrollSel.size} selected</span>
              <button onClick={() => doEnroll(enrollFor.id, Array.from(enrollSel))} disabled={busy || enrollSel.size === 0} className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold disabled:opacity-50">Enroll {enrollSel.size || ''}</button>
            </div>
          </div>
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <h3 className="font-bold text-white">Dry-run preview</h3>
              <button onClick={() => setPreview(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="p-4 overflow-y-auto">
              <p className="text-sm text-slate-300 mb-3">{preview.live ? 'LIVE mode.' : 'Safe mode (not sending).'} {preview.wouldSend ?? 0} text{(preview.wouldSend ?? 0) === 1 ? '' : 's'} are due right now.</p>
              {(preview.preview || []).length === 0 ? (
                <div className="text-slate-500 text-sm">Nothing due to send at this moment.</div>
              ) : (
                <div className="space-y-2">
                  {(preview.preview || []).map((p, i) => (
                    <div key={i} className="bg-slate-900/50 border border-slate-700 rounded-lg p-3">
                      <div className="text-sm text-white font-medium">{p.name} <span className="text-slate-500 text-xs">{p.phone}</span></div>
                      <div className="text-sm text-slate-300 mt-1">{p.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-lg shadow-xl text-sm font-medium ${toast.kind === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>{toast.msg}</div>}
    </div>
  );
}
