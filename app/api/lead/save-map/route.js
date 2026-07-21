import { NextResponse } from 'next/server';
import { generateAndSaveLeadMap } from '@/lib/leadMap';

// POST /api/lead/save-map
// Body: { leadId, apn?, fips?, state?, county?, geometry? }
// Generates a satellite + parcel-boundary map from the parcel and saves it to
// the lead's map slot, flagging map_uploaded=true. Replaces manual screenshots.
export async function POST(request) {
  try {
    const { leadId, apn, fips, state, county, geometry } = await request.json();
    if (!leadId) return NextResponse.json({ ok: false, error: 'Missing leadId' }, { status: 400 });
    const { url, reason } = await generateAndSaveLeadMap({ leadId, apn, fips, state, county, geometry });
    if (!url) {
      const msg = reason === 'no_boundary_coverage'
        ? 'No parcel boundary available for this parcel (no coverage). Upload a screenshot instead.'
        : (reason || 'Could not generate map');
      return NextResponse.json({ ok: false, error: msg }, { status: reason === 'no_boundary_coverage' ? 404 : 500 });
    }
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    console.error('[lead save-map]', err);
    return NextResponse.json({ ok: false, error: err.message || 'Failed' }, { status: 500 });
  }
}
