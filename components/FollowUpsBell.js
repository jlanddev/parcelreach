'use client';

import { useState } from 'react';

const labelFor = (t) => {
  const tt = (t.task_type || '').toLowerCase();
  if (tt === 'meeting' || tt.includes('appt')) return 'Appointment';
  if (tt === 'callback') return 'Callback';
  if (tt === 'follow_up') return 'Follow-up';
  return t.title || 'Task';
};

const when = (iso) =>
  new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * Follow-ups bell — sits next to the notification bell. Lights up with a count
 * of tasks due today or overdue (follow-ups, callbacks, appointments). Click to
 * see each one, who it's with, and jump to that lead's card.
 */
export default function FollowUpsBell({ tasks = [], leadsById = {}, onOpenLead, onComplete }) {
  const [open, setOpen] = useState(false);
  const now = new Date();
  const sorted = [...tasks].sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
  const count = sorted.length;
  const apptToday = sorted.some((t) => labelFor(t) === 'Appointment');

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        title="Follow-ups & appointments due"
        className="relative p-2 text-slate-400 hover:text-white focus:outline-none rounded-lg hover:bg-slate-700/50 transition-colors"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 16l2 2 4-4" />
        </svg>
        {count > 0 && (
          <span className={`absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 rounded-full ${apptToday ? 'bg-amber-500' : 'bg-red-500'}`}>
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 w-80 mt-2 bg-slate-800 rounded-lg shadow-lg border border-slate-700 max-h-96 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700">
              <h3 className="text-sm font-semibold text-white">Follow-ups &amp; Appointments</h3>
              <p className="text-xs text-slate-400 mt-0.5">Due today or overdue</p>
            </div>
            <div className="overflow-y-auto max-h-80">
              {count === 0 ? (
                <div className="px-4 py-8 text-center text-slate-400 text-sm">Nothing due. You&apos;re clear.</div>
              ) : (
                sorted.map((t) => {
                  const lead = leadsById[t.lead_id];
                  const name = lead ? (lead.full_name || lead.name || 'Lead') : 'Lead';
                  const label = labelFor(t);
                  const isAppt = label === 'Appointment';
                  const overdue = new Date(t.due_at) < now;
                  return (
                    <div key={t.id} className="flex items-start gap-2 px-4 py-3 hover:bg-slate-700 border-b border-slate-700 transition-colors">
                      <button
                        type="button"
                        onClick={() => { setOpen(false); if (lead && onOpenLead) onOpenLead(lead); }}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${isAppt ? 'bg-amber-500/20 text-amber-300' : 'bg-blue-500/20 text-blue-300'}`}>{label}</span>
                          {overdue && <span className="text-[10px] font-bold text-red-400">OVERDUE</span>}
                        </div>
                        <p className="text-sm text-white font-medium mt-1 truncate">{name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{when(t.due_at)}</p>
                      </button>
                      {onComplete && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onComplete(t); }}
                          title="Mark done"
                          className="flex-shrink-0 mt-0.5 px-2 py-1 rounded-md bg-green-600/20 hover:bg-green-600/40 text-green-300 text-xs font-medium inline-flex items-center gap-1"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                          Done
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
