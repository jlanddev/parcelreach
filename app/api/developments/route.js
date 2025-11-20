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
 * Fetch Austin development projects
 * Focus on: Subdivisions, Commercial, Multifamily, Major developments
 * Data source: https://data.austintexas.gov
 */
async function fetchAustinPermits(limit) {
  try {
    // Austin subdivision plats and major developments
    // Filter for: Commercial, Multifamily, Subdivision plats
    const url = `https://data.austintexas.gov/resource/3syk-w9eu.json?$limit=${limit}&$order=issue_date DESC&$where=issue_date>'${getDateMonthsAgo(12)}' AND (permit_type_desc LIKE '%COMMERCIAL%' OR permit_type_desc LIKE '%MULTIFAMILY%' OR permit_type_desc LIKE '%SUBDIVISION%' OR work_class LIKE '%NEW BUILDING%')`;

    const response = await fetch(url);
    if (!response.ok) throw new Error('Austin API failed');

    const data = await response.json();

    return data
      .filter(permit =>
        permit.latitude &&
        permit.longitude &&
        // Filter for significant projects only
        (permit.total_existing_bldg_sqft > 5000 ||
         permit.permit_type_desc?.includes('COMMERCIAL') ||
         permit.permit_type_desc?.includes('MULTIFAMILY') ||
         permit.permit_type_desc?.includes('SUBDIVISION'))
      )
      .map(permit => ({
        id: `austin-${permit.permit_number}`,
        city: 'Austin',
        state: 'TX',
        type: permit.permit_type_desc || 'Development Project',
        description: permit.description || permit.work_class || 'Major Development',
        address: permit.original_address1 || 'Address not available',
        latitude: parseFloat(permit.latitude),
        longitude: parseFloat(permit.longitude),
        value: permit.total_existing_bldg_sqft ? `${parseInt(permit.total_existing_bldg_sqft).toLocaleString()} sqft` : null,
        issueDate: permit.issue_date,
        status: permit.status_current || 'Active',
        source: 'Austin Development Data',
        permitNumber: permit.permit_number
      }));
  } catch (error) {
    console.error('Austin fetch error:', error);
    return [];
  }
}

/**
 * Fetch Dallas building permits
 * Data source: https://www.dallasopendata.com
 */
async function fetchDallasPermits(limit) {
  try {
    // Dallas Open Data API
    const url = `https://www.dallasopendata.com/resource/5qod-7kea.json?$limit=${limit}&$order=issued_date DESC&$where=issued_date>'${getDateMonthsAgo(6)}'`;

    const response = await fetch(url);
    if (!response.ok) throw new Error('Dallas API failed');

    const data = await response.json();

    return data
      .filter(permit => permit.latitude && permit.longitude)
      .map(permit => ({
        id: `dallas-${permit.permit_number}`,
        city: 'Dallas',
        state: 'TX',
        type: permit.permit_type || 'Building Permit',
        description: permit.work_description || 'Development Project',
        address: permit.address || 'Address not available',
        latitude: parseFloat(permit.latitude),
        longitude: parseFloat(permit.longitude),
        value: permit.construction_cost ? `$${parseInt(permit.construction_cost).toLocaleString()}` : null,
        issueDate: permit.issued_date,
        status: permit.status || 'Active',
        source: 'Dallas Open Data',
        permitNumber: permit.permit_number
      }));
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
