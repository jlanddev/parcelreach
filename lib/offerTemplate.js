// Builds the two-page "Offer Summary" document (page 1: offer + terms, page 2:
// Exhibit A aerial) as a self-contained HTML string that gets rendered to PDF by
// /api/offer/generate via Browserbase. All styling is inline; fonts load from
// Google Fonts (Browserbase Chromium has internet). The design mirrors the LR
// Acquisitions offer: deep-green header band, gold accents, rust dividers, cream
// body, beige info boxes.

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const money = (n) => {
  const v = Number(n);
  if (!isFinite(v) || v <= 0) return '';
  return '$' + Math.round(v).toLocaleString('en-US');
};

const num = (v) => {
  const n = Number(String(v ?? '').replace(/[^0-9.]/g, ''));
  return isFinite(n) ? n : 0;
};

const acres = (n) => {
  const v = num(n);
  if (!v) return '';
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

function fmtDate(d) {
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(d);
  } catch { return ''; }
}

// Merge a lead + its saved offer_terms into a fully-resolved set of display
// values, filling every blank with a sensible default so a PDF always renders.
export function resolveOffer(lead) {
  const t = (lead && lead.offer_terms) || {};
  const fd = (lead && lead.form_data) || {};

  const county = t.county || lead?.property_county || lead?.county || fd.county || '';
  const state = t.state || lead?.property_state || lead?.state || fd.state || '';
  const apn = t.parcelNumber || lead?.parcel_id || lead?.parcelid || fd.parcel_id || fd.apn || fd.parcelId || '';
  const acreBase = lead?.acreage || lead?.acres || fd.acreage || fd.acres || '';

  const price = num(t.purchasePrice ?? lead?.offer_amount);
  const gisAcres = num(t.gisAcres ?? acreBase);
  const deededAcres = num(t.deededAcres ?? acreBase);
  const perAcre = gisAcres > 0 ? price / gisAcres : 0;

  const namesOnDeed = t.namesOnDeed || fd.namesOnDeed || lead?.owner_name || lead?.full_name || lead?.name || '';

  const now = new Date();
  const validDefault = new Date(now.getTime() + 7 * 86400000);

  const buyerEntity = t.buyerEntity || 'LR Acquisitions LLC';
  const roadName = t.roadName || lead?.street_address || lead?.address || '';
  const countyState = [county && `${county} County`, state].filter(Boolean).join(', ') || [county, state].filter(Boolean).join(', ');

  const surveyTerm = t.weFurnishSurvey
    ? "Buyer will furnish a new survey at Buyer's cost"
    : "Sellers' existing survey, if any";
  const closingTerm = t.weCoverClosing
    ? 'Buyer pays customary closing costs'
    : "Buyer's choice, customary split";

  // Seller-facing notes: prefer the AI-polished text; otherwise fall back to the
  // standard three-part boilerplate so the document is never empty.
  const closingDays = t.closingDays || 30;
  const depositDays = t.depositDays || 3;
  const earnest = num(t.earnestMoney) || 5000;
  const familyLast = (namesOnDeed.split(/\band\b|,|&/)[0] || '').trim().split(/\s+/).pop() || '';

  const boilerplate = [
    `All cash. There is no lender, no loan approval, and no financing contingency on this offer. Proof of funds is available on request. Nothing sits between contract and closing except the title work.`,
    `Speed. Buyer will close on or before ${closingDays} days from execution and can move sooner if the title company is ready. ${t.weFurnishSurvey ? 'Buyer will furnish a new survey at Buyer’s own cost.' : 'Buyer will accept the Sellers’ existing survey if one is on hand, and will order a new one at Buyer’s own cost if not.'}`,
    `Next step. This is a non-binding expression of interest offered in good faith${familyLast ? ` and with respect for the ${familyLast} family` : ''}. On acceptance, Buyer will execute a standard ${state || 'state'} purchase agreement reflecting these terms and deliver earnest money to the title company.`,
  ].join('\n\n');

  const preparedForName = t.preparedForName || (familyLast ? `The ${familyLast} Family` : namesOnDeed);
  const preparedForNames = t.preparedForNames || namesOnDeed;
  const preparedForCity = t.preparedForCity || [lead?.city || '', state].filter(Boolean).join(', ');

  return {
    buyerEntity,
    county, state, countyState, apn, roadName,
    price, gisAcres, deededAcres, perAcre,
    useCategory: t.useCategory || 'Agricultural',
    namesOnDeed,
    termsCash: t.termsCash || 'All cash, no financing',
    earnest,
    depositDays,
    closingDays,
    contingencies: t.contingencies || 'Clear and marketable title only',
    appraisal: t.appraisal || 'None required',
    titleEscrow: closingTerm,
    survey: surveyTerm,
    possession: t.possession || 'At closing and funding',
    notes: (t.offerNotes && String(t.offerNotes).trim()) || boilerplate,
    preparedForName, preparedForNames, preparedForCity,
    presentedDate: t.presentedDate || fmtDate(now),
    validThrough: t.validThrough || fmtDate(validDefault),
    mapUrl: t.offerMapUrl || lead?.map_image_url || '',
    propTitle: `±${acres(gisAcres) || gisAcres} Acres • ${roadName || countyState}`,
  };
}

// Render one paragraph of the notes, emphasizing the short lead phrase (up to the
// first period) in rust the way the template does ("All cash." "Speed." etc.).
function noteParagraph(p) {
  const m = /^([^.]{1,24}\.)\s*(.*)$/s.exec(p.trim());
  if (m) return `<p class="note"><span class="note-lead">${esc(m[1])}</span> ${esc(m[2])}</p>`;
  return `<p class="note">${esc(p.trim())}</p>`;
}

const termRow = (label, value) => value
  ? `<tr><td class="tl">${esc(label)}</td><td class="tv">${esc(value)}</td></tr>` : '';

const snapRow = (label, value) => value
  ? `<div class="snap-row"><span class="snap-l">${esc(label)}</span><span class="snap-v">${esc(value)}</span></div>` : '';

export function buildOfferHtml(lead) {
  const o = resolveOffer(lead);
  const notesHtml = String(o.notes).split(/\n{2,}/).filter(Boolean).map(noteParagraph).join('\n');
  const priceStr = money(o.price) || 'Price on request';
  const perAcreStr = o.perAcre > 0 ? `${money(o.perAcre)} per GIS acre | all cash` : 'all cash';

  const mapImg = o.mapUrl
    ? `<img class="map" src="${esc(o.mapUrl)}" alt="Aerial and boundary" crossorigin="anonymous"/>`
    : `<div class="map map-missing">No map selected</div>`;
  const mapImgBig = o.mapUrl
    ? `<img class="map-big" src="${esc(o.mapUrl)}" alt="Aerial and boundary" crossorigin="anonymous"/>`
    : `<div class="map-big map-missing">No map selected</div>`;

  return `<!doctype html><html><head><meta charset="utf-8"/>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600;1,700&family=EB+Garamond:ital@0;1&display=swap" rel="stylesheet">
<style>
  :root{
    --green:#3b4a34; --green-d:#33402d; --gold:#c6a95f; --gold-l:#d8c088;
    --rust:#b4622e; --cream:#f4efe3; --beige:#e8e1d0; --beige-2:#efe9db;
    --ink:#33402d; --ink-soft:#4a4a3d; --line:#d8d0bd;
  }
  *{box-sizing:border-box; margin:0; padding:0;}
  @page{ size:Letter; margin:0; }
  html,body{ -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body{ font-family:'EB Garamond', Georgia, serif; color:var(--ink); background:var(--cream);
    /* Force normal (lining) numerals so prices/acres/dates read cleanly. */
    font-variant-numeric:lining-nums; font-feature-settings:"lnum" 1, "onum" 0; }
  .price, .prop-title, .prop-sub, table.terms td, .snap-v, .stat-v, .price-sub, .map-cap{
    font-variant-numeric:lining-nums; font-feature-settings:"lnum" 1, "onum" 0; }
  .page{ width:8.5in; height:11in; background:var(--cream); position:relative;
    padding:0.45in 0.55in 0.9in; overflow:hidden; page-break-after:always; }
  .page:last-child{ page-break-after:auto; }

  /* Header band */
  .hdr{ background:var(--green); border-radius:3px; padding:16px; }
  .hdr-frame{ border:1.5px solid var(--gold); border-radius:2px; padding:14px 10px 16px; text-align:center; }
  .hdr-title{ font-family:'Cormorant Garamond', serif; font-style:italic; font-weight:600; color:var(--cream); font-size:48px; line-height:1.05; letter-spacing:1px; }
  .hdr-sub{ color:var(--gold-l); font-size:11px; letter-spacing:6px; text-transform:uppercase; margin-top:10px; }
  .rust-bar{ height:5px; background:var(--rust); margin:0 0 0; border-radius:2px; }

  /* Property title */
  .prop-title{ font-family:'Cormorant Garamond', serif; font-weight:600; font-size:26px; text-align:center; color:var(--ink); margin-top:20px; }
  .prop-sub{ font-family:'Cormorant Garamond', serif; font-style:italic; font-size:15px; text-align:center; color:var(--ink-soft); margin-top:2px; }

  .cols{ display:flex; gap:18px; margin-top:18px; align-items:flex-start; }
  .col-l{ width:45%; }
  .col-r{ width:55%; }

  .map{ width:100%; height:2.35in; object-fit:cover; border-radius:3px; border:1px solid var(--line); display:block; }
  .map-big{ width:100%; height:5.4in; object-fit:cover; border-radius:3px; border:1px solid var(--line); display:block; }
  .map-missing{ display:flex; align-items:center; justify-content:center; background:var(--beige); color:#9a917c; font-style:italic; }
  .map-cap{ font-family:'Cormorant Garamond', serif; font-style:italic; font-size:11px; color:var(--ink-soft); margin-top:6px; line-height:1.3; }
  .center{ text-align:center; }

  .snapshot{ background:var(--beige); border-radius:3px; padding:14px 16px; margin-top:16px; border-top:3px solid var(--green); }
  .snap-h{ font-size:11px; letter-spacing:3px; text-transform:uppercase; color:var(--green); font-weight:600; margin-bottom:10px; }
  .snap-row{ display:flex; justify-content:space-between; padding:5px 0; font-size:14px; }
  .snap-l{ color:#7a745f; letter-spacing:1px; text-transform:uppercase; font-size:11px; align-self:center; }
  .snap-v{ color:var(--ink); font-weight:600; }

  .price-box{ background:var(--green); border:1.5px solid var(--gold); border-radius:3px; text-align:center; padding:16px; }
  .price-label{ color:var(--gold-l); font-size:11px; letter-spacing:5px; text-transform:uppercase; }
  .price{ color:var(--cream); font-family:'Cormorant Garamond', serif; font-weight:600; font-size:44px; line-height:1.05; margin:4px 0; }
  .price-sub{ color:var(--gold-l); font-style:italic; font-size:13px; }

  .terms-h{ font-size:12px; letter-spacing:4px; text-transform:uppercase; color:var(--rust); font-weight:600; margin:16px 0 8px; }
  table.terms{ width:100%; border-collapse:collapse; }
  table.terms td{ font-size:13.5px; padding:6px 10px; }
  table.terms tr:nth-child(odd){ background:var(--beige-2); }
  td.tl{ color:#7a745f; text-transform:uppercase; letter-spacing:0.5px; font-size:11px; }
  td.tv{ text-align:right; color:var(--ink); }

  .notes{ margin-top:20px; }
  .notes-h{ font-size:12px; letter-spacing:4px; text-transform:uppercase; color:var(--rust); font-weight:600; border-top:1px solid var(--line); padding-top:12px; margin-bottom:8px; }
  .note{ font-size:12.5px; line-height:1.5; color:var(--ink-soft); margin-bottom:7px; }
  .note-lead{ color:var(--rust); font-style:italic; }

  /* Stats bar (page 2) */
  .stats{ display:flex; background:var(--beige); border-radius:3px; margin-top:18px; overflow:hidden; }
  .stat{ flex:1; text-align:center; padding:16px 8px; border-right:1px solid #d6cdb8; }
  .stat:last-child{ border-right:none; }
  .stat-l{ font-size:10px; letter-spacing:3px; text-transform:uppercase; color:var(--green); font-weight:600; }
  .stat-v{ font-family:'Cormorant Garamond', serif; font-weight:600; font-size:22px; color:var(--ink); margin-top:4px; }

  /* Footer band */
  .footer{ position:absolute; left:0; right:0; bottom:0; background:var(--green); color:var(--cream);
    display:flex; justify-content:space-between; padding:16px 0.55in; }
  .foot-h{ color:var(--gold-l); font-size:10px; letter-spacing:4px; text-transform:uppercase; margin-bottom:5px; }
  .foot-l{ font-size:13px; line-height:1.4; }
  .foot-r{ text-align:right; font-size:13px; line-height:1.4; }
  .foot-name{ font-weight:600; }
  .foot-it{ font-style:italic; color:var(--gold-l); font-size:12px; }
  .pageno{ position:absolute; bottom:5px; left:0; right:0; text-align:center; font-size:9px; color:#8f8873; }
</style></head>
<body>

  <!-- PAGE 1 -->
  <div class="page">
    <div class="hdr"><div class="hdr-frame">
      <div class="hdr-title">Offer Summary</div>
      <div class="hdr-sub">${esc(o.buyerEntity)}</div>
    </div></div>
    <div class="rust-bar"></div>

    <div class="prop-title">${esc(o.propTitle)}</div>
    <div class="prop-sub">${esc(o.countyState)}${o.presentedDate ? ` • Presented ${esc(o.presentedDate)}` : ''}</div>

    <div class="cols">
      <div class="col-l">
        ${mapImg}
        <div class="map-cap">Subject tract shown outlined.${o.roadName ? ` Frontage on ${esc(o.roadName)}.` : ''} See Exhibit A.</div>
        <div class="snapshot">
          <div class="snap-h">Property Snapshot</div>
          ${snapRow('County', o.countyState)}
          ${snapRow('Parcel Number', o.apn)}
          ${snapRow('GIS Acres', acres(o.gisAcres))}
          ${snapRow('Deeded Acres', acres(o.deededAcres))}
          ${snapRow('Use Category', o.useCategory)}
        </div>
      </div>
      <div class="col-r">
        <div class="price-box">
          <div class="price-label">Purchase Price</div>
          <div class="price">${esc(priceStr)}</div>
          <div class="price-sub">${esc(perAcreStr)}</div>
        </div>
        <div class="terms-h">Terms of Offer</div>
        <table class="terms">
          ${termRow('Buyer', o.buyerEntity)}
          ${termRow('Sellers', o.namesOnDeed)}
          ${termRow('Purchase Price', money(o.price))}
          ${termRow('Terms', o.termsCash)}
          ${termRow('Earnest Money', money(o.earnest))}
          ${termRow('Deposit', `${o.depositDays} business days from execution`)}
          ${termRow('Closing', `On or before ${o.closingDays} days`)}
          ${termRow('Contingencies', o.contingencies)}
          ${termRow('Appraisal', o.appraisal)}
          ${termRow('Title & Escrow', o.titleEscrow)}
          ${termRow('Survey', o.survey)}
          ${termRow('Possession', o.possession)}
        </table>
      </div>
    </div>

    <div class="notes">
      <div class="notes-h">Notes on this Offer</div>
      ${notesHtml}
    </div>

    <div class="footer">
      <div class="foot-l">
        <div class="foot-h">Prepared For</div>
        <div class="foot-name">${esc(o.preparedForName)}</div>
        ${o.preparedForNames ? `<div>${esc(o.preparedForNames)}</div>` : ''}
        ${o.preparedForCity ? `<div class="foot-it">${esc(o.preparedForCity)}</div>` : ''}
      </div>
      <div class="foot-r">
        <div class="foot-h">Presented By</div>
        <div class="foot-name">${esc(o.buyerEntity)}</div>
        ${o.validThrough ? `<div class="foot-it">Offer valid through ${esc(o.validThrough)}</div>` : ''}
      </div>
    </div>
    <div class="pageno">Non-binding, subject to definitive contract &nbsp;&nbsp; Page 1 of 2</div>
  </div>

  <!-- PAGE 2: EXHIBIT A -->
  <div class="page">
    <div class="hdr"><div class="hdr-frame">
      <div class="hdr-title">Exhibit A</div>
      <div class="hdr-sub">Aerial &amp; Boundary</div>
    </div></div>
    <div class="rust-bar"></div>

    <div class="prop-title">${esc(o.propTitle)}</div>
    <div class="prop-sub">${esc(o.countyState)}${o.apn ? ` • Parcel ${esc(o.apn)}` : ''}${o.namesOnDeed ? `, ${esc(o.namesOnDeed)}` : ''}</div>

    ${mapImgBig}
    <div class="map-cap center">Subject tract shown outlined.${o.gisAcres ? ` Approximately ${acres(o.gisAcres)} GIS acres${o.deededAcres ? `, ${acres(o.deededAcres)} deeded` : ''}.` : ''} Boundary shown is approximate and for illustration only.</div>

    <div class="stats">
      <div class="stat"><div class="stat-l">GIS Acres</div><div class="stat-v">${esc(acres(o.gisAcres) || '—')}</div></div>
      <div class="stat"><div class="stat-l">Deeded</div><div class="stat-v">${esc(acres(o.deededAcres) || '—')}</div></div>
      <div class="stat"><div class="stat-l">Offer</div><div class="stat-v">${esc(money(o.price) || '—')}</div></div>
      <div class="stat"><div class="stat-l">Per Acre</div><div class="stat-v">${esc(o.perAcre > 0 ? money(o.perAcre) : '—')}</div></div>
    </div>

    <div class="footer">
      <div class="foot-l">
        <div class="foot-h">Exhibit A</div>
        <div class="foot-name">Aerial &amp; Boundary Exhibit</div>
        <div class="foot-it">Attached to and made part of the Offer Summary${o.presentedDate ? ` dated ${esc(o.presentedDate)}` : ''}</div>
      </div>
      <div class="foot-r">
        <div class="foot-name">${esc(o.buyerEntity)}</div>
        <div class="foot-it">Page 2 of 2</div>
      </div>
    </div>
  </div>

</body></html>`;
}
