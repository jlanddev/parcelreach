'use client';

// Clean View 2 — a SEPARATE test CRM at /admin/land/v2. Reads the same leads but
// shows only those flagged clean_view_2, laid out as the new pipeline. Fully
// standalone: it never imports or mutates the main /admin/land board, so the
// production CRM is unaffected by anything here.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const ADMIN_EMAILS = ['admin@parcelreach.ai', 'jordan@havenground.com', 'jordan@landreach.co'];

const STAGE_OPTIONS = [
  { v: 'NEW', l: 'New' }, { v: 'CONTACTING', l: 'Contacting' }, { v: 'CONTACTED', l: 'Contacted' },
  { v: 'OFFER_CURATED', l: 'Offer Curated' }, { v: 'APPT_SET_FOR_JORDAN', l: 'Appointment Set' },
  { v: 'OFFER_SENT', l: 'Offer Sent' }, { v: 'NEGOTIATING', l: 'Negotiating' },
  { v: 'AGREEMENT_SENT', l: 'Agreement Sent' }, { v: 'UNDER_CONTRACT', l: 'Under Contract' },
  { v: 'CLOSED', l: 'Closed' }, { v: 'FOLLOW_UP', l: 'Follow-Up' }, { v: 'LOST', l: 'Lost' },
];

const up = (l) => (l.pipeline_status || l.status || '').toUpperCase();

function stageOf(l) {
  const s = up(l);
  if (s === 'APPT_SET_FOR_JORDAN') return 'appointment-set';
  if (['OFFER_SENT', 'NEGOTIATING'].includes(s)) return 'offer-made';
  if (['AGREEMENT_SENT', 'UNDER_CONTRACT', 'CLOSED'].includes(s)) return 'signed-agreement';
  if (s === 'FOLLOW_UP') return 'follow-up';
  if (s === 'LOST') return 'lost';
  return 'ppc-inflow';
}

// Stage accent for the thin banner at the top of each card.
const STAGE_BANNER = {
  'ppc-inflow': { bg: 'bg-orange-500/15 border-orange-500/40', dot: 'bg-orange-400', text: 'text-orange-300', label: 'PPC Inflow' },
  'appointment-set': { bg: 'bg-green-500/15 border-green-500/40', dot: 'bg-green-400', text: 'text-green-300', label: 'Appointment Set' },
  'offer-made': { bg: 'bg-purple-500/15 border-purple-500/40', dot: 'bg-purple-400', text: 'text-purple-300', label: 'Offer Made' },
  'signed-agreement': { bg: 'bg-emerald-500/15 border-emerald-500/40', dot: 'bg-emerald-400', text: 'text-emerald-300', label: 'Signed Agreement' },
  'follow-up': { bg: 'bg-rose-500/15 border-rose-500/40', dot: 'bg-rose-400', text: 'text-rose-300', label: 'Follow-Up' },
  'lost': { bg: 'bg-zinc-500/15 border-zinc-500/40', dot: 'bg-zinc-400', text: 'text-zinc-300', label: 'Lost' },
};

const MAIN_TABS = ['ppc-inflow', 'appointment-set', 'offer-made', 'signed-agreement', 'campaigns'];
// Everything else in the CRM. Lead-list views render natively here; tools open in
// the main CRM (they share the same data, so no need to duplicate them).
const LEAD_LIST = ['all-leads', 'follow-up', 'lost', 'investors', 'subdivision-inflow', 'archive'];
const TOOL_TABS = ['shared-calendar', 'create-lead', 'partners', 'om-search', 'export', 'organizations', 'activity-log', 'session-analytics', 'unassigned'];
const OVERFLOW = [...LEAD_LIST, ...TOOL_TABS];

const LABELS = {
  'ppc-inflow': 'PPC Inflow', 'appointment-set': 'Mapped & Appointment Set', 'offer-made': 'Offer Made',
  'signed-agreement': 'Signed Agreement', 'campaigns': 'Follow-Up Campaigns', 'all-leads': 'All Leads',
  'follow-up': 'Follow-Up', 'lost': 'Lost', 'investors': 'Investors', 'subdivision-inflow': 'Subdivision Inflow',
  'archive': 'Archive', 'shared-calendar': 'Shared Calendar', 'create-lead': 'Create Lead', 'partners': 'Partners',
  'om-search': 'OM Search', 'export': 'Export CSV', 'organizations': 'Organizations', 'activity-log': 'Activity Log',
  'session-analytics': 'Session Analytics', 'unassigned': 'Unassigned',
};

export default function CleanView2Page() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [denied, setDenied] = useState(false);
  const [leads, setLeads] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [usersById, setUsersById] = useState({});
  const [activeTab, setActiveTab] = useState('ppc-inflow');
  const [moreOpen, setMoreOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState(null);
  const [colMissing, setColMissing] = useState(false);
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; });
  const [calSelectedDay, setCalSelectedDay] = useState(() => new Date().toDateString());
  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState('');

  const showToast = (msg, kind = 'success') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 2600); };

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/admin/login'); return; }
      let role = null;
      try {
        const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
        role = profile?.role || (ADMIN_EMAILS.includes(user.email) ? 'admin' : null);
      } catch { role = ADMIN_EMAILS.includes(user.email) ? 'admin' : null; }
      if (!role || !['admin', 'acquisition_manager'].includes(role)) { setDenied(true); setReady(true); return; }
      await loadAll();
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAll = async () => {
    const cols = 'id, name, full_name, email, phone, pipeline_status, status, map_uploaded, property_county, county, property_state, state, acreage, acres, last_contact_at, last_contact_dir, last_contact_preview, source, form_data, created_at';
    let res = await supabase.from('leads').select(`${cols}, clean_view_2, clean_view_2_at`).order('created_at', { ascending: false });
    if (res.error && /clean_view_2/.test(res.error.message || '')) {
      setColMissing(true);
      res = await supabase.from('leads').select(cols).order('created_at', { ascending: false });
    }
    setLeads(res.data || []);
    const { data: t } = await supabase.from('scheduled_tasks').select('id, lead_id, task_type, due_at, status, assigned_to, title').eq('status', 'pending');
    setTasks(t || []);
    const { data: us } = await supabase.from('users').select('id, full_name');
    setUsersById(Object.fromEntries((us || []).map(u => [u.id, u.full_name])));
  };

  const cvLeads = useMemo(() => leads.filter(l => l.clean_view_2 === true), [leads]);
  const meetings = useMemo(() => tasks.filter(t => t.task_type === 'meeting'), [tasks]);

  const counts = useMemo(() => {
    const c = {};
    cvLeads.forEach(l => { const st = stageOf(l); c[st] = (c[st] || 0) + 1; });
    c['all-leads'] = cvLeads.length;
    c['investors'] = cvLeads.filter(l => l.source === 'go-west-lands').length;
    c['subdivision-inflow'] = cvLeads.filter(l => l.source === 'subdivision').length;
    c['archive'] = cvLeads.filter(l => (l.status || '').toLowerCase() === 'archived').length;
    return c;
  }, [cvLeads]);

  const matchesSearch = (l) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [l.full_name, l.name, l.phone, l.email, l.property_county, l.county, up(l)].filter(Boolean).join(' ').toLowerCase().includes(q);
  };

  const leadsForTab = (tab) => {
    if (tab === 'all-leads') return cvLeads;
    if (tab === 'investors') return cvLeads.filter(l => l.source === 'go-west-lands');
    if (tab === 'subdivision-inflow') return cvLeads.filter(l => l.source === 'subdivision');
    if (tab === 'archive') return cvLeads.filter(l => (l.status || '').toLowerCase() === 'archived');
    return cvLeads.filter(l => stageOf(l) === tab);
  };

  const setStage = async (leadId, value) => {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, pipeline_status: value } : l));
    const { error } = await supabase.from('leads').update({ pipeline_status: value, last_activity_at: new Date().toISOString() }).eq('id', leadId);
    if (error) { showToast('Could not update stage', 'error'); loadAll(); return; }
    showToast('Stage updated');
  };
  const setCV2 = async (leadId, on) => {
    const at = on ? new Date().toISOString() : null;
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, clean_view_2: on, clean_view_2_at: at } : l));
    const { error } = await supabase.from('leads').update({ clean_view_2: on, clean_view_2_at: at }).eq('id', leadId);
    if (error) { showToast(on ? 'Could not add' : 'Could not remove', 'error'); loadAll(); return; }
    showToast(on ? 'Added to Clean View 2' : 'Removed from Clean View 2');
  };
  const addAppointment = async (leadId, dateStr, timeStr) => {
    if (!dateStr || !timeStr) return;
    const dueAt = new Date(`${dateStr}T${timeStr}`).toISOString();
    const { data, error } = await supabase.from('scheduled_tasks').insert({ lead_id: leadId, task_type: 'meeting', title: 'Appointment', due_at: dueAt, status: 'pending', priority: 'high' }).select().maybeSingle();
    if (error) { showToast('Could not set appointment', 'error'); return; }
    if (data) setTasks(prev => [...prev, data]);
    await setStage(leadId, 'APPT_SET_FOR_JORDAN');
    showToast('Appointment set');
  };

  if (!ready) return <div className="min-h-screen bg-slate-900 text-slate-300 flex items-center justify-center">Loading…</div>;
  if (denied) return <div className="min-h-screen bg-slate-900 text-slate-300 flex items-center justify-center">Access denied.</div>;

  const countFor = (t) => counts[t] != null ? ` (${counts[t]})` : '';
  const cardProps = { usersById, onStage: setStage, onRemove: (id) => setCV2(id, false), onAppt: addAppointment };

  const renderGrid = (tab) => {
    const list = leadsForTab(tab).filter(matchesSearch);
    if (list.length === 0) return <div className="text-center py-16 text-slate-500 border border-dashed border-slate-700 rounded-xl">No leads here.</div>;
    return <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">{list.map(l => <LeadCard key={l.id} lead={l} {...cardProps} />)}</div>;
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Top bar */}
      <div className="px-6 py-3 border-b border-slate-700/60 flex items-center justify-between gap-4 bg-slate-900/90 backdrop-blur sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold">ParcelReach</span>
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-600/30 text-indigo-300 border border-indigo-500/40">Clean View 2 · Test CRM</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setAddOpen(true)} className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white inline-flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Add leads
          </button>
          <a href="/admin/land" className="text-sm text-slate-300 hover:text-white inline-flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Main CRM
          </a>
        </div>
      </div>

      {colMissing && (
        <div className="px-6 py-3 bg-amber-500/15 border-b border-amber-500/40 text-amber-200 text-sm">
          The <code>clean_view_2</code> column isn't in the database yet, so no leads can show. Run the ALTER TABLE snippet, then use "Add leads".
        </div>
      )}

      {/* Tabs */}
      <div className="bg-slate-800/40 border-b border-slate-700/50 px-6">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0">
            {MAIN_TABS.map((t, i) => (
              <div key={t} className="flex items-center flex-shrink-0">
                {i > 0 && i < 4 && <svg className="w-4 h-4 text-slate-600 mx-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>}
                {i === 4 && <span className="w-px h-5 bg-slate-700 mx-2" />}
                <button onClick={() => { setActiveTab(t); setMoreOpen(false); }} className={`px-4 py-3 font-medium border-b-2 transition whitespace-nowrap ${activeTab === t ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-white'}`}>
                  {LABELS[t]}{countFor(t)}
                </button>
              </div>
            ))}
          </div>
          <div className="relative flex-shrink-0 ml-1">
            <button onClick={() => setMoreOpen(v => !v)} className={`px-4 py-3 font-medium border-b-2 transition inline-flex items-center gap-1 ${OVERFLOW.includes(activeTab) ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-white'}`}>
              More <svg className={`w-4 h-4 transition-transform ${moreOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {moreOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
                <div className="absolute right-0 mt-1 z-50 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl py-1 min-w-[230px] max-h-[75vh] overflow-y-auto">
                  <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-slate-500">Lead lists</div>
                  {LEAD_LIST.map(t => (
                    <button key={t} onClick={() => { setActiveTab(t); setMoreOpen(false); }} className={`block w-full text-left px-4 py-2 text-sm ${activeTab === t ? 'bg-indigo-600/20 text-indigo-300' : 'text-slate-300 hover:bg-slate-700'}`}>{LABELS[t]}{countFor(t)}</button>
                  ))}
                  <div className="px-3 py-1.5 mt-1 text-[10px] uppercase tracking-wide text-slate-500 border-t border-slate-700/60">Tools (open in main CRM)</div>
                  {TOOL_TABS.map(t => (
                    <a key={t} href="/admin/land" target="_blank" rel="noreferrer" className="flex items-center justify-between px-4 py-2 text-sm text-slate-300 hover:bg-slate-700">
                      {LABELS[t]}
                      <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    </a>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Funnel tiles on pipeline/list tabs */}
        {activeTab !== 'campaigns' && activeTab !== 'appointment-set' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { t: 'ppc-inflow', label: 'PPC Inflow', color: 'from-orange-500/20 to-orange-600/10 border-orange-500/30 text-orange-400' },
              { t: 'appointment-set', label: 'Mapped & Appt Set', color: 'from-green-500/20 to-green-600/10 border-green-500/30 text-green-400' },
              { t: 'offer-made', label: 'Offer Made', color: 'from-purple-500/20 to-purple-600/10 border-purple-500/30 text-purple-400' },
              { t: 'signed-agreement', label: 'Signed Agreement', color: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30 text-emerald-400' },
            ].map(tile => (
              <button key={tile.t} onClick={() => setActiveTab(tile.t)} className={`bg-gradient-to-br border rounded-xl p-4 text-left hover:scale-[1.02] transition ${tile.color}`}>
                <div className="text-3xl font-bold">{counts[tile.t] || 0}</div>
                <div className="text-slate-300 text-xs mt-1">{tile.label}</div>
              </button>
            ))}
          </div>
        )}

        {cvLeads.length === 0 && !colMissing && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-lg font-medium text-slate-200">No leads in Clean View 2 yet.</p>
            <p className="mt-1 text-sm">New leads land here automatically. To test now, hit "Add leads" and pull a few in.</p>
          </div>
        )}

        {activeTab === 'appointment-set' ? (
          <AppointmentCalendar meetings={meetings} leads={cvLeads} usersById={usersById}
            calMonth={calMonth} setCalMonth={setCalMonth} calSelectedDay={calSelectedDay} setCalSelectedDay={setCalSelectedDay}
            onOpenLead={(id) => window.open(`/admin/land?lead=${id}`, '_blank')}
            renderCard={(l) => <LeadCard key={l.id} lead={l} {...cardProps} />} />
        ) : activeTab === 'campaigns' ? (
          <CampaignsPanel />
        ) : cvLeads.length > 0 ? (
          <>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, county, status…" className="w-full md:w-96 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500" />
            {renderGrid(activeTab)}
          </>
        ) : null}
      </div>

      {addOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setAddOpen(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <h3 className="font-bold text-white">Add leads to Clean View 2</h3>
              <button onClick={() => setAddOpen(false)} className="text-slate-400 hover:text-white"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="p-4"><input autoFocus value={addSearch} onChange={e => setAddSearch(e.target.value)} placeholder="Search leads to add…" className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500" /></div>
            <div className="px-4 pb-4 overflow-y-auto space-y-1.5">
              {leads.filter(l => l.clean_view_2 !== true).filter(l => {
                const q = addSearch.trim().toLowerCase(); if (!q) return true;
                return [l.full_name, l.name, l.phone, l.property_county, l.county].filter(Boolean).join(' ').toLowerCase().includes(q);
              }).slice(0, 80).map(l => (
                <div key={l.id} className="flex items-center justify-between gap-3 bg-slate-700/40 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm text-white truncate">{l.full_name || l.name || 'Unnamed'}</div>
                    <div className="text-xs text-slate-400 truncate">{l.phone || 'no phone'}{(l.property_county || l.county) ? ` · ${l.property_county || l.county}` : ''}</div>
                  </div>
                  <button onClick={() => setCV2(l.id, true)} className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white">Add</button>
                </div>
              ))}
              {leads.filter(l => l.clean_view_2 !== true).length === 0 && <div className="text-sm text-slate-500 py-6 text-center">Every lead is already in Clean View 2.</div>}
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-xl text-sm font-medium ${toast.kind === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>{toast.msg}</div>}
    </div>
  );
}

function CampaignsPanel() {
  return (
    <div className="max-w-3xl space-y-4">
      <div className="bg-gradient-to-br from-rose-500/10 to-rose-600/5 border border-rose-500/40 rounded-xl p-6">
        <h2 className="text-2xl font-bold text-rose-300">Follow-Up Campaigns</h2>
        <p className="text-slate-400 text-sm mt-1">Automated drips for silent and price-far-off leads.</p>
      </div>
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 text-sm text-slate-300">
        <p>Being built next (Phase 2), with the guardrails so it never repeats the old problems:</p>
        <ul className="mt-3 space-y-2 list-disc pl-5">
          <li>Named campaigns with a cadence (twice a week for silent leads, once a month for "price too far off").</li>
          <li>Silent leads move in automatically and out of the inflow; they auto-exit the moment they reply.</li>
          <li>One reliable scheduled sender, strict no-duplicate sends, quiet hours, and a dry-run before any real texts.</li>
        </ul>
      </div>
    </div>
  );
}

function LeadCard({ lead, usersById, onStage, onRemove, onAppt }) {
  const [apptOpen, setApptOpen] = useState(false);
  const [apptDate, setApptDate] = useState('');
  const [apptTime, setApptTime] = useState('10:00');
  const st = stageOf(lead);
  const banner = STAGE_BANNER[st] || STAGE_BANNER['ppc-inflow'];
  const name = lead.full_name || lead.name || 'Unnamed';
  const county = lead.property_county || lead.county;
  const acres = lead.form_data?.acres || lead.acreage || lead.acres;
  const digits = (lead.phone || '').replace(/[^\d+]/g, '');
  const lastAt = lead.last_contact_at ? new Date(lead.last_contact_at).toLocaleDateString() : null;
  const preview = lead.last_contact_preview;
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden hover:border-indigo-500/40 transition">
      <div className={`px-4 py-1.5 border-b flex items-center gap-2 ${banner.bg}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${banner.dot}`} />
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${banner.text}`}>{banner.label}</span>
      </div>
      <div className="p-5">
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          {lead.map_uploaded ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-900/40 border border-green-700/50 text-green-400 text-[10px] font-semibold uppercase tracking-wide">
              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd" /></svg>
              Mapped
            </span>
          ) : (
            <span className="holo-notmapped inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide">
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7M4 4l16 16" /></svg>
              Not Mapped
            </span>
          )}
        </div>

        <div className="text-lg font-semibold text-white leading-tight">{name}</div>
        <div className="text-sm text-slate-400 mt-0.5">{lead.phone || 'No phone'}{county ? ` · ${county} County` : ''}{acres ? ` · ${acres} ac` : ''}</div>
        {lastAt && <div className="text-xs text-slate-500 mt-1 truncate">Last {lead.last_contact_dir || 'contact'} · {lastAt}{preview ? ` · ${preview}` : ''}</div>}

        <div className="mt-3 flex gap-2">
          {digits && <a href={`tel:${digits}`} className="flex-1 text-center text-xs font-semibold px-3 py-2 rounded-lg bg-slate-700/60 hover:bg-slate-600/60 text-slate-200 inline-flex items-center justify-center gap-1.5"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11 11 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>Call</a>}
          <a href={`/admin/land?lead=${lead.id}`} target="_blank" rel="noreferrer" className="flex-1 text-center text-xs font-semibold px-3 py-2 rounded-lg bg-slate-700/60 hover:bg-slate-600/60 text-slate-200 inline-flex items-center justify-center gap-1.5"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M21 12a9 9 0 01-9 9 9.8 9.8 0 01-4.2-.9L3 21l1.9-4.8A9.8 9.8 0 013 12a9 9 0 1118 0z" /></svg>Messages</a>
        </div>

        <div className="mt-2">
          <select value={up(lead)} onChange={e => onStage(lead.id, e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
            {STAGE_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        </div>

        {!apptOpen ? (
          <button onClick={() => setApptOpen(true)} className="mt-2 w-full text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 text-slate-300">Set appointment</button>
        ) : (
          <div className="mt-2 flex gap-2">
            <input type="date" value={apptDate} onChange={e => setApptDate(e.target.value)} className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-white" />
            <input type="time" value={apptTime} onChange={e => setApptTime(e.target.value)} className="bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-white" />
            <button onClick={() => { onAppt(lead.id, apptDate, apptTime); setApptOpen(false); }} className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold">Save</button>
          </div>
        )}

        <div className="mt-2 flex gap-2">
          <a href={`/admin/land?lead=${lead.id}`} target="_blank" rel="noreferrer" className="flex-1 text-center text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/40 border border-indigo-500/40">Open in CRM</a>
          <button onClick={() => onRemove(lead.id)} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 text-slate-400">Remove</button>
        </div>
      </div>
    </div>
  );
}

function AppointmentCalendar({ meetings, leads, usersById, calMonth, setCalMonth, calSelectedDay, setCalSelectedDay, onOpenLead, renderCard }) {
  const byDay = {};
  meetings.forEach(t => { if (!t.due_at) return; const k = new Date(t.due_at).toDateString(); (byDay[k] = byDay[k] || []).push(t); });
  const first = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(calMonth.getFullYear(), calMonth.getMonth(), d));
  const todayStr = new Date().toDateString();
  const monthLabel = calMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const shift = (n) => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + n, 1));
  const selMeetings = (byDay[calSelectedDay] || []).slice().sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
  const selLabel = new Date(calSelectedDay).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const leadById = Object.fromEntries(leads.map(l => [l.id, l]));
  const total = cells.filter(Boolean).reduce((n, d) => n + (byDay[d.toDateString()]?.length || 0), 0);
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-green-500/10 to-emerald-600/5 border border-green-500/40 rounded-xl p-6">
        <h2 className="text-2xl font-bold text-green-300">Mapped &amp; Appointment Set</h2>
        <p className="text-slate-400 text-sm mt-1">{total} appointment{total === 1 ? '' : 's'} in {monthLabel}.</p>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-3 bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => shift(-1)} className="p-2 rounded-lg hover:bg-slate-700 text-slate-300"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>
            <div className="flex items-center gap-3"><h3 className="text-lg font-bold">{monthLabel}</h3><button onClick={() => { const t = new Date(); setCalMonth(new Date(t.getFullYear(), t.getMonth(), 1)); setCalSelectedDay(t.toDateString()); }} className="text-xs px-2 py-1 rounded bg-slate-700 text-slate-300 hover:bg-slate-600">Today</button></div>
            <button onClick={() => shift(1)} className="p-2 rounded-lg hover:bg-slate-700 text-slate-300"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500 py-1">{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, idx) => {
              if (!d) return <div key={`e${idx}`} />;
              const ds = d.toDateString();
              const count = byDay[ds]?.length || 0;
              const isToday = ds === todayStr;
              const isSel = ds === calSelectedDay;
              return (
                <button key={ds} onClick={() => setCalSelectedDay(ds)} className={`relative aspect-square rounded-lg p-1.5 text-left transition border ${isSel ? 'border-indigo-500 bg-indigo-500/15' : isToday ? 'border-slate-500 bg-slate-700/40' : 'border-transparent hover:bg-slate-700/40'}`}>
                  <span className={`text-sm ${isToday ? 'text-indigo-300 font-bold' : 'text-slate-300'}`}>{d.getDate()}</span>
                  {count > 0 && <span className="absolute bottom-1 right-1 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[11px] font-bold">{count}</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="xl:col-span-2">
          <h3 className="text-lg font-bold mb-1">{selLabel}</h3>
          <p className="text-sm text-slate-400 mb-4">{selMeetings.length} appointment{selMeetings.length === 1 ? '' : 's'}</p>
          {selMeetings.length === 0 ? (
            <div className="text-center py-10 text-slate-500 border border-dashed border-slate-700 rounded-xl">No appointments this day.</div>
          ) : (
            <div className="space-y-4">
              {selMeetings.map(t => {
                const lead = leadById[t.lead_id];
                const who = t.assigned_to && usersById[t.assigned_to] ? usersById[t.assigned_to].split(' ')[0] : null;
                return (
                  <div key={t.id}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-500/15 text-green-300 text-sm font-semibold"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>{fmtTime(t.due_at)}</span>
                      {who && <span className="text-xs text-slate-400">with {who}</span>}
                    </div>
                    {lead ? renderCard(lead) : <button onClick={() => onOpenLead(t.lead_id)} className="text-sm text-slate-400 border border-slate-700 rounded-lg p-3 w-full text-left">{t.title || 'Appointment'} — not in Clean View 2 (open in CRM)</button>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
