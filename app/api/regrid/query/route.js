import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get('lat');
    const lon = searchParams.get('lon');

    if (!lat || !lon) {
      return NextResponse.json({
        success: false,
        message: 'Latitude and longitude are required'
      }, { status: 400 });
    }

    const token = process.env.REGRID_TOKEN || process.env.NEXT_PUBLIC_REGRID_TOKEN;

    console.log('🖱️ Regrid Tile Query at:', { lat, lon });

    // Use Regrid's parcel endpoint with lat/lon
    const response = await fetch(
      `https://app.regrid.com/api/v1/parcel.json?lat=${lat}&lon=${lon}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Regrid API error: ${response.status}`);
    }

    const data = await response.json();

    // Format the response to match our expected structure
    if (data.parcels && data.parcels.length > 0) {
      const results = data.parcels.map(parcel => ({
        properties: {
          address: parcel.properties?.fields?.address || '',
          city: parcel.properties?.fields?.city || parcel.properties?.fields?.scity || '',
          state: parcel.properties?.fields?.state2 || '',
          zip: parcel.properties?.fields?.szip5 || parcel.properties?.fields?.szip || '',
          county: parcel.properties?.fields?.county || '',
          acres: parcel.properties?.fields?.ll_gisacre || parcel.properties?.fields?.gisacre || '',
          apn: parcel.properties?.fields?.parcelnumb || parcel.properties?.fields?.alt_parcelnumb1 || '',
          owner: parcel.properties?.fields?.owner || ''
        },
        geometry: parcel.geometry
      }));

      return NextResponse.json({
        success: true,
        results
      });
    } else {
      return NextResponse.json({
        success: true,
        results: []
      });
    }
  } catch (error) {
    console.error('Regrid tile query error:', error);
    return NextResponse.json({
      success: false,
      message: error.message,
      results: []
    }, { status: 500 });
  }
}
