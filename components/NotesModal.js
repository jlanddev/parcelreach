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
export default function NotesModal({ lead, currentUserId, currentUserName, roster = [], usersById = {}, onClose, onPosted }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const taRef = useRef(null);
  const scrollRef = useRef(null);

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

  useEffect(() => { load(); }, [load]);

  // Live: new notes from teammates appear without refresh.
  useEffect(() => {
    if (!lead?.id) return;
    const ch = supabase
      .channel(`lead-notes-${lead.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lead_notes', filter: `lead_id=eq.${lead.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [lead?.id, load]);

  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [notes, loading]);

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
            link: '/admin/land',
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
            <div className="text-slate-100 font-semibold truncate">Notes — {name}</div>
            <div className="text-slate-400 text-xs">{notes.length} note{notes.length === 1 ? '' : 's'} · tag with @</div>
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
            return (
              <div key={n.id} className="flex flex-col">
                <div className="flex items-baseline gap-2">
                  <span className={`text-xs font-semibold ${mine ? 'text-blue-300' : 'text-slate-300'}`}>
                    {usersById[n.user_id] || (mine ? 'You' : 'Teammate')}
                  </span>
                  <span className="text-[10px] text-slate-500">{timeAgo(n.created_at)}</span>
                </div>
                <div className="text-sm text-slate-200 whitespace-pre-wrap break-words mt-0.5">{renderContent(n.content)}</div>
              </div>
            );
          })}
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
