'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import 'mapbox-gl/dist/mapbox-gl.css';
import area from '@turf/area';
import { supabase } from '../lib/supabase';

// Mapbox token from environment variable
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

// Calculate area of polygon in acres
function calculateArea(coordinates) {
  const polygon = {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: coordinates
    }
  };
  const areaInSquareMeters = area(polygon);
  const areaInAcres = areaInSquareMeters * 0.000247105; // Convert to acres
  return areaInAcres;
}

export default function LeadsMap({ leads = [], zoomToLead = null, developments = [] }) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markers = useRef([]);
  const developmentMarkers = useRef([]);
  const draw = useRef(null);
  const [selectedLead, setSelectedLead] = useState(null);
  const [selectedParcel, setSelectedParcel] = useState(null);
  const [is3D, setIs3D] = useState(false);
  const [isInfoCollapsed, setIsInfoCollapsed] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(11);
  const [infoBoxPosition, setInfoBoxPosition] = useState({ x: 0, y: 0 });
  const [drawnPolygons, setDrawnPolygons] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawMode, setDrawMode] = useState(null); // Track drawing mode
  const [showTopography, setShowTopography] = useState(false); // Track topography visibility
  const [contourInterval, setContourInterval] = useState(10); // Contour interval in feet
  const [elevationStats, setElevationStats] = useState(null); // Min/max elevation for selected parcel
  const parcelsLoaded = useRef(false);
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [powerExpanded, setPowerExpanded] = useState(false);
  const [lotAbsorptionExpanded, setLotAbsorptionExpanded] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [comingSoonFeature, setComingSoonFeature] = useState('');

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

  // DISABLED: Regrid API functions - use saved parcel_geometry from database only!
  const fetchParcelByID = async (parcelId, leadStatus) => {
    console.log('⚠️ fetchParcelByID disabled - use saved parcel_geometry instead');
    return null;
  };

  const fetchParcelData = async (lat, lng, leadStatus, isLeadSubmission = false) => {
    console.log('⚠️ fetchParcelData disabled - use saved parcel_geometry instead');
    return null;
  };

  // Save parcel data to database
  const saveParcelDataToLead = async (leadId, parcelData) => {
    if (!parcelData || !parcelData.properties) return;

    const updates = {
      parcelid: parcelData.properties.parcelnumb || parcelData.properties.apn || null,
      county: parcelData.properties.county || parcelData.properties.countyname || null
    };

    if (updates.parcelid || updates.county) {
      await supabase
        .from('leads')
        .update(updates)
        .eq('id', leadId);
      console.log('Updated lead with parcel data:', updates);
    }
  };

  // Get marker color based on lead status or priced status
  const getMarkerColor = (lead) => {
    // Check if lead is priced (has a price > 0)
    const hasPrice = lead.price && parseFloat(lead.price) > 0;

    // If lead is masked, it's a priced lead NOT YET purchased = GREEN
    if (lead.isMasked) {
      return '#10B981'; // Bright green for priced leads not purchased
    }

    // If lead has price but is NOT masked, it's been purchased = BLUE
    if (hasPrice && !lead.isMasked) {
      return '#3B82F6'; // Bright blue for purchased leads
    }

    // Regular status colors for non-priced leads
    switch (lead.status) {
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

  // Toggle polygon drawing mode
  const togglePolygonMode = () => {
    if (!draw.current) return;

    const currentMode = draw.current.getMode();
    if (currentMode === 'draw_polygon') {
      // Turn OFF drawing mode
      draw.current.changeMode('simple_select');
      setDrawMode(null);
      console.log('🔴 Polygon drawing mode OFF');
    } else {
      // Turn ON drawing mode
      draw.current.changeMode('draw_polygon');
      setDrawMode('draw_polygon');
      console.log('🟢 Polygon drawing mode ON');
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

    // Helper functions for polygon drawing
    function updatePolygons(e) {
      console.log('🎨 Polygon event triggered');
      const data = draw.current.getAll();
      console.log('📊 Draw data:', data);
      const polygons = data.features.map(feature => {
        if (feature.geometry.type === 'Polygon') {
          const areaValue = calculateArea(feature.geometry.coordinates);
          const center = getCentroid(feature.geometry.coordinates[0]);
          console.log('📐 Calculated area:', areaValue, 'acres');
          return {
            id: feature.id,
            area: areaValue,
            center: center,
            coordinates: feature.geometry.coordinates
          };
        }
        return null;
      }).filter(p => p !== null);

      console.log('✅ Total polygons:', polygons.length);
      setDrawnPolygons(polygons);
    }

    function getCentroid(coordinates) {
      let x = 0, y = 0;
      coordinates.forEach(coord => {
        x += coord[0];
        y += coord[1];
      });
      return [x / coordinates.length, y / coordinates.length];
    }

    // Track zoom level for marker fade
    map.current.on('zoom', () => {
      setCurrentZoom(map.current.getZoom());
    });

    // Smooth transitions and click-to-highlight parcel
    map.current.on('load', () => {
      map.current.resize();

      // Initialize drawing control AFTER map is loaded (only trash button, we'll make custom polygon button)
      try {
        draw.current = new MapboxDraw({
          displayControlsDefault: false,
          controls: {
            polygon: false, // Hide default polygon button
            trash: true
          }
        });
        console.log('✅ MapboxDraw instance created:', draw.current);

        map.current.addControl(draw.current, 'top-right');
        console.log('✅ Drawing controls added to map');

        // Listen for drawing events
        map.current.on('draw.create', (e) => {
          updatePolygons(e);
          // Immediately re-enter drawing mode to allow continuous lot drawing
          setTimeout(() => {
            if (draw.current) {
              draw.current.changeMode('draw_polygon');
              console.log('🔄 Re-entering drawing mode for next lot');
            }
          }, 100);
        });
        map.current.on('draw.delete', updatePolygons);
        map.current.on('draw.update', updatePolygons);

        // Listen for mode changes to update cursor
        map.current.on('draw.modechange', (e) => {
          const mode = e.mode;
          console.log('🎨 Draw mode changed to:', mode);

          // Always keep crosshair when in draw_polygon mode
          if (mode === 'draw_polygon') {
            setDrawMode('draw_polygon');
            map.current.getCanvas().style.cursor = 'crosshair';
          } else {
            setDrawMode(null);
            map.current.getCanvas().style.cursor = '';
          }
        });
      } catch (error) {
        console.error('❌ Error creating drawing controls:', error);
      }

      // Add 3D terrain source
      map.current.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14
      });

      // Set the terrain on the map with lower exaggeration for better performance
      map.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.2 });

      // Add hillshading for terrain depth (default intensity)
      map.current.addLayer({
        id: 'hillshading',
        type: 'hillshade',
        source: 'mapbox-dem',
        layout: {
          'visibility': 'visible'
        },
        paint: {
          'hillshade-shadow-color': '#000000',
          'hillshade-illumination-direction': 315,
          'hillshade-exaggeration': 0.5
        }
      }, 'waterway-label'); // Add before labels

      // Add enhanced hillshading for topography visualization
      map.current.addLayer({
        id: 'hillshading-enhanced',
        type: 'hillshade',
        source: 'mapbox-dem',
        layout: {
          'visibility': 'none' // Hidden by default, shown when topography is toggled
        },
        paint: {
          'hillshade-shadow-color': '#473B24',
          'hillshade-highlight-color': '#ffffff',
          'hillshade-illumination-direction': 335,
          'hillshade-exaggeration': 1.0 // Maximum allowed exaggeration
        }
      }, 'waterway-label');

      // Add sky layer for better 3D visualization
      map.current.addLayer({
        id: 'sky',
        type: 'sky',
        paint: {
          'sky-type': 'atmosphere',
          'sky-atmosphere-sun': [0.0, 90.0],
          'sky-atmosphere-sun-intensity': 15
        }
      });

      console.log('✅ 3D terrain and hillshading enabled');

      // NOTE: Regrid vector tiles removed to prevent excessive API usage
      // We only load parcel geometry from saved data in the database

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

      // NOTE: Parcel tile click handlers removed to prevent excessive API usage
      // Parcels are now only displayed from saved database geometry

      console.log('✅ Map initialization complete');
    });
  }, [leads]);

  // Toggle 3D view
  const toggle3D = () => {
    if (!map.current) return;
    const newIs3D = !is3D;
    setIs3D(newIs3D);

    map.current.easeTo({
      pitch: newIs3D ? 70 : 0,
      bearing: newIs3D ? -20 : 0,
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

      // Remove existing parcel layers and sources (with error handling)
      try {
        if (map.current.getLayer('parcels-fill')) {
          map.current.removeLayer('parcels-fill');
        }
        if (map.current.getLayer('parcels-outline')) {
          map.current.removeLayer('parcels-outline');
        }
        if (map.current.getSource('parcels')) {
          map.current.removeSource('parcels');
        }
      } catch (error) {
        console.warn('Error removing existing layers/sources:', error);
      }

      // Process all leads - USE SAVED GEOMETRY ONLY (no API calls!)
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

        // USE SAVED PARCEL GEOMETRY - DO NOT CALL REGRID API!
        let parcel = null;
        if (lead.parcel_geometry) {
          // Use saved geometry from database - MUST be proper GeoJSON Feature
          // Map lead fields to parcel properties structure for info box display
          parcel = {
            type: 'Feature',
            geometry: lead.parcel_geometry,
            properties: {
              leadStatus: lead.status,
              isLeadSubmission: true,
              isMasked: lead.isMasked || false,
              headline: lead.address || lead.street_address || lead.county ? `${lead.address || lead.street_address || ''}, ${lead.county || lead.property_county || ''}, TX` : 'Address not available',
              fields: {
                owner: lead.isMasked ? '████████' : (lead.full_name || lead.name || lead.names_on_deed || 'Unknown'),
                ll_gisacre: lead.acres ? parseFloat(lead.acres) : (lead.acreage ? parseFloat(lead.acreage) : null),
                parcelnumb: lead.parcel_id || lead.parcelid || 'N/A',
                county: lead.county || lead.property_county || 'Unknown',
                // Add any other fields from lead data
                usedesc: lead.land_use || null,
                zoning: lead.zoning || null,
                mailadd: lead.mailing_address || null,
                saleprice: lead.last_sale_price ? parseFloat(lead.last_sale_price) : null,
                saledate: lead.sale_date || null,
                assessedval: lead.assessed_value ? parseFloat(lead.assessed_value) : null,
                marketval: lead.market_value ? parseFloat(lead.market_value) : null,
                taxamt: lead.tax_amount ? parseFloat(lead.tax_amount) : null,
                sqft: lead.sqft ? parseFloat(lead.sqft) : null
              }
            }
          };
          console.log('✅ Using saved geometry for', lead.name, '- Type:', lead.parcel_geometry?.type);
        } else {
          console.log('❌ No saved geometry for lead:', lead.name);
        }

        // If parcel found, use its centroid for accurate marker placement
        // BUT: If lead is masked (has isMasked flag), DO NOT use parcel geometry - use masked coords instead
        if (parcel && parcel.geometry && !lead.isMasked) {
          // Calculate centroid based on geometry type
          if (parcel.geometry.type === 'Point') {
            coords = { lng: parcel.geometry.coordinates[0], lat: parcel.geometry.coordinates[1] };
          } else if (parcel.geometry.type === 'Polygon') {
            // Use first coordinate as approximation (centroid calculation could be more sophisticated)
            const bounds = parcel.geometry.coordinates[0];
            const lngs = bounds.map(c => c[0]);
            const lats = bounds.map(c => c[1]);
            coords = {
              lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
              lat: (Math.min(...lats) + Math.max(...lats)) / 2
            };
          }
        }

        return { coords, parcel, lead };
      });

      const results = await Promise.all(parcelPromises);

      const parcelFeatures = [];

      console.log('📊 Processing', results.length, 'lead results for map');

      // Add markers and collect parcels
      results.forEach(({ coords, parcel, lead }) => {
        if (!coords) {
          console.log('⚠️ No coords for lead:', lead?.name);
          return;
        }

        // Collect parcel if available
        // BUT: Don't show parcel boundaries for masked leads (reveals exact location)
        if (parcel && !lead.isMasked) {
          console.log('✅ Adding parcel for', lead?.name, '- Type:', parcel.type, 'Geometry:', parcel.geometry?.type);
          parcelFeatures.push(parcel);
        } else if (lead.isMasked) {
          console.log('🔒 Parcel hidden for masked lead:', lead?.name);
        } else {
          console.log('❌ No parcel geometry for', lead?.name);
        }

        // Create premium marker with bigger pulse
        const el = document.createElement('div');
        el.className = 'premium-marker';
        el.style.transition = 'opacity 0.3s ease';
        el.innerHTML = `
          <div style="
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            cursor: pointer;
          ">
            <div class="lead-marker-circle" style="
              background: ${getMarkerColor(lead)};
              width: 20px;
              height: 20px;
              border-radius: 50%;
              border: 4px solid rgba(255,255,255,0.95);
              box-shadow: 0 6px 16px rgba(0,0,0,0.5), 0 0 0 6px rgba(${
                lead.status === 'new' ? '59, 130, 246' :
                lead.status === 'scheduled' ? '16, 185, 129' :
                lead.status === 'called' ? '245, 158, 11' : '107, 114, 128'
              }, 0.3);
              animation: sonarPulse 2.5s ease-out infinite;
            "></div>
          </div>
        `;

        // Create marker
        const marker = new mapboxgl.Marker(el)
          .setLngLat([coords.lng, coords.lat])
          .addTo(map.current);

        // Add click event - show compact info next to marker (on the left)
        el.addEventListener('click', (e) => {
          const rect = el.getBoundingClientRect();
          const infoBoxWidth = 320; // w-80 = 20rem = 320px
          setInfoBoxPosition({
            x: rect.left - infoBoxWidth - 10, // 10px to the left of marker
            y: rect.top
          });
          setSelectedLead(lead);
          setSelectedParcel({ parcel, lead });
          setIsInfoCollapsed(false);
        });

        // Store element reference for zoom-based fading
        marker._element = el;
        markers.current.push(marker);
      });

      // Add parcel boundaries to map
      console.log('🗺️  Total parcel features collected:', parcelFeatures.length);
      if (parcelFeatures.length > 0) {
        console.log('🗺️  First parcel feature:', JSON.stringify(parcelFeatures[0]).substring(0, 200));
      }

      // Function to add parcels - will retry if map not ready
      const addParcelsToMap = () => {
        if (!map.current) return;

        if (!map.current.isStyleLoaded()) {
          console.log('⏳ Map style not loaded yet, retrying in 500ms...');
          setTimeout(addParcelsToMap, 500);
          return;
        }

        console.log('🎨 Adding', parcelFeatures.length, 'parcels to map');

        try {
          // Check if source exists, if so update it, otherwise add it
          const existingSource = map.current.getSource('parcels');
          if (existingSource) {
            console.log('✅ Updating existing parcels source');
            existingSource.setData({
              type: 'FeatureCollection',
              features: parcelFeatures
            });
          } else {
            console.log('✅ Adding new parcels source');
            map.current.addSource('parcels', {
              type: 'geojson',
              data: {
                type: 'FeatureCollection',
                features: parcelFeatures
              }
            });
          }

          // Add layers only if they don't exist
          if (!map.current.getLayer('parcels-fill')) {
            map.current.addLayer({
              id: 'parcels-fill',
              type: 'fill',
              source: 'parcels',
              paint: {
                'fill-color': [
                  'case',
                  ['get', 'isLeadSubmission'], // If lead submission, always bright red
                  '#EF4444',
                  [
                    'match',
                    ['get', 'leadStatus'],
                    'new', '#3B82F6',
                    'called', '#F59E0B',
                    'scheduled', '#10B981',
                    'completed', '#6B7280',
                    '#888888'
                  ]
                ],
                'fill-opacity': [
                  'case',
                  ['get', 'isLeadSubmission'],
                  0.4, // More visible for lead submissions
                  0.15
                ]
              }
            });
          }

          // Add outline layer only if it doesn't exist
          if (!map.current.getLayer('parcels-outline')) {
            map.current.addLayer({
              id: 'parcels-outline',
              type: 'line',
              source: 'parcels',
              paint: {
                'line-color': [
                  'case',
                  ['get', 'isLeadSubmission'], // If lead submission, always bright red
                  '#EF4444',
                  [
                    'match',
                    ['get', 'leadStatus'],
                    'new', '#3B82F6',
                    'called', '#F59E0B',
                    'scheduled', '#10B981',
                    'completed', '#6B7280',
                    '#888888'
                  ]
                ],
                'line-width': [
                  'case',
                  ['get', 'isLeadSubmission'],
                  3.5, // Thicker line for lead submissions
                  2.5
                ],
                'line-opacity': 1
              }
            });
          }
        } catch (error) {
          console.error('Error adding parcels to map:', error);
        }
      };

      // Call the function to add parcels (will retry if needed)
      if (parcelFeatures.length > 0) {
        addParcelsToMap();
      } else {
        console.log('❌ No parcel features to display');
      }
    };

    loadLeadsAndParcels();
  }, [leads]);

  // Handle development markers
  useEffect(() => {
    if (!map.current) return;

    // Clear existing development markers
    developmentMarkers.current.forEach(marker => marker.remove());
    developmentMarkers.current = [];

    // Add development markers
    developments.forEach(dev => {
      if (!dev.latitude || !dev.longitude) return;

      // Create development marker element (construction/development themed)
      const el = document.createElement('div');
      el.className = 'development-marker';
      el.innerHTML = `
        <div style="
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          cursor: pointer;
        ">
          <div style="
            background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%);
            width: 24px;
            height: 24px;
            border-radius: 4px;
            border: 2px solid rgba(255,255,255,0.95);
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
          ">🏗️</div>
        </div>
      `;

      // Create marker
      const marker = new mapboxgl.Marker(el)
        .setLngLat([dev.longitude, dev.latitude])
        .addTo(map.current);

      // Add click event for popup
      el.addEventListener('click', () => {
        const popupHTML = `
          <div class="development-popup" style="min-width: 250px;">
            <div style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: white; padding: 12px; margin: -10px -10px 10px -10px; border-radius: 3px 3px 0 0;">
              <h3 style="margin: 0; font-size: 14px; font-weight: 600;">🏗️ ${dev.city} Development</h3>
            </div>
            <div style="padding: 4px 0;">
              <p style="margin: 6px 0; font-size: 13px; font-weight: 600; color: #1f2937;">${dev.type}</p>
              <p style="margin: 4px 0; font-size: 12px; color: #6b7280;">${dev.description}</p>
              <p style="margin: 6px 0; font-size: 11px; color: #9ca3af;">${dev.address}</p>
              ${dev.value ? `<p style="margin: 4px 0; font-size: 12px; color: #059669; font-weight: 500;">Value: ${dev.value}</p>` : ''}
              <p style="margin: 6px 0 0 0; font-size: 11px; color: #9ca3af;">
                Issued: ${new Date(dev.issueDate).toLocaleDateString()}
              </p>
              <p style="margin: 4px 0 0 0; font-size: 10px; color: #d1d5db;">
                Source: ${dev.source}
              </p>
            </div>
          </div>
        `;

        new mapboxgl.Popup({ offset: 25, closeButton: true, closeOnClick: false })
          .setLngLat([dev.longitude, dev.latitude])
          .setHTML(popupHTML)
          .addTo(map.current);
      });

      developmentMarkers.current.push(marker);
    });

    console.log(`📍 Added ${developments.length} development markers`);
  }, [developments]);

  // Handle zoom to specific lead when zoomToLead prop changes
  useEffect(() => {
    if (!map.current || !zoomToLead) return;

    console.log('🎯 Zooming to lead:', zoomToLead.full_name || zoomToLead.name);

    // Get coordinates
    const lat = zoomToLead.latitude;
    const lng = zoomToLead.longitude;

    if (!lat || !lng) {
      console.warn('⚠️ Lead has no coordinates for zoom');
      return;
    }

    // Fly to the lead location with zoom level ~15 (similar to screenshot)
    map.current.flyTo({
      center: [lng, lat],
      zoom: 15,
      duration: 1500,
      essential: true
    });

  }, [zoomToLead]);

  // Handle marker fade based on zoom
  useEffect(() => {
    if (!map.current) return;

    markers.current.forEach(marker => {
      if (marker._element) {
        // Fade out when zoom > 16 (very close), fade back when zooming out
        const opacity = currentZoom > 16 ? 0.3 : 1;
        marker._element.style.opacity = opacity;
      }
    });
  }, [currentZoom]);

  // Add acreage labels to drawn polygons
  useEffect(() => {
    if (!map.current || !map.current.loaded()) return;

    // Remove existing labels
    drawnPolygons.forEach(polygon => {
      if (map.current.getLayer(`polygon-label-${polygon.id}`)) {
        map.current.removeLayer(`polygon-label-${polygon.id}`);
      }
      if (map.current.getSource(`polygon-label-${polygon.id}`)) {
        map.current.removeSource(`polygon-label-${polygon.id}`);
      }
    });

    // Add new labels
    drawnPolygons.forEach(polygon => {
      try {
        // Format area display - show sq ft for small areas, acres for larger
        const acres = polygon.area;
        const sqft = acres * 43560; // 1 acre = 43,560 sq ft
        let displayText;

        if (acres < 0.1) {
          // Show square feet for very small areas
          displayText = `${Math.round(sqft).toLocaleString()} sq ft`;
        } else {
          // Show acres with appropriate precision
          displayText = `${acres.toFixed(2)} acres`;
        }

        map.current.addSource(`polygon-label-${polygon.id}`, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: polygon.center
            },
            properties: {
              area: displayText
            }
          }
        });

        map.current.addLayer({
          id: `polygon-label-${polygon.id}`,
          type: 'symbol',
          source: `polygon-label-${polygon.id}`,
          layout: {
            'text-field': ['get', 'area'],
            'text-size': 18,
            'text-anchor': 'center',
            'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold']
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': '#000000',
            'text-halo-width': 3,
            'text-halo-blur': 1
          }
        });
      } catch (error) {
        console.log('Label already exists or error adding:', error);
      }
    });

    return () => {
      // Cleanup labels when component unmounts
      drawnPolygons.forEach(polygon => {
        if (map.current?.getLayer(`polygon-label-${polygon.id}`)) {
          map.current.removeLayer(`polygon-label-${polygon.id}`);
        }
        if (map.current?.getSource(`polygon-label-${polygon.id}`)) {
          map.current.removeSource(`polygon-label-${polygon.id}`);
        }
      });
    };
  }, [drawnPolygons]);

  // Query elevation at a specific point using Mapbox Terrain RGB
  const queryElevation = async (lng, lat) => {
    try {
      const zoom = 14; // Higher zoom = more precision
      const tileSize = 256;

      // Convert lng/lat to tile coordinates
      const x = Math.floor((lng + 180) / 360 * Math.pow(2, zoom));
      const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));

      // Fetch terrain RGB tile
      const url = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${zoom}/${x}/${y}.pngraw?access_token=${mapboxgl.accessToken}`;

      const response = await fetch(url);
      const blob = await response.blob();

      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = tileSize;
          canvas.height = tileSize;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);

          // Get pixel coordinates within tile
          const pixelX = Math.floor(((lng + 180) / 360 * Math.pow(2, zoom) - x) * tileSize);
          const pixelY = Math.floor(((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom) - y) * tileSize);

          const pixel = ctx.getImageData(pixelX, pixelY, 1, 1).data;

          // Decode RGB to elevation (Mapbox Terrain RGB encoding)
          const elevation = -10000 + ((pixel[0] * 256 * 256 + pixel[1] * 256 + pixel[2]) * 0.1);
          const elevationFeet = elevation * 3.28084; // Convert meters to feet

          resolve(elevationFeet);
        };
        img.src = URL.createObjectURL(blob);
      });
    } catch (error) {
      console.error('Error querying elevation:', error);
      return null;
    }
  };

  // Sample elevation points within parcel boundary
  const sampleParcelElevation = async (parcelGeometry) => {
    console.log('🗻 Sampling elevation for parcel...');

    // Get parcel bounds
    let coords = [];
    if (parcelGeometry.type === 'Polygon') {
      coords = parcelGeometry.coordinates[0];
    } else if (parcelGeometry.type === 'MultiPolygon') {
      coords = parcelGeometry.coordinates[0][0];
    }

    if (coords.length === 0) return null;

    // Calculate bounding box
    const lngs = coords.map(c => c[0]);
    const lats = coords.map(c => c[1]);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);

    // Sample points in a grid pattern (9 points for speed)
    const samplePoints = [];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const lng = minLng + (maxLng - minLng) * (i / 2);
        const lat = minLat + (maxLat - minLat) * (j / 2);
        samplePoints.push([lng, lat]);
      }
    }

    console.log(`📍 Querying ${samplePoints.length} elevation samples...`);

    // Query elevation for all sample points
    const elevations = await Promise.all(
      samplePoints.map(([lng, lat]) => queryElevation(lng, lat))
    );

    const validElevations = elevations.filter(e => e !== null && !isNaN(e));

    if (validElevations.length === 0) {
      console.error('❌ No valid elevation data');
      return null;
    }

    const minElevation = Math.min(...validElevations);
    const maxElevation = Math.max(...validElevations);
    const elevationChange = maxElevation - minElevation;

    // Calculate slope percentage (rise over run)
    // Estimate horizontal distance from parcel bounds
    const latDistance = (maxLat - minLat) * 364000; // Approx feet per degree latitude
    const lngDistance = (maxLng - minLng) * 288200 * Math.cos(((maxLat + minLat) / 2) * Math.PI / 180); // Feet per degree longitude
    const horizontalDistance = Math.sqrt(latDistance * latDistance + lngDistance * lngDistance);
    const slopePercent = horizontalDistance > 0 ? (elevationChange / horizontalDistance) * 100 : 0;

    console.log(`✅ Elevation: ${minElevation.toFixed(1)} - ${maxElevation.toFixed(1)} ft, Slope: ${slopePercent.toFixed(1)}%`);

    return {
      min: minElevation,
      max: maxElevation,
      slope: slopePercent,
      samples: validElevations
    };
  };

  // Toggle topography/enhanced hillshading visibility and terrain exaggeration
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) {
      console.log('⏸️ Map not ready for topography toggle');
      return;
    }

    console.log(`🗺️ Toggling topography: ${showTopography ? 'ON' : 'OFF'}`);
    console.log(`📏 Contour interval: ${contourInterval} feet`);

    // Only show topography if a parcel is selected
    if (showTopography && selectedParcel) {
      const parcelGeometry = selectedParcel.parcel?.geometry;

      console.log('🗺️ Loading topography for selected parcel');
      console.log('📍 Parcel geometry:', parcelGeometry);

      if (!parcelGeometry) {
        console.error('❌ No parcel geometry available for topography');
        return;
      }

      // Query real elevation data for the parcel
      sampleParcelElevation(parcelGeometry).then(stats => {
        if (stats) {
          setElevationStats(stats);
        }
      });

      // Add Mapbox Terrain vector source for contours
      try {
        if (!map.current.getSource('mapbox-terrain')) {
          map.current.addSource('mapbox-terrain', {
            type: 'vector',
            url: 'mapbox://mapbox.mapbox-terrain-v2'
          });
          console.log('✅ Added mapbox-terrain source');
        }
      } catch (error) {
        console.error('❌ Error adding terrain source:', error);
        return;
      }

      // Create an inverse mask - darken everything EXCEPT the parcel to focus attention
      try {
        const worldBounds = [
          [-180, -90],
          [180, -90],
          [180, 90],
          [-180, 90],
          [-180, -90]
        ];

        let parcelHole = [];
        if (parcelGeometry.type === 'Polygon') {
          parcelHole = parcelGeometry.coordinates[0];
        } else if (parcelGeometry.type === 'MultiPolygon') {
          parcelHole = parcelGeometry.coordinates[0][0];
        }

        const maskFeature = {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [worldBounds, parcelHole]
          }
        };

        if (!map.current.getSource('topo-mask')) {
          map.current.addSource('topo-mask', {
            type: 'geojson',
            data: maskFeature
          });
        } else {
          map.current.getSource('topo-mask').setData(maskFeature);
        }

        if (!map.current.getLayer('topo-mask-layer')) {
          map.current.addLayer({
            id: 'topo-mask-layer',
            type: 'fill',
            source: 'topo-mask',
            paint: {
              'fill-color': '#000000',
              'fill-opacity': 0.6
            }
          });
          console.log('✅ Added topography mask to focus on parcel');
        }
      } catch (error) {
        console.error('❌ Error adding topo mask:', error);
      }

      // Add elevation-colored zones (only within parcel using clip)
      try {
        if (!map.current.getLayer('terrain-elevation-fill')) {
          map.current.addLayer({
            id: 'terrain-elevation-fill',
            type: 'fill',
            source: 'mapbox-terrain',
            'source-layer': 'contour',
            paint: {
              'fill-color': [
                'interpolate',
                ['linear'],
                ['get', 'ele'],
                0, '#1e3a8a',      // Dark blue (low)
                100, '#3b82f6',    // Blue
                200, '#10b981',    // Green
                300, '#fbbf24',    // Yellow
                400, '#f97316',    // Orange
                500, '#dc2626',    // Red
                600, '#7f1d1d'     // Dark red (high)
              ],
              'fill-opacity': 0.5
            }
          }, 'topo-mask-layer');
          console.log('✅ Added elevation fill zones');
        }
      } catch (error) {
        console.error('❌ Error adding elevation fill:', error);
      }

      // Add contour lines layer with clip to parcel
      try {
        if (!map.current.getLayer('terrain-contour-lines')) {
          map.current.addLayer({
            id: 'terrain-contour-lines',
            type: 'line',
            source: 'mapbox-terrain',
            'source-layer': 'contour',
            minzoom: 11,
            layout: {
              'line-join': 'round',
              'line-cap': 'round'
            },
            paint: {
              'line-color': '#000000',
              'line-width': [
                'case',
                ['==', ['%', ['get', 'index'], 2], 0],
                2.0, // Thicker lines for major contours (every 2nd = ~10ft)
                1.2  // Medium lines for minor contours
              ],
              'line-opacity': 0.95
            }
          });
          console.log('✅ Added terrain contour lines');
        }
      } catch (error) {
        console.error('❌ Error adding contour lines:', error);
      }

      // Add contour labels showing elevation every ~10ft
      try {
        if (!map.current.getLayer('terrain-contour-labels')) {
          map.current.addLayer({
            id: 'terrain-contour-labels',
            type: 'symbol',
            source: 'mapbox-terrain',
            'source-layer': 'contour',
            filter: ['==', ['%', ['get', 'index'], 2], 0], // Every 2nd contour (~10ft intervals)
            minzoom: 13,
            layout: {
              'text-field': [
                'concat',
                ['to-string', ['round', ['*', ['get', 'ele'], 3.28084]]],
                ' ft'
              ],
              'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
              'text-size': 13,
              'symbol-placement': 'line',
              'text-rotation-alignment': 'map',
              'text-pitch-alignment': 'viewport',
              'text-max-angle': 25,
              'text-padding': 40,
              'symbol-spacing': 300
            },
            paint: {
              'text-color': '#1a1a1a',
              'text-halo-color': '#ffffff',
              'text-halo-width': 3,
              'text-halo-blur': 0.5,
              'text-opacity': 1
            }
          });
          console.log('✅ Added contour labels');
        }
      } catch (error) {
        console.error('❌ Error adding contour labels:', error);
      }

      // Enhance hillshading for topography
      if (map.current.getLayer('hillshading-enhanced')) {
        map.current.setLayoutProperty('hillshading-enhanced', 'visibility', 'visible');
      }

      console.log('✅ Parcel topography enabled');
    } else {
      // Hide topography layers
      ['terrain-contour-lines', 'terrain-elevation-fill', 'terrain-contour-labels', 'topo-mask-layer'].forEach(layerId => {
        if (map.current.getLayer(layerId)) {
          map.current.removeLayer(layerId);
        }
      });
      ['topo-mask'].forEach(sourceId => {
        if (map.current.getSource(sourceId)) {
          map.current.removeSource(sourceId);
        }
      });

      // Hide enhanced hillshading
      if (map.current.getLayer('hillshading-enhanced')) {
        map.current.setLayoutProperty('hillshading-enhanced', 'visibility', 'none');
      }

      setElevationStats(null);
      console.log('✅ Topography disabled');
    }

    // Adjust terrain exaggeration when in 3D + topography mode
    if (map.current.getTerrain()) {
      if (showTopography && is3D) {
        // Dramatically increase terrain exaggeration in 3D topography mode
        map.current.setTerrain({
          source: 'mapbox-dem',
          exaggeration: 5.0
        });
        console.log('🏔️ Terrain exaggeration set to 5.0x for 3D topography');
      } else if (showTopography) {
        map.current.setTerrain({
          source: 'mapbox-dem',
          exaggeration: 2.5
        });
      } else {
        map.current.setTerrain({
          source: 'mapbox-dem',
          exaggeration: 1.2
        });
      }
    }
  }, [showTopography, selectedParcel, contourInterval, is3D]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full rounded-lg" />

      {/* 3D Toggle Button */}
      <button
        onClick={toggle3D}
        className={`absolute top-4 left-4 z-10 px-4 py-2 rounded-lg font-semibold shadow-lg transition-all ${
          is3D
            ? 'bg-orange-500 text-white hover:bg-orange-600'
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

      {/* Tools & Layers - Main Expandable Container */}
      <button
        onClick={() => setToolsExpanded(!toolsExpanded)}
        className={`absolute top-16 left-4 z-10 px-4 py-2 rounded-lg font-semibold shadow-lg transition-all ${
          toolsExpanded
            ? 'bg-orange-500 text-white hover:bg-orange-600'
            : 'bg-white/95 text-gray-700 hover:bg-white border border-gray-300'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            <span>Tools & Layers</span>
          </div>
          <svg className={`w-4 h-4 transition-transform ${toolsExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Tools & Layers Menu - Collapsible */}
      {toolsExpanded && (
        <div className="absolute top-28 left-4 z-10 flex flex-col gap-2 max-w-xs">
          {/* Draw Lots */}
          <button
            onClick={togglePolygonMode}
            className={`px-4 py-2 rounded-lg font-semibold shadow-lg transition-all ${
              drawMode === 'draw_polygon'
                ? 'bg-orange-500 text-white hover:bg-orange-600'
                : 'bg-white/95 text-gray-700 hover:bg-white border border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
              </svg>
              <span>{drawMode === 'draw_polygon' ? 'Exit Draw Mode' : 'Draw Lots'}</span>
            </div>
          </button>

          {/* Show Topography */}
          <button
            onClick={() => setShowTopography(!showTopography)}
            className={`px-4 py-2 rounded-lg font-semibold shadow-lg transition-all ${
              showTopography
                ? 'bg-orange-500 text-white hover:bg-orange-600'
                : 'bg-white/95 text-gray-700 hover:bg-white border border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12h10M7 8h10M7 16h10M3 4h18v16H3z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 12h14M5 16h14" />
              </svg>
              <span>{showTopography ? 'Hide Topography' : 'Show Topography'}</span>
            </div>
          </button>

          {/* Power - Expandable */}
          <button
            onClick={() => setPowerExpanded(!powerExpanded)}
            className="bg-white/90 backdrop-blur-sm hover:bg-white shadow-lg rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-800 hover:shadow-xl transition-all"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>Power</span>
              </div>
              <svg className={`w-4 h-4 transition-transform ${powerExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>

          {/* Power Submenu */}
          {powerExpanded && (
            <div className="ml-4 space-y-2">
              {['High Tension Lines', '# Phase', 'Substations', 'Battery Stations'].map((item) => (
                <button
                  key={item}
                  onClick={() => { setComingSoonFeature(item); setShowComingSoon(true); }}
                  className="bg-white/80 hover:bg-white shadow rounded-lg px-4 py-2 text-sm text-slate-700 hover:text-slate-900 transition-all w-full text-left"
                >
                  {item}
                </button>
              ))}
            </div>
          )}

          {/* Infrastructure Districts */}
          <button
            onClick={() => { setComingSoonFeature('Infrastructure Districts'); setShowComingSoon(true); }}
            className="bg-white/90 backdrop-blur-sm hover:bg-white shadow-lg rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-800 hover:shadow-xl transition-all"
          >
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <span>Infrastructure Districts</span>
            </div>
          </button>

          {/* Lot Absorption - Expandable */}
          <button
            onClick={() => setLotAbsorptionExpanded(!lotAbsorptionExpanded)}
            className="bg-white/90 backdrop-blur-sm hover:bg-white shadow-lg rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-800 hover:shadow-xl transition-all"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <span>Lot Absorption</span>
              </div>
              <svg className={`w-4 h-4 transition-transform ${lotAbsorptionExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>

          {/* Lot Absorption Submenu */}
          {lotAbsorptionExpanded && (
            <div className="ml-4">
              <button
                onClick={() => { setComingSoonFeature('Lot Absorption by Size'); setShowComingSoon(true); }}
                className="bg-white/80 hover:bg-white shadow rounded-lg px-4 py-2 text-sm text-slate-700 hover:text-slate-900 transition-all w-full text-left"
              >
                Toggle by Lot Sizes
              </button>
            </div>
          )}

          {/* For Sale Comps / Sold Comps */}
          <button
            onClick={() => { setComingSoonFeature('For Sale / Sold Comps'); setShowComingSoon(true); }}
            className="bg-white/90 backdrop-blur-sm hover:bg-white shadow-lg rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-800 hover:shadow-xl transition-all"
          >
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span>For Sale / Sold Comps</span>
            </div>
          </button>

          {/* Builder Lot Takes */}
          <button
            onClick={() => { setComingSoonFeature('Builder Lot Takes'); setShowComingSoon(true); }}
            className="bg-white/90 backdrop-blur-sm hover:bg-white shadow-lg rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-800 hover:shadow-xl transition-all"
          >
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <span>Builder Lot Takes</span>
            </div>
          </button>

          {/* Developments Map */}
          <button
            onClick={() => { setComingSoonFeature('Developments Map'); setShowComingSoon(true); }}
            className="bg-white/90 backdrop-blur-sm hover:bg-white shadow-lg rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-800 hover:shadow-xl transition-all"
          >
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <span>Developments Map</span>
            </div>
          </button>

          {/* Wetlands / Floodplain */}
          <button
            onClick={() => { setComingSoonFeature('Wetlands / Floodplain'); setShowComingSoon(true); }}
            className="bg-white/90 backdrop-blur-sm hover:bg-white shadow-lg rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-800 hover:shadow-xl transition-all"
          >
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
              <span>Wetlands / Floodplain</span>
            </div>
          </button>
        </div>
      )}

      {/* Coming Soon Message */}
      {showComingSoon && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center"
          onClick={() => setShowComingSoon(false)}
        >
          <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl shadow-2xl p-8 max-w-md border-4 border-orange-400/50 animate-bounce-gentle">
            <div className="text-center">
              <svg className="w-16 h-16 text-white mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-2xl font-bold text-white mb-2">Coming Soon!</h3>
              <p className="text-white/90 text-lg">{comingSoonFeature}</p>
              <p className="text-white/70 text-sm mt-3">This feature is under development</p>
              <button
                onClick={() => setShowComingSoon(false)}
                className="mt-6 px-6 py-2 bg-white text-orange-600 font-semibold rounded-lg hover:bg-orange-50 transition-colors"
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Elevation Control Panel - Shows when topography is enabled */}
      {showTopography && elevationStats && (
        <div className="absolute bottom-4 left-4 z-10 bg-slate-900/95 backdrop-blur-xl rounded-xl shadow-2xl border border-slate-600/30 p-4 w-64">
          {/* Header */}
          <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-600/30">
            <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
            </svg>
            <span className="text-white font-semibold">Elevation</span>
          </div>

          {/* Elevation Range */}
          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Range</span>
              <div className="text-right">
                <div className="text-white font-semibold">Min {elevationStats.min.toFixed(1)} ft</div>
                <div className="text-slate-400 text-xs">Max {elevationStats.max.toFixed(1)} ft</div>
              </div>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Slope</span>
              <div className="text-right">
                <div className="text-white font-semibold">Min 0.0%</div>
                <div className="text-slate-400 text-xs">Max {elevationStats.slope.toFixed(1)}%</div>
              </div>
            </div>
          </div>

          {/* Elevation Gradient Bar */}
          <div className="mb-4">
            <div className="h-3 rounded-full overflow-hidden" style={{
              background: 'linear-gradient(to right, #6B46C1, #3B82F6, #10B981, #FBBF24, #F97316, #EF4444, #991B1B)'
            }}></div>
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>{elevationStats.min.toFixed(0)} ft</span>
              <span className="text-center">100%</span>
            </div>
          </div>

          {/* Contour Interval Control - Disabled for now */}
          <div className="space-y-2 opacity-50">
            <div className="flex justify-between items-center">
              <label className="text-slate-400 text-sm">Contour Interval:</label>
              <div className="bg-slate-800 text-white text-sm px-2 py-1 rounded border border-slate-600">
                10 Feet
              </div>
            </div>
            <div className="text-xs text-slate-500">Coming soon</div>
          </div>
        </div>
      )}

      {/* Premium animations CSS */}
      <style jsx global>{`
        /* Hide Mapbox branding */
        .mapboxgl-ctrl-bottom-left,
        .mapboxgl-ctrl-bottom-right {
          display: none !important;
        }

        @keyframes sonarPulse {
          0% {
            box-shadow:
              0 6px 16px rgba(0,0,0,0.5),
              0 0 0 6px rgba(59, 130, 246, 0.4),
              0 0 0 0 rgba(59, 130, 246, 0.8);
          }
          50% {
            box-shadow:
              0 6px 16px rgba(0,0,0,0.5),
              0 0 0 6px rgba(59, 130, 246, 0.3),
              0 0 0 60px rgba(59, 130, 246, 0);
          }
          100% {
            box-shadow:
              0 6px 16px rgba(0,0,0,0.5),
              0 0 0 6px rgba(59, 130, 246, 0.4),
              0 0 0 70px rgba(59, 130, 246, 0);
          }
        }
      `}</style>

      {/* Premium Lead Info Card - positioned next to marker */}
      {selectedLead && selectedParcel && (
        <div
          className={`fixed bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 backdrop-blur-xl rounded-xl shadow-2xl border border-slate-600/30 z-20 transition-all duration-300 ${isInfoCollapsed ? 'w-12' : 'w-80'}`}
          style={{
            left: `${infoBoxPosition.x}px`,
            top: `${infoBoxPosition.y}px`,
            transform: 'translateY(-50%)' // Center vertically on marker
          }}
        >
          {/* Header with collapse button */}
          <div className="flex items-center justify-between p-4 border-b border-slate-600/30">
            <button
              onClick={() => setIsInfoCollapsed(!isInfoCollapsed)}
              className="text-slate-400 hover:text-white transition-colors"
              title={isInfoCollapsed ? 'Expand' : 'Collapse'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isInfoCollapsed ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                )}
              </svg>
            </button>
            {!isInfoCollapsed && (
              <button
                onClick={() => {
                  setSelectedLead(null);
                  setSelectedParcel(null);
                }}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Premium lead info with field boxes */}
          {!isInfoCollapsed && (
            <div className="p-4 space-y-3">
              {/* Owner Field */}
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider mb-1.5 block font-semibold">Owner</label>
                <div className="bg-slate-800/60 border border-slate-600/40 rounded-lg px-3 py-2.5">
                  <div className="text-white font-medium text-sm leading-tight">
                    {selectedParcel.parcel?.properties?.fields?.owner || 'Unknown'}
                  </div>
                </div>
              </div>

              {/* Acreage Field */}
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider mb-1.5 block font-semibold">Acreage</label>
                <div className="bg-slate-800/60 border border-slate-600/40 rounded-lg px-3 py-2.5">
                  <div className="text-white font-bold text-sm">
                    {selectedParcel?.parcel?.properties?.fields?.ll_gisacre?.toFixed(2) || selectedLead?.acreage?.toFixed(2) || selectedLead?.acres?.toFixed(2) || 'N/A'} Acres
                  </div>
                </div>
              </div>

              {/* Exit Strategy Field */}
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider mb-1.5 block font-semibold">Exit Strategy</label>
                <div className="bg-gradient-to-r from-blue-500/10 to-blue-600/10 border border-blue-500/30 rounded-lg px-3 py-2.5">
                  <div className="text-blue-400 font-bold text-sm capitalize">
                    {selectedLead.dealtype || selectedLead.dealType || 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          )}
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

              {selectedParcel.parcel.properties.fields?.ll_gisacre && (
                <div className="flex justify-between items-center py-2 border-b border-slate-700/30">
                  <span className="text-slate-400">Acreage</span>
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
