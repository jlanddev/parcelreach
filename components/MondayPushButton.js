'use client';

import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';

// Cache the partner board list across all cards. Only cache a NON-EMPTY result,
// so a failed/empty fetch retries on the next open instead of sticking.
let boardsCache = null;
function loadBoards() {
  if (boardsCache && boardsCache.length) return Promise.resolve(boardsCache);
  return fetch('/api/monday/boards')
    .then((r) => r.json())
    .then((d) => {
      const b = d.boards || [];
      if (b.length) boardsCache = b;
      return b;
    })
    .catch(() => []);
}

/**
 * Partner push. Compose one note, pick the partner(s), and send. Partners are
 * not connected, so you can send a different note to each on the same property:
 * send to one, rewrite, send to the next. The composer stays open for that. Each
 * push remembers the exact note that partner received.
 */
export default function MondayPushButton({ lead, onToast }) {
  const [boards, setBoards] = useState(boardsCache || []);
  const [loading, setLoading] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [expanded, setExpanded] = useState(false); // big editor vs normal
  const [selectedBoards, setSelectedBoards] = useState(() => new Set());
  const [pushingMany, setPushingMany] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [summary, setSummary] = useState(lead.partner_summary || '');
  const [coords, setCoords] = useState(lead.partner_coordinates || '');

  // Extra files (a new map, a survey, any doc) to push onto the partner's item.
  // These attach on both a first push and a follow-up update, so you can send an
  // updated map or a document to a partner anytime.
  const [attachments, setAttachments] = useState([]); // { name, url }
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const fileRef = useRef(null);

  // "Push as a new lead": recreate a fresh item on the partner board instead of
  // updating the prior one. For when the partner deleted the lead, or you just
  // want a clean push (map + columns + note all fresh).
  const [forceNew, setForceNew] = useState(false);

  const handleAttach = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setUploadingFiles(true);
    try {
      const added = [];
      for (const file of files) {
        const safe = file.name.replace(/[^\w.\-]+/g, '_');
        const path = `${lead.id}/attach/${Date.now()}-${safe}`;
        const { error } = await supabase.storage.from('lead-maps').upload(path, file, { cacheControl: '3600', upsert: true });
        if (error) throw error;
        const { data } = supabase.storage.from('lead-maps').getPublicUrl(path);
        added.push({ name: file.name, url: data?.publicUrl });
      }
      setAttachments((prev) => [...prev, ...added]);
    } catch (e) {
      onToast && onToast('Attach failed: ' + (e?.message || e), 'error');
    } finally {
      setUploadingFiles(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const removeAttachment = (url) => setAttachments((prev) => prev.filter((a) => a.url !== url));

  // Partners this lead has already been sent to (from the lead, plus any sent now).
  const [sent, setSent] = useState(Array.isArray(lead.partner_pushes) ? lead.partner_pushes : []);
  const sentIds = new Set(sent.map((p) => String(p.board_id)));
  const whySelling = (lead.form_data?.whySelling || '').trim();

  const toggleBoard = (id) => setSelectedBoards((s) => {
    const n = new Set(s); const k = String(id);
    n.has(k) ? n.delete(k) : n.add(k);
    return n;
  });

  // Open the composer. Optionally preload a note (e.g. Edit/resend) and
  // preselect a partner. Loads the board list on first open.
  const openComposer = async (preloadNote, preselectBoardId) => {
    if (typeof preloadNote === 'string') setSummary(preloadNote);
    setSelectedBoards(preselectBoardId ? new Set([String(preselectBoardId)]) : new Set());
    setComposerOpen(true);
    if (boards.length === 0) {
      setLoading(true);
      const b = await loadBoards();
      setBoards(b);
      setLoading(false);
    }
  };

  const closeComposer = () => { setComposerOpen(false); setExpanded(false); };

  // Two modes, decided by whether the box already has your own writing:
  //  - empty box  -> compile the note from the logged notes/texts (grounded)
  //  - your text  -> just clean up your writing, add nothing new
  const generateSummary = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/ai/partner-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, draft: summary }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not generate');
      setSummary(data.summary);
      onToast && onToast(data.mode === 'polish' ? 'Cleaned up your note.' : 'Note drafted from your logs. Review it, then send.', 'success');
    } catch (e) {
      onToast && onToast('Generate failed: ' + (e?.message || e), 'error');
    } finally {
      setGenerating(false);
    }
  };

  // Put the seller's reason for selling on TOP of the note.
  const addSellingReason = () => {
    if (!whySelling) return;
    setSummary((cur) => {
      const body = (cur || '').trim();
      if (body.includes(whySelling)) return cur;
      return `Reason for selling: ${whySelling}${body ? `\n\n${body}` : ''}`;
    });
  };

  // Push the current note to every ticked board (endpoint takes one board), then
  // report a combined result. Keep the composer open so a different note can go
  // to the next partner.
  const send = async () => {
    const targets = boards.filter((b) => selectedBoards.has(String(b.id)));
    if (!targets.length || !summary.trim()) return;
    setPushingMany(true);
    const newNames = [];
    const updatedNames = [];
    const failNames = [];
    let latestPushes = null;
    for (const board of targets) {
      try {
        const res = await fetch('/api/monday/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadId: lead.id, boardId: board.id, summary: summary.trim(), coordinates: coords.trim(), attachments, forceNew }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Push failed');
        if (Array.isArray(data.partner_pushes)) latestPushes = data.partner_pushes;
        else latestPushes = [...(latestPushes || sent).filter((p) => String(p.board_id) !== String(board.id)), { board_id: board.id, board_name: board.name, note: summary.trim() }];
        (data.updatedExisting ? updatedNames : newNames).push(board.name);
      } catch (err) {
        failNames.push(board.name);
        console.warn('[monday push]', board.name, err?.message);
      }
    }
    if (latestPushes) setSent(latestPushes);
    setSelectedBoards(new Set());
    setAttachments([]);
    setForceNew(false);
    setPushingMany(false);
    const attachNote = attachments.length ? ` (+${attachments.length} file${attachments.length > 1 ? 's' : ''})` : '';
    const okBits = [];
    if (newNames.length) okBits.push(`${forceNew ? 'Pushed as new to' : 'Sent to'} ${newNames.join(', ')} with the map${attachNote}`);
    if (updatedNames.length) okBits.push(`Posted an update to ${updatedNames.join(', ')}${attachNote}`);
    if (okBits.length && !failNames.length) onToast && onToast(okBits.join('. '), 'success');
    else if (okBits.length && failNames.length) onToast && onToast(`${okBits.join('. ')}. Failed: ${failNames.join(', ')}`, 'error');
    else onToast && onToast(`Push failed: ${failNames.join(', ')}`, 'error');
  };

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      {/* What each partner already received (notes can differ per partner). */}
      {sent.length > 0 && (
        <div className="mb-2 space-y-1">
          <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Sent to partners</span>
          {sent.map((p) => (
            <div key={p.board_id} className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 px-2.5 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-200">
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                  {p.board_name}
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); openComposer(p.note || summary, p.board_id); }}
                  className="text-[10px] text-indigo-300 hover:text-indigo-100 flex-shrink-0"
                  title="Load this note to edit and resend a tailored version to this partner"
                >
                  Edit / resend
                </button>
              </div>
              {p.note && <p className="mt-1 text-[11px] text-slate-400 whitespace-pre-wrap break-words line-clamp-3">{p.note}</p>}
            </div>
          ))}
        </div>
      )}

      {/* One clear entry point into the compose + send flow. */}
      <button
        type="button"
        onClick={() => openComposer()}
        className="w-full px-3 py-2 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 text-sm font-medium flex items-center justify-center gap-1.5"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
        {sent.length ? 'Add summary note' : 'Add summary note'}
      </button>

      {composerOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40 bg-black/60" onClick={closeComposer} />
          {/* Composer */}
          <div
            className={`fixed z-50 left-1/2 -translate-x-1/2 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl flex flex-col ${expanded ? 'top-4 bottom-4 w-[min(920px,94vw)]' : 'top-1/2 -translate-y-1/2 w-[min(560px,94vw)] max-h-[88vh]'}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 flex-shrink-0">
              <span className="text-sm font-semibold text-white">Note to partners</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  title={expanded ? 'Shrink' : 'Expand'}
                  className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700"
                >
                  {expanded ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m0 0v4m0-4h4m7 5l5-5m0 0v4m0-4h-4m-1 12l5 5m0 0v-4m0 4h-4M9 15l-5 5m0 0v-4m0 4h4" /></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                  )}
                </button>
                <button
                  type="button"
                  onClick={closeComposer}
                  title="Close"
                  className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {/* Partner picker */}
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Send to</span>
                {loading && <div className="text-xs text-slate-400">Loading partners…</div>}
                {!loading && boards.length === 0 && <div className="text-xs text-slate-400">No partner boards found</div>}
                <div className="flex flex-wrap gap-1.5">
                  {boards.map((b) => {
                    const checked = selectedBoards.has(String(b.id));
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => toggleBoard(b.id)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${checked ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-900/60 border-slate-600 text-slate-300 hover:border-slate-500'}`}
                      >
                        <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${checked ? 'border-white' : 'border-slate-500'}`}>
                          {checked && <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                        </span>
                        {b.name}
                        {sentIds.has(String(b.id)) && <span className="text-[9px] opacity-70">update</span>}
                      </button>
                    );
                  })}
                </div>
                {/* Reset: push as a brand-new lead (recreate on the partner board). */}
                <label className="mt-2 flex items-start gap-2 text-[11px] text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={forceNew} onChange={(e) => setForceNew(e.target.checked)} className="mt-0.5 w-3.5 h-3.5 accent-indigo-500" />
                  <span>Push as a <b className="text-indigo-300">new lead</b> (recreate a fresh item with the map. Use if the partner deleted it, or you want a clean re-push.)</span>
                </label>
              </div>

              {/* Note editor */}
              <div>
                <div className="flex items-center justify-between mb-1.5 gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">The note</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={generateSummary}
                      disabled={generating}
                      title={summary.trim() ? 'Clean up and improve what you wrote. Adds nothing new.' : 'Draft the note from this lead’s logged notes and texts'}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-cyan-600/20 hover:bg-cyan-600/40 disabled:opacity-50 text-cyan-300 text-[11px] font-semibold"
                    >
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l1.9 5.8L20 9.7l-4.7 3.7L16.9 20 12 16.3 7.1 20l1.6-6.6L4 9.7l6.1-1.9L12 2z" /></svg>
                      {generating ? 'Writing…' : summary.trim() ? 'Clean up' : 'Generate'}
                    </button>
                    {whySelling && (
                      <button
                        type="button"
                        onClick={addSellingReason}
                        title="Put the seller's reason for selling on top of the note"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-700/70 hover:bg-slate-600 text-slate-200 text-[11px] font-semibold"
                      >
                        + Selling reason
                      </button>
                    )}
                  </div>
                </div>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={expanded ? 16 : 7}
                  placeholder="Write or paste the note, or hit Generate. This is what the partner sees."
                  className="w-full resize-none bg-slate-900/70 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500/60"
                />
              </div>

              {/* Coordinates (optional) */}
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Coordinates (optional)</span>
                <input
                  value={coords}
                  onChange={(e) => setCoords(e.target.value)}
                  placeholder="e.g. 30.2672, -97.7431"
                  className="w-full bg-slate-900/70 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500/60"
                />
              </div>

              {/* Attachments: push a new map or any document to the partner's item. */}
              <div>
                <div className="flex items-center justify-between mb-1.5 gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Attachments (map, docs)</span>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploadingFiles}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-700/70 hover:bg-slate-600 disabled:opacity-50 text-slate-200 text-[11px] font-semibold"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                    {uploadingFiles ? 'Uploading…' : 'Attach file(s)'}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => handleAttach(e.target.files)} />
                </div>
                {attachments.length === 0 ? (
                  <p className="text-[11px] text-slate-500">Attach a new map or a document to send to the partner. Works on a first push or an update.</p>
                ) : (
                  <div className="space-y-1">
                    {attachments.map((a) => (
                      <div key={a.url} className="flex items-center justify-between gap-2 bg-slate-900/60 border border-slate-700 rounded-md px-2.5 py-1.5">
                        <span className="text-[11px] text-slate-200 truncate">{a.name}</span>
                        <button type="button" onClick={() => removeAttachment(a.url)} className="text-slate-400 hover:text-red-400 text-xs flex-shrink-0">Remove</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer: send */}
            <div className="px-4 py-3 border-t border-slate-700 flex-shrink-0 flex items-center gap-2">
              <button
                type="button"
                onClick={closeComposer}
                className="px-3 py-2 rounded-md text-slate-300 hover:bg-slate-700 text-sm font-medium"
              >
                Close
              </button>
              <button
                type="button"
                onClick={send}
                disabled={selectedBoards.size === 0 || !summary.trim() || pushingMany}
                className="flex-1 px-3 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold"
              >
                {pushingMany
                  ? 'Sending…'
                  : selectedBoards.size
                    ? `Send to ${selectedBoards.size} ${selectedBoards.size === 1 ? 'partner' : 'partners'}`
                    : 'Pick a partner to send'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
