'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { clockTime } from '@/lib/format';

/**
 * iMessage-style conversation for one lead. Inbound left/gray, outbound
 * right/blue, chronological. Composer sends via Project Blue with optimistic
 * bubbles + retry on failure. Live inbound arrives over Supabase Realtime.
 */
export default function ConversationModal({ lead, currentUserId, onClose, onActivity }) {
  const phone = lead?.phone || lead?.owner_phone || '';
  const name = lead?.owner_name || lead?.name || lead?.full_name || 'Lead';

  const [messages, setMessages] = useState([]);
  const [optimistic, setOptimistic] = useState([]); // local-only bubbles
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  const load = useCallback(async () => {
    if (!phone) {
      setLoading(false);
      setError('No phone number on this lead.');
      return;
    }
    try {
      const res = await fetch(`/api/pb/messages?phone=${encodeURIComponent(phone)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load messages');
      setMessages(data.messages || []);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [phone]);

  useEffect(() => {
    load();
  }, [load]);

  // Mark inbound texts read on open.
  useEffect(() => {
    if (!lead?.id) return;
    supabase
      .from('activities')
      .update({ read_at: new Date().toISOString() })
      .eq('lead_id', lead.id)
      .eq('direction', 'INBOUND')
      .is('read_at', null)
      .then(
        () => onActivity && onActivity(),
        () => {}
      );
  }, [lead?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live inbound: any new activity row for this lead → reload the thread.
  useEffect(() => {
    if (!lead?.id) return;
    const channel = supabase
      .channel(`lead-msgs-${lead.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activities', filter: `lead_id=eq.${lead.id}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [lead?.id, load]);

  // Autoscroll to newest.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, optimistic, loading]);

  const postSend = async (text) => {
    const res = await fetch('/api/pb/send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: phone, message: text, leadId: lead?.id, userId: currentUserId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || 'Send failed');
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    const tempId = `tmp-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    setOptimistic((o) => [...o, { tempId, content: text, status: 'sending', created_at: new Date().toISOString() }]);
    setDraft('');
    setSending(true);
    try {
      await postSend(text);
      setOptimistic((o) => o.filter((m) => m.tempId !== tempId));
      setTimeout(load, 1200); // reconcile with the canonical PB row
      onActivity && onActivity();
    } catch (e) {
      setOptimistic((o) => o.map((m) => (m.tempId === tempId ? { ...m, status: 'failed', error: e.message } : m)));
    } finally {
      setSending(false);
    }
  };

  const retry = async (m) => {
    setOptimistic((o) => o.map((x) => (x.tempId === m.tempId ? { ...x, status: 'sending', error: null } : x)));
    try {
      await postSend(m.content);
      setOptimistic((o) => o.filter((x) => x.tempId !== m.tempId));
      setTimeout(load, 1200);
    } catch (e) {
      setOptimistic((o) => o.map((x) => (x.tempId === m.tempId ? { ...x, status: 'failed', error: e.message } : x)));
    }
  };

  const thread = [
    ...messages.map((m) => ({
      id: m.message_handle,
      content: m.content,
      outbound: m.direction === 'outbound',
      ts: m.sent_at || m.created_at,
      status: m.status,
    })),
    ...optimistic.map((m) => ({
      id: m.tempId,
      content: m.content,
      outbound: true,
      ts: m.created_at,
      status: m.status,
      failed: m.status === 'failed',
      error: m.error,
      onRetry: () => retry(m),
    })),
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md h-[620px] bg-slate-900 border border-slate-700 rounded-xl flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700/70 bg-slate-800/60">
          <div className="flex-1 min-w-0">
            <div className="text-slate-100 font-semibold truncate">{name}</div>
            <div className="text-slate-400 text-xs">{phone || 'no phone'}</div>
          </div>
          <button
            type="button"
            disabled
            title="Calling unlocks when the Project Blue Dialer add-on (Twilio Voice) is enabled"
            className="p-2 rounded-lg bg-slate-700/40 text-slate-500 cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
            </svg>
          </button>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-700/60 text-slate-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Thread */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-2">
          {loading && <div className="text-slate-500 text-sm text-center mt-6">Loading conversation…</div>}
          {error && !loading && <div className="text-red-400 text-sm text-center mt-6">{error}</div>}
          {!loading && !error && thread.length === 0 && (
            <div className="text-slate-500 text-sm text-center mt-6">No messages yet. Say hello 👋</div>
          )}
          {thread.map((m) => (
            <div key={m.id} className={`flex flex-col ${m.outbound ? 'items-end' : 'items-start'}`}>
              <div
                className={`max-w-[78%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                  m.outbound
                    ? m.failed
                      ? 'bg-red-900/40 border border-red-600/50 text-red-100'
                      : 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-100'
                }`}
              >
                {m.content}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5 px-1 flex items-center gap-1.5">
                <span>{clockTime(m.ts)}</span>
                {m.outbound && m.status === 'sending' && <span>· Sending…</span>}
                {m.outbound && m.failed && (
                  <button onClick={m.onRetry} className="text-red-400 hover:underline">
                    · Failed — Retry
                  </button>
                )}
                {m.outbound && m.status === 'delivered' && <span>· Delivered</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Composer */}
        <div className="border-t border-slate-700/70 p-2 bg-slate-800/40">
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder={phone ? 'Message…' : 'No phone number'}
              disabled={!phone}
              className="flex-1 resize-none max-h-28 bg-slate-900/70 border border-slate-700 rounded-2xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500/60"
            />
            <button
              onClick={send}
              disabled={!draft.trim() || sending || !phone}
              className="px-4 py-2 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
