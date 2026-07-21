import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { abbrByFips } from '@/lib/usStates';
import { generateAndSaveLeadMap } from '@/lib/leadMap';

// POST /api/landportal/push-lead
// Push an OM Search listing into the CRM as a Subdivision Inflow lead so it can
// be worked. Body: { property: {property_id, owner_full_name, street_address,
// apn, fips, lot_size_acres, county, state}, geometry? }
// - Dedupes by parcel (APN + fips): re-pushing an already-pushed parcel returns
//   the existing lead instead of creating a duplicate.
// - Auto-saves the parcel map (Regrid where covered, or the passed LP geometry).
// - Schedules the daily rundown, same as the subdivision create flow.
export async function POST(request) {
  try {
    const { property = {}, geometry } = await request.json();
    const apn = String(property.apn || '').trim();
    const fips = String(property.fips || '').trim();
    const county = property.county || '';
    const state = property.state || abbrByFips[fips.slice(0, 2)] || '';
    const owner = property.owner_full_name || 'Owner unknown';
    const acres = property.lot_size_acres != null ? Number(property.lot_size_acres) : null;
    if (!apn && !property.property_id) return NextResponse.json({ ok: false, error: 'Missing parcel identity' }, { status: 400 });

    const sb = supabaseAdmin();

    // Dedupe: same parcel already pushed?
    let existing = null;
    if (apn) {
      const { data } = await sb.from('leads').select('id, map_uploaded').eq('parcel_id', apn).limit(1);
      existing = data?.[0] || null;
    }
    if (!existing && property.property_id) {
      const { data } = await sb.from('leads').select('id, map_uploaded').eq('source', 'subdivision').contains('form_data', { lp_property_id: String(property.property_id) }).limit(1);
      existing = data?.[0] || null;
    }

    let leadId = existing?.id;
    if (!leadId) {
      const { data: lead, error } = await sb.from('leads').insert([{
        name: owner,
        full_name: owner,
        email: 'omsearch@parcelreach.com',
        phone: 'N/A',
        address: property.street_address || `${county}, ${state}`,
        city: county,
        property_county: county,
        county,
        property_state: state,
        state,
        acres,
        acreage: acres,
        parcel_id: apn || null,
        source: 'subdivision',
        status: 'new',
        form_data: {
          origin: 'om_search',
          lp_property_id: property.property_id ? String(property.property_id) : null,
          listing_owner: owner,
          agentName: '', agentPhone: '', agentEmail: '',
        },
      }]).select().single();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      leadId = lead.id;

      // Daily rundown, mirroring the subdivision create flow.
      const at5 = new Date(); at5.setHours(17, 0, 0, 0);
      await sb.from('scheduled_tasks').insert([{ lead_id: leadId, status: 'pending', scheduled_for: at5.toISOString() }]).then(() => {}, () => {});
    }

    // Auto-save the parcel map (best-effort; no coverage just means no map yet).
    let mapped = !!existing?.map_uploaded;
    try {
      const { url } = await generateAndSaveLeadMap({ leadId, geometry, apn, fips, state, county });
      if (url) mapped = true;
    } catch { /* map optional */ }

    return NextResponse.json({ ok: true, leadId, existing: !!existing, mapped });
  } catch (err) {
    console.error('[landportal push-lead]', err);
    return NextResponse.json({ ok: false, error: err.message || 'Push failed' }, { status: 500 });
  }
}
