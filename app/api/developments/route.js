import { NextResponse } from 'next/server';

/**
 * GET /api/developments
 * Fetch recent development/permit data from city open data portals
 * Query params:
 *   - cities: comma-separated list (austin,dallas,houston)
 *   - limit: number of results per city (default 50)
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const citiesParam = searchParams.get('cities') || 'austin,dallas,houston';
    const limit = parseInt(searchParams.get('limit') || '50');

    const cities = citiesParam.split(',').map(c => c.trim().toLowerCase());

    const allDevelopments = [];

    // Fetch data for each city
    for (const city of cities) {
      try {
        const developments = await fetchCityDevelopments(city, limit);
        allDevelopments.push(...developments);
      } catch (error) {
        console.error(`Error fetching ${city} data:`, error.message);
        // Continue with other cities even if one fails
      }
    }

    return NextResponse.json({
      success: true,
      count: allDevelopments.length,
      developments: allDevelopments
    });

  } catch (error) {
    console.error('Error fetching developments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch development data' },
      { status: 500 }
    );
  }
}

async function fetchCityDevelopments(city, limit) {
  switch (city) {
    case 'austin':
      return fetchAustinPermits(limit);
    case 'dallas':
      return fetchDallasPermits(limit);
    case 'houston':
      return fetchHoustonPermits(limit);
    default:
      return [];
  }
}

/**
 * Fetch Austin development proposals using AI document parsing
 * Analyzes city council agendas and planning documents
 */
async function fetchAustinPermits(limit) {
  try {
    // For now, use Austin's zoning cases and subdivision data
    // These are closer to real development proposals
    const zoningUrl = `https://data.austintexas.gov/resource/jctp-ykk8.json?$limit=100&$order=status_date DESC`;

    const response = await fetch(zoningUrl);
    if (!response.ok) {
      console.error('Austin zoning API failed');
      return [];
    }

    const data = await response.json();

    // Filter and map zoning cases to development proposals
    const developments = [];
    for (const item of data) {
      // Only include significant commercial/residential developments
      const caseType = (item.case_type || '').toUpperCase();
      const description = (item.case_description || '').toLowerCase();

      if (caseType.includes('SITE PLAN') ||
          caseType.includes('SUBDIVISION') ||
          caseType.includes('PUD') ||
          description.includes('commercial') ||
          description.includes('multifamily') ||
          description.includes('apartment') ||
          description.includes('subdivision')) {

        // Try to geocode the location
        let coords = null;
        if (item.latitude && item.longitude) {
          coords = {
            lat: parseFloat(item.latitude),
            lng: parseFloat(item.longitude)
          };
        } else if (item.address) {
          coords = await geocodeAddress(item.address);
        }

        if (coords) {
          developments.push({
            id: `austin-${item.case_number}`,
            city: 'Austin',
            state: 'TX',
            type: item.case_type || 'Development Proposal',
            description: item.case_description || item.project_name || 'Development Project',
            address: item.address || item.location_description || 'Location not specified',
            latitude: coords.lat,
            longitude: coords.lng,
            value: null,
            issueDate: item.status_date || item.application_date,
            status: item.status || 'Under Review',
            source: 'Austin Planning & Zoning',
            caseNumber: item.case_number
          });
        }
      }

      if (developments.length >= limit) break;
    }

    console.log(`✅ Found ${developments.length} Austin development proposals`);
    return developments;

  } catch (error) {
    console.error('Austin fetch error:', error);
    return [];
  }
}

// Simple geocoding function
async function geocodeAddress(address, city = 'Austin', state = 'TX') {
  try {
    const fullAddress = `${address}, ${city}, ${state}`;
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(fullAddress)}.json?access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}&limit=1`;

    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    if (data.features && data.features.length > 0) {
      const [lng, lat] = data.features[0].center;
      return { lat, lng };
    }
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

/**
 * Fetch Dallas major development permits
 * Data source: https://www.dallasopendata.com
 * Filters for significant commercial/multifamily projects only
 */
async function fetchDallasPermits(limit) {
  try {
    // Fetch more records to filter down to major developments
    const url = `https://www.dallasopendata.com/resource/5qod-7kea.json?$limit=500&$order=issued_date DESC&$where=issued_date>'${getDateMonthsAgo(12)}'`;

    const response = await fetch(url);
    if (!response.ok) {
      console.error('Dallas API failed');
      return [];
    }

    const data = await response.json();

    const developments = [];
    for (const permit of data) {
      if (!permit.latitude || !permit.longitude) continue;

      const cost = permit.construction_cost ? parseInt(permit.construction_cost) : 0;
      const permitType = (permit.permit_type || '').toUpperCase();
      const workDesc = (permit.work_description || '').toLowerCase();

      // Filter for major developments:
      // - Construction cost > $500k
      // - Commercial, multifamily, or subdivision permits
      const isMajorDevelopment =
        cost > 500000 ||
        permitType.includes('COMMERCIAL') ||
        permitType.includes('MULTIFAMILY') ||
        permitType.includes('APARTMENT') ||
        workDesc.includes('commercial') ||
        workDesc.includes('multifamily') ||
        workDesc.includes('apartment') ||
        workDesc.includes('subdivision') ||
        workDesc.includes('shopping center') ||
        workDesc.includes('office building');

      if (isMajorDevelopment) {
        developments.push({
          id: `dallas-${permit.permit_number}`,
          city: 'Dallas',
          state: 'TX',
          type: permit.permit_type || 'Development Project',
          description: permit.work_description || 'Major Development',
          address: permit.address || 'Address not available',
          latitude: parseFloat(permit.latitude),
          longitude: parseFloat(permit.longitude),
          value: cost > 0 ? `$${cost.toLocaleString()}` : null,
          issueDate: permit.issued_date,
          status: permit.status || 'Active',
          source: 'Dallas Open Data',
          permitNumber: permit.permit_number
        });
      }

      if (developments.length >= limit) break;
    }

    console.log(`✅ Found ${developments.length} Dallas major developments`);
    return developments;

  } catch (error) {
    console.error('Dallas fetch error:', error);
    return [];
  }
}

/**
 * Fetch Houston building permits
 * Data source: http://cohgis-mycity.opendata.arcgis.com
 */
async function fetchHoustonPermits(limit) {
  try {
    // Houston uses ArcGIS REST API
    const url = `https://services.arcgis.com/su8ic9KbA7PYVxPS/arcgis/rest/services/Building_Permits/FeatureServer/0/query?where=ISSUE_DATE>'${getDateMonthsAgo(6)}'&outFields=*&returnGeometry=true&f=json&resultRecordCount=${limit}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error('Houston API failed');

    const data = await response.json();

    if (!data.features) return [];

    return data.features
      .filter(feature => feature.geometry && feature.geometry.y && feature.geometry.x)
      .map(feature => {
        const attrs = feature.attributes;
        return {
          id: `houston-${attrs.PERMIT_NUMBER}`,
          city: 'Houston',
          state: 'TX',
          type: attrs.PERMIT_TYPE || 'Building Permit',
          description: attrs.PROJECT_DESC || attrs.WORK_DESC || 'Development Project',
          address: attrs.ADDRESS || 'Address not available',
          latitude: feature.geometry.y,
          longitude: feature.geometry.x,
          value: attrs.CONSTRUCTION_COST ? `$${parseInt(attrs.CONSTRUCTION_COST).toLocaleString()}` : null,
          issueDate: attrs.ISSUE_DATE,
          status: attrs.STATUS || 'Active',
          source: 'Houston GIS Open Data',
          permitNumber: attrs.PERMIT_NUMBER
        };
      });
  } catch (error) {
    console.error('Houston fetch error:', error);
    return [];
  }
}

/**
 * Get date string for X months ago (YYYY-MM-DD format)
 */
function getDateMonthsAgo(months) {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.toISOString().split('T')[0];
}
