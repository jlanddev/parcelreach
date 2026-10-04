'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Follow-Up Campaigns: create drip sequences, enroll leads (manually or by
// auto-scanning silent inflow leads), and preview exactly what would send. Real
// sending stays OFF until CAMPAIGNS_LIVE=true is set in the environment; until
// then "Preview sends" shows the dry-run.

const BLANK_STEP = () => ({ delayMin: 0, type: 'text', message: '', label: '' });
// The appointment-reminders automation is stored as a campaign with this name.
const REMINDER_CAMPAIGN_NAME = 'Appointment Reminders';
// Committed/closed stages a bulk drip must NEVER touch, no matter what you pick
// (a signed/closed/dead deal should never get a generic "still interested?").
// Everything else, including Offer Curated/Sent and Negotiating, is selectable.
const ALWAYS_EXCLUDED = ['UNDER_CONTRACT', 'CLOSED', 'DEAD', 'WE_PASSED', 'ARCHIVED'];
// Stages checked by default on a brand-new campaign (early pipeline). You can
// tick any of the mid-funnel stages on top.
const DEFAULT_STAGES = ['NEW', 'CONTACTING', 'ANTHONY_CONTACTED', 'ANTHONY_FOLLOW_UP', 'NURTURE'];
// Ready-to-use message templates so a step is never a blank box you have to guess at.
const MESSAGE_TEMPLATES = [
  { name: 'Friendly check-in', body: 'Hi {{first}}, just checking in on your land in {{county}}. Still happy to help whenever the timing is right, no pressure at all.' },
  { name: 'Still interested?', body: 'Hey {{first}}, are you still open to selling your property in {{county}}? Happy to take a quick look and see what we could do.' },
  { name: 'Quick call ask', body: 'Hi {{first}}, would you have a few minutes for a quick call about your land in {{county}}? Easier to answer any questions that way.' },
  { name: 'No pressure follow-up', body: 'Hey {{first}}, following up one more time. No rush at all, just let me know if selling your {{county}} property is something you want to explore.' },
  { name: 'Cash buyer intro', body: 'Hi {{first}}, I buy land in {{county}} and would love to make you a fair cash offer on your property. Open to a quick chat?' },
  { name: 'Re-engage (gone quiet)', body: 'Hey {{first}}, it has been a bit. Still interested in helping with your land in {{county}} whenever you are ready. Shoot me a text anytime.' },
  { name: 'Timing check', body: 'Hi {{first}}, is now a better time to talk about your {{county}} property, or should I circle back down the road?' },
];
// Step timing helpers: delayMin (minutes after enrollment) is the source of truth.
const stepOffsetMin = (s) => (s && s.delayMin != null) ? Number(s.delayMin) : (Number(s?.day) || 0) * 1440;
const splitDelay = (min) => { min = Number(min) || 0; if (min === 0) return { amount: 0, unit: 'min' }; if (min % 1440 === 0) return { amount: min / 1440, unit: 'day' }; if (min % 60 === 0) return { amount: min / 60, unit: 'hour' }; return { amount: min, unit: 'min' }; };
const toMin = (amount, unit) => { const a = Number(amount) || 0; return unit === 'day' ? a * 1440 : unit === 'hour' ? a * 60 : a; };
const offsetLabel = (min) => { min = Number(min) || 0; if (min === 0) return 'Right away'; if (min < 60) return `${min} min`; if (min < 1440) { const h = min / 60; return `${Number.isInteger(h) ? h : h.toFixed(1)} hr`; } const d = min / 1440; return `Day ${Number.isInteger(d) ? d : d.toFixed(1)}`; };

export default function CampaignsPanel({ leads = [], currentUserId, renderLeadCard, scheduledTasks = [], onOpenLead, onManageReminders, stages = [], stageGroups = [] }) {
  const [campaigns, setCampaigns] = useState(null);
  const [counts, setCounts] = useState({}); // campaignId -> { active, pending }
  const [openCampaign, setOpenCampaign] = useState(null); // campaign being viewed in detail
  const [enrolledIds, setEnrolledIds] = useState(new Set());
  const [detailQueue, setDetailQueue] = useState([]); // text queue for the open campaign
  const [enrolledAtById, setEnrolledAtById] = useState({}); // leadId -> enrollment time (open campaign)
  const [enrollAtByCampaign, setEnrollAtByCampaign] = useState({}); // campaignId -> { leadId: enrolledAt } (active)
  const [enrollAtAllByCampaign, setEnrollAtAllByCampaign] = useState({}); // campaignId -> { leadId: enrolledAt } (all)
  const [templateFor, setTemplateFor] = useState(null); // step index whose template list is open
  const [aiGoal, setAiGoal] = useState(''); // AI builder: describe the campaign
  const [aiFeedback, setAiFeedback] = useState(''); // follow-up tweak request
  const [aiMessages, setAiMessages] = useState([]); // running conversation with Claude (memory)
  const [aiDrafted, setAiDrafted] = useState(false); // a draft exists, show refine box
  const [aiBusy, setAiBusy] = useState(false);
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
  const [isLive, setIsLive] = useState(null); // null=unknown, true/false from /status
  const [maxPerRun, setMaxPerRun] = useState(8);
  useEffect(() => {
    fetch('/api/campaigns/status').then(r => r.json()).then(j => { if (j?.ok) { setIsLive(!!j.live); setMaxPerRun(j.maxPerRun || 8); } }).catch(() => {});
  }, []);

  const say = (msg, kind = 'success') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 2800); };

  const load = async () => {
    const { data: camps } = await supabase.from('campaigns').select('*').order('created_at', { ascending: true });
    // Hide the hidden settings row (used to store the appointment reminder config).
    setCampaigns((camps || []).filter(c => !String(c.name || '').startsWith('__settings')));
    const { data: enr } = await supabase.from('campaign_enrollments').select('lead_id, campaign_id, status, created_at');
    const { data: q } = await supabase.from('campaign_queue').select('campaign_id, status');
    const c = {};
    const byCamp = {};
    const atByCamp = {};     // active enrollments only (for needs-attention)
    const atByCampAll = {};  // every enrollment ever (for response stats)
    (camps || []).forEach(cp => { c[cp.id] = { active: 0, pending: 0, sent: 0 }; });
    (enr || []).forEach(e => {
      if (!c[e.campaign_id]) return;
      (atByCampAll[e.campaign_id] = atByCampAll[e.campaign_id] || {})[e.lead_id] = e.created_at;
      if (e.status === 'active') { c[e.campaign_id].active += 1; (byCamp[e.campaign_id] = byCamp[e.campaign_id] || new Set()).add(e.lead_id); (atByCamp[e.campaign_id] = atByCamp[e.campaign_id] || {})[e.lead_id] = e.created_at; }
    });
    (q || []).forEach(x => { if (!c[x.campaign_id]) return; if (x.status === 'pending') c[x.campaign_id].pending += 1; else if (x.status === 'sent') c[x.campaign_id].sent += 1; });
    setCounts(c);
    setEnrollByCampaign(byCamp);
    setEnrollAtByCampaign(atByCamp);
    setEnrollAtAllByCampaign(atByCampAll);
  };
  // Count leads in a campaign who have replied to us since we enrolled them.
  const campaignReplies = (cpId) => {
    const atMap = enrollAtAllByCampaign[cpId] || {};
    return Object.keys(atMap).filter(id => repliedAfterEnroll(leadsById[id], atMap[id])).length;
  };
  // A reply only "needs attention" if it came AFTER we enrolled them (replies from
  // before the campaign are just their old thread history, not a campaign response).
  const repliedAfterEnroll = (lead, enrolledAt) => lead && String(lead.last_contact_dir || '').toLowerCase() === 'inbound' && lead.last_contact_at && (!enrolledAt || new Date(lead.last_contact_at) >= new Date(enrolledAt));
  useEffect(() => { load(); }, []);

  const leadsById = useMemo(() => Object.fromEntries(leads.map(l => [l.id, l])), [leads]);
  const openDetail = async (cp) => {
    setOpenCampaign(cp);
    setEnrolledIds(new Set());
    setDetailQueue([]);
    const { data } = await supabase.from('campaign_enrollments').select('lead_id, status, created_at').eq('campaign_id', cp.id).eq('status', 'active');
    setEnrolledIds(new Set((data || []).map(e => e.lead_id)));
    setEnrolledAtById(Object.fromEntries((data || []).map(e => [e.lead_id, e.created_at])));
    const { data: q } = await supabase.from('campaign_queue').select('id, lead_id, message, due_at, status, processed_at').eq('campaign_id', cp.id).eq('type', 'text').order('due_at', { ascending: true }).limit(200);
    setDetailQueue(q || []);
  };
  // refresh enrolled set when campaigns reload while a detail is open
  useEffect(() => { if (openCampaign) { const cp = (campaigns || []).find(c => c.id === openCampaign.id); if (cp) openDetail(cp); } /* eslint-disable-next-line */ }, [campaigns]);

  // Targeting is by main CRM TAB KEY (offer-aware on the server), not raw statuses.
  const safeGroups = stageGroups || [];
  const allSafe = safeGroups.map(g => g.key);
  const defaultStages = allSafe.includes('ppc-inflow') ? ['ppc-inflow'] : allSafe.slice(0, 1);
  const groupLabels = (keys) => safeGroups.filter(g => (keys || []).includes(g.key)).map(g => g.label);
  const startNew = () => { setEditing({ id: null, name: '', description: '', steps: [BLANK_STEP()], active: true, kind: 'manual', autoRule: 'nocontact', autoDays: 30, autoStages: defaultStages }); setAiGoal(""); setAiFeedback(""); setAiMessages([]); setAiDrafted(false); setTemplateFor(null); setShowCreate(true); };
  const startEdit = (cp) => { const a = parseAuto(cp.description); setEditing({ id: cp.id, name: cp.name, description: descClean(cp.description), steps: (Array.isArray(cp.steps) && cp.steps.length ? cp.steps : [BLANK_STEP()]).map(s => ({ delayMin: stepOffsetMin(s), type: s.type || 'text', message: s.message || '', label: s.label || '' })), active: cp.active !== false, kind: a ? 'drip' : 'manual', autoRule: a?.rule || 'nocontact', autoDays: a?.days ?? 30, autoStages: (a?.tabs?.length ? a.tabs : defaultStages) }); setAiGoal(""); setAiFeedback(""); setAiMessages([]); setAiDrafted(false); setTemplateFor(null); setShowCreate(true); };

  const saveCampaign = async () => {
    if (!editing?.name.trim()) { say('Name is required', 'error'); return; }
    setBusy(true);
    const steps = editing.steps.map(s => {
      const delayMin = Number(s.delayMin) || 0;
      const base = { delayMin, day: Math.round(delayMin / 1440), type: s.type }; // keep day for legacy readers
      if (s.type === 'call') base.label = s.label || 'Call';
      else base.message = s.message || '';
      return base;
    });
    let desc = descClean(editing.description);
    if (editing.kind === 'drip') {
      const d = Math.max(1, Number(editing.autoDays) || 30);
      const sel = (editing.autoStages || []).filter(v => allSafe.includes(v));
      // Encode the chosen CRM tab keys. Empty or "all tabs" => no filter (all).
      const tabPart = (sel.length && sel.length < allSafe.length) ? ':' + sel.join(',') : '';
      desc = `${desc} [auto:${editing.autoRule}:${d}${tabPart}]`.trim();
    }
    const payload = { name: editing.name.trim(), description: desc, steps, active: editing.active };
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
  // Append a {{token}} to a step's message so nobody has to type brackets.
  const insertToken = (i, token) => setEditing(prev => {
    const st = [...prev.steps];
    const cur = st[i].message || '';
    st[i] = { ...st[i], message: cur + (cur && !cur.endsWith(' ') ? ' ' : '') + token };
    return { ...prev, steps: st };
  });
  // AI builder: describe the campaign (and refine it with plain-English feedback).
  const runAI = async (isRefine) => {
    if (isRefine && !aiFeedback.trim()) { say('Type what to change', 'error'); return; }
    if (!isRefine && !aiGoal.trim()) { say('Describe what you want first', 'error'); return; }
    setAiBusy(true);
    try {
      // Keep the full conversation so every revision remembers earlier instructions.
      const turn = isRefine ? aiFeedback.trim() : aiGoal.trim();
      const history = isRefine ? aiMessages : [];
      const msgs = [...history, { role: 'user', content: turn }];
      const res = await fetch('/api/campaigns/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: msgs, goal: aiGoal.trim() }) });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'failed');
      setAiMessages([...msgs, { role: 'assistant', content: j.assistant || JSON.stringify({ name: j.name, description: j.description, steps: j.steps }) }]);
      setEditing(prev => ({
        ...prev,
        name: (isRefine || !prev.name?.trim()) ? (j.name || prev.name) : prev.name,
        description: (isRefine || !prev.description?.trim()) ? (j.description || prev.description) : prev.description,
        steps: (j.steps || []).map(s => ({ delayMin: Number(s.delayMin) || 0, type: s.type === 'call' ? 'call' : 'text', message: s.message || '', label: s.label || '' })),
      }));
      setAiDrafted(true);
      if (isRefine) setAiFeedback('');
      say(isRefine ? 'Updated, review the changes' : 'Draft ready, review and tweak before saving');
    } catch (e) { say('AI failed: ' + e.message, 'error'); }
    setAiBusy(false);
  };
  // Immediately pull in everyone matching a bulk-drip rule (don't wait for the
  // 30-min scheduler tick). Confirms the count first so there are no surprises.
  const populateNow = async (cp) => {
    const a = parseAuto(cp.description);
    if (!a) { say('This campaign has no auto rule', 'error'); return; }
    setBusy(true);
    try {
      const body = { campaignId: cp.id, rule: a.rule, days: a.days, tabs: a.tabs || [], userId: currentUserId };
      const c = await fetch('/api/campaigns/enroll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, countOnly: true }) }).then(r => r.json());
      if (!c.ok) throw new Error(c.error || 'failed');
      if (!c.wouldAdd) { say(`No new leads match right now${c.alreadyIn ? ` (${c.alreadyIn} already in)` : ''}`, 'error'); setBusy(false); return; }
      if (!window.confirm(`Add ${c.wouldAdd} lead${c.wouldAdd === 1 ? '' : 's'} to "${cp.name}" now? They start the drip from day 1.`)) { setBusy(false); return; }
      const res = await fetch('/api/campaigns/enroll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
      if (!res.ok) throw new Error(res.error || 'failed');
      say(`Added ${res.enrolled}, ${res.queued} texts queued`);
      load();
    } catch (e) { say('Populate failed: ' + e.message, 'error'); }
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

  // Auto-enroll rule stored as [auto:<rule>:<days>] with an optional stage filter
  // [auto:<rule>:<days>:STAGE1,STAGE2]. Legacy [auto:untouched:N] => "no contact",
  // legacy [auto:stage:STATUS:N] => contact rule limited to that one stage.
  const RULE_LABELS = { nocontact: "haven't been contacted (text or call)", notext: "haven't been texted", nocall: "haven't been called" };
  const parseAuto = (d) => {
    const s = String(d || '');
    let m = s.match(/\[auto:stage:([A-Za-z_]+):(\d+)\]/i); // legacy single-status marker
    if (m) return { rule: 'nocontact', days: Number(m[2]), tabs: [] };
    m = s.match(/\[auto:(nocontact|notext|nocall|untouched):(\d+)(?::([A-Za-z0-9_,-]+))?\]/i);
    if (m) {
      const toks = m[3] ? m[3].toLowerCase().split(',').filter(Boolean) : [];
      const tabs = toks.filter(t => allSafe.includes(t)); // keep only valid tab keys
      return { rule: m[1].toLowerCase() === 'untouched' ? 'nocontact' : m[1].toLowerCase(), days: Number(m[2]), tabs };
    }
    return null;
  };
  const descClean = (d) => String(d || '').replace(/\s*\[auto:[^\]]+\]\s*/i, '').trim();
  const autoSummary = (d) => {
    const a = parseAuto(d);
    if (!a) return null;
    const labels = a.tabs?.length ? groupLabels(a.tabs) : [];
    const where = labels.length ? `${labels.join(' / ')} ` : '';
    return `Auto-adds ${where}leads who ${RULE_LABELS[a.rule]} in ${a.days}d`;
  };

  const stepSummary = (steps) => {
    if (!Array.isArray(steps) || !steps.length) return 'No steps';
    const t = steps.filter(s => s.type !== 'call').length, c = steps.filter(s => s.type === 'call').length;
    const maxMin = Math.max(0, ...steps.map(s => stepOffsetMin(s)));
    const span = maxMin < 1440 ? offsetLabel(maxMin).toLowerCase() : `${Math.round(maxMin / 1440)} days`;
    return `${steps.length} steps · ${t} text${t === 1 ? '' : 's'}, ${c} call${c === 1 ? '' : 's'} · over ${span}`;
  };

  // Needs-attention count for a campaign: due calls + leads who replied and owe us.
  const campaignNotif = (cp) => {
    const set = enrollByCampaign[cp.id] || new Set();
    if (!set.size) return 0;
    const atMap = enrollAtByCampaign[cp.id] || {};
    const replies = leads.filter(l => set.has(l.id) && repliedAfterEnroll(l, atMap[l.id])).length;
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
  const repliesWaiting = enrolledLeads.filter(l => repliedAfterEnroll(l, enrolledAtById[l.id])).length;
  const detailItems = openCampaign ? [
    ...enrolledLeads.filter(l => repliedAfterEnroll(l, enrolledAtById[l.id])).map(l => ({ kind: 'message', lead: l, ts: l.last_contact_at, text: l.last_contact_preview })),
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
              {descClean(openCampaign.description) && <p className="text-slate-400 text-sm mt-1">{descClean(openCampaign.description)}</p>}
              {autoSummary(openCampaign.description) && <p className="text-indigo-300 text-xs mt-1 font-semibold">Auto-enroll on: {autoSummary(openCampaign.description)}.</p>}
              <div className="mt-2 flex items-center gap-4 text-sm text-slate-300 flex-wrap">
                <span><span className="font-bold text-emerald-300">{counts[openCampaign.id]?.sent || 0}</span> sent</span>
                <span className="text-cyan-300"><span className="font-bold">{campaignReplies(openCampaign.id)}</span> replied</span>
                <span><span className="font-bold text-white">{counts[openCampaign.id]?.pending || 0}</span> queued</span>
                <span><span className="font-bold text-white">{enrolledLeads.length}</span> active</span>
                <span><span className="font-bold text-white">{campaignCalls.length}</span> calls to make</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setEnrollFor(openCampaign); setEnrollSel(new Set()); setEnrollSearch(''); }} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white">Enroll leads</button>
              {autoSummary(openCampaign.description) && <button onClick={() => populateNow(openCampaign)} disabled={busy} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 disabled:opacity-50">Populate now</button>}
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
              <span className="flex-shrink-0 text-xs font-bold text-slate-400 w-16">{offsetLabel(stepOffsetMin(s))}</span>
              <span className={`flex-shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${s.type === 'call' ? 'bg-amber-500/20 text-amber-300' : 'bg-cyan-500/20 text-cyan-300'}`}>{s.type === 'call' ? 'Call' : 'Text'}</span>
              <span className="text-sm text-slate-200">{s.type === 'call' ? (s.label || 'Call') : s.message}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Delivery: exactly what's going out, what's scheduled, what already sent */}
      {(() => {
        const q = detailQueue || [];
        const sent = q.filter(x => x.status === 'sent');
        const pending = q.filter(x => x.status === 'pending');
        const nowT = Date.now();
        const label = (x) => {
          if (x.status === 'sent') return { t: 'sent ✓', c: 'bg-emerald-500/20 text-emerald-300' };
          if (x.status === 'cancelled') return { t: 'stopped', c: 'bg-slate-700 text-slate-400' };
          if (x.status === 'failed') return { t: 'failed', c: 'bg-red-500/20 text-red-300' };
          if (new Date(x.due_at).getTime() <= nowT) return { t: 'due', c: 'bg-amber-500/20 text-amber-300' };
          return { t: 'scheduled', c: 'bg-slate-700 text-slate-400' };
        };
        const rows = [...pending.filter(x => new Date(x.due_at).getTime() <= nowT), ...pending.filter(x => new Date(x.due_at).getTime() > nowT), ...sent.slice().reverse()].slice(0, 60);
        return (
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">What's going out</h3>
              <span className="text-xs text-slate-500"><span className="text-emerald-300 font-semibold">{sent.length}</span> sent · <span className="text-white font-semibold">{pending.length}</span> scheduled</span>
            </div>
            {rows.length === 0 ? (
              <div className="text-sm text-slate-500">Nothing queued yet. Enroll leads (or turn on auto-add) and texts will line up here.</div>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {rows.map(x => {
                  const lead = leadsById[x.lead_id];
                  const nm = lead?.full_name || lead?.name || 'Lead';
                  const lab = label(x);
                  return (
                    <button key={x.id} onClick={() => lead && onOpenLead && onOpenLead(lead)} className="w-full text-left bg-slate-900/40 border border-slate-700/40 rounded-lg px-3 py-2 hover:bg-slate-800/60 flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white truncate">{nm}</span>
                          <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${lab.c}`}>{lab.t}</span>
                        </div>
                        <div className="text-xs text-slate-400 truncate mt-0.5">{x.message}</div>
                      </div>
                      <span className="flex-shrink-0 text-xs text-slate-500">{x.status === 'sent' && x.processed_at ? fmtWhen(x.processed_at) : fmtWhen(x.due_at)}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <p className="mt-2 text-xs text-slate-500">{isLive ? `"Sent ✓" already went out. "Due"/"Scheduled" go out on upcoming runs (up to ${maxPerRun} per run, every 30 min, 10am-8pm Central), so they trickle. Counts are for THIS campaign only.` : '"Due" means it\'s queued and would go on the next run, but nothing sends while sending is in safe mode (off). Counts are for THIS campaign only.'} Every real send also shows in the lead\'s message thread.</p>
          </div>
        );
      })()}

      {/* Enrolled leads */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400 mb-3">Enrolled leads ({enrolledLeads.length})</h3>
        {enrolledLeads.length === 0 ? (
          <div className="text-center py-12 text-slate-500 border border-dashed border-slate-700 rounded-xl">No leads enrolled yet. Use "Enroll leads"{autoSummary(openCampaign.description) ? ' or "Populate now"' : ''}.</div>
        ) : renderLeadCard ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">{enrolledLeads.map(l => <div key={l.id}>{renderLeadCard(l)}</div>)}</div>
        ) : (
          <div className="space-y-2">{enrolledLeads.map(l => (
            <button key={l.id} onClick={() => onOpenLead && onOpenLead(l)} className="w-full text-left bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 hover:bg-slate-700/60">
              <div className="text-sm text-white">{l.full_name || l.name}</div>
              <div className="text-xs text-slate-400">{l.phone}{repliedAfterEnroll(l, enrolledAtById[l.id]) ? ' · replied, owe a response' : ''}</div>
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

      {/* Live / safe-mode banner (reflects real CAMPAIGNS_LIVE state) */}
      {isLive ? (
        <div className="bg-emerald-500/10 border border-emerald-500/40 rounded-xl px-4 py-3 text-sm text-emerald-200">
          <p><span className="font-semibold">● LIVE — automated texts are sending.</span> They drip: up to {maxPerRun} per run, every 30 min, 10am-8pm Central only, one per lead per day. Under-contract/closed deals and anyone who replied are skipped. Use <span className="font-semibold">Preview sends</span> to see the next batch before it goes.</p>
        </div>
      ) : (
        <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl px-4 py-3 text-sm text-amber-200">
          <p><span className="font-semibold">Sending is in safe mode (off).</span> Nothing goes out until it's turned live. Use <span className="font-semibold">Preview sends</span> to see exactly what would go. Quiet hours (10am-8pm Central), {maxPerRun}/run throttle, one per lead per day, and skip-on-reply are always enforced.</p>
        </div>
      )}
      <div className="bg-slate-800/40 border border-slate-700 rounded-xl px-4 py-2.5 text-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-400">Test sending, text your own phone:</span>
          <input value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="(555) 555-5555" className="bg-slate-900 border border-slate-600 rounded-lg px-2.5 py-1 text-white text-sm w-40" />
          <button onClick={sendTest} disabled={busy} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-50">Send test text</button>
        </div>
      </div>

      {campaigns === null ? (
        <div className="text-slate-400">Loading campaigns…</div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-12 text-slate-400 border border-dashed border-slate-700 rounded-xl">No campaigns yet. Create your first drip.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {campaigns.map(cp => {
            // The appointment-reminders campaign lives in this list like any other,
            // but it's appointment-driven (not enroll-driven), so it gets tailored controls.
            if (cp.name === REMINDER_CAMPAIGN_NAME) {
              const upcoming = (scheduledTasks || []).filter(t => t.task_type === 'meeting' && t.status === 'pending' && !/^BLOCKED/i.test(t.title || '') && t.lead_id && new Date(t.due_at) > new Date());
              const sentN = upcoming.filter(t => /\[reminded/.test(t.description || '')).length;
              const msgN = (Array.isArray(cp.steps) ? cp.steps : []).filter(s => s.enabled !== false).length;
              return (
                <div key={cp.id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 cursor-pointer" onClick={() => onManageReminders && onManageReminders()}>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-white hover:text-rose-200">{cp.name}</h3>
                        <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${cp.active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-600/40 text-slate-400'}`}>{cp.active ? 'Active' : 'Paused'}</span>
                      </div>
                      <p className="text-sm text-slate-400 mt-1">Automatic texts before each scheduled appointment.</p>
                      <p className="text-xs text-slate-500 mt-2">{msgN} reminder message{msgN === 1 ? '' : 's'} · over {upcoming.length} upcoming appointment{upcoming.length === 1 ? '' : 's'}</p>
                    </div>
                    <button onClick={() => toggleActive(cp)} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 flex-shrink-0">{cp.active ? 'Pause' : 'Activate'}</button>
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-sm">
                    <span className="text-slate-300"><span className="font-bold text-white">{upcoming.length}</span> upcoming</span>
                    <span className="text-slate-300"><span className="font-bold text-emerald-300">{sentN}</span> reminded</span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={() => onManageReminders && onManageReminders()} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-rose-600/20 text-rose-200 border border-rose-500/40 hover:bg-rose-600/40">Edit reminders</button>
                  </div>
                </div>
              );
            }
            return (
            <div key={cp.id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 cursor-pointer" onClick={() => openDetail(cp)}>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-white hover:text-rose-200">{cp.name}</h3>
                    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${cp.active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-600/40 text-slate-400'}`}>{cp.active ? 'Active' : 'Paused'}</span>
                    {campaignNotif(cp) > 0 && <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[11px] font-bold">{campaignNotif(cp)}</span>}
                  </div>
                  {descClean(cp.description) && <p className="text-sm text-slate-400 mt-1">{descClean(cp.description)}</p>}
                  <div className="flex items-center gap-2 flex-wrap mt-2">
                    <p className="text-xs text-slate-500">{stepSummary(cp.steps)}</p>
                    {autoSummary(cp.description) && <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300">{autoSummary(cp.description)}</span>}
                  </div>
                </div>
                <button onClick={() => toggleActive(cp)} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 flex-shrink-0">{cp.active ? 'Pause' : 'Activate'}</button>
              </div>
              <div className="mt-3 flex items-center gap-4 text-sm flex-wrap">
                <span className="text-slate-300"><span className="font-bold text-emerald-300">{counts[cp.id]?.sent || 0}</span> sent</span>
                <span className="text-slate-300"><span className="font-bold text-cyan-300">{campaignReplies(cp.id)}</span> replied</span>
                <span className="text-slate-300"><span className="font-bold text-white">{counts[cp.id]?.pending || 0}</span> queued</span>
                <span className="text-slate-400"><span className="font-bold text-slate-200">{counts[cp.id]?.active || 0}</span> active</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => { setEnrollFor(cp); setEnrollSel(new Set()); setEnrollSearch(''); }} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-rose-600/20 text-rose-200 border border-rose-500/40 hover:bg-rose-600/40">Enroll leads</button>
                {autoSummary(cp.description) && <button onClick={() => populateNow(cp)} disabled={busy} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600/20 text-indigo-200 border border-indigo-500/40 hover:bg-indigo-600/40 disabled:opacity-50">Populate now</button>}
                <button onClick={() => startEdit(cp)} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-700/60 text-slate-200 hover:bg-slate-600/60">Edit steps</button>
                <button onClick={() => deleteCampaign(cp)} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-700/40 text-slate-400 hover:text-red-300">Delete</button>
              </div>
            </div>
            );
          })}
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

              {/* Campaign kind: manual enroll vs rule-based bulk drip */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Campaign type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setEditing({ ...editing, kind: 'manual' })} className={`text-left rounded-lg border p-3 ${editing.kind === 'manual' ? 'border-rose-500/60 bg-rose-500/10' : 'border-slate-600 bg-slate-900/40 hover:bg-slate-700/40'}`}>
                    <div className="text-sm font-semibold text-white">Manual</div>
                    <div className="text-xs text-slate-400 mt-0.5">You add people yourself (Enroll button or the card's Campaign toggle).</div>
                  </button>
                  <button type="button" onClick={() => setEditing({ ...editing, kind: 'drip' })} className={`text-left rounded-lg border p-3 ${editing.kind === 'drip' ? 'border-indigo-500/60 bg-indigo-500/10' : 'border-slate-600 bg-slate-900/40 hover:bg-slate-700/40'}`}>
                    <div className="text-sm font-semibold text-white">Bulk drip (rule-based)</div>
                    <div className="text-xs text-slate-400 mt-0.5">The scheduler auto-adds everyone matching a rule and keeps it topped up.</div>
                  </button>
                </div>
                {editing.kind === 'drip' && (
                  <div className="bg-indigo-500/10 border border-indigo-500/40 rounded-lg p-3 space-y-3">
                    <div>
                      <div className="text-sm font-semibold text-indigo-200 mb-1">Who should auto-enroll?</div>
                      <select value={editing.autoRule} onChange={e => setEditing({ ...editing, autoRule: e.target.value })} className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-white text-sm">
                        <option value="nocontact">Haven't been contacted (text or call)</option>
                        <option value="notext">Haven't been texted</option>
                        <option value="nocall">Haven't been called</option>
                      </select>
                      <div className="flex items-center gap-2 text-sm text-indigo-100 mt-2">
                        <span>for</span>
                        <input type="number" min="1" value={editing.autoDays} onChange={e => setEditing({ ...editing, autoDays: e.target.value })} className="w-16 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-center" />
                        <span>days or more.</span>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-indigo-200">Which CRM tabs?</div>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setEditing({ ...editing, autoStages: allSafe })} className="text-[10px] text-indigo-300 hover:text-white">All</button>
                          <button type="button" onClick={() => setEditing({ ...editing, autoStages: [] })} className="text-[10px] text-indigo-300 hover:text-white">None</button>
                        </div>
                      </div>
                      <div className="text-xs text-indigo-200/70 mb-1.5">Pick which tabs this pulls from, e.g. PPC Inflow and Offer Curated.</div>
                      <div className="grid grid-cols-2 gap-1">
                        {safeGroups.map(g => {
                          const on = (editing.autoStages || []).includes(g.key);
                          return (
                            <label key={g.key} className={`flex items-center gap-2 rounded px-2 py-1 text-xs cursor-pointer ${on ? 'bg-indigo-600/30 text-white' : 'bg-slate-800/60 text-slate-300'}`}>
                              <input type="checkbox" checked={on} onChange={() => setEditing(prev => { const cur = new Set(prev.autoStages || []); on ? cur.delete(g.key) : cur.add(g.key); return { ...prev, autoStages: [...cur] }; })} className="accent-indigo-500" />
                              {g.label}
                            </label>
                          );
                        })}
                      </div>
                      {(editing.autoStages || []).length === 0 && <p className="text-[11px] text-amber-300 mt-1">Pick at least one tab or nobody will enroll.</p>}
                    </div>
                    <p className="text-xs text-indigo-200/70">Under contract and closed/dead deals, and anyone who has replied, are never included (even if their stage is checked). Runs a small batch per tick, so it trickles instead of blasting.</p>
                  </div>
                )}
              </div>

              {/* AI builder: describe it, Claude drafts the whole sequence */}
              <div className="bg-cyan-500/10 border border-cyan-500/40 rounded-lg p-3">
                <div className="text-sm font-semibold text-cyan-200 mb-1">Let Claude build it for you</div>
                <div className="text-xs text-cyan-200/70 mb-2">Describe what you want and Claude drafts the timing and messages. You can edit everything after.</div>
                <textarea value={aiGoal} onChange={e => setAiGoal(e.target.value)} rows="2" placeholder="e.g. Re-engage leads we haven't heard from in 30 days and get them on a call" className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
                <button onClick={() => runAI(false)} disabled={aiBusy} className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50">{aiBusy ? 'Drafting…' : (aiDrafted ? '✨ Regenerate from scratch' : '✨ Generate sequence')}</button>
                {aiDrafted && (
                  <div className="mt-3 pt-3 border-t border-cyan-500/30">
                    <div className="text-xs font-semibold text-cyan-200 mb-1">Tell Claude what to change</div>
                    <textarea value={aiFeedback} onChange={e => setAiFeedback(e.target.value)} rows="2" placeholder="e.g. Make the first message ask if they already sold it. Keep it shorter." className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
                    <button onClick={() => runAI(true)} disabled={aiBusy} className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg bg-cyan-600/80 hover:bg-cyan-500 text-white disabled:opacity-50">{aiBusy ? 'Updating…' : 'Revise draft'}</button>
                  </div>
                )}
              </div>

              <div className="text-xs text-slate-400">Steps. Each one goes out a set time after enrollment (minutes, hours, or days). Use the <span className="text-slate-300">Insert</span> buttons or <span className="text-slate-300">Templates</span> below each message, so no typing brackets.</div>
              <div className="space-y-2">
                {editing.steps.map((s, i) => {
                  const { amount, unit } = splitDelay(stepOffsetMin(s));
                  return (
                  <div key={i} className="bg-slate-900/50 border border-slate-700 rounded-lg p-2.5 flex gap-2 items-start">
                    <div className="flex flex-col">
                      <label className="text-[10px] text-slate-500 uppercase">After</label>
                      <div className="flex gap-1">
                        <input type="number" min="0" value={amount} onChange={e => { const st = [...editing.steps]; st[i] = { ...s, delayMin: toMin(e.target.value, unit) }; setEditing({ ...editing, steps: st }); }} className="w-12 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm text-center" />
                        <select value={unit} onChange={e => { const st = [...editing.steps]; st[i] = { ...s, delayMin: toMin(amount, e.target.value) }; setEditing({ ...editing, steps: st }); }} className="bg-slate-700 border border-slate-600 rounded px-1 py-1 text-white text-xs">
                          <option value="min">min</option>
                          <option value="hour">hrs</option>
                          <option value="day">days</option>
                        </select>
                      </div>
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
                        : <>
                            <textarea value={s.message} onChange={e => { const st = [...editing.steps]; st[i] = { ...s, message: e.target.value }; setEditing({ ...editing, steps: st }); }} rows="2" placeholder="Hi {{first}}, ..." className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm" />
                            <div className="flex flex-wrap gap-1 mt-1">
                              <span className="text-[10px] text-slate-500 self-center">Insert:</span>
                              {[['Name', '{{first}}'], ['County', '{{county}}'], ['Acreage', '{{acres}}'], ['State', '{{state}}']].map(([lbl, tok]) => (
                                <button key={tok} type="button" onClick={() => insertToken(i, tok)} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600">+ {lbl}</button>
                              ))}
                              <button type="button" onClick={() => setTemplateFor(templateFor === i ? null : i)} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-200 border border-cyan-500/40">Templates ▾</button>
                            </div>
                            {templateFor === i && (
                              <div className="mt-1 bg-slate-900 border border-slate-600 rounded-lg p-1 max-h-48 overflow-y-auto">
                                {MESSAGE_TEMPLATES.map((t, ti) => (
                                  <button key={ti} type="button" onClick={() => { const st = [...editing.steps]; st[i] = { ...s, message: t.body }; setEditing({ ...editing, steps: st }); setTemplateFor(null); }} className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-700">
                                    <div className="text-[11px] font-semibold text-cyan-200">{t.name}</div>
                                    <div className="text-[11px] text-slate-400 truncate">{t.body}</div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </>}
                    </div>
                    <button onClick={() => setEditing({ ...editing, steps: editing.steps.filter((_, j) => j !== i) })} className="text-slate-500 hover:text-red-300 mt-4">✕</button>
                  </div>
                  );
                })}
                <div className="flex gap-2">
                  <button onClick={() => setEditing({ ...editing, steps: [...editing.steps, BLANK_STEP()] })} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200">+ Add step</button>
                  <button onClick={() => { const maxMin = Math.max(0, ...editing.steps.map(s => stepOffsetMin(s))); const d = maxMin + 30 * 1440; setEditing({ ...editing, steps: [...editing.steps, { delayMin: d, type: 'text', message: 'Hi {{first}}, just checking in. Still happy to help with your land whenever the timing is right, no rush at all.', label: '' }, { delayMin: d, type: 'call', label: 'Monthly check-in call', message: '' }] }); }} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40">+ Monthly touch (warm text + call)</button>
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
