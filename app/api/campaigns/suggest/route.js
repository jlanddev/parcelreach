import { NextResponse } from 'next/server';

// Campaign builder: the user describes what they want ("re-engage leads we
// haven't heard from in 30 days") and Claude drafts a full cadence, timing and
// messages, that drops straight into the step editor. Suggestions only; the
// user reviews and edits before saving.

export async function POST(request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ ok: false, error: 'AI not configured' }, { status: 500 });
    const { goal, feedback, current, messages } = await request.json();
    const hasHistory = Array.isArray(messages) && messages.length;
    if (!hasHistory && (!goal || !String(goal).trim()) && (!feedback || !String(feedback).trim())) {
      return NextResponse.json({ ok: false, error: 'Describe what you want the campaign to do.' }, { status: 400 });
    }

    const system = `You are an elite land acquisitions manager for a land-buying company. You design SMS follow-up cadences (drip campaigns) that re-engage land sellers and move them toward a phone call. The company texts from iMessage, so NEVER include "reply STOP", opt-out language, or compliance footers. You are better at seller psychology than the person reading this; write cadences that actually get replies.

Write a short, effective sequence of steps. Each step is either a TEXT the system sends or a CALL task for the rep to make. Rules:
- 3 to 6 steps total. Space them out sensibly over days (occasionally the first touch can be minutes/hours after enrollment if that fits the goal).
- Messages are short (1-3 sentences), warm, human, low-pressure, no hype, no stacked exclamation points. Contractions are good.
- Personalize with tokens: use {{first}} for the seller's first name and {{county}} for their county. Use {{first}} in most texts. Only use tokens that exist: {{first}}, {{county}}.
- The goal is to earn a reply and get them on a call, not to hard-sell over text.
- Vary the wording across steps; do not repeat the same sentence.
- A CALL step has no message, just a short label like "Call to reconnect".
- Never use em dashes or en dashes. Use commas, periods, or parentheses.

This is a CONVERSATION. The user will give you follow-up change requests one after another. Treat EVERY instruction you have been given so far as still in force, and apply them all together, cumulatively. A new change request ADDS to the earlier ones, it does not replace them: never undo a change the user asked for earlier unless they explicitly tell you to. Example: if they told you earlier "we are the value, do not ask if they are open to it, we provide the offer," then every later revision must keep that framing. Re-read the whole conversation and honor all of it. Return the full updated sequence each time.

Respond with ONLY a JSON object, no prose, no code fences:
{
  "name": a short campaign name (3-5 words),
  "description": one short sentence on what it does and who it targets,
  "steps": [
    { "afterDays": number (days after enrollment; may be 0), "type": "text" | "call", "message": the text (for text steps), "label": short label (for call steps) }
  ]
}`;

    const toAfterDays = (min) => Math.round(((Number(min) || 0) / 1440) * 100) / 100;
    const currentSteps = Array.isArray(current?.steps) ? current.steps.map(s => ({
      afterDays: toAfterDays(s.delayMin != null ? s.delayMin : (Number(s.day) || 0) * 1440),
      type: s.type === 'call' ? 'call' : 'text',
      message: s.message || '', label: s.label || '',
    })) : null;

    // Build the conversation. Prefer the full history the client sends (true
    // memory across revisions); fall back to a single message for old callers.
    let convo;
    if (hasHistory) {
      convo = messages
        .filter(x => x && (x.role === 'user' || x.role === 'assistant') && typeof x.content === 'string' && x.content.trim())
        .slice(-20)
        .map(x => ({ role: x.role, content: x.content }));
      if (!convo.length || convo[0].role !== 'user') convo.unshift({ role: 'user', content: `Design the campaign for this goal:\n"${String(goal || '').trim()}"` });
    } else if (currentSteps && feedback && String(feedback).trim()) {
      convo = [{ role: 'user', content: `Here is the CURRENT DRAFT of the campaign:\n${JSON.stringify({ name: current.name || '', description: current.description || '', steps: currentSteps }, null, 2)}\n\n${goal ? `Original goal: "${String(goal).trim()}"\n\n` : ''}CHANGE REQUEST from the user: "${String(feedback).trim()}"\n\nReturn the full revised campaign.` }];
    } else {
      convo = [{ role: 'user', content: `Design the campaign for this goal:\n"${String(goal || feedback).trim()}"` }];
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1200, temperature: 0.4, system, messages: convo }),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ ok: false, error: data.error?.message || 'AI error' }, { status: 502 });

    let text = data.content?.[0]?.text?.trim() || '';
    const m = text.match(/\{[\s\S]*\}/);
    let parsed;
    try { parsed = JSON.parse(m ? m[0] : text); } catch { return NextResponse.json({ ok: false, error: 'Could not parse suggestion' }, { status: 502 }); }

    const noDash = (s) => String(s || '').replace(/\s*[—–]\s*/g, ', ').replace(/[—–]/g, '-');
    const steps = (Array.isArray(parsed.steps) ? parsed.steps : []).slice(0, 8).map((s) => {
      const type = s.type === 'call' ? 'call' : 'text';
      const delayMin = Math.max(0, Math.round((Number(s.afterDays) || 0) * 1440));
      return type === 'call'
        ? { delayMin, type, label: noDash(s.label || 'Call'), message: '' }
        : { delayMin, type, message: noDash(s.message || ''), label: '' };
    }).filter((s) => s.type === 'call' || s.message);

    if (!steps.length) return NextResponse.json({ ok: false, error: 'No steps generated, try rewording the goal.' }, { status: 502 });
    // `assistant` is the raw model reply; the client appends it to the running
    // conversation so the next revision remembers everything said so far.
    return NextResponse.json({ ok: true, name: noDash(parsed.name || '').slice(0, 80), description: noDash(parsed.description || '').slice(0, 200), steps, assistant: text });
  } catch (err) {
    console.error('[campaigns suggest]', err);
    return NextResponse.json({ ok: false, error: err.message || 'Failed' }, { status: 500 });
  }
}
