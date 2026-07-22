'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { clockTime } from '@/lib/format';
import { playSwoosh } from '@/lib/sound';
import { OFFER_DIRECTIONS, GENERAL_DIRECTIONS } from '@/lib/followups';

const LEAN_LABEL = Object.fromEntries([...OFFER_DIRECTIONS, ...GENERAL_DIRECTIONS].map((d) => [d.value, d.label]));

// Short date for a message: "Today", "Yesterday", or "Mon Jun 29".
function dateLabel(input) {
  const d = new Date(input);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const dayStart = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const diff = Math.round((dayStart(now) - dayStart(d)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * iMessage-style conversation for one lead. Inbound left/gray, outbound
 * right/blue, chronological. Composer sends via Project Blue with optimistic
 * bubbles + retry on failure. Live inbound arrives over Supabase Realtime.
 */
export default function ConversationModal({ lead, currentUserId, currentUserName, onClose, onActivity, onCall, onOpenLead, onSetDirection, onScheduleFollowUp }) {
  const phone = lead?.phone || lead?.owner_phone || '';
  const name = lead?.owner_name || lead?.name || lead?.full_name || 'Lead';

  // Smart message suggestions, merge-filled from the lead card.
  // On-market (subdivision) leads were sourced by us from a listing; the owner
  // did NOT submit their property, so the outreach is buyer-side cold contact
  // to the LISTING AGENT, not "the land you wanted us to check out."
  const isOnMarket = lead?.source === 'subdivision';
  const agentFirst = (lead?.form_data?.agentName || '').trim().split(/\s+/)[0];
  // On-market: greet the agent by first name (or a neutral "there" until entered),
  // never the owner/company. Inbound: greet the seller/owner.
  const firstName = isOnMarket
    ? (agentFirst || 'there')
    : (lead?.name || lead?.full_name || lead?.owner_name || 'there').trim().split(/\s+/)[0];
  const county = lead?.property_county || lead?.county || lead?.form_data?.propertyCounty || lead?.form_data?.county || 'your area';
  const repName = (currentUserName || '').trim().split(/\s+/)[0];
  const intro = repName ? `this is ${repName} with Haven Ground` : `this is the team at Haven Ground`;
  const leadStatus = (lead?.pipeline_status || lead?.status || '').toUpperCase();
  const suggestions = isOnMarket ? {
    first: { label: 'First touch', text: `Hey ${firstName}, ${intro}. I came across the ${county} property you have listed and we're actively buying land in the area. Would you be open to a cash offer? We close quick and easy.` },
    checkin: { label: 'Check-in', text: `Hey ${firstName}, following up on the ${county} property. Is it still available? We're a serious buyer and would love to put an offer together if you're open to it.` },
    offer: { label: 'Offer follow-up', text: `Hey ${firstName}, wanted to follow up on the offer we put together on the ${county} property. Confident in our numbers and we can close without a hitch. Happy to talk it through.` },
  } : {
    first: { label: 'First touch', text: `Hey ${firstName}, ${intro}. Reaching out about the land you wanted us to check out in ${county}. When's a good time to call and discuss?` },
    checkin: { label: 'Check-in', text: `Hey ${firstName}, checking in on the land you wanted us to check out in ${county}. Did you end up getting that sold, or are you still interested in us buying?` },
    offer: { label: 'Offer follow-up', text: `Hey ${firstName}, wanted to check in on the offer we made on the land in ${county}. Very confident in our underwriting and our ability to close this without a hitch.` },
  };
  const order = ['OFFER_SENT', 'NEGOTIATING', 'AGREEMENT_SENT', 'APPT_SET_FOR_JORDAN'].includes(leadStatus)
    ? ['offer', 'checkin', 'first']
    : ['CONTACTED', 'ANTHONY_CONTACTED', 'ANTHONY_FOLLOW_UP'].includes(leadStatus)
      ? ['checkin', 'first', 'offer']
      : ['first', 'checkin', 'offer'];
  const orderedSuggestions = order.map((k) => ({ key: k, ...suggestions[k] }));

  const [messages, setMessages] = useState([]);
  const [optimistic, setOptimistic] = useState([]); // local-only bubbles
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [ai, setAi] = useState(null); // { lean, follow_up, draft_reply, summary } or { error }
  const [aiApplied, setAiApplied] = useState({});
  const [aiDismissed, setAiDismissed] = useState({}); // per-box dismiss (lean/fu/draft)
  const scrollRef = useRef(null);

  const runSmartSuggest = async () => {
    setAiLoading(true);
    setAi(null);
    setAiApplied({});
    setAiDismissed({});
    try {
      const res = await fetch('/api/ai/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'No suggestion');
      setAi(data);
    } catch (e) {
      setAi({ error: e.message });
    } finally {
      setAiLoading(false);
    }
  };

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
    playSwoosh();
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
            <button
              type="button"
              onClick={() => { if (onOpenLead) { onOpenLead(lead); onClose(); } }}
              className="text-slate-100 font-semibold truncate hover:text-blue-300 hover:underline text-left max-w-full block"
              title="Open lead card"
            >
              {name}
            </button>
            <div className="text-slate-400 text-xs">{phone || 'no phone'}</div>
          </div>
          <button
            type="button"
            onClick={() => onCall && onCall(lead)}
            title="Call"
            className="p-2 rounded-lg bg-green-600/20 hover:bg-green-600/40 text-green-400"
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
                <span>{dateLabel(m.ts)} · {clockTime(m.ts)}</span>
                {m.outbound && m.status === 'sending' && <span>· Sending…</span>}
                {m.outbound && m.failed && (
                  <button onClick={m.onRetry} className="text-red-400 hover:underline">
                    · Failed, tap to retry
                  </button>
                )}
                {m.outbound && m.status === 'delivered' && <span>· Delivered</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Composer */}
        <div className="border-t border-slate-700/70 p-2 bg-slate-800/40 relative">
          {/* Generative Responses popup */}
          {suggestOpen && (
            <div className="absolute bottom-full left-2 right-2 mb-2 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl overflow-hidden z-10">
              <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-700 flex items-center justify-between">
                <span>Suggested messages</span>
                <button type="button" onClick={() => setSuggestOpen(false)} className="text-slate-500 hover:text-slate-300 normal-case">Close</button>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {orderedSuggestions.map((s, i) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => { setDraft(s.text); setSuggestOpen(false); }}
                    className="block w-full text-left px-3 py-2.5 hover:bg-blue-600/20 border-b border-slate-700/50 last:border-0"
                  >
                    <div className="text-[11px] font-semibold text-purple-300 mb-0.5">{s.label}{i === 0 ? ' · suggested' : ''}</div>
                    <div className="text-xs text-slate-300 line-clamp-3">{s.text}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Smart Suggest result: three independent boxes. Dismissing or
              applying one never touches the others, and the read summary stays. */}
          {(aiLoading || ai) && (
            <div className="mb-2 space-y-1.5">
              <div className="flex items-center justify-between px-0.5">
                <span className="text-[11px] font-bold text-cyan-300 uppercase tracking-wide">Smart Suggest</span>
                {ai && <button type="button" onClick={() => { setAi(null); setAiDismissed({}); }} className="text-slate-500 hover:text-slate-300 text-xs">Clear all</button>}
              </div>
              {aiLoading && <div className="text-xs text-slate-400 py-1 px-2 rounded-lg border border-cyan-500/30 bg-cyan-500/5">Reading the file…</div>}
              {ai?.error && <div className="text-xs text-red-400 py-1.5 px-2 rounded-lg border border-red-500/30 bg-red-500/5">{ai.error}</div>}
              {ai && !ai.error && (
                <>
                  {ai.summary && (
                    <div className="text-xs text-slate-300 px-2 py-1.5 rounded-lg border border-slate-700/50 bg-slate-800/40">{ai.summary}</div>
                  )}
                  {ai.lean && onSetDirection && !aiDismissed.lean && (
                    <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-2 py-1.5 flex items-center gap-2">
                      <button type="button" disabled={aiApplied.lean}
                        onClick={() => { onSetDirection(lead.id, ai.lean); setAiApplied((a) => ({ ...a, lean: true })); }}
                        className="flex-1 text-left text-xs disabled:opacity-60">
                        <span className="text-[10px] uppercase tracking-wide text-slate-500 block">Lean</span>
                        {aiApplied.lean ? '✓ Set: ' : 'Set lean: '}<span className="text-cyan-300 font-medium">{LEAN_LABEL[ai.lean] || ai.lean}</span>
                      </button>
                      <button type="button" onClick={() => setAiDismissed((d) => ({ ...d, lean: true }))} title="Dismiss" className="flex-shrink-0 text-slate-500 hover:text-slate-300 text-sm leading-none px-1">×</button>
                    </div>
                  )}
                  {ai.follow_up && onScheduleFollowUp && !aiDismissed.fu && (
                    <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-2 py-1.5 flex items-center gap-2">
                      <button type="button" disabled={aiApplied.fu}
                        onClick={() => { onScheduleFollowUp(lead.id, ai.follow_up.when, ai.follow_up.label); setAiApplied((a) => ({ ...a, fu: true })); }}
                        className="flex-1 text-left text-xs disabled:opacity-60">
                        <span className="text-[10px] uppercase tracking-wide text-slate-500 block">Schedule task</span>
                        {aiApplied.fu ? '✓ Scheduled: ' : ''}<span className="text-cyan-300 font-medium">{ai.follow_up.label} · {new Date(ai.follow_up.when).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                      </button>
                      <button type="button" onClick={() => setAiDismissed((d) => ({ ...d, fu: true }))} title="Dismiss" className="flex-shrink-0 text-slate-500 hover:text-slate-300 text-sm leading-none px-1">×</button>
                    </div>
                  )}
                  {ai.draft_reply && !aiDismissed.draft && (
                    <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-2 py-1.5 flex items-center gap-2">
                      <button type="button"
                        onClick={() => { setDraft(ai.draft_reply); }}
                        className="flex-1 text-left text-xs">
                        <span className="text-[10px] uppercase tracking-wide text-slate-500 block">Draft message</span>
                        <span className="text-slate-200">{ai.draft_reply.slice(0, 80)}{ai.draft_reply.length > 80 ? '…' : ''}</span>
                      </button>
                      <button type="button" onClick={() => setAiDismissed((d) => ({ ...d, draft: true }))} title="Dismiss" className="flex-shrink-0 text-slate-500 hover:text-slate-300 text-sm leading-none px-1">×</button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          <div className="mb-1.5 flex items-center gap-3">
            <button
              type="button"
              onClick={runSmartSuggest}
              disabled={aiLoading}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-300 hover:text-cyan-200 disabled:opacity-40"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l1.9 5.1L19 9l-5.1 1.9L12 16l-1.9-5.1L5 9l5.1-1.9L12 2z" /></svg>
              {aiLoading ? 'Thinking…' : 'Smart Suggest'}
            </button>
            <button
              type="button"
              onClick={() => setSuggestOpen((o) => !o)}
              disabled={!phone}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-300 hover:text-purple-200 disabled:opacity-40"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2l1.9 5.1L19 9l-5.1 1.9L12 16l-1.9-5.1L5 9l5.1-1.9L12 2zm6 12l.95 2.55L21.5 17.5l-2.55.95L18 21l-.95-2.55L14.5 17.5l2.55-.95L18 14z" />
              </svg>
              Generative Responses
              <svg className={`w-3 h-3 transition-transform ${suggestOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>
          </div>
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
