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
  const [pushingId, setPushingId] = useState(null);
  // Partners this lead has already been sent to (from the lead, plus any sent now).
  const [sent, setSent] = useState(Array.isArray(lead.partner_pushes) ? lead.partner_pushes : []);
  const sentIds = new Set(sent.map((p) => String(p.board_id)));

  // Partner summary: the ONLY note text that pushes to the board. Write/paste,
  // then lock. Locked = saved and read-only until you hit Edit.
  const [summary, setSummary] = useState(lead.partner_summary || '');
  const [locked, setLocked] = useState(!!(lead.partner_summary && lead.partner_summary.trim()));
  const [savingSummary, setSavingSummary] = useState(false);

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

  const push = async (board, e) => {
    e.stopPropagation();
    setPushingId(board.id);
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
      if (Array.isArray(data.partner_pushes)) setSent(data.partner_pushes);
      else setSent((cur) => [...cur.filter((p) => String(p.board_id) !== String(board.id)), { board_id: board.id, board_name: board.name }]);
      setOpen(false);
      // Report exactly what landed so a missing tag/map is never silent.
      const bits = [];
      bits.push(data.tagInBubble ? 'tagged in bubble' : (data.notified ? 'partner notified' : 'no tag'));
      bits.push(data.mapUploaded ? 'map attached' : 'no map');
      const warned = Array.isArray(data.warnings) && data.warnings.length;
      onToast && onToast(`Sent to ${board.name} (${bits.join(', ')})`, warned ? 'error' : 'success');
      if (warned) console.warn('[monday push warnings]', data.warnings);
    } catch (err) {
      onToast && onToast(`Monday push failed: ${err.message}`, 'error');
    } finally {
      setPushingId(null);
    }
  };

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      {sent.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {sent.map((p) => (
            <span key={p.board_id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-200 text-[10px] font-medium border border-indigo-500/40">
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
              {p.board_name}
            </span>
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
            <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Partner summary</span>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              placeholder="Write or paste the summary to send with this lead. This is the only note the partner sees."
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
        {sent.length ? 'Send to another partner' : 'Send to Partner'}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 left-0 right-0 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl max-h-64 overflow-y-auto">
          {loading && <div className="px-3 py-3 text-xs text-slate-400 text-center">Loading partners…</div>}
          {!loading && boards.length === 0 && <div className="px-3 py-3 text-xs text-slate-400 text-center">No partner boards found</div>}
          {boards.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={(e) => push(b, e)}
              disabled={pushingId === b.id}
              className="flex w-full items-center justify-between text-left px-3 py-2 text-sm text-slate-200 hover:bg-indigo-600/30 disabled:opacity-50 border-b border-slate-700/50 last:border-0"
            >
              <span>{pushingId === b.id ? `Sending to ${b.name}…` : b.name}</span>
              {sentIds.has(String(b.id)) && <span className="text-[10px] text-indigo-300">sent · resend</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
