'use client';

import { useState, useEffect } from 'react';
import dynamicImport from 'next/dynamic';

// Dynamically import map to avoid SSR issues
const LeadsMap = dynamicImport(() => import('@/components/LeadsMap'), {
  ssr: false,
  loading: () => <div className="w-full h-96 bg-gray-100 rounded-lg animate-pulse" />
});

export const dynamic = 'force-dynamic'; // Fresh compile

export default function DashboardPage() {
  // Simplified - no auth required for Lead-Bid demo
  const [leads, setLeads] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dealTypeFilter, setDealTypeFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  // TODO: Fetch land leads from database
  useEffect(() => {
    // For now, empty - will add land leads later
    setLeads([]);

    // Simulate loading time for smooth entrance
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  const filteredLeads = dealTypeFilter === 'all'
    ? leads
    : leads.filter(lead => lead.dealType === dealTypeFilter);

  // Land-related stats (will calculate from real data later)
  const newLeads = leads.filter(l => !l.offerMade && !l.contractSigned).length;
  const offersOut = leads.filter(l => l.offerMade && !l.contractSigned).length;
  const signedContracts = leads.filter(l => l.contractSigned).length;
  const projectedRevenue = leads.reduce((sum, l) => sum + (l.projectedProfit || 0), 0);

  // Open lead detail modal
  const openLeadDetail = (lead) => {
    setSelectedLead(lead);
    setModalOpen(true);
  };

  // Update lead data
  const updateLead = (leadId, updates) => {
    const updatedLeads = leads.map(l => l.id === leadId ? { ...l, ...updates } : l);
    setLeads(updatedLeads);
    // Update selectedLead if it's the one being edited
    if (selectedLead && selectedLead.id === leadId) {
      setSelectedLead({ ...selectedLead, ...updates });
    }
  };

  // Handle test lead submission
  const handleTestLeadSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);

    const parcelId = formData.get('parcelId');
    const county = formData.get('county');
    const token = process.env.NEXT_PUBLIC_REGRID_TOKEN;

    if (!token) {
      alert('Regrid API token not configured');
      return;
    }

    let latitude = null;
    let longitude = null;
    let address = '';
    let acres = 0;
    let ownerName = `Landowner - ${parcelId}`; // Default, will be replaced if found
    let parcelGeometry = null; // Store geometry for mini map

    try {
      console.log(`🔍 Searching for parcel: ${parcelId} in ${county} County`);

      // Create variations to try (some counties use letters in parcel IDs)
      const variations = [
        parcelId, // Try original first
        parcelId.replace(/[A-Z]/gi, ''), // Remove letters (e.g., "000002621710D0000" → "000002621710000")
        parcelId.replace(/[A-Z]/gi, '0'), // Replace letters with 0 (e.g., "D" → "0")
      ].filter((v, i, arr) => arr.indexOf(v) === i); // Remove duplicates

      console.log('🔍 Trying variations:', variations);

      let data = null;
      let foundParcel = false;

      // Try each variation
      for (const variation of variations) {
        const url = `https://app.regrid.com/api/v2/parcels/apn?parcelnumb=${encodeURIComponent(variation)}&token=${token}`;
        console.log('🔗 Trying:', url.replace(token, 'TOKEN'));

        const response = await fetch(url);
        data = await response.json();

        const features = data?.parcels?.features || [];
        if (features.length > 0) {
          foundParcel = true;
          console.log(`✅ Found with variation: "${variation}"`);
          break;
        }
      }

      // Get features from successful response
      const features = data?.parcels?.features || [];

      if (features.length > 0) {
        const feature = features[0];
        console.log('✅ Found parcel:', feature);

        // Store geometry for mini map
        parcelGeometry = feature.geometry;

        // Extract coordinates from geometry (centroids use Point geometry)
        const coords = feature.geometry.coordinates;
        if (feature.geometry.type === 'Point') {
          longitude = coords[0];
          latitude = coords[1];
        } else if (coords && coords.length > 0) {
          // Handle Polygon/MultiPolygon if returned
          if (feature.geometry.type === 'Polygon') {
            longitude = coords[0][0][0];
            latitude = coords[0][0][1];
          } else if (feature.geometry.type === 'MultiPolygon') {
            longitude = coords[0][0][0][0];
            latitude = coords[0][0][0][1];
          }
        }

        address = feature.properties.headline || feature.properties.address || `${parcelId}, ${county}`;
        acres = feature.properties.fields?.ll_gisacre || feature.properties.fields?.acres || feature.properties.acres || 0;

        // Get owner name from parcel data (they're the one who needs to sign)
        ownerName = feature.properties.fields?.owner || `Landowner - ${parcelId}`;

        console.log('📍 Extracted coords:', { latitude, longitude, address, acres, ownerName });
      } else {
        console.log('❌ No results found. API returned:', data);

        // Show detailed error with API response
        const errorDetails = JSON.stringify(data, null, 2);
        alert(`DEBUG INFO:\n\nQuery: ${parcelId} ${county} County Texas\n\nAPI Response:\n${errorDetails.substring(0, 500)}\n\nNote: Your trial token may only have access to specific counties.`);
        return;
      }
    } catch (error) {
      console.error('Parcel search error:', error);
      alert(`API Error: ${error.message}`);
      return;
    }

    if (!latitude || !longitude) {
      alert('Parcel not found. Check ID and county name.');
      return;
    }

    const newLead = {
      id: Date.now(),
      name: ownerName,
      phone: '555-0000',
      email: 'test@example.com',
      address: address,
      latitude: latitude,
      longitude: longitude,
      acres: acres,
      parcelId: parcelId, // Exact parcel ID searched for
      regridParcelId: parcelId, // Store for exact parcel lookup
      parcelGeometry: parcelGeometry, // Store geometry for mini map
      county: county,
      dealType: 'flips',
      askingPrice: 0,
      pricePerLead: 50,
      status: 'new',
      projectedProfit: 0,
      created_at: new Date().toISOString(),
      issue_description: 'Lead from parcel search',
      notes: '',
      pictures: [],
      offerMade: false,
      offerPrice: 0,
      contractSigned: false,
      contractFile: null
    };

    setLeads([newLead, ...leads]);
    e.target.reset();
  };

  // Loading Screen
  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center">
          {/* Animated Logo */}
          <div className="relative mb-8">
            <div className="w-24 h-24 mx-auto bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/50 animate-pulse">
              <svg className="w-14 h-14 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            {/* Spinning ring */}
            <div className="absolute inset-0 w-24 h-24 mx-auto border-4 border-blue-500/30 border-t-blue-400 rounded-2xl animate-spin" style={{ animationDuration: '2s' }}></div>
          </div>

          {/* Title */}
          <h1 className="text-4xl font-bold text-white mb-2">Lead-Bid</h1>
          <p className="text-lg text-slate-400 mb-8">Land Lead Marketplace</p>

          {/* Loading bar */}
          <div className="w-64 h-1.5 bg-slate-700 rounded-full mx-auto overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-500 to-orange-400 rounded-full animate-pulse" style={{ width: '70%', transition: 'width 1s ease-out' }}></div>
          </div>

          <p className="text-sm text-slate-500 mt-4">Initializing 3D terrain mapping...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top Header */}
      <header className="bg-white shadow-sm z-20 flex-shrink-0">
        <div className="px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 hover:bg-gray-100 rounded"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-xl font-bold text-gray-900">Lead-Bid</h1>
          </div>
        </div>
      </header>

      {/* Main Layout: Sidebar + Map */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Premium Dark Sidebar */}
        <aside className={`
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 transition-transform duration-300
          w-80 lg:w-96 bg-gradient-to-b from-slate-900 to-slate-800 border-r border-slate-700/50 shadow-2xl
          absolute lg:relative h-full z-10
          flex flex-col
        `}>
          {/* Premium Sidebar Header */}
          <div className="p-5 border-b border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-white font-bold text-lg">Land Deals</h2>
                <p className="text-slate-400 text-sm">{leads.length} Active Leads</p>
              </div>
            </div>
          </div>

          {/* Land Stats */}
          <div className="p-4 border-b border-slate-700/50">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-800/60 backdrop-blur-sm p-3 rounded-lg border border-slate-700/50">
                <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">New Leads</div>
                <div className="text-2xl font-bold text-blue-400">
                  {newLeads}
                </div>
              </div>
              <div className="bg-slate-800/60 backdrop-blur-sm p-3 rounded-lg border border-slate-700/50">
                <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Offers Out</div>
                <div className="text-2xl font-bold text-yellow-400">
                  {offersOut}
                </div>
              </div>
              <div className="bg-slate-800/60 backdrop-blur-sm p-3 rounded-lg border border-slate-700/50">
                <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Signed Contracts</div>
                <div className="text-2xl font-bold text-green-400">
                  {signedContracts}
                </div>
              </div>
              <div className="bg-slate-800/60 backdrop-blur-sm p-3 rounded-lg border border-slate-700/50">
                <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Projected Revenue</div>
                <div className="text-lg font-bold text-emerald-400">
                  ${projectedRevenue.toLocaleString()}
                </div>
              </div>
            </div>
          </div>

          {/* Deal Type Filter */}
          <div className="flex border-b border-slate-700/50 bg-slate-900/50 overflow-x-auto">
            {[
              { value: 'all', label: 'All Deals' },
              { value: 'flips', label: 'Flips' },
              { value: 'subdivisions', label: 'Subdivisions' },
              { value: 'entitlements', label: 'Entitlements' }
            ].map(type => (
              <button
                key={type.value}
                onClick={() => setDealTypeFilter(type.value)}
                className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap border-b-2 transition-all ${
                  dealTypeFilter === type.value
                    ? 'border-blue-500 text-blue-400 bg-slate-800/50'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>

          {/* Live Lead Feed */}
          <div className="flex-1 overflow-y-auto bg-slate-900/30">
            <div className="p-4 space-y-2">
              {filteredLeads.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <svg className="w-12 h-12 mx-auto mb-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                  <p className="text-sm font-medium">No leads yet</p>
                  <p className="text-xs text-slate-600 mt-1">Submit a test lead to get started</p>
                </div>
              ) : (
                filteredLeads.map((lead) => (
                  <div
                    key={lead.id}
                    onClick={() => openLeadDetail(lead)}
                    className="bg-slate-800/40 backdrop-blur-sm border border-slate-700/50 rounded-lg p-3 hover:bg-slate-800/60 hover:border-slate-600/50 transition-all cursor-pointer group"
                  >
                    <div className="flex gap-3">
                      {/* Left Column - Lead Info */}
                      <div className="flex-1 min-w-0">
                        {/* Status Indicator & Owner Name */}
                        <div className="flex items-start gap-2 mb-2">
                          <div
                            className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 shadow-lg"
                            style={{
                              backgroundColor:
                                lead.status === 'new' ? '#60A5FA' :
                                lead.status === 'offer' ? '#FBBF24' :
                                lead.status === 'signed' ? '#34D399' :
                                '#94A3B8',
                              boxShadow: `0 0 8px ${
                                lead.status === 'new' ? '#60A5FA' :
                                lead.status === 'offer' ? '#FBBF24' :
                                lead.status === 'signed' ? '#34D399' :
                                '#94A3B8'
                              }40`
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-white text-sm truncate group-hover:text-blue-300 transition-colors">
                              {lead.name}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              </svg>
                              <span className="truncate text-[11px]">{lead.address}</span>
                            </div>
                          </div>
                        </div>

                        {/* Acreage & Exit Row */}
                        <div className="flex gap-2">
                          <div className="bg-orange-500/10 border border-orange-500/30 px-2 py-1 rounded flex-1">
                            <div className="text-[10px] text-slate-400 uppercase">Acres</div>
                            <div className="text-xs font-bold text-orange-400">
                              {lead.acres > 0 ? lead.acres.toFixed(1) : 'N/A'}
                            </div>
                          </div>
                          <div className="relative flex-1">
                            <div className="text-[10px] text-slate-400 uppercase mb-0.5">Exit</div>
                            <select
                              value={lead.dealType}
                              onChange={(e) => {
                                const updatedLeads = leads.map(l =>
                                  l.id === lead.id ? { ...l, dealType: e.target.value } : l
                                );
                                setLeads(updatedLeads);
                              }}
                              className="w-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] px-1.5 py-0.5 rounded appearance-none cursor-pointer hover:bg-blue-500/20 transition-colors pr-4 font-bold"
                            >
                              <option value="flips">Flip</option>
                              <option value="subdivisions">Subdivision</option>
                              <option value="entitlements">Entitlement</option>
                            </select>
                            <svg className="absolute right-1 bottom-1 w-2.5 h-2.5 text-blue-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>
                      </div>

                      {/* Right Column - Mini Map Preview with Satellite Imagery */}
                      <div className="w-20 flex-shrink-0">
                        <div className="relative border border-slate-600/40 rounded overflow-hidden h-full">
                          {lead.latitude && lead.longitude ? (
                            <>
                              <img
                                src={`https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/${lead.longitude},${lead.latitude},13,0/80x80@2x?access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`}
                                alt="Property aerial view"
                                className="absolute inset-0 w-full h-full object-cover"
                              />
                              {/* Property boundary overlay */}
                              {lead.parcelGeometry && (
                                <svg
                                  viewBox="0 0 100 100"
                                  className="absolute inset-0 w-full h-full"
                                  preserveAspectRatio="xMidYMid meet"
                                >
                                  {(() => {
                                    const coords = lead.parcelGeometry.type === 'Polygon'
                                      ? lead.parcelGeometry.coordinates[0]
                                      : lead.parcelGeometry.coordinates[0][0];

                                    const lngs = coords.map(c => c[0]);
                                    const lats = coords.map(c => c[1]);
                                    const minLng = Math.min(...lngs);
                                    const maxLng = Math.max(...lngs);
                                    const minLat = Math.min(...lats);
                                    const maxLat = Math.max(...lats);

                                    const lngRange = maxLng - minLng || 0.001;
                                    const latRange = maxLat - minLat || 0.001;

                                    // Calculate aspect ratio and scale to fit within box
                                    const padding = 10;
                                    const boxSize = 100 - 2 * padding;

                                    // Use the larger range to determine scale, maintaining aspect ratio
                                    const scale = Math.max(lngRange, latRange);
                                    const xScale = (boxSize / scale);
                                    const yScale = (boxSize / scale);

                                    // Center the parcel in the box
                                    const xOffset = padding + (boxSize - lngRange * xScale) / 2;
                                    const yOffset = padding + (boxSize - latRange * yScale) / 2;

                                    // Convert coordinates to SVG space with proper scaling
                                    const points = coords.map(coord => {
                                      const x = ((coord[0] - minLng) * xScale) + xOffset;
                                      const y = boxSize + padding - ((coord[1] - minLat) * yScale) - yOffset + padding;
                                      return `${x},${y}`;
                                    }).join(' ');

                                    return (
                                      <polygon
                                        points={points}
                                        fill="none"
                                        stroke="#EF4444"
                                        strokeWidth="2"
                                      />
                                    );
                                  })()}
                                </svg>
                              )}
                            </>
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80">
                              <svg className="w-8 h-8 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                              </svg>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </aside>

        {/* Map - Full Screen */}
        <div className="flex-1 relative">
          <LeadsMap leads={leads} />

          {/* Simple Test Bar at Bottom */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
            <form onSubmit={handleTestLeadSubmit} className="flex items-center gap-3 bg-gradient-to-r from-slate-900 to-slate-800 backdrop-blur-lg px-6 py-4 rounded-full shadow-2xl border border-slate-700/50">
              <input
                type="text"
                name="parcelId"
                required
                placeholder="Parcel ID"
                className="bg-slate-800/60 border border-slate-700/50 rounded-full px-4 py-2 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 w-48"
              />
              <input
                type="text"
                name="county"
                required
                placeholder="County"
                className="bg-slate-800/60 border border-slate-700/50 rounded-full px-4 py-2 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 w-40"
              />
              <button
                type="submit"
                className="bg-gradient-to-r from-blue-600 to-blue-500 text-white px-6 py-2 rounded-full font-semibold hover:from-blue-500 hover:to-blue-400 transition-all shadow-lg hover:shadow-blue-500/30 whitespace-nowrap"
              >
                Submit Lead
              </button>
            </form>
          </div>
        </div>

        {/* Mobile overlay when sidebar is open */}
        {sidebarOpen && (
          <div
            className="lg:hidden absolute inset-0 bg-black bg-opacity-50 z-5"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </div>

      {/* Lead Detail Modal */}
      {modalOpen && selectedLead && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-b from-slate-800 to-slate-900 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden border border-slate-700/50">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-500 p-6 flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">{selectedLead.name}</h2>
                <p className="text-blue-100 text-sm flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  </svg>
                  {selectedLead.address}
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="space-y-6">
                  {/* Property Details */}
                  <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                    <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                      <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Property Details
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Acreage:</span>
                        <span className="text-white font-semibold">{selectedLead.acres > 0 ? selectedLead.acres.toFixed(2) : 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Parcel ID:</span>
                        <span className="text-white font-mono text-xs">{selectedLead.parcelId}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">County:</span>
                        <span className="text-white">{selectedLead.county}</span>
                      </div>
                    </div>
                  </div>

                  {/* Projected Revenue */}
                  <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                    <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                      <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Projected Revenue
                    </h3>
                    <input
                      type="number"
                      value={selectedLead.projectedProfit || ''}
                      onChange={(e) => updateLead(selectedLead.id, { projectedProfit: Number(e.target.value) })}
                      placeholder="Enter projected revenue"
                      className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/50"
                    />
                  </div>

                  {/* Status Tags */}
                  <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                    <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                      <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                      Status
                    </h3>
                    <div className="space-y-4">
                      {/* Offer Made */}
                      <div>
                        <label className="flex items-center gap-3 cursor-pointer group mb-2">
                          <input
                            type="checkbox"
                            checked={selectedLead.offerMade || false}
                            onChange={(e) => updateLead(selectedLead.id, { offerMade: e.target.checked })}
                            className="w-5 h-5 bg-slate-900/50 border-2 border-slate-700/50 rounded checked:bg-blue-500 checked:border-blue-500 cursor-pointer"
                          />
                          <span className="text-white group-hover:text-blue-300 transition-colors">Offer Made</span>
                        </label>
                        {selectedLead.offerMade && (
                          <div className="ml-8">
                            <input
                              type="number"
                              value={selectedLead.offerPrice || ''}
                              onChange={(e) => updateLead(selectedLead.id, { offerPrice: Number(e.target.value) })}
                              placeholder="Offer price"
                              className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
                            />
                          </div>
                        )}
                      </div>

                      {/* Contract Signed */}
                      <div>
                        <label className="flex items-center gap-3 cursor-pointer group mb-2">
                          <input
                            type="checkbox"
                            checked={selectedLead.contractSigned || false}
                            onChange={(e) => updateLead(selectedLead.id, { contractSigned: e.target.checked })}
                            className="w-5 h-5 bg-slate-900/50 border-2 border-slate-700/50 rounded checked:bg-green-500 checked:border-green-500 cursor-pointer"
                          />
                          <span className="text-white group-hover:text-green-300 transition-colors">Contract Signed</span>
                        </label>
                        {selectedLead.contractSigned && (
                          <div className="ml-8">
                            <input
                              type="file"
                              accept=".pdf,.doc,.docx"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const fileUrl = URL.createObjectURL(file);
                                  updateLead(selectedLead.id, {
                                    contractFile: { url: fileUrl, name: file.name }
                                  });
                                }
                              }}
                              className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-green-500 file:text-white file:cursor-pointer hover:file:bg-green-600 file:text-xs"
                            />
                            {selectedLead.contractFile && (
                              <div className="mt-2 flex items-center gap-2 text-xs text-green-400 bg-green-500/10 border border-green-500/30 rounded px-2 py-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span className="flex-1 truncate">{selectedLead.contractFile.name}</span>
                                <a
                                  href={selectedLead.contractFile.url}
                                  download={selectedLead.contractFile.name}
                                  className="text-green-300 hover:text-green-200"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                  </svg>
                                </a>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                  {/* Notes */}
                  <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                    <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                      <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Notes
                    </h3>
                    <textarea
                      value={selectedLead.notes || ''}
                      onChange={(e) => updateLead(selectedLead.id, { notes: e.target.value })}
                      placeholder="Add notes about this lead..."
                      rows={8}
                      className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 resize-none"
                    />
                  </div>

                  {/* Pictures */}
                  <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                    <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                      <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Pictures
                    </h3>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        const fileUrls = files.map(file => URL.createObjectURL(file));
                        updateLead(selectedLead.id, {
                          pictures: [...(selectedLead.pictures || []), ...fileUrls]
                        });
                      }}
                      className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-2 text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-500 file:text-white file:cursor-pointer hover:file:bg-blue-600"
                    />
                    {selectedLead.pictures && selectedLead.pictures.length > 0 && (
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {selectedLead.pictures.map((pic, idx) => (
                          <div key={idx} className="relative group">
                            <img
                              src={pic}
                              alt={`Upload ${idx + 1}`}
                              className="w-full h-20 object-cover rounded-lg border border-slate-700/50"
                            />
                            <button
                              onClick={() => {
                                const newPics = selectedLead.pictures.filter((_, i) => i !== idx);
                                updateLead(selectedLead.id, { pictures: newPics });
                              }}
                              className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-800/50 border-t border-slate-700/50 p-4 flex justify-end gap-3">
              <button
                onClick={() => setModalOpen(false)}
                className="px-6 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors font-semibold"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setSelectedLead(null);
                  setModalOpen(false);
                }}
                className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-semibold"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
