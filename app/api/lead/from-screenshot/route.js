import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// POST /api/lead/from-screenshot
// Body: { image: "data:image/png;base64,...." }
// Reads a lead screenshot (name / phone / email / address / county / state /
// acres), extracts the fields with Claude vision, and creates a PPC-inflow lead
// so it lands in the pipeline just like a form-fill lead. Returns the new lead.

export const maxDuration = 60;

function parseDataUri(uri) {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(uri || '');
  if (!m) return null;
  return { mediaType: m[1], base64: m[2] };
}

// Pull the first JSON object out of the model's reply (tolerate code fences).
function extractJson(text) {
  if (!text) return null;
  const fenced = text.replace(/```json|```/gi, '');
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(fenced.slice(start, end + 1)); } catch { return null; }
}

// Treat "null"/"n/a"/"" as empty.
function clean(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || /^(null|n\/a|na|none|unknown)$/i.test(s)) return null;
  return s;
}

export async function POST(request) {
  try {
    const { image } = await request.json();
    const parsed = parseDataUri(image);
    if (!parsed) return NextResponse.json({ ok: false, error: 'No valid image provided' }, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ ok: false, error: 'AI is not configured' }, { status: 500 });

    const prompt = `You extract real-estate seller lead details from a screenshot of a lead notification.
Return ONLY a compact JSON object (no markdown, no commentary) with exactly these keys:
"name", "name_on_title", "phone", "email", "address", "city", "county", "state", "zip", "acres".
Rules:
- Values are strings. Use null when a field is missing or literally shows "null".
- "address" is the street address only (no city/state).
- "city" and "state" split out from the address line when present.
- "acres" keep exactly as shown (for example "5 - 20").`;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        temperature: 0,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: parsed.mediaType, data: parsed.base64 } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text().catch(() => '');
      return NextResponse.json({ ok: false, error: `Vision request failed (${aiRes.status})`, detail: t.slice(0, 300) }, { status: 502 });
    }
    const aiJson = await aiRes.json();
    const text = (aiJson.content || []).map((c) => c.text || '').join('');
    const fields = extractJson(text);
    if (!fields) return NextResponse.json({ ok: false, error: 'Could not read the screenshot. Try a clearer image.' }, { status: 422 });

    const name = clean(fields.name);
    if (!name) return NextResponse.json({ ok: false, error: 'No name found in the screenshot.' }, { status: 422 });

    const acresRaw = clean(fields.acres);
    const acresNum = acresRaw && /^\s*\d+(\.\d+)?\s*$/.test(acresRaw) ? Number(acresRaw) : null;

    const county = clean(fields.county);
    const state = clean(fields.state);
    const address = clean(fields.address);
    const city = clean(fields.city);
    const zip = clean(fields.zip);

    const sb = supabaseAdmin();
    const payload = {
      name,
      full_name: name,
      email: clean(fields.email) || 'N/A',
      phone: clean(fields.phone) || 'N/A',
      address: address || (city || county ? [city, state].filter(Boolean).join(', ') : 'N/A'),
      city: city || county || 'N/A',
      zip: zip || null,
      county: county || null,
      property_county: county || null,
      state: state || null,
      property_state: state || null,
      acreage: acresNum,
      acres: acresNum,
      source: 'haven-ground',
      status: 'new',
      pipeline_status: 'NEW',
      last_activity_at: new Date().toISOString(),
      form_data: {
        origin: 'screenshot_upload',
        namesOnDeed: clean(fields.name_on_title),
        acresRange: acresRaw,
        streetAddress: address,
        city, county, state, zip,
      },
    };

    let { data: lead, error } = await sb.from('leads').insert([payload]).select().single();
    if (error) {
      // Retry without newer columns some databases may not have.
      const slim = { name, full_name: name, email: payload.email, phone: payload.phone,
        address: payload.address, city: payload.city, source: 'haven-ground', status: 'new',
        form_data: payload.form_data };
      const retry = await sb.from('leads').insert([slim]).select().single();
      if (retry.error) return NextResponse.json({ ok: false, error: retry.error.message }, { status: 500 });
      lead = retry.data;
    }

    return NextResponse.json({ ok: true, lead: { id: lead.id, name, county, state, acres: acresRaw }, fields });
  } catch (err) {
    console.error('[from-screenshot]', err);
    return NextResponse.json({ ok: false, error: err.message || 'Failed to process screenshot' }, { status: 500 });
  }
}
