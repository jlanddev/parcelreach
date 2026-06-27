'use client';

import { useState } from 'react';
import {
  OFFER_DIRECTIONS,
  GENERAL_DIRECTIONS,
  FOLLOWUP_BUCKETS,
  FOLLOWUP_KEYS,
  LOST_REASONS,
  formatOffer,
  mergeScript,
  touchForStep,
} from '@/lib/followups';

const fmtWhen = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diff = Math.round((day - today) / 86400000);
  const rel = diff < 0 ? `${-diff}d overdue` : diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : `in ${diff}d`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${rel}`;
};

const CHANNEL = { text: 'Text', call: 'Call', note: 'Note' };

/**
 * The deal strip on each lead card: offer (with reviewed check), a direction
 * tag, and Follow-Up controls. Live offers show live direction labels; parked
 * leads show their bucket, the next scheduled touch, and the script.
 */
export default function DealStrip({
  lead,
  repName,
  onSetOffer,
  onToggleOfferConfirmed,
  onSetDirection,
  onMoveToFollowUp,
  onAdvance,
  onSnooze,
  onRevive,
  onMarkLost,
}) {
  const status = (lead.pipeline_status || lead.status || '').toUpperCase();
  const inFollowUp = status === 'FOLLOW_UP';
  const isLost = status === 'LOST';
  const isOfferStage = ['OFFER_SENT', 'OFFER_MADE', 'NEGOTIATING', 'AGREEMENT_SENT', 'APPT_SET_FOR_JORDAN'].includes(status);
  const directions = isOfferStage ? OFFER_DIRECTIONS : GENERAL_DIRECTIONS;

  const [draft, setDraft] = useState(lead.offer_amount ?? '');
  const [pickBucket, setPickBucket] = useState(false);
  const [pickLost, setPickLost] = useState(false);
  const [showScript, setShowScript] = useState(false);

  const stop = (e) => e.stopPropagation();
  const bucket = inFollowUp ? FOLLOWUP_BUCKETS[lead.follow_up_bucket] : null;
  const touch = inFollowUp ? touchForStep(lead.follow_up_bucket, lead.follow_up_step || 0, lead.follow_up_started_at) : null;

  return (
    <div className="mb-4 rounded-lg border border-slate-700/60 bg-slate-900/40 p-3" onClick={stop}>
      {/* Offer + reviewed check */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-slate-500 w-10">Offer</span>
        <div className="relative flex-1">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
          <input
            type="text"
            inputMode="numeric"
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/[^0-9.]/g, ''))}
            onBlur={() => onSetOffer(lead.id, draft)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSetOffer(lead.id, draft); e.target.blur(); } }}
            placeholder="No offer yet"
            className="w-full bg-slate-900/70 border border-slate-700 rounded pl-5 pr-2 py-1 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/60"
          />
        </div>
        <button
          type="button"
          onClick={() => onToggleOfferConfirmed(lead)}
          title={lead.offer_confirmed ? 'Reviewed and locked' : 'Mark offer reviewed'}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold border ${
            lead.offer_confirmed
              ? 'bg-green-600/25 border-green-500/50 text-green-300'
              : 'bg-slate-800 border-slate-600 text-slate-400 hover:text-slate-200'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
          {lead.offer_confirmed ? 'Reviewed' : 'Review'}
        </button>
      </div>

      {/* Direction tag (live stages) */}
      {!inFollowUp && !isLost && (
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[10px] uppercase tracking-wide text-slate-500 w-10">Lean</span>
          <div className="flex flex-wrap gap-1">
            {directions.map((d) => {
              const on = lead.deal_direction === d.value;
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => onSetDirection(lead.id, on ? null : d.value)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                    on ? `${d.text} border-current bg-slate-800` : 'text-slate-500 border-slate-700 hover:text-slate-300'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${on ? d.dot : 'bg-slate-600'}`} />
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Follow-Up state */}
      {inFollowUp && (
        <div className="mt-2 rounded-md bg-slate-800/60 border border-slate-700/60 p-2">
          <div className="flex items-center justify-between">
            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${bucket?.text || 'text-rose-300'}`}>
              <span className={`w-2 h-2 rounded-full ${bucket?.dot || 'bg-rose-500'}`} />
              {bucket?.label || 'Follow-Up'}
            </span>
            <span className="text-[11px] text-slate-400">
              {touch ? `${CHANNEL[touch.channel] || ''} · ${fmtWhen(lead.next_follow_up_at)}` : 'tail'}
            </span>
          </div>
          {touch && (
            <button type="button" onClick={() => setShowScript((s) => !s)} className="mt-1.5 text-[11px] text-blue-300 hover:text-blue-200">
              {showScript ? 'Hide script' : 'Show script'}
            </button>
          )}
          {showScript && touch && (
            <div className="mt-1 text-xs text-slate-200 bg-slate-900/60 rounded p-2 whitespace-pre-wrap">
              {mergeScript(touch.script, lead, repName)}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 mt-2">
            <button type="button" onClick={() => onAdvance(lead)} className="px-2 py-1 rounded bg-green-600/20 hover:bg-green-600/40 text-green-300 text-[11px] font-medium">Did it → next</button>
            <button type="button" onClick={() => onSnooze(lead, 3)} className="px-2 py-1 rounded bg-slate-700/60 hover:bg-slate-700 text-slate-200 text-[11px] font-medium">Snooze 3d</button>
            <button type="button" onClick={() => onRevive(lead)} className="px-2 py-1 rounded bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 text-[11px] font-medium">Back in play</button>
            <button type="button" onClick={() => setPickLost((v) => !v)} className="px-2 py-1 rounded bg-zinc-700/50 hover:bg-zinc-700 text-zinc-300 text-[11px] font-medium">Lost</button>
          </div>
        </div>
      )}

      {/* Lost state */}
      {isLost && (
        <div className="mt-2 text-[11px] text-zinc-400">
          Lost{lead.lost_reason ? ` · ${(LOST_REASONS.find((r) => r.value === lead.lost_reason) || {}).label || lead.lost_reason}` : ''}
          <button type="button" onClick={() => onRevive(lead)} className="ml-2 text-blue-300 hover:text-blue-200">Reopen</button>
        </div>
      )}

      {/* Actions for live leads: move to Follow-Up / mark Lost */}
      {!inFollowUp && !isLost && (
        <div className="mt-2 flex items-center gap-2">
          <button type="button" onClick={() => { setPickBucket((v) => !v); setPickLost(false); }} className="px-2 py-1 rounded bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 text-[11px] font-medium">Move to Follow-Up</button>
          <button type="button" onClick={() => { setPickLost((v) => !v); setPickBucket(false); }} className="px-2 py-1 rounded bg-zinc-700/40 hover:bg-zinc-700 text-zinc-300 text-[11px] font-medium">Mark Lost</button>
        </div>
      )}

      {/* Bucket picker */}
      {pickBucket && (
        <div className="mt-2 space-y-1">
          {FOLLOWUP_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => { onMoveToFollowUp(lead, k); setPickBucket(false); }}
              className="block w-full text-left px-2 py-1.5 rounded bg-slate-800/70 hover:bg-slate-700 border border-slate-700/60"
            >
              <span className={`text-[11px] font-semibold ${FOLLOWUP_BUCKETS[k].text}`}>{FOLLOWUP_BUCKETS[k].label}</span>
              <span className="block text-[10px] text-slate-400">{FOLLOWUP_BUCKETS[k].blurb}</span>
            </button>
          ))}
        </div>
      )}

      {/* Lost reason picker */}
      {pickLost && (
        <div className="mt-2 space-y-1">
          {LOST_REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => { onMarkLost(lead, r.value); setPickLost(false); }}
              className="block w-full text-left px-2 py-1.5 rounded bg-slate-800/70 hover:bg-slate-700 border border-slate-700/60 text-[11px] text-zinc-300"
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
