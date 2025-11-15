'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Mapbox token from environment variable
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

export default function LeadsMap({ leads = [] }) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markers = useRef([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [selectedParcel, setSelectedParcel] = useState(null);
  const [is3D, setIs3D] = useState(false);
  const parcelsLoaded = useRef(false);

  // Geocode address using Nominatim (free, no API key needed)
  const geocodeAddress = async (address, city, zip) => {
    try {
      const query = `${address}, ${city}, TX ${zip}`;
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`
      );
      const data = await response.json();
      if (data && data.length > 0) {
        return {
          lng: parseFloat(data[0].lon),
          lat: parseFloat(data[0].lat)
        };
      }
    } catch (error) {
      console.error('Geocoding error:', error);
    }
    return null;
  };

  // Fetch parcel data from Regrid API
  const fetchParcelData = async (lat, lng, leadStatus) => {
    try {
      const token = process.env.NEXT_PUBLIC_REGRID_TOKEN;
      if (!token) {
        console.log('No Regrid token found');
        return null;
      }

      // Regrid v2 API endpoint - correct format with query params
      const url = `https://app.regrid.com/api/v2/parcels/point?lat=${lat}&lon=${lng}&token=${token}&return_geometry=true`;
      console.log('Fetching parcel:', url.replace(token, 'TOKEN'));

      const response = await fetch(url, {
        headers: {
          'accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Regrid API error:', response.status, response.statusText, errorText);
        return null;
      }

      const data = await response.json();
      console.log('Regrid response for', lat, lng, ':', data);

      // Response format: { parcels: { type: "FeatureCollection", features: [...] } }
      if (data && data.parcels && data.parcels.features && data.parcels.features.length > 0) {
        const parcel = data.parcels.features[0];
        // Add status to parcel for color coding
        if (!parcel.properties) parcel.properties = {};
        parcel.properties.leadStatus = leadStatus;
        console.log('Successfully fetched parcel:', parcel.properties.headline || 'no address');
        return parcel;
      } else {
        console.log('No parcels found for coords:', lat, lng);
      }
    } catch (error) {
      console.error('Regrid API error:', error);
    }
    return null;
  };

  // Get marker color based on lead status
  const getMarkerColor = (status) => {
    switch (status) {
      case 'new':
        return '#3B82F6'; // Bright blue
      case 'called':
        return '#F59E0B'; // Orange/yellow
      case 'scheduled':
        return '#10B981'; // Bright green
      case 'completed':
        return '#6B7280'; // Gray
      case 'lost':
        return '#EF4444'; // Red
      default:
        return '#3B82F6';
    }
  };

  useEffect(() => {
    if (map.current) return; // Initialize map only once

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12', // High-end satellite view
      center: [-96.7970, 32.7767], // Dallas, TX (Dallas County - included in trial)
      zoom: 11,
      pitch: 0, // Start flat, toggle for 3D
      bearing: 0
    });

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Add fullscreen control
    map.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');

    // Smooth transitions and click-to-highlight parcel
    map.current.on('load', () => {
      map.current.resize();

      // Add Regrid vector tile layer for all parcels (if tiles API is available)
      const token = process.env.NEXT_PUBLIC_REGRID_TOKEN;
      if (token) {
        try {
          map.current.addSource('regrid-parcels', {
            type: 'vector',
            tiles: [`https://tiles.regrid.com/api/v1/parcels/{z}/{x}/{y}.mvt?token=${token}`],
            minzoom: 10,
            maxzoom: 22
          });

          // Add parcel fill layer
          map.current.addLayer({
            id: 'regrid-parcel-fill',
            type: 'fill',
            source: 'regrid-parcels',
            'source-layer': 'parcels',
            paint: {
              'fill-color': '#ffffff',
              'fill-opacity': 0.05
            }
          });

          // Add parcel borders
          map.current.addLayer({
            id: 'regrid-parcel-borders',
            type: 'line',
            source: 'regrid-parcels',
            'source-layer': 'parcels',
            paint: {
              'line-color': '#88ccff',
              'line-width': 1,
              'line-opacity': 0.5
            }
          });

          console.log('✅ Regrid vector tile layer added');
        } catch (error) {
          console.error('❌ Failed to add Regrid vector tiles (may require tiles API subscription):', error);
        }
      }

      // Add empty source for clicked parcel
      map.current.addSource('clicked-parcel', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });

      // Add fill layer for clicked parcel
      map.current.addLayer({
        id: 'clicked-parcel-fill',
        type: 'fill',
        source: 'clicked-parcel',
        paint: {
          'fill-color': '#FF0000',
          'fill-opacity': 0.3
        }
      });

      // Add outline layer for clicked parcel
      map.current.addLayer({
        id: 'clicked-parcel-outline',
        type: 'line',
        source: 'clicked-parcel',
        paint: {
          'line-color': '#FF0000',
          'line-width': 3,
          'line-opacity': 1
        }
      });

      // Add hover cursor for parcel layers
      map.current.on('mouseenter', 'regrid-parcel-fill', () => {
        map.current.getCanvas().style.cursor = 'pointer';
      });
      map.current.on('mouseleave', 'regrid-parcel-fill', () => {
        map.current.getCanvas().style.cursor = '';
      });

      // Click handler for vector tile parcels
      map.current.on('click', 'regrid-parcel-fill', async (e) => {
        if (e.features && e.features.length > 0) {
          const feature = e.features[0];
          const { lng, lat } = e.lngLat;

          console.log('🗺️ Parcel clicked:', feature.properties);

          const token = process.env.NEXT_PUBLIC_REGRID_TOKEN;
          if (!token) return;

          // Show loading state
          map.current.getCanvas().style.cursor = 'wait';

          try {
            // Fetch full parcel data with geometry
            const url = `https://app.regrid.com/api/v2/parcels/point?lat=${lat}&lon=${lng}&token=${token}&return_geometry=true`;
            const response = await fetch(url);

            if (response.ok) {
              const data = await response.json();

              if (data && data.parcels && data.parcels.features && data.parcels.features.length > 0) {
                const parcel = data.parcels.features[0];
                console.log('✅ Parcel data fetched:', parcel.properties.headline || 'No address');

                // Update the clicked-parcel source with the full geometry
                const source = map.current.getSource('clicked-parcel');
                if (source) {
                  source.setData({
                    type: 'FeatureCollection',
                    features: [parcel]
                  });
                }

                // Find associated lead if any (match by address or coordinates)
                const associatedLead = leads.find(lead => {
                  const parcelAddress = parcel.properties.headline?.toLowerCase() || '';
                  const leadAddress = `${lead.address} ${lead.city}`.toLowerCase();

                  // Check if addresses match or coordinates are very close
                  if (parcelAddress.includes(lead.address.toLowerCase())) return true;

                  if (lead.latitude && lead.longitude) {
                    const distance = Math.sqrt(
                      Math.pow(lead.latitude - lat, 2) +
                      Math.pow(lead.longitude - lng, 2)
                    );
                    return distance < 0.0001; // Very close coordinates
                  }

                  return false;
                });

                // Set selected parcel with associated lead data
                setSelectedParcel({
                  parcel,
                  lead: associatedLead || null
                });
              }
            }
          } catch (error) {
            console.error('❌ Error fetching parcel:', error);
          } finally {
            map.current.getCanvas().style.cursor = 'pointer';
          }
        }
      });

      console.log('✅ Click-to-highlight parcel feature ready!');
    });
  }, [leads]);

  // Toggle 3D view
  const toggle3D = () => {
    if (!map.current) return;
    const newIs3D = !is3D;
    setIs3D(newIs3D);

    map.current.easeTo({
      pitch: newIs3D ? 60 : 0,
      duration: 1000
    });
  };

  // Update markers and parcels when leads change
  useEffect(() => {
    if (!map.current) return;

    const loadLeadsAndParcels = async () => {
      // Clear existing markers
      markers.current.forEach(marker => marker.remove());
      markers.current = [];

      // Remove existing parcel layers and sources
      if (map.current.getLayer('parcels-fill')) {
        map.current.removeLayer('parcels-fill');
      }
      if (map.current.getLayer('parcels-outline')) {
        map.current.removeLayer('parcels-outline');
      }
      if (map.current.getSource('parcels')) {
        map.current.removeSource('parcels');
      }

      // Process all leads and fetch parcels
      const parcelPromises = leads.map(async (lead) => {
        // Get coordinates
        let coords = null;
        if (!lead.latitude || !lead.longitude) {
          coords = await geocodeAddress(lead.address, lead.city || 'Dallas', lead.zip);
        } else {
          coords = { lng: lead.longitude, lat: lead.latitude };
        }

        if (!coords) {
          console.log('No coords for lead:', lead.name);
          return { coords: null, parcel: null, lead };
        }

        // Fetch parcel data
        const parcel = await fetchParcelData(coords.lat, coords.lng, lead.status);
        console.log('Fetched parcel for', lead.name, ':', parcel ? 'success' : 'failed');

        return { coords, parcel, lead };
      });

      const results = await Promise.all(parcelPromises);

      const parcelFeatures = [];

      // Add markers and collect parcels
      results.forEach(({ coords, parcel, lead }) => {
        if (!coords) return;

        // Collect parcel if available
        if (parcel) {
          parcelFeatures.push(parcel);
        }

        // Create premium marker with label
        const el = document.createElement('div');
        el.className = 'premium-marker';
        el.innerHTML = `
          <div style="
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            cursor: pointer;
          ">
            <div style="
              background: ${getMarkerColor(lead.status)};
              width: 14px;
              height: 14px;
              border-radius: 50%;
              border: 3px solid rgba(255,255,255,0.95);
              box-shadow: 0 4px 12px rgba(0,0,0,0.4), 0 0 0 4px rgba(${
                lead.status === 'new' ? '59, 130, 246' :
                lead.status === 'scheduled' ? '16, 185, 129' :
                lead.status === 'called' ? '245, 158, 11' : '107, 114, 128'
              }, 0.2);
              ${lead.status === 'new' ? 'animation: premiumPulse 2s infinite;' : ''}
            "></div>
            <div style="
              background: rgba(0, 0, 0, 0.85);
              backdrop-filter: blur(10px);
              color: white;
              padding: 4px 10px;
              border-radius: 6px;
              font-size: 11px;
              font-weight: 600;
              margin-top: 6px;
              white-space: nowrap;
              box-shadow: 0 2px 8px rgba(0,0,0,0.3);
              border: 1px solid rgba(255,255,255,0.1);
            ">${lead.name}</div>
          </div>
        `;

        // Create marker
        const marker = new mapboxgl.Marker(el)
          .setLngLat([coords.lng, coords.lat])
          .addTo(map.current);

        // Add click event
        el.addEventListener('click', () => {
          setSelectedLead(lead);
        });

        markers.current.push(marker);
      });

      // Add parcel boundaries to map
      if (parcelFeatures.length > 0 && map.current) {
        console.log('Adding', parcelFeatures.length, 'parcels to map');

        map.current.addSource('parcels', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: parcelFeatures
          }
        });

        // Add fill layer
        map.current.addLayer({
          id: 'parcels-fill',
          type: 'fill',
          source: 'parcels',
          paint: {
            'fill-color': [
              'match',
              ['get', 'leadStatus'],
              'new', '#3B82F6',
              'called', '#F59E0B',
              'scheduled', '#10B981',
              'completed', '#6B7280',
              '#EF4444'
            ],
            'fill-opacity': 0.15
          }
        });

        // Add outline layer
        map.current.addLayer({
          id: 'parcels-outline',
          type: 'line',
          source: 'parcels',
          paint: {
            'line-color': [
              'match',
              ['get', 'leadStatus'],
              'new', '#3B82F6',
              'called', '#F59E0B',
              'scheduled', '#10B981',
              'completed', '#6B7280',
              '#EF4444'
            ],
            'line-width': 2.5,
            'line-opacity': 0.8
          }
        });
      } else {
        console.log('No parcels to display');
      }
    };

    loadLeadsAndParcels();
  }, [leads]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full rounded-lg" />

      {/* 3D Toggle Button */}
      <button
        onClick={toggle3D}
        className={`absolute top-4 left-4 z-10 px-4 py-2 rounded-lg font-semibold shadow-lg transition-all ${
          is3D
            ? 'bg-blue-500 text-white hover:bg-blue-600'
            : 'bg-white/95 text-gray-700 hover:bg-white border border-gray-300'
        }`}
      >
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
          <span>{is3D ? '2D View' : '3D View'}</span>
        </div>
      </button>

      {/* Premium animations CSS */}
      <style jsx global>{`
        @keyframes premiumPulse {
          0% {
            box-shadow: 0 4px 12px rgba(0,0,0,0.4), 0 0 0 4px rgba(59, 130, 246, 0.2), 0 0 0 0 rgba(59, 130, 246, 0.4);
          }
          50% {
            box-shadow: 0 4px 12px rgba(0,0,0,0.4), 0 0 0 4px rgba(59, 130, 246, 0.2), 0 0 0 12px rgba(59, 130, 246, 0);
          }
          100% {
            box-shadow: 0 4px 12px rgba(0,0,0,0.4), 0 0 0 4px rgba(59, 130, 246, 0.2), 0 0 0 0 rgba(59, 130, 246, 0);
          }
        }
      `}</style>

      {/* Premium Lead details popup */}
      {selectedLead && (
        <div className="absolute top-6 right-6 bg-white/95 backdrop-blur-lg rounded-xl shadow-2xl p-5 max-w-sm z-10 border border-gray-200">
          <button
            onClick={() => setSelectedLead(null)}
            className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: getMarkerColor(selectedLead.status) }}
              />
              <span className="font-bold text-lg text-gray-900">{selectedLead.name}</span>
            </div>

            <div className="space-y-2 text-sm text-gray-700">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                {selectedLead.phone}
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {selectedLead.address}, {selectedLead.city} {selectedLead.zip}
              </div>
            </div>

            <div className="text-sm bg-gray-50 rounded-lg p-3">
              <div className="font-semibold text-gray-900 mb-1">Issue Description</div>
              <div className="text-gray-700">{selectedLead.issue_description}</div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                selectedLead.status === 'new' ? 'bg-blue-500 text-white' :
                selectedLead.status === 'scheduled' ? 'bg-green-500 text-white' :
                selectedLead.status === 'called' ? 'bg-yellow-500 text-white' :
                'bg-gray-500 text-white'
              }`}>
                {selectedLead.status.toUpperCase()}
              </span>
              <span className="text-xs text-gray-500">
                {new Date(selectedLead.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Property Summary Panel */}
      {selectedParcel && (
        <div className="absolute top-6 right-6 w-80 bg-gradient-to-b from-slate-900 to-slate-800 backdrop-blur-lg rounded-xl shadow-2xl border border-slate-700/50 z-20 overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <h3 className="text-white font-bold">Property Summary</h3>
            </div>
            <button
              onClick={() => {
                setSelectedParcel(null);
                // Clear the highlighted parcel
                const source = map.current.getSource('clicked-parcel');
                if (source) {
                  source.setData({
                    type: 'FeatureCollection',
                    features: []
                  });
                }
              }}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Parcel Details */}
          <div className="p-4 space-y-3 text-sm max-h-[calc(100vh-120px)] overflow-y-auto">
            <div className="space-y-2">
              <div className="flex justify-between items-center py-2 border-b border-slate-700/30">
                <span className="text-slate-400">Location</span>
                <span className="text-white font-medium text-right">
                  {selectedParcel.parcel.properties.fields?.county || 'Unknown'}, TX
                </span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-slate-700/30">
                <span className="text-slate-400">Acres</span>
                <span className="text-white font-medium">
                  {selectedParcel.parcel.properties.fields?.acres?.toFixed(2) || 'N/A'}
                </span>
              </div>

              {selectedParcel.parcel.properties.fields?.ll_gisacre && (
                <div className="flex justify-between items-center py-2 border-b border-slate-700/30">
                  <span className="text-slate-400">GIS Acres</span>
                  <span className="text-white font-medium">
                    {selectedParcel.parcel.properties.fields.ll_gisacre.toFixed(2)}
                  </span>
                </div>
              )}

              {selectedParcel.parcel.properties.fields?.sqft && (
                <div className="flex justify-between items-center py-2 border-b border-slate-700/30">
                  <span className="text-slate-400">Lot Size (sqft)</span>
                  <span className="text-white font-medium">
                    {selectedParcel.parcel.properties.fields.sqft.toLocaleString()}
                  </span>
                </div>
              )}

              <div className="flex justify-between items-center py-2 border-b border-slate-700/30">
                <span className="text-slate-400">Parcel #</span>
                <span className="text-white font-medium">
                  {selectedParcel.parcel.properties.fields?.parcelnumb || 'N/A'}
                </span>
              </div>

              {selectedParcel.parcel.properties.fields?.usedesc && (
                <div className="py-2 border-b border-slate-700/30">
                  <div className="text-slate-400 mb-1">Land Use</div>
                  <div className="text-white font-medium">
                    {selectedParcel.parcel.properties.fields.usedesc}
                  </div>
                </div>
              )}

              {selectedParcel.parcel.properties.fields?.zoning && (
                <div className="flex justify-between items-center py-2 border-b border-slate-700/30">
                  <span className="text-slate-400">Zoning</span>
                  <span className="text-white font-medium">
                    {selectedParcel.parcel.properties.fields.zoning}
                  </span>
                </div>
              )}

              <div className="py-2 border-b border-slate-700/30">
                <div className="text-slate-400 mb-1">Owner</div>
                <div className="text-white font-medium">
                  {selectedParcel.parcel.properties.fields?.owner || 'Unknown'}
                </div>
              </div>

              {selectedParcel.parcel.properties.fields?.mailadd && (
                <div className="py-2 border-b border-slate-700/30">
                  <div className="text-slate-400 mb-1">Owner Mailing Address</div>
                  <div className="text-white text-xs">
                    {selectedParcel.parcel.properties.fields.mailadd}
                  </div>
                </div>
              )}

              <div className="py-2 border-b border-slate-700/30">
                <div className="text-slate-400 mb-1">Property Address</div>
                <div className="text-white font-medium">
                  {selectedParcel.parcel.properties.headline || 'Address not available'}
                </div>
              </div>

              {selectedParcel.parcel.properties.fields?.saleprice && (
                <div className="flex justify-between items-center py-2 border-b border-slate-700/30">
                  <span className="text-slate-400">Last Sale Price</span>
                  <span className="text-green-400 font-medium">
                    ${selectedParcel.parcel.properties.fields.saleprice.toLocaleString()}
                  </span>
                </div>
              )}

              {selectedParcel.parcel.properties.fields?.saledate && (
                <div className="flex justify-between items-center py-2 border-b border-slate-700/30">
                  <span className="text-slate-400">Sale Date</span>
                  <span className="text-white font-medium">
                    {selectedParcel.parcel.properties.fields.saledate}
                  </span>
                </div>
              )}

              {selectedParcel.parcel.properties.fields?.assessedval && (
                <div className="flex justify-between items-center py-2 border-b border-slate-700/30">
                  <span className="text-slate-400">Assessed Value</span>
                  <span className="text-white font-medium">
                    ${selectedParcel.parcel.properties.fields.assessedval.toLocaleString()}
                  </span>
                </div>
              )}

              {selectedParcel.parcel.properties.fields?.marketval && (
                <div className="flex justify-between items-center py-2 border-b border-slate-700/30">
                  <span className="text-slate-400">Market Value</span>
                  <span className="text-white font-medium">
                    ${selectedParcel.parcel.properties.fields.marketval.toLocaleString()}
                  </span>
                </div>
              )}

              {selectedParcel.parcel.properties.fields?.taxamt && (
                <div className="flex justify-between items-center py-2 border-b border-slate-700/30">
                  <span className="text-slate-400">Tax Amount</span>
                  <span className="text-white font-medium">
                    ${selectedParcel.parcel.properties.fields.taxamt.toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {/* Lead Information if associated */}
            {selectedParcel.lead && (
              <>
                <div className="pt-3 border-t border-slate-600">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-green-400 font-semibold text-xs uppercase tracking-wide">Active Lead</span>
                  </div>

                  <div className="space-y-2">
                    <div className="py-2 border-b border-slate-700/30">
                      <div className="text-slate-400 mb-1 text-xs">Contact Name</div>
                      <div className="text-white font-medium">{selectedParcel.lead.name}</div>
                    </div>

                    <div className="py-2 border-b border-slate-700/30">
                      <div className="text-slate-400 mb-1 text-xs">Phone</div>
                      <div className="text-white font-medium">{selectedParcel.lead.phone}</div>
                    </div>

                    {selectedParcel.lead.email && (
                      <div className="py-2 border-b border-slate-700/30">
                        <div className="text-slate-400 mb-1 text-xs">Email</div>
                        <div className="text-white font-medium text-xs">{selectedParcel.lead.email}</div>
                      </div>
                    )}

                    <div className="py-2">
                      <div className="text-slate-400 mb-1 text-xs">Issue Description</div>
                      <div className="text-white text-sm">{selectedParcel.lead.issue_description}</div>
                    </div>

                    <div className="pt-2 flex items-center justify-between">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        selectedParcel.lead.status === 'new' ? 'bg-blue-500 text-white' :
                        selectedParcel.lead.status === 'scheduled' ? 'bg-green-500 text-white' :
                        selectedParcel.lead.status === 'called' ? 'bg-yellow-500 text-white' :
                        'bg-gray-500 text-white'
                      }`}>
                        {selectedParcel.lead.status.toUpperCase()}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(selectedParcel.lead.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
