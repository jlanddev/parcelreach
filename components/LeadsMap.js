'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import 'mapbox-gl/dist/mapbox-gl.css';
import area from '@turf/area';

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

export default function LeadsMap({ leads = [] }) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markers = useRef([]);
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

  // Fetch parcel by exact ID (most precise)
  const fetchParcelByID = async (parcelId, leadStatus) => {
    try {
      const token = process.env.NEXT_PUBLIC_REGRID_TOKEN;
      if (!token) return null;

      const url = `https://app.regrid.com/api/v2/parcels/apn?parcelnumb=${encodeURIComponent(parcelId)}&token=${token}&return_geometry=true`;
      console.log('Fetching parcel by ID:', url.replace(token, 'TOKEN'));

      const response = await fetch(url);
      const data = await response.json();

      if (data?.parcels?.features?.length > 0) {
        const parcel = data.parcels.features[0];
        if (!parcel.properties) parcel.properties = {};
        parcel.properties.leadStatus = leadStatus;
        parcel.properties.isLeadSubmission = true; // Always bright red
        return parcel;
      }
    } catch (error) {
      console.error('Error fetching parcel by ID:', error);
    }
    return null;
  };

  // Fetch parcel data from Regrid API
  const fetchParcelData = async (lat, lng, leadStatus, isLeadSubmission = false) => {
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
        // Add status and submission flag to parcel for color coding
        if (!parcel.properties) parcel.properties = {};
        parcel.properties.leadStatus = leadStatus;
        parcel.properties.isLeadSubmission = isLeadSubmission; // Bright red for lead submissions
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

  // Toggle polygon drawing mode
  const togglePolygonMode = () => {
    if (!draw.current) return;

    const currentMode = draw.current.getMode();
    if (currentMode === 'draw_polygon') {
      // Turn OFF drawing mode
      draw.current.changeMode('simple_select');
      console.log('🔴 Polygon drawing mode OFF');
    } else {
      // Turn ON drawing mode
      draw.current.changeMode('draw_polygon');
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
          'hillshade-exaggeration': 1,
          'hillshade-accent-color': '#ff6b35'
        }
      }, 'waterway-label');

      console.log('✅ 3D terrain and hillshading enabled');

      // Delay loading heavy parcel tiles for better initial performance
      setTimeout(() => {
        const token = process.env.NEXT_PUBLIC_REGRID_TOKEN;
        if (token) {
          try {
            map.current.addSource('regrid-parcels', {
              type: 'vector',
              tiles: [`https://tiles.regrid.com/api/v1/parcels/{z}/{x}/{y}.mvt?token=${token}`],
              minzoom: 12, // Only show at closer zoom levels for performance
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
      }, 1000); // Load parcels after 1 second delay

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

      // Add hover cursor for parcel layers (unless in drawing mode)
      map.current.on('mouseenter', 'regrid-parcel-fill', () => {
        if (draw.current && draw.current.getMode() === 'draw_polygon') {
          return; // Keep crosshair cursor
        }
        map.current.getCanvas().style.cursor = 'pointer';
      });
      map.current.on('mouseleave', 'regrid-parcel-fill', () => {
        if (draw.current && draw.current.getMode() === 'draw_polygon') {
          return; // Keep crosshair cursor
        }
        map.current.getCanvas().style.cursor = '';
      });

      // Click handler for vector tile parcels
      map.current.on('click', 'regrid-parcel-fill', async (e) => {
        // Don't handle parcel clicks when in drawing mode
        if (draw.current && draw.current.getMode() === 'draw_polygon') {
          console.log('⏸️ Parcel click ignored - drawing mode active');
          return;
        }

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

        // Fetch parcel data - if we have exact parcel ID, use APN endpoint for precision
        let parcel = null;
        if (lead.regridParcelId) {
          // Fetch by exact parcel ID to avoid getting adjacent parcels
          parcel = await fetchParcelByID(lead.regridParcelId, lead.status);
        } else {
          // Fetch by coordinates (less precise, might get adjacent parcel)
          parcel = await fetchParcelData(coords.lat, coords.lng, lead.status, true);
        }
        console.log('Fetched parcel for', lead.name, ':', parcel ? 'success' : 'failed');

        // If parcel found, use its centroid for accurate marker placement
        if (parcel && parcel.geometry) {
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

      // Add markers and collect parcels
      results.forEach(({ coords, parcel, lead }) => {
        if (!coords) return;

        // Collect parcel if available
        if (parcel) {
          parcelFeatures.push(parcel);
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
              background: ${getMarkerColor(lead.status)};
              width: 20px;
              height: 20px;
              border-radius: 50%;
              border: 4px solid rgba(255,255,255,0.95);
              box-shadow: 0 6px 16px rgba(0,0,0,0.5), 0 0 0 6px rgba(${
                lead.status === 'new' ? '59, 130, 246' :
                lead.status === 'scheduled' ? '16, 185, 129' :
                lead.status === 'called' ? '245, 158, 11' : '107, 114, 128'
              }, 0.3);
              ${lead.status === 'new' ? 'animation: strongPulse 1.5s infinite;' : ''}
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
      if (parcelFeatures.length > 0 && map.current && map.current.isStyleLoaded()) {
        console.log('Adding', parcelFeatures.length, 'parcels to map');

        try {
          // Check if source exists, if so update it, otherwise add it
          const existingSource = map.current.getSource('parcels');
          if (existingSource) {
            existingSource.setData({
              type: 'FeatureCollection',
              features: parcelFeatures
            });
          } else {
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
      } else {
        console.log('No parcels to display');
      }
    };

    loadLeadsAndParcels();
  }, [leads]);

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

  // Toggle topography/enhanced hillshading visibility and terrain exaggeration
  useEffect(() => {
    if (!map.current) return;

    // Toggle enhanced hillshading layer
    if (map.current.getLayer('hillshading-enhanced')) {
      map.current.setLayoutProperty(
        'hillshading-enhanced',
        'visibility',
        showTopography ? 'visible' : 'none'
      );
    }

    // Increase terrain exaggeration when topography is on
    if (map.current.getTerrain()) {
      map.current.setTerrain({
        source: 'mapbox-dem',
        exaggeration: showTopography ? 3.0 : 1.2 // Much higher exaggeration for topography mode
      });
    }

    // Adjust default hillshading intensity
    if (map.current.getLayer('hillshading')) {
      map.current.setPaintProperty(
        'hillshading',
        'hillshade-exaggeration',
        showTopography ? 0.8 : 0.5
      );
    }
  }, [showTopography]);

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

      {/* Polygon Drawing Toggle Button */}
      <button
        onClick={togglePolygonMode}
        className={`absolute top-16 left-4 z-10 px-4 py-2 rounded-lg font-semibold shadow-lg transition-all ${
          drawMode === 'draw_polygon'
            ? 'bg-purple-500 text-white hover:bg-purple-600'
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

      {/* Topography Toggle Button - Shows when parcel is selected */}
      {selectedParcel && (
        <button
          onClick={() => setShowTopography(!showTopography)}
          className={`absolute top-28 left-4 z-10 px-4 py-2 rounded-lg font-semibold shadow-lg transition-all ${
            showTopography
              ? 'bg-orange-500 text-white hover:bg-orange-600'
              : 'bg-white/95 text-gray-700 hover:bg-white border border-gray-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
            </svg>
            <span>{showTopography ? 'Hide Topography' : 'Show Topography'}</span>
          </div>
        </button>
      )}

      {/* Premium animations CSS */}
      <style jsx global>{`
        @keyframes strongPulse {
          0% {
            box-shadow: 0 6px 16px rgba(0,0,0,0.5), 0 0 0 6px rgba(59, 130, 246, 0.4), 0 0 0 0 rgba(59, 130, 246, 0.6);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 6px 16px rgba(0,0,0,0.5), 0 0 0 6px rgba(59, 130, 246, 0.3), 0 0 0 20px rgba(59, 130, 246, 0);
            transform: scale(1.1);
          }
          100% {
            box-shadow: 0 6px 16px rgba(0,0,0,0.5), 0 0 0 6px rgba(59, 130, 246, 0.4), 0 0 0 0 rgba(59, 130, 246, 0);
            transform: scale(1);
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
                    {selectedParcel.parcel?.properties?.fields?.ll_gisacre?.toFixed(2) || 'N/A'} Acres
                  </div>
                </div>
              </div>

              {/* Exit Strategy Field */}
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider mb-1.5 block font-semibold">Exit Strategy</label>
                <div className="bg-gradient-to-r from-blue-500/10 to-blue-600/10 border border-blue-500/30 rounded-lg px-3 py-2.5">
                  <div className="text-blue-400 font-bold text-sm capitalize">
                    {selectedLead.dealType || 'N/A'}
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
