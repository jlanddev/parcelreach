'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { timeAgo } from '@/lib/format';

/**
 * Collaborative notes thread for one lead (Monday-style). Shows all authors'
 * notes chronologically, composer with @mention of teammates, and fires a
 * notification (the bell + email) to anyone tagged.
 *
 * roster: [{ id, name }] of taggable teammates (admin + acquisition manager).
 * usersById: { [userId]: name } for author labels.
 */
const LEAN_LABEL = { hot: 'Hot', warm: 'Warm', cold: 'Cold', ready: 'Ready' };

export default function NotesModal({ lead, currentUserId, currentUserName, roster = [], usersById = {}, onClose, onPosted, onOpenLead, onSetDirection, onScheduleFollowUp }) {
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
  const taRef = useRef(null);
  const scrollRef = useRef(null);

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
      .select('id, lead_id, content, created_at, user_id, mentioned_users')
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
    if (!content || posting) return;
    setPosting(true);
    try {
      const mentioned = roster
        .filter((r) => content.toLowerCase().includes(`@${r.name.toLowerCase()}`))
        .map((r) => r.id)
        .filter((id) => id && id !== currentUserId);

      const { error } = await supabase.from('lead_notes').insert({
        lead_id: lead.id,
        user_id: currentUserId,
        content,
        mentioned_users: mentioned,
      });
      if (error) throw error;
      setDraft('');

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
      <div className="w-full max-w-md h-[620px] bg-slate-900 border border-slate-700 rounded-xl flex flex-col overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
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

        {/* Smart Suggest (notes brain): reads texts + calls + notes together */}
        <div className="border-t border-slate-700/70 px-2 pt-2 bg-slate-800/40">
          {ai && !ai.error && (
            <div className="mb-2 space-y-1.5">
              <div className="flex items-center justify-between px-0.5">
                <span className="text-[11px] font-bold text-cyan-300 uppercase tracking-wide">Smart Suggest</span>
                <button type="button" onClick={() => { setAi(null); setAiDismissed({}); }} className="text-slate-500 hover:text-slate-300 text-xs">Clear all</button>
              </div>
              {ai.summary && <p className="text-xs text-slate-200 px-2 py-1.5 rounded-lg border border-slate-700/50 bg-slate-800/40">{ai.summary}</p>}
              {ai.lean && onSetDirection && !aiDismissed.lean && (
                <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-2 py-1.5 flex items-center gap-2">
                  <button type="button" disabled={aiApplied.lean}
                    onClick={() => { onSetDirection(lead.id, ai.lean); setAiApplied((a) => ({ ...a, lean: true })); }}
                    className="flex-1 text-left text-xs disabled:opacity-60">
                    <span className="text-[10px] uppercase tracking-wide text-slate-500 block">Lean</span>
                    {aiApplied.lean ? '✓ Set: ' : 'Set lean: '}<span className="text-cyan-300 font-medium">{LEAN_LABEL[ai.lean] || ai.lean}</span>
                  </button>
                  <button type="button" onClick={() => setAiDismissed((d) => ({ ...d, lean: true }))} title="Dismiss" className="flex-shrink-0 text-slate-500 hover:text-slate-300 text-sm leading-none px-1">×</button>
                </div>
              )}
              {ai.follow_up && onScheduleFollowUp && !aiDismissed.fu && (
                <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-2 py-1.5 flex items-center gap-2">
                  <button type="button" disabled={aiApplied.fu}
                    onClick={() => { onScheduleFollowUp(lead.id, ai.follow_up.when, ai.follow_up.label); setAiApplied((a) => ({ ...a, fu: true })); }}
                    className="flex-1 text-left text-xs disabled:opacity-60">
                    <span className="text-[10px] uppercase tracking-wide text-slate-500 block">Schedule task</span>
                    {aiApplied.fu ? '✓ Scheduled: ' : ''}<span className="text-cyan-300 font-medium">{ai.follow_up.label} · {whenLabel(ai.follow_up.when)}</span>
                  </button>
                  <button type="button" onClick={() => setAiDismissed((d) => ({ ...d, fu: true }))} title="Dismiss" className="flex-shrink-0 text-slate-500 hover:text-slate-300 text-sm leading-none px-1">×</button>
                </div>
              )}
            </div>
          )}
          {ai && ai.error && (
            <div className="mb-2 text-xs text-rose-300">{ai.error}</div>
          )}
          <button
            type="button"
            onClick={runSmartSuggest}
            disabled={aiLoading}
            className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-cyan-300 hover:text-cyan-200 disabled:opacity-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
            {aiLoading ? 'Reading the file…' : 'Smart Suggest'}
          </button>
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
          <div className="flex items-end gap-2">
            <textarea
              ref={taRef}
              value={draft}
              onChange={onChange}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); post(); } }}
              rows={2}
              placeholder="Add a note… use @ to tag a teammate (⌘+Enter to send)"
              className="flex-1 resize-none max-h-32 bg-slate-900/70 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500/60"
            />
            <button onClick={post} disabled={!draft.trim() || posting} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium">
              Post
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
