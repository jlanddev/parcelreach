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
  const [error, setError] = useState(null);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const deviceRef = useRef(null);
  const callRef = useRef(null);
  const startRef = useRef(null);
  const timerRef = useRef(null);
  const loggedRef = useRef(false);

  const endCall = async (outcome) => {
    if (loggedRef.current) return;
    loggedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    const dur = startRef.current ? Math.floor((Date.now() - startRef.current) / 1000) : 0;
    setStatus('ended');
    try {
      await supabase.from('activities').insert({
        lead_id: lead.id,
        user_id: currentUserId,
        activity_type: 'CALL',
        direction: 'OUTBOUND',
        outcome: dur > 0 ? 'connected' : outcome || 'no_answer',
        duration_seconds: dur,
        created_at: new Date().toISOString(),
      });
      const nowIso = new Date().toISOString();
      const connected = dur > 0;
      const lp = {
        last_activity_at: nowIso,
        last_contact_at: nowIso,
        last_contact_dir: 'outbound',
        last_contact_channel: 'call',
        last_contact_preview: connected ? `Call · ${Math.floor(dur / 60)}m ${dur % 60}s` : 'Call · no answer',
        last_call_at: nowIso,
        last_call_outcome: connected ? 'connected' : (outcome || 'no_answer'),
      };
      // A connected call is a real contact: advance a NEW lead to In Contact.
      const cur = (lead.pipeline_status || lead.status || '').toUpperCase();
      if (connected && (!cur || cur === 'NEW')) {
        lp.status = 'contacting';
        lp.pipeline_status = 'CONTACTING';
      }
      const { error: lpErr } = await supabase.from('leads').update(lp).eq('id', lead.id);
      if (lpErr) await supabase.from('leads').update({ last_activity_at: nowIso }).eq('id', lead.id);
    } catch (e) {
      console.error('[call log]', e);
    }
    onLogged && onLogged();
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
          startRef.current = Date.now();
          timerRef.current = setInterval(() => setSeconds(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
        });
        call.on('disconnect', () => endCall('completed'));
        call.on('cancel', () => endCall('no_answer'));
        call.on('reject', () => endCall('rejected'));
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
    endCall('completed');
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
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={status === 'ended' || status === 'error' ? onClose : undefined}>
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
          {status === 'ended' || status === 'error' ? (
            <button onClick={onClose} className="px-6 py-3 rounded-full bg-slate-700 hover:bg-slate-600 text-white font-medium">Close</button>
          ) : (
            <button onClick={hangup} className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center" title="Hang up">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 01-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-1.78 1.78c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85a1.01 1.01 0 01-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" /></svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
