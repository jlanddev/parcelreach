import { NextResponse } from 'next/server';

// Campaign builder: the user describes what they want ("re-engage leads we
// haven't heard from in 30 days") and Claude drafts a full cadence, timing and
// messages, that drops straight into the step editor. Suggestions only; the
// user reviews and edits before saving.

export async function POST(request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ ok: false, error: 'AI not configured' }, { status: 500 });
    const { goal } = await request.json();
    if (!goal || !String(goal).trim()) return NextResponse.json({ ok: false, error: 'Describe what you want the campaign to do.' }, { status: 400 });

    const system = `You are an elite land acquisitions manager for a land-buying company. You design SMS follow-up cadences (drip campaigns) that re-engage land sellers and move them toward a phone call. The company texts from iMessage, so NEVER include "reply STOP", opt-out language, or compliance footers. You are better at seller psychology than the person reading this; write cadences that actually get replies.

Write a short, effective sequence of steps. Each step is either a TEXT the system sends or a CALL task for the rep to make. Rules:
- 3 to 6 steps total. Space them out sensibly over days (occasionally the first touch can be minutes/hours after enrollment if that fits the goal).
- Messages are short (1-3 sentences), warm, human, low-pressure, no hype, no stacked exclamation points. Contractions are good.
- Personalize with tokens: use {{first}} for the seller's first name and {{county}} for their county. Use {{first}} in most texts. Only use tokens that exist: {{first}}, {{county}}.
- The goal is to earn a reply and get them on a call, not to hard-sell over text.
- Vary the wording across steps; do not repeat the same sentence.
- A CALL step has no message, just a short label like "Call to reconnect".
- Never use em dashes or en dashes. Use commas, periods, or parentheses.

Respond with ONLY a JSON object, no prose, no code fences:
{
  "name": a short campaign name (3-5 words),
  "description": one short sentence on what it does and who it targets,
  "steps": [
    { "afterDays": number (days after enrollment; may be 0), "type": "text" | "call", "message": the text (for text steps), "label": short label (for call steps) }
  ]
}`;

    const user = `Design the campaign for this goal:\n"${String(goal).trim()}"`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1200, temperature: 0.4, system, messages: [{ role: 'user', content: user }] }),
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
    return NextResponse.json({ ok: true, name: noDash(parsed.name || '').slice(0, 80), description: noDash(parsed.description || '').slice(0, 200), steps });
  } catch (err) {
    console.error('[campaigns suggest]', err);
    return NextResponse.json({ ok: false, error: err.message || 'Failed' }, { status: 500 });
  }
}
