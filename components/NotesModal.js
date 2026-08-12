'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { timeAgo } from '@/lib/format';
import { playSwoosh } from '@/lib/sound';

/**
 * Collaborative notes thread for one lead (Monday-style). Shows all authors'
 * notes chronologically, composer with @mention of teammates, and fires a
 * notification (the bell + email) to anyone tagged.
 *
 * roster: [{ id, name }] of taggable teammates (admin + acquisition manager).
 * usersById: { [userId]: name } for author labels.
 */
const LEAN_LABEL = { hot: 'Hot', warm: 'Warm', cold: 'Cold', ready: 'Ready' };

export default function NotesModal({ lead, currentUserId, currentUserName, roster = [], usersById = {}, onClose, onPosted, onOpenLead, onSetDirection, onScheduleFollowUp, onAssignTask, onEnrollCampaign, onSetStage, postCall }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [reads, setReads] = useState([]); // [{user_id, read_at}] read receipts
  const [aiLoading, setAiLoading] = useState(false);
  const [ai, setAi] = useState(null); // { lean, follow_up, summary } or { error }
  const [aiApplied, setAiApplied] = useState({});
  const [aiDismissed, setAiDismissed] = useState({});
  const [expanded, setExpanded] = useState(false);          // bigger note window
  const [draftFiles, setDraftFiles] = useState([]);         // [{url,name,type}] attached to the note being written
  const [uploading, setUploading] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);          // assign-task form
  const [taskAssignee, setTaskAssignee] = useState('');
  const [taskDate, setTaskDate] = useState('');
  const [taskTime, setTaskTime] = useState('10:00');
  const [taskLabel, setTaskLabel] = useState('Call');
  const [taskWhy, setTaskWhy] = useState('');
  const taRef = useRef(null);
  const scrollRef = useRef(null);
  const fileRef = useRef(null);

  // Upload one attachment to the note-attachments bucket, return its public URL.
  const uploadFiles = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const added = [];
      for (const file of Array.from(files)) {
        const rand = Math.random().toString(36).slice(2, 8);
        const path = `${lead.id}/${Date.now()}-${rand}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { error } = await supabase.storage.from('note-attachments').upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw error;
        const { data } = supabase.storage.from('note-attachments').getPublicUrl(path);
        added.push({ url: data.publicUrl, name: file.name, type: file.type });
      }
      setDraftFiles((prev) => [...prev, ...added]);
    } catch (e) {
      alert('Upload failed: ' + (e?.message || e));
    } finally {
      setUploading(false);
    }
  };

  // Assign a task (who + when) as the lead's next touch. Keeps the lead's stage,
  // and supersedes any existing follow-up (handled in the parent) so nothing conflicts.
  const submitTask = () => {
    if (!onAssignTask || !taskDate) return;
    const dueISO = new Date(`${taskDate}T${taskTime || '10:00'}:00`).toISOString();
    onAssignTask(lead.id, { assignedTo: taskAssignee || undefined, dueISO, label: taskLabel || 'Call', why: taskWhy.trim() || undefined });
    setTaskWhy('');
    setTaskOpen(false); setTaskDate('');
  };
  const quickDate = (days) => { const d = new Date(); d.setDate(d.getDate() + days); setTaskDate(d.toISOString().slice(0, 10)); };

  // AI assistant: talk to it. Ask for a read, or tell it to do something
  // ("set a call in 3 days", "move to Offer Pending"); it acts on the lead.
  const [asstInput, setAsstInput] = useState('');
  const [asstOpen, setAsstOpen] = useState(!!postCall);
  const [asstMsgs, setAsstMsgs] = useState(
    postCall ? [{ role: 'ai', text: 'How did the call go? Tell me and I will suggest the next move for you to approve.' }] : []
  ); // { role:'user'|'ai', text }
  const [asstBusy, setAsstBusy] = useState(false);
  const [pending, setPending] = useState(null); // proposed action awaiting your OK
  const [cleaning, setCleaning] = useState(false);

  // Clean up the note the rep is writing (grammar/flow, in their voice, adds
  // nothing). Same tool as the partner summary, on regular notes.
  const cleanupNote = async () => {
    const text = draft.trim();
    if (!text || cleaning) return;
    setCleaning(true);
    try {
      const res = await fetch('/api/ai/partner-summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: lead.id, draft: text }) });
      const data = await res.json();
      if (res.ok && data.ok && data.summary) setDraft(data.summary);
    } catch { /* leave the note as is */ } finally { setCleaning(false); }
  };

  const actionSummary = (a) => {
    if (!a) return '';
    if (a.type === 'set_task') {
      const when = a.date ? `${a.date}${a.time ? ' ' + a.time : ''}` : `in ${a.in_days ?? 2} day${(a.in_days ?? 2) === 1 ? '' : 's'}${a.time ? ' at ' + a.time : ''}`;
      return `Set follow-up "${a.label || 'Call'}" ${when}`;
    }
    if (a.type === 'enroll_campaign') return `Add to campaign: ${a.campaign}`;
    if (a.type === 'set_stage') return `Move stage to ${a.stage}`;
    if (a.type === 'set_lean') return `Set lean to ${a.lean}`;
    return 'Take an action';
  };

  // Ask Claude. It PROPOSES; nothing happens to the lead until you approve.
  const askAssistant = async (text, isSuggest) => {
    const instruction = (text ?? asstInput).trim();
    if (!instruction || asstBusy) return;
    setAsstMsgs((m) => [...m, { role: 'user', text: instruction }]);
    setAsstInput('');
    setAsstBusy(true);
    setPending(null);
    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, instruction }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Assistant failed');
      setAsstMsgs((m) => [...m, { role: 'ai', text: data.reply || 'Okay.' }]);
      if (data.action) setPending({ action: data.action, instruction, isSuggest: !!isSuggest });
    } catch (e) {
      setAsstMsgs((m) => [...m, { role: 'ai', text: 'Error: ' + (e.message || e) }]);
    } finally { setAsstBusy(false); }
  };

  // Approve the proposed action: NOW it acts + logs a note (your own words, plus
  // what was done). The canned Suggest prompt is never logged as your note.
  const approvePending = async () => {
    if (!pending) return;
    const a = pending.action;
    let logSuffix = '';
    if (a.type === 'set_task' && onAssignTask) {
      let dueISO;
      if (a.date) dueISO = new Date(`${a.date}T${a.time || '10:00'}:00`).toISOString();
      else { const d = new Date(); d.setDate(d.getDate() + (a.in_days ?? 2)); const [hh, mm] = (a.time || '10:00').split(':').map(Number); d.setHours(hh || 10, mm || 0, 0, 0); dueISO = d.toISOString(); }
      onAssignTask(lead.id, { assignedTo: undefined, dueISO, label: a.label || 'Call', why: a.why || a.reason || (pending.isSuggest ? undefined : pending.instruction) });
      logSuffix = actionSummary(a);
    } else if (a.type === 'enroll_campaign' && onEnrollCampaign && a.campaign) { onEnrollCampaign(lead.id, a.campaign); logSuffix = `Enrolled in "${a.campaign}"`; }
    else if (a.type === 'set_stage' && onSetStage && a.stage) { onSetStage(lead.id, a.stage); logSuffix = `Moved to ${a.stage}`; }
    else if (a.type === 'set_lean' && onSetDirection && a.lean) { onSetDirection(lead.id, a.lean); logSuffix = `Lean set to ${a.lean}`; }
    setAsstMsgs((m) => [...m, { role: 'ai', text: `✓ ${actionSummary(a)}` }]);
    try {
      const typed = pending.isSuggest ? '' : pending.instruction;
      const content = [typed, logSuffix ? `→ ${logSuffix}` : ''].filter(Boolean).join('\n');
      if (content) { await supabase.from('lead_notes').insert({ lead_id: lead.id, user_id: currentUserId, content, mentioned_users: [] }); load(); onPosted && onPosted(); }
    } catch { /* non-fatal */ }
    setPending(null);
  };
  const cancelPending = () => { setPending(null); setAsstMsgs((m) => [...m, { role: 'ai', text: 'Holding off. Tell me what to change.' }]); };

  // Notes brain: reads the WHOLE file (texts + calls + notes) via the same
  // endpoint the message brain uses, so both see everything.
  const runSmartSuggest = async () => {
    setAiLoading(true);
    setAi(null);
    setAiApplied({});
    setAiDismissed({});
    try {
      const res = await fetch('/api/ai/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'No suggestion');
      setAi(data);
    } catch (e) {
      setAi({ error: e.message });
    } finally {
      setAiLoading(false);
    }
  };

  const whenLabel = (iso) =>
    new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  const name = lead?.full_name || lead?.name || lead?.owner_name || 'Lead';

  const load = useCallback(async () => {
    if (!lead?.id) return;
    const { data } = await supabase
      .from('lead_notes')
      .select('id, lead_id, content, created_at, user_id, mentioned_users, attachments')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: true });
    setNotes(data || []);
    setLoading(false);
  }, [lead?.id]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 8000); // live even if lead_notes isn't in the realtime publication
    return () => clearInterval(iv);
  }, [load]);

  // Live: new notes from teammates appear without refresh.
  useEffect(() => {
    if (!lead?.id) return;
    const ch = supabase
      .channel(`lead-notes-${lead.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lead_notes', filter: `lead_id=eq.${lead.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [lead?.id, load]);

  // Read receipts: mark this teammate as having read the thread, and load who
  // else has. Degrades silently if the note_reads table isn't created yet.
  useEffect(() => {
    if (!lead?.id || !currentUserId) return;
    let cancelled = false;
    const sync = async () => {
      try {
        await supabase
          .from('note_reads')
          .upsert({ lead_id: lead.id, user_id: currentUserId, read_at: new Date().toISOString() }, { onConflict: 'lead_id,user_id' });
        const { data } = await supabase.from('note_reads').select('user_id, read_at').eq('lead_id', lead.id);
        if (!cancelled && data) setReads(data);
      } catch {}
    };
    sync();
    const iv = setInterval(sync, 8000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [lead?.id, currentUserId]);

  // Only auto-scroll when a NEW note arrives (or first load), not on every poll,
  // otherwise the view bounces to the bottom while you're reading.
  const prevCount = useRef(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (el && notes.length > prevCount.current) el.scrollTop = el.scrollHeight;
    prevCount.current = notes.length;
  }, [notes]);

  const onChange = (e) => {
    setDraft(e.target.value);
    const upto = e.target.value.slice(0, e.target.selectionStart);
    setMentionOpen(/@\w*$/.test(upto));
  };

  const pickMention = (r) => {
    const ta = taRef.current;
    const pos = ta ? ta.selectionStart : draft.length;
    const before = draft.slice(0, pos).replace(/@\w*$/, `@${r.name} `);
    setDraft(before + draft.slice(pos));
    setMentionOpen(false);
    if (ta) ta.focus();
  };

  const post = async () => {
    const content = draft.trim();
    if ((!content && draftFiles.length === 0) || posting) return;
    setPosting(true);
    try {
      const mentioned = roster
        .filter((r) => content.toLowerCase().includes(`@${r.name.toLowerCase()}`))
        .map((r) => r.id)
        .filter((id) => id && id !== currentUserId);

      const { error } = await supabase.from('lead_notes').insert({
        lead_id: lead.id,
        user_id: currentUserId,
        content: content || '(attachment)',
        mentioned_users: mentioned,
        attachments: draftFiles,
      });
      if (error) throw error;
      setDraft('');
      setDraftFiles([]);
      playSwoosh();

      // Fire a notification (bell + email) to each tagged teammate.
      for (const uid of mentioned) {
        fetch('/api/notifications/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: uid,
            fromUserId: currentUserId,
            type: 'mention',
            title: `${currentUserName || 'A teammate'} mentioned you on ${name}`,
            message: content.slice(0, 200),
            link: `/admin/land?lead=${lead.id}`,
            notePreview: content.slice(0, 200),
          }),
        }).catch(() => {});
      }
      load();
      onPosted && onPosted();
    } catch (e) {
      alert('Could not post note: ' + e.message);
    } finally {
      setPosting(false);
    }
  };

  const renderContent = (text) =>
    (text || '').split(/(@[A-Za-z][\w'-]*)/g).map((part, i) =>
      part.startsWith('@') ? (
        <span key={i} className="text-blue-400 font-medium">{part}</span>
      ) : (
        <span key={i}>{part}</span>
      )
    );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className={`w-full bg-slate-900 border border-slate-700 rounded-xl flex flex-col overflow-hidden shadow-2xl ${expanded ? 'max-w-3xl h-[88vh]' : 'max-w-md h-[620px]'}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700/70 bg-slate-800/60">
          <div className="flex-1 min-w-0">
            <button
              type="button"
              onClick={() => { if (onOpenLead) { onOpenLead(lead); onClose(); } }}
              className="text-slate-100 font-semibold truncate hover:text-blue-300 hover:underline text-left max-w-full"
              title="Open lead card"
            >
              {name}
            </button>
            <div className="text-slate-400 text-xs">{notes.length} note{notes.length === 1 ? '' : 's'} · tap name for the lead card</div>
          </div>
          <button onClick={() => setExpanded((v) => !v)} title={expanded ? 'Shrink' : 'Expand'} className="p-2 rounded-lg hover:bg-slate-700/60 text-slate-400">
            {expanded ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m0 0v4m0-4h4m7 5l5-5m0 0v4m0-4h-4m-1 12l5 5m0 0v-4m0 4h-4M9 15l-5 5m0 0v-4m0 4h4" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
            )}
          </button>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-700/60 text-slate-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
          {loading && <div className="text-slate-500 text-sm text-center mt-6">Loading notes…</div>}
          {!loading && notes.length === 0 && <div className="text-slate-500 text-sm text-center mt-6">No notes yet. Start the thread.</div>}
          {notes.map((n) => {
            const mine = n.user_id === currentUserId;
            const who = (usersById[n.user_id] || (mine ? 'You' : 'Teammate')).split(' ')[0];
            return (
              <div key={n.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                <div className="flex items-baseline gap-2 px-1">
                  <span className={`text-[11px] font-semibold ${mine ? 'text-blue-300' : 'text-purple-300'}`}>{who}</span>
                  <span className="text-[10px] text-slate-500">{timeAgo(n.created_at)}</span>
                </div>
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words mt-0.5 ${
                    mine
                      ? 'bg-blue-600/30 border border-blue-600/40 text-blue-50'
                      : 'bg-slate-700/70 border border-slate-600/40 text-slate-100'
                  }`}
                >
                  {renderContent(n.content)}
                  {Array.isArray(n.attachments) && n.attachments.length > 0 && (
                    <div className="mt-2 flex flex-col gap-2">
                      {n.attachments.map((f, i) => (
                        (f.type || '').startsWith('image/') ? (
                          <a key={i} href={f.url} target="_blank" rel="noreferrer">
                            <img src={f.url} alt={f.name} className="max-h-48 rounded-lg border border-slate-600/40" />
                          </a>
                        ) : (
                          <a key={i} href={f.url} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-800/70 border border-slate-600/40 text-xs text-blue-300 hover:text-blue-200 max-w-full">
                            <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                            <span className="truncate">{f.name}</span>
                          </a>
                        )
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Read receipts: who has seen the thread */}
        {(() => {
          const latestTs = notes.length ? new Date(notes[notes.length - 1].created_at).getTime() : 0;
          const others = reads.filter((r) => r.user_id !== currentUserId && usersById[r.user_id]);
          if (others.length === 0) return null;
          return (
            <div className="px-4 py-1 text-[10px] text-slate-500 flex flex-wrap gap-x-3 border-t border-slate-800/60">
              {others.map((r) => {
                const caught = new Date(r.read_at).getTime() >= latestTs;
                const who = (usersById[r.user_id] || 'Teammate').split(' ')[0];
                return (
                  <span key={r.user_id} className={caught ? 'text-green-500/80' : ''}>
                    {caught ? '✓✓ Seen by' : 'Last read by'} {who} {timeAgo(r.read_at)}
                  </span>
                );
              })}
            </div>
          );
        })()}

        {/* AI Assistant: collapsible. It PROPOSES; nothing happens to the lead
            until you approve. Click the header to open or close it. */}
        <div className="border-t border-slate-700/70 px-2 py-2 bg-slate-800/40">
          <button type="button" onClick={() => setAsstOpen((v) => !v)} className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-cyan-300 hover:text-cyan-200">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
            Assistant
            <svg className={`w-3 h-3 transition-transform ${asstOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
          </button>
          {asstOpen && (
            <div className="mt-2">
              {asstMsgs.length > 0 && (
                <div className="mb-2 max-h-40 overflow-y-auto space-y-1.5 pr-1">
                  {asstMsgs.map((m, i) => (
                    <div key={i} className={`text-xs px-2.5 py-1.5 rounded-lg whitespace-pre-wrap ${m.role === 'user' ? 'bg-blue-600/20 text-blue-100 ml-8' : 'bg-slate-800/70 border border-cyan-500/20 text-slate-200 mr-8'}`}>{m.text}</div>
                  ))}
                  {asstBusy && <div className="text-xs text-slate-500 px-2">Thinking…</div>}
                </div>
              )}
              {pending && (
                <div className="mb-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-2">
                  <div className="text-xs text-cyan-100 mb-1.5">Approve this? <span className="font-semibold">{actionSummary(pending.action)}</span></div>
                  <div className="flex gap-2">
                    <button type="button" onClick={approvePending} className="px-3 py-1 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold">Approve</button>
                    <button type="button" onClick={cancelPending} className="px-3 py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs">Cancel</button>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <input
                  value={asstInput}
                  onChange={(e) => setAsstInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); askAssistant(); } }}
                  placeholder="Tell me what happened, or ask for the next move…"
                  className="flex-1 bg-slate-900/70 border border-slate-700 rounded-md px-2.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/60"
                />
                <button type="button" onClick={() => askAssistant()} disabled={asstBusy || !asstInput.trim()} className="px-3 py-2 rounded-md bg-cyan-600/30 hover:bg-cyan-600/50 disabled:opacity-40 text-cyan-100 text-xs font-medium">Send</button>
                <button type="button" onClick={() => askAssistant("What's the smartest next move on this lead?", true)} disabled={asstBusy} title="Get a read" className="px-3 py-2 rounded-md bg-slate-700/60 hover:bg-slate-600 text-slate-300 text-xs">Suggest</button>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-700/70 p-2 bg-slate-800/40 relative">
          {mentionOpen && roster.length > 0 && (
            <div className="absolute bottom-full left-2 mb-1 bg-slate-800 border border-slate-600 rounded-lg overflow-hidden shadow-xl">
              {roster.map((r) => (
                <button key={r.id} onClick={() => pickMention(r)} className="block w-full text-left px-3 py-1.5 text-sm text-slate-200 hover:bg-blue-600/30">
                  @{r.name}
                </button>
              ))}
            </div>
          )}
          {/* Assign Task: sets the lead's next touch (who + when), keeps its stage. */}
          {onAssignTask && (
            <div className="mb-2">
              {!taskOpen ? (
                <button type="button" onClick={() => { setTaskOpen(true); if (!taskDate) quickDate(2); }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-700/60 hover:bg-slate-600 text-slate-200 text-xs font-medium">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                  Assign Task
                </button>
              ) : (
                <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-wide text-slate-400">Assign a task</span>
                    <button type="button" onClick={() => setTaskOpen(false)} className="text-slate-500 hover:text-slate-300 text-sm">×</button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select value={taskAssignee} onChange={(e) => setTaskAssignee(e.target.value)} className="col-span-2 bg-slate-900/70 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-200">
                      <option value="">Assign to owner</option>
                      {roster.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                    <input value={taskLabel} onChange={(e) => setTaskLabel(e.target.value)} placeholder="Call" className="col-span-2 bg-slate-900/70 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-200" />
                    <input value={taskWhy} onChange={(e) => setTaskWhy(e.target.value)} placeholder="Objective: why are we calling? (e.g. offer is out, close her)" className="col-span-2 bg-slate-900/70 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-200" />
                    <input type="date" value={taskDate} onChange={(e) => setTaskDate(e.target.value)} className="bg-slate-900/70 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-200" />
                    <input type="time" value={taskTime} onChange={(e) => setTaskTime(e.target.value)} className="bg-slate-900/70 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-200" />
                  </div>
                  <div className="flex items-center">
                    <button type="button" onClick={submitTask} disabled={!taskDate} className="ml-auto px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-medium">Set task</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Attachments queued on the note being written. */}
          {draftFiles.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {draftFiles.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-700/60 text-xs text-slate-200 max-w-[180px]">
                  <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                  <span className="truncate">{f.name}</span>
                  <button type="button" onClick={() => setDraftFiles((prev) => prev.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-rose-300">×</button>
                </span>
              ))}
            </div>
          )}

          {/* THE NOTE: the main event. Write the full story here; Clean up
              polishes your own words (grammar + flow, invents nothing). */}
          <div className="flex items-center justify-between mb-1.5 px-0.5">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">The note</span>
            <button type="button" onClick={cleanupNote} disabled={!draft.trim() || cleaning} title="Clean up your note: grammar and flow, in your voice, adds nothing" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-200 text-xs font-semibold disabled:opacity-40">
              {cleaning ? (
                <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>Cleaning…</>
              ) : (
                <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>Clean up</>
              )}
            </button>
          </div>
          <textarea
            ref={taRef}
            value={draft}
            onChange={onChange}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); post(); } }}
            rows={expanded ? 8 : 5}
            placeholder="Write the whole story here: what happened, what they want, next step. Use @ to tag a teammate. ⌘+Enter to post."
            className="w-full resize-none max-h-72 bg-slate-900/70 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500/60"
          />
          <div className="flex items-center gap-2 mt-2">
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { uploadFiles(e.target.files); e.target.value = ''; }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} title="Attach a file" className="p-2 rounded-lg bg-slate-700/60 hover:bg-slate-600 text-slate-300 disabled:opacity-50">
              {uploading ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
              )}
            </button>
            <button onClick={post} disabled={(!draft.trim() && draftFiles.length === 0) || posting} className="ml-auto px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-semibold">
              Post note
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
