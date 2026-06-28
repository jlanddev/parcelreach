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
 * "Send to Partner" — pushes this lead into a partner's Monday board (item in
 * the New Leads group + an update bubble with property notes and the parcel map).
 */
export default function MondayPushButton({ lead, onToast }) {
  const [open, setOpen] = useState(false);
  const [boards, setBoards] = useState(boardsCache || []);
  const [loading, setLoading] = useState(false);
  const [pushingId, setPushingId] = useState(null);
  // Partners this lead has already been sent to (from the lead, plus any sent now).
  const [sent, setSent] = useState(Array.isArray(lead.partner_pushes) ? lead.partner_pushes : []);
  const sentIds = new Set(sent.map((p) => String(p.board_id)));

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
      const res = await fetch('/api/monday/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, boardId: board.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Push failed');
      if (Array.isArray(data.partner_pushes)) setSent(data.partner_pushes);
      else setSent((cur) => [...cur.filter((p) => String(p.board_id) !== String(board.id)), { board_id: board.id, board_name: board.name }]);
      setOpen(false);
      onToast && onToast(`Sent to ${board.name}${data.mapUploaded ? ' with map' : ''}`, 'success');
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
