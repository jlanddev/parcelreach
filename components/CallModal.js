'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

const toE164 = (p) => {
  const d = (p || '').replace(/\D/g, '');
  if (String(p || '').trim().startsWith('+')) return '+' + d;
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  return '+' + d;
};

/**
 * In-browser outbound call via Twilio Voice. Mints a token, dials the lead, and
 * logs the call to the activities timeline (attributed to the caller) when it
 * ends, so it shows in Last Contacted and the Activity Log.
 */
export default function CallModal({ lead, currentUserId, onClose, onLogged, onEnded, onOpenNotes }) {
  const phone = lead?.phone || lead?.owner_phone || '';
  const name = lead?.full_name || lead?.name || lead?.owner_name || 'Lead';

  const [status, setStatus] = useState('connecting'); // connecting | ringing | in-call | ended | error
  const [phase, setPhase] = useState('live'); // live | wrapup | done, wrapup asks the outcome
  const [error, setError] = useState(null);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [minimized, setMinimized] = useState(false); // shrink to a floating widget so the rep can roam the CRM mid-call

  const deviceRef = useRef(null);
  const callRef = useRef(null);
  const startRef = useRef(null);
  const timerRef = useRef(null);
  const durRef = useRef(0);
  const wasAnswered = useRef(false);
  const loggedRef = useRef(false);
  const attemptRef = useRef(0);       // dial attempts (double-dial: 2 before giving up)
  const doneRef = useRef(false);      // terminal: already routed to spoke / no-answer
  const legHandledRef = useRef(false); // this dial leg's end already processed
  const redialTimerRef = useRef(null);
  const [attempt, setAttempt] = useState(1);

  // Place one call leg on the existing device. Called once per dial attempt.
  const connectCall = async () => {
    if (doneRef.current) return;
    attemptRef.current += 1;
    setAttempt(attemptRef.current);
    wasAnswered.current = false;
    legHandledRef.current = false;
    setStatus('connecting');
    try {
      const num = toE164(phone);
      const call = await deviceRef.current.connect({ params: { To: num, to: num, phone: num, PhoneNumber: num, number: num, Called: num } });
      callRef.current = call;
      call.on('ringing', () => setStatus('ringing'));
      call.on('accept', () => {
        setStatus('in-call');
        wasAnswered.current = true;
        startRef.current = Date.now();
        timerRef.current = setInterval(() => setSeconds(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
      });
      call.on('disconnect', () => onLegEnded());
      call.on('cancel', () => onLegEnded());
      call.on('reject', () => onLegEnded());
      call.on('error', (e) => { setError(e?.message || 'Call error'); setStatus('error'); });
    } catch (e) { setError(e.message); setStatus('error'); }
  };

  // A call leg ended. Answered = spoke. No answer = double-dial: try a second
  // time, and only after the second miss hand off to the text screen (with the
  // reason we're reaching out). No button clicking.
  const onLegEnded = () => {
    if (doneRef.current || legHandledRef.current) return;
    legHandledRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    if (wasAnswered.current) {
      doneRef.current = true;
      durRef.current = startRef.current ? Math.floor((Date.now() - startRef.current) / 1000) : 0;
      setStatus('ended');
      if (onEnded) logOutcome('spoke'); else setPhase('wrapup');
      return;
    }
    // No answer on this leg. One more dial before we give up.
    if (attemptRef.current < 2) {
      setStatus('redialing');
      redialTimerRef.current = setTimeout(() => { connectCall(); }, 2000);
      return;
    }
    // Second miss: route to the text screen.
    doneRef.current = true;
    durRef.current = 0;
    setStatus('ended');
    if (onEnded) logOutcome('no_answer'); else setPhase('wrapup');
  };

  // Rep picks the outcome (spoke | voicemail | no_answer) → log it accurately.
  const logOutcome = async (outcome) => {
    if (loggedRef.current) return;
    loggedRef.current = true;
    const dur = durRef.current;
    const spoke = outcome === 'spoke';
    const preview = spoke ? `Call · ${Math.floor(dur / 60)}m ${dur % 60}s` : outcome === 'voicemail' ? 'Voicemail left' : 'No answer';
    try {
      await supabase.from('activities').insert({
        lead_id: lead.id, user_id: currentUserId, activity_type: 'CALL', direction: 'OUTBOUND',
        outcome, duration_seconds: spoke ? dur : 0, created_at: new Date().toISOString(),
      });
      const nowIso = new Date().toISOString();
      const lp = {
        last_activity_at: nowIso, last_contact_at: nowIso, last_contact_dir: 'outbound', last_contact_channel: 'call',
        last_contact_preview: preview, last_call_at: nowIso, last_call_outcome: outcome, last_call_duration: spoke ? dur : 0,
      };
      // Only a real conversation advances a NEW lead to In Contact.
      const cur = (lead.pipeline_status || lead.status || '').toUpperCase();
      if (spoke && (!cur || cur === 'NEW')) { lp.status = 'contacting'; lp.pipeline_status = 'CONTACTING'; }
      const { error: lpErr } = await supabase.from('leads').update(lp).eq('id', lead.id);
      if (lpErr) {
        const { last_call_duration, ...lp2 } = lp; // column may not be migrated yet
        const { error: e2 } = await supabase.from('leads').update(lp2).eq('id', lead.id);
        if (e2) await supabase.from('leads').update({ last_activity_at: nowIso }).eq('id', lead.id);
      }
    } catch (e) {
      console.error('[call log]', e);
    }
    onLogged && onLogged();
    // Hand off: spoke -> Claude assistant to route; no answer -> text screen.
    if (onEnded) { onEnded(lead, outcome); onClose && onClose(); }
    else setPhase('done');
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!phone) {
        setError('No phone number on this lead.');
        setStatus('error');
        return;
      }
      try {
        const res = await fetch(`/api/twilio/token?identity=${encodeURIComponent(currentUserId || 'agent')}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not get a call token');

        const { Device } = await import('@twilio/voice-sdk');
        if (cancelled) return;
        deviceRef.current = new Device(data.token, { codecPreferences: ['opus', 'pcmu'] });
        connectCall(); // first dial; onLegEnded handles the second and the hand-off
      } catch (e) {
        if (!cancelled) {
          setError(e.message);
          setStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
      if (redialTimerRef.current) clearTimeout(redialTimerRef.current);
      try { callRef.current?.disconnect(); } catch {}
      try { deviceRef.current?.destroy(); } catch {}
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Manual hang up: stop any pending redial and end now. If they'd answered it
  // logs as spoke; if not, we're done dialing, so route to the text screen.
  const hangup = () => {
    attemptRef.current = 2;
    if (redialTimerRef.current) clearTimeout(redialTimerRef.current);
    try { callRef.current?.disconnect(); } catch {}
    onLegEnded();
  };
  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    try { callRef.current?.mute(m); } catch {}
  };

  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const statusText = {
    connecting: attempt > 1 ? 'Dialing again (2 of 2)…' : 'Connecting…',
    ringing: attempt > 1 ? 'Ringing again (2 of 2)…' : 'Ringing…',
    'in-call': fmt(seconds),
    redialing: 'No answer. Dialing again…',
    ended: 'Call ended',
    error: 'Could not connect',
  }[status];

  // Minimized: a small floating widget (no backdrop) so the rep can browse the
  // CRM, open the lead, and take notes / use the assistant while still on the call.
  if (minimized && phase === 'live') {
    return (
      <div className="fixed bottom-4 right-4 z-[70] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl px-3 py-2 flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
        <div className="min-w-0 mr-1">
          <div className="text-sm text-white font-medium truncate max-w-[130px]">{name}</div>
          <div className={`text-xs font-mono ${status === 'in-call' ? 'text-green-400' : 'text-slate-400'}`}>{statusText}</div>
        </div>
        <button onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'} className={`px-2 py-1.5 rounded-md text-xs border ${muted ? 'bg-slate-600 border-slate-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>{muted ? 'Off' : 'Mic'}</button>
        {onOpenNotes && <button onClick={() => onOpenNotes(lead)} title="Open notes / assistant" className="px-2 py-1.5 rounded-md bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 text-xs font-medium">Notes</button>}
        <button onClick={() => setMinimized(false)} title="Expand" className="px-2 py-1.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 text-xs">Expand</button>
        <button onClick={hangup} title="Hang up" className="w-8 h-8 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 01-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-1.78 1.78c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85a1.01 1.01 0 01-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" /></svg>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={phase === 'done' || status === 'error' ? onClose : undefined}>
      <div className="w-full max-w-xs bg-slate-900 border border-slate-700 rounded-2xl p-6 text-center shadow-2xl relative" onClick={(e) => e.stopPropagation()}>
        {phase === 'live' && (
          <button onClick={() => setMinimized(true)} title="Minimize and keep the call going" className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-slate-700/60 text-slate-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
          </button>
        )}
        <div className="w-16 h-16 mx-auto rounded-full bg-green-600/20 border border-green-600/40 flex items-center justify-center mb-3">
          <svg className="w-7 h-7 text-green-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
          </svg>
        </div>
        <div className="text-lg font-semibold text-white truncate">{name}</div>
        <div className="text-sm text-slate-400">{phone}</div>
        <div className={`mt-3 text-sm font-medium ${status === 'in-call' ? 'text-green-400 font-mono text-base' : status === 'error' ? 'text-red-400' : 'text-slate-300'}`}>
          {statusText}
        </div>
        {error && <div className="mt-1 text-xs text-red-400">{error}</div>}

        {/* Wrap-up: status the call (the dialer disposition screen) */}
        {phase === 'wrapup' ? (
          <div className="mt-5">
            <div className="text-sm font-medium text-slate-200 mb-3">How did it go?</div>
            <div className="space-y-2">
              <button onClick={() => logOutcome('spoke')} className="w-full py-2.5 rounded-xl bg-green-600/20 hover:bg-green-600/40 border border-green-600/40 text-green-200 font-medium">
                Spoke with them{durRef.current > 0 ? ` · ${fmt(durRef.current)}` : ''}
              </button>
              <button onClick={() => logOutcome('voicemail')} className="w-full py-2.5 rounded-xl bg-amber-600/20 hover:bg-amber-600/40 border border-amber-600/40 text-amber-200 font-medium">
                Left voicemail
              </button>
              <button onClick={() => logOutcome('no_answer')} className="w-full py-2.5 rounded-xl bg-slate-700/60 hover:bg-slate-700 border border-slate-600 text-slate-200 font-medium">
                No answer
              </button>
            </div>
          </div>
        ) : phase === 'done' ? (
          <div className="mt-5">
            <div className="text-green-400 text-sm font-medium mb-3">Logged ✓</div>
            <button onClick={onClose} className="px-6 py-3 rounded-full bg-slate-700 hover:bg-slate-600 text-white font-medium">Close</button>
          </div>
        ) : (
          <div className="mt-5 flex items-center justify-center gap-4">
            {(status === 'in-call' || status === 'ringing' || status === 'connecting') && (
              <button
                onClick={toggleMute}
                className={`w-12 h-12 rounded-full border flex items-center justify-center ${muted ? 'bg-slate-600 border-slate-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'}`}
                title={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? 'Off' : 'Mic'}
              </button>
            )}
            {status === 'error' ? (
              <button onClick={onClose} className="px-6 py-3 rounded-full bg-slate-700 hover:bg-slate-600 text-white font-medium">Close</button>
            ) : (
              <button onClick={hangup} className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center" title="Hang up">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 01-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-1.78 1.78c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85a1.01 1.01 0 01-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" /></svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
