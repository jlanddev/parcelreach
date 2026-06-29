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
export default function CallModal({ lead, currentUserId, onClose, onLogged }) {
  const phone = lead?.phone || lead?.owner_phone || '';
  const name = lead?.full_name || lead?.name || lead?.owner_name || 'Lead';

  const [status, setStatus] = useState('connecting'); // connecting | ringing | in-call | ended | error
  const [phase, setPhase] = useState('live'); // live | wrapup | done, wrapup asks the outcome
  const [error, setError] = useState(null);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const deviceRef = useRef(null);
  const callRef = useRef(null);
  const startRef = useRef(null);
  const timerRef = useRef(null);
  const durRef = useRef(0);
  const wasAnswered = useRef(false);
  const loggedRef = useRef(false);

  // Call leg ended → freeze the duration and ask the rep how it went.
  const finishLive = () => {
    if (phase !== 'live') return;
    if (timerRef.current) clearInterval(timerRef.current);
    durRef.current = startRef.current ? Math.floor((Date.now() - startRef.current) / 1000) : 0;
    setStatus('ended');
    setPhase('wrapup');
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
    setPhase('done');
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
        const device = new Device(data.token, { codecPreferences: ['opus', 'pcmu'] });
        deviceRef.current = device;

        // Project Blue's TwiML app reads one of these; send the common names so
        // whichever it expects gets the number to dial.
        const num = toE164(phone);
        const call = await device.connect({ params: { To: num, to: num, phone: num, PhoneNumber: num, number: num, Called: num } });
        callRef.current = call;
        call.on('ringing', () => setStatus('ringing'));
        call.on('accept', () => {
          setStatus('in-call');
          wasAnswered.current = true;
          startRef.current = Date.now();
          timerRef.current = setInterval(() => setSeconds(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
        });
        call.on('disconnect', () => finishLive());
        call.on('cancel', () => finishLive());
        call.on('reject', () => finishLive());
        call.on('error', (e) => {
          setError(e?.message || 'Call error');
          setStatus('error');
        });
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
      try { callRef.current?.disconnect(); } catch {}
      try { deviceRef.current?.destroy(); } catch {}
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hangup = () => {
    try { callRef.current?.disconnect(); } catch {}
    finishLive();
  };
  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    try { callRef.current?.mute(m); } catch {}
  };

  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const statusText = {
    connecting: 'Connecting…',
    ringing: 'Ringing…',
    'in-call': fmt(seconds),
    ended: 'Call ended',
    error: 'Could not connect',
  }[status];

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={phase === 'done' || status === 'error' ? onClose : undefined}>
      <div className="w-full max-w-xs bg-slate-900 border border-slate-700 rounded-2xl p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
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
