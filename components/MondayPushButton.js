'use client';

import { useState } from 'react';

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
 * "Send to Partner", pushes this lead into a partner's Monday board (item in
 * the New Leads group + an update bubble with property notes and the parcel map).
 */
export default function MondayPushButton({ lead, onToast, onSaveSummary, onSaveCoordinates }) {
  const [open, setOpen] = useState(false);
  const [boards, setBoards] = useState(boardsCache || []);
  const [loading, setLoading] = useState(false);
  // Multi-select: tick several partner boards, then send to all at once.
  const [selectedBoards, setSelectedBoards] = useState(() => new Set());
  const [pushingMany, setPushingMany] = useState(false);
  const toggleBoard = (id) => setSelectedBoards((s) => {
    const n = new Set(s); const k = String(id);
    n.has(k) ? n.delete(k) : n.add(k);
    return n;
  });
  // Partners this lead has already been sent to (from the lead, plus any sent now).
  const [sent, setSent] = useState(Array.isArray(lead.partner_pushes) ? lead.partner_pushes : []);
  const sentIds = new Set(sent.map((p) => String(p.board_id)));

  // Partner summary: the ONLY note text that pushes to the board. Write/paste,
  // then lock. Locked = saved and read-only until you hit Edit.
  const [summary, setSummary] = useState(lead.partner_summary || '');
  const [locked, setLocked] = useState(!!(lead.partner_summary && lead.partner_summary.trim()));
  const [savingSummary, setSavingSummary] = useState(false);
  const [generating, setGenerating] = useState(false);

  const whySelling = (lead.form_data?.whySelling || '').trim();

  // Generate a clean partner summary in Jordan's voice from the lead file
  // (property facts + notes + SMS). Fills the summary box; he can edit then lock.
  const generateSummary = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/ai/partner-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not generate');
      // Keep the selling reason on top if it is already there; otherwise just
      // drop in the summary. Jordan can add the reason with the button below.
      setSummary(data.summary);
      setLocked(false);
      onToast && onToast('Summary drafted. Review and lock it.', 'success');
    } catch (e) {
      onToast && onToast('Summary failed: ' + (e?.message || e), 'error');
    } finally {
      setGenerating(false);
    }
  };

  // Put the lead's Why Selling on TOP of the summary so the reason and the
  // write-up push to the partner together as one note.
  const addSellingReason = () => {
    if (!whySelling) return;
    setSummary((cur) => {
      const body = (cur || '').trim();
      if (body.startsWith(whySelling)) return cur; // already on top
      return `Reason for selling: ${whySelling}${body ? `\n\n${body}` : ''}`;
    });
    setLocked(false);
  };

  const lockSummary = async () => {
    setSavingSummary(true);
    try {
      if (onSaveSummary) await onSaveSummary(lead.id, summary.trim());
      setLocked(true);
    } catch (e) {
      onToast && onToast('Could not save summary: ' + (e?.message || e), 'error');
    } finally {
      setSavingSummary(false);
    }
  };

  // Optional coordinates (used occasionally, e.g. PLG). Same write/paste + lock
  // pattern as the summary. Pushed under the tag/summary, above the map.
  const [coords, setCoords] = useState(lead.partner_coordinates || '');
  const [coordsLocked, setCoordsLocked] = useState(!!(lead.partner_coordinates && lead.partner_coordinates.trim()));
  const [savingCoords, setSavingCoords] = useState(false);

  const lockCoords = async () => {
    setSavingCoords(true);
    try {
      if (onSaveCoordinates) await onSaveCoordinates(lead.id, coords.trim());
      setCoordsLocked(true);
    } catch (e) {
      onToast && onToast('Could not save coordinates: ' + (e?.message || e), 'error');
    } finally {
      setSavingCoords(false);
    }
  };

  const toggle = async (e) => {
    e.stopPropagation();
    const next = !open;
    setOpen(next);
    if (next && boards.length === 0) {
      setLoading(true);
      const b = await loadBoards();
      setBoards(b);
      setLoading(false);
    }
  };

  // Push this lead to every ticked board, one call each (the endpoint takes a
  // single board), then report one combined result.
  const pushSelected = async (e) => {
    e.stopPropagation();
    const targets = boards.filter((b) => selectedBoards.has(String(b.id)));
    if (!targets.length) return;
    setPushingMany(true);
    const okNames = [];
    const failNames = [];
    let latestPushes = null;
    for (const board of targets) {
      try {
        // Send the current summary/coordinates with the push so whatever is in the
        // boxes goes out, even if you didn't hit Lock (and regardless of DB timing).
        const res = await fetch('/api/monday/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadId: lead.id, boardId: board.id, summary: summary.trim(), coordinates: coords.trim() }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Push failed');
        // Each response returns the merged partner_pushes list; keep the newest.
        if (Array.isArray(data.partner_pushes)) latestPushes = data.partner_pushes;
        else latestPushes = [...(latestPushes || sent).filter((p) => String(p.board_id) !== String(board.id)), { board_id: board.id, board_name: board.name, note: summary.trim() }];
        okNames.push(board.name);
      } catch (err) {
        failNames.push(board.name);
        console.warn('[monday push]', board.name, err?.message);
      }
    }
    if (latestPushes) setSent(latestPushes);
    setSelectedBoards(new Set());
    setOpen(false);
    setPushingMany(false);
    if (okNames.length && !failNames.length) onToast && onToast(`Sent to ${okNames.join(', ')}`, 'success');
    else if (okNames.length && failNames.length) onToast && onToast(`Sent to ${okNames.join(', ')}. Failed: ${failNames.join(', ')}`, 'error');
    else onToast && onToast(`Push failed: ${failNames.join(', ')}`, 'error');
  };

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
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
                {p.note && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setSummary(p.note); setLocked(false); onToast && onToast(`Loaded the note sent to ${p.board_name}. Edit and resend.`, 'success'); }}
                    className="text-[10px] text-indigo-300 hover:text-indigo-100 flex-shrink-0"
                    title="Load this note back into the box to edit and resend a tailored version"
                  >
                    Edit / resend
                  </button>
                )}
              </div>
              {p.note && <p className="mt-1 text-[11px] text-slate-400 whitespace-pre-wrap break-words line-clamp-3">{p.note}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Partner summary: the only note text that gets pushed to the board. */}
      <div className="mb-1.5">
        {locked ? (
          <div className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-2.5 py-2">
            <div className="flex items-center justify-between mb-1">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-indigo-300">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                Partner summary (locked)
              </span>
              <button type="button" onClick={() => setLocked(false)} className="text-[11px] text-indigo-300 hover:text-indigo-200">Edit</button>
            </div>
            <p className="text-xs text-slate-200 whitespace-pre-wrap break-words">{summary}</p>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-600 bg-slate-900/60 px-2.5 py-2">
            <div className="flex items-center justify-between mb-1.5 gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Partner summary</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={generateSummary}
                  disabled={generating}
                  title="Draft a summary in your voice from the notes, texts, and property details"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-cyan-600/20 hover:bg-cyan-600/40 disabled:opacity-50 text-cyan-300 text-[11px] font-semibold"
                >
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l1.9 5.8L20 9.7l-4.7 3.7L16.9 20 12 16.3 7.1 20l1.6-6.6L4 9.7l6.1-1.9L12 2z" /></svg>
                  {generating ? 'Writing…' : 'Generate'}
                </button>
                {whySelling && (
                  <button
                    type="button"
                    onClick={addSellingReason}
                    title="Put the seller's reason for selling on top of the summary"
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
              rows={4}
              placeholder="Write or paste the summary, or hit Generate. This is the only note the partner sees."
              className="w-full resize-none bg-slate-900/70 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500/60"
            />
            <button
              type="button"
              onClick={lockSummary}
              disabled={!summary.trim() || savingSummary}
              className="mt-1.5 w-full px-3 py-1.5 rounded-md bg-indigo-600/30 hover:bg-indigo-600/50 disabled:opacity-40 text-indigo-200 text-xs font-medium inline-flex items-center justify-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              {savingSummary ? 'Saving…' : 'Lock summary'}
            </button>
          </div>
        )}
      </div>

      {/* Optional coordinates (occasional, e.g. PLG). Pushed above the map. */}
      <div className="mb-1.5">
        {coordsLocked ? (
          <div className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-2.5 py-1.5 flex items-center justify-between gap-2">
            <span className="min-w-0 text-xs text-slate-200 truncate">
              <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-300 mr-1.5">Coordinates</span>
              {coords}
            </span>
            <button type="button" onClick={() => setCoordsLocked(false)} className="flex-shrink-0 text-[11px] text-indigo-300 hover:text-indigo-200">Edit</button>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-600 bg-slate-900/60 px-2.5 py-2">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Coordinates (optional)</span>
            <div className="flex items-center gap-1.5">
              <input
                value={coords}
                onChange={(e) => setCoords(e.target.value)}
                placeholder="e.g. 30.2672, -97.7431"
                className="flex-1 min-w-0 bg-slate-900/70 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500/60"
              />
              <button
                type="button"
                onClick={lockCoords}
                disabled={!coords.trim() || savingCoords}
                className="flex-shrink-0 px-2.5 py-1.5 rounded-md bg-indigo-600/30 hover:bg-indigo-600/50 disabled:opacity-40 text-indigo-200 text-xs font-medium"
              >
                {savingCoords ? 'Saving…' : 'Lock'}
              </button>
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={toggle}
        className="w-full px-3 py-2 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 text-sm font-medium flex items-center justify-center gap-1.5"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M4 11h6V5H4v6zm0 8h6v-6H4v6zm8 0h6v-6h-6v6zm0-14v6h6V5h-6z" /></svg>
        {sent.length ? 'Send to more partners' : 'Send to Partners'}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 left-0 right-0 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl max-h-72 overflow-y-auto">
          {loading && <div className="px-3 py-3 text-xs text-slate-400 text-center">Loading partners…</div>}
          {!loading && boards.length === 0 && <div className="px-3 py-3 text-xs text-slate-400 text-center">No partner boards found</div>}
          {boards.map((b) => {
            const checked = selectedBoards.has(String(b.id));
            return (
              <button
                key={b.id}
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleBoard(b.id); }}
                className="flex w-full items-center gap-2.5 text-left px-3 py-2 text-sm text-slate-200 hover:bg-indigo-600/20 border-b border-slate-700/50 last:border-0"
              >
                <span className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${checked ? 'bg-indigo-500 border-indigo-400' : 'border-slate-500'}`}>
                  {checked && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </span>
                <span className="flex-1">{b.name}</span>
                {sentIds.has(String(b.id)) && <span className="text-[10px] text-indigo-300 flex-shrink-0">sent · resend</span>}
              </button>
            );
          })}
          {!loading && boards.length > 0 && (
            <div className="sticky bottom-0 bg-slate-800 border-t border-slate-600 p-2">
              <button
                type="button"
                onClick={pushSelected}
                disabled={selectedBoards.size === 0 || pushingMany}
                className="w-full px-3 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold"
              >
                {pushingMany
                  ? 'Sending…'
                  : selectedBoards.size
                    ? `Send to ${selectedBoards.size} ${selectedBoards.size === 1 ? 'partner' : 'partners'}`
                    : 'Select partners to send'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
