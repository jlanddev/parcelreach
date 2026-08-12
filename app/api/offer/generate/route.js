import { NextResponse } from 'next/server';
import { chromium } from 'playwright-core';
import BrowserbaseSDK from '@browserbasehq/sdk';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// The SDK is CJS with the class on `.default` (see scripts/screenshot.js).
const Browserbase = BrowserbaseSDK?.default || BrowserbaseSDK;
import { buildOfferHtml } from '@/lib/offerTemplate';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Renders the offer HTML to a 2-page Letter PDF using the same remote Browserbase
// Chromium the screenshot tool uses. We drive printToPDF over a raw CDP session
// (not Playwright's page.pdf(), which refuses to run outside headless mode) so it
// works regardless of how the Browserbase session is launched. The finished PDF
// is stored in the public `offer-pdfs` bucket and its URL returned for download.

export async function POST(request) {
  let browser;
  try {
    const { leadId, terms, mapUrl } = await request.json();
    if (!leadId) return NextResponse.json({ error: 'Missing leadId' }, { status: 400 });

    const supabase = supabaseAdmin();
    const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).maybeSingle();
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    // Persist the offer terms/map the modal sent so the stored offer matches the
    // PDF, then build the document from the merged lead.
    const nextTerms = {
      ...(lead.offer_terms || {}),
      ...(terms || {}),
      ...(mapUrl ? { offerMapUrl: mapUrl } : {}),
    };
    await supabase.from('leads').update({ offer_terms: nextTerms }).eq('id', leadId);

    const html = buildOfferHtml({ ...lead, offer_terms: nextTerms });

    if (!process.env.BROWSERBASE_API_KEY || !process.env.BROWSERBASE_PROJECT_ID) {
      return NextResponse.json({ error: 'PDF renderer not configured' }, { status: 500 });
    }

    const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });
    const session = await bb.sessions.create({ projectId: process.env.BROWSERBASE_PROJECT_ID });
    browser = await chromium.connectOverCDP(session.connectUrl, { timeout: 20000 });

    const context = browser.contexts()[0];
    const page = context.pages()[0];
    await page.setContent(html, { waitUntil: 'networkidle', timeout: 30000 });
    // Give the web fonts and the remote map image a beat to settle.
    await page.evaluate(() => (document.fonts && document.fonts.ready) || true).catch(() => {});
    await page.waitForTimeout(600);

    const client = await context.newCDPSession(page);
    const { data: b64 } = await client.send('Page.printToPDF', {
      printBackground: true,
      preferCSSPageSize: true,
      paperWidth: 8.5,
      paperHeight: 11,
      marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
    });
    await browser.close().catch(() => {});
    browser = null;

    const buf = Buffer.from(b64, 'base64');
    const path = `${leadId}/offer-${Date.now()}.pdf`;
    const { error: upErr } = await supabase.storage.from('offer-pdfs')
      .upload(path, buf, { contentType: 'application/pdf', upsert: true });
    if (upErr) return NextResponse.json({ error: 'Upload failed: ' + upErr.message }, { status: 500 });

    const { data: urlData } = supabase.storage.from('offer-pdfs').getPublicUrl(path);
    const url = urlData?.publicUrl;
    await supabase.from('leads').update({ offer_pdf_url: url }).eq('id', leadId);

    const nameBits = [lead.property_county || lead.county, lead.parcel_id].filter(Boolean).join('_');
    const filename = `Offer_${(nameBits || leadId).replace(/[^\w-]+/g, '_')}.pdf`;

    return NextResponse.json({ ok: true, url, filename });
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
