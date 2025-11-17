import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');
    const apn = searchParams.get('apn');
    const county = searchParams.get('county');

    if (!address && !apn) {
      return NextResponse.json({
        success: false,
        message: 'Address or APN is required'
      }, { status: 400 });
    }

    const token = process.env.REGRID_TOKEN || process.env.NEXT_PUBLIC_REGRID_TOKEN;
    let data;

    // Use different endpoints based on input type
    if (apn) {
      // APN lookup - use search endpoint with ONLY the parcel number
      console.log('🎯 Using APN search for:', apn);
      const response = await fetch(
        `https://app.regrid.com/api/v1/search.json?query=${encodeURIComponent(apn)}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Regrid API error: ${response.status}`);
      }

      data = await response.json();
    } else {
      // Address search - can return multiple parcels (10+ API calls)
      console.log('📍 Using search endpoint for:', address);
      const response = await fetch(
        `https://app.regrid.com/api/v1/search.json?query=${encodeURIComponent(address)}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Regrid API error: ${response.status}`);
      }

      data = await response.json();
    }

    // Return results in the format expected by frontend
    if (data.results && data.results.length > 0) {
      // Filter by county if provided
      let filteredResults = data.results;
      if (county && county.trim()) {
        console.log('🔍 Filtering results for county:', county);
        filteredResults = data.results.filter(result => {
          const resultCounty = result.properties?.fields?.county?.toLowerCase() || '';
          const searchCounty = county.toLowerCase().trim();
          const matches = resultCounty.includes(searchCounty);
          console.log(`  County match: "${resultCounty}" ${matches ? '✅' : '❌'} "${searchCounty}"`);
          return matches;
        });
        console.log(`  Filtered from ${data.results.length} to ${filteredResults.length} results`);
      }

      const results = filteredResults.slice(0, 10).map(result => ({
        properties: {
          address: result.properties?.fields?.address || '',
          city: result.properties?.fields?.city || result.properties?.fields?.scity || '',
          state: result.properties?.fields?.state2 || '',
          zip: result.properties?.fields?.szip5 || result.properties?.fields?.szip || '',
          county: result.properties?.fields?.county || '',
          acres: result.properties?.fields?.ll_gisacre || result.properties?.fields?.gisacre || '',
          apn: result.properties?.fields?.parcelnumb || result.properties?.fields?.alt_parcelnumb1 || '',
          owner: result.properties?.fields?.owner || ''
        },
        geometry: result.geometry // Include the parcel boundary geometry
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
    console.error('Regrid lookup error:', error);
    return NextResponse.json({
      success: false,
      message: error.message,
      results: []
    }, { status: 500 });
  }
}
