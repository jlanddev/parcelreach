'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamicImport from 'next/dynamic';
import { createClient } from '@supabase/supabase-js';
import NotificationsPanel from '@/components/NotificationsPanel';
import LeadNotes from '@/components/LeadNotes';

// Dynamically import map to avoid SSR issues
const LeadsMap = dynamicImport(() => import('@/components/LeadsMap'), {
  ssr: false,
  loading: () => <div className="w-full h-96 bg-gray-100 rounded-lg animate-pulse" />
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export const dynamic = 'force-dynamic'; // Fresh compile

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
  'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky',
  'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi',
  'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico',
  'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania',
  'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
  'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'
];

const ACREAGE_RANGES = [
  { label: '0-5 acres', value: '0-5' },
  { label: '5-20 acres', value: '5-20' },
  { label: '20-100 acres', value: '20-100' },
  { label: '100+ acres', value: '100+' }
];

export default function DashboardPage() {
  const router = useRouter();
  const [leads, setLeads] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dealTypeFilter, setDealTypeFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentTeam, setCurrentTeam] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [saveTimeout, setSaveTimeout] = useState(null);
  const [logoPosition, setLogoPosition] = useState({ x: 0, y: 0 });
  const [logoSize, setLogoSize] = useState(200);
  const [isDraggingLogo, setIsDraggingLogo] = useState(false);
  const [isResizingLogo, setIsResizingLogo] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ size: 200, x: 0 });
  const [headerPaddingTop, setHeaderPaddingTop] = useState(8);
  const [isDraggingPadding, setIsDraggingPadding] = useState(false);
  const [paddingDragStart, setPaddingDragStart] = useState({ padding: 8, y: 0 });
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [logoEditMode, setLogoEditMode] = useState(false);
  const [campaignsOpen, setCampaignsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [zoomToLead, setZoomToLead] = useState(null);
  const [clickTimeout, setClickTimeout] = useState(null);

  // Campaign settings state
  const [campaignName, setCampaignName] = useState('');
  const [dailyLeadLimit, setDailyLeadLimit] = useState('');
  const [isNationwide, setIsNationwide] = useState(true);
  const [selectedStates, setSelectedStates] = useState([]);
  const [selectedAcreageRange, setSelectedAcreageRange] = useState('');
  const [viewingCampaigns, setViewingCampaigns] = useState(false);
  const [campaigns, setCampaigns] = useState([]);

  // Delete confirmation modal
  const [leadToDelete, setLeadToDelete] = useState(null);

  // Account settings state
  const [organizationName, setOrganizationName] = useState('');

  // Check authentication and load team data
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      setCurrentUser(user);

      // Get or create user profile
      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();

      if (!userData) {
        await supabase.from('users').insert([{
          id: user.id,
          email: user.email,
          full_name: user.email.split('@')[0]
        }]);
      }

      // Check if admin is viewing a specific organization
      const adminViewingOrg = typeof window !== 'undefined' ? sessionStorage.getItem('admin_viewing_org') : null;
      console.log('🔍 Dashboard checking admin_viewing_org:', adminViewingOrg);

      if (adminViewingOrg) {
        // Load the specific organization for admin
        console.log('📊 Loading admin organization:', adminViewingOrg);
        const { data: team } = await supabase
          .from('teams')
          .select('*')
          .eq('id', adminViewingOrg)
          .single();

        console.log('📊 Admin team loaded:', team);
        if (team) {
          setCurrentTeam(team);
          loadTeamMembers(team.id);
          fetchLeads(team.id);
        }
      } else {
        // Get user's teams
        const { data: teams } = await supabase
          .from('team_members')
          .select('team_id, teams(*)')
          .eq('user_id', user.id);

        if (teams && teams.length > 0) {
          setCurrentTeam(teams[0].teams);
          loadTeamMembers(teams[0].team_id);
          fetchLeads(teams[0].team_id);
        } else {
        // Create default team for user
        const { data: newTeam } = await supabase
          .from('teams')
          .insert([{
            name: `${user.email}'s Team`,
            owner_id: user.id
          }])
          .select()
          .single();

        await supabase.from('team_members').insert([{
          team_id: newTeam.id,
          user_id: user.id,
          role: 'owner'
        }]);

          setCurrentTeam(newTeam);
          loadTeamMembers(newTeam.id);
          fetchLeads(newTeam.id);
        }
      }
    };

    checkAuth();
  }, []);




  const loadTeamMembers = async (teamId) => {
    const { data } = await supabase
      .from('team_members')
      .select('*, users(id, full_name, email)')
      .eq('team_id', teamId);

    setTeamMembers(data || []);
  };

  // Load organization name when modal opens or team changes
  useEffect(() => {
    if (currentTeam?.name) {
      setOrganizationName(currentTeam.name);
    }
  }, [currentTeam, accountOpen]);

  // Load logo position and size from localStorage
  useEffect(() => {
    const savedPosition = localStorage.getItem('logoPosition');
    const savedSize = localStorage.getItem('logoSize');
    const savedPadding = localStorage.getItem('headerPaddingTop');
    if (savedPosition) {
      setLogoPosition(JSON.parse(savedPosition));
    }
    if (savedSize) {
      setLogoSize(JSON.parse(savedSize));
    }
    if (savedPadding) {
      setHeaderPaddingTop(JSON.parse(savedPadding));
    }
  }, []);

  // Logo drag handlers
  const handleLogoMouseDown = (e) => {
    e.preventDefault();
    setIsDraggingLogo(true);
    setDragStart({
      x: e.clientX - logoPosition.x,
      y: e.clientY - logoPosition.y
    });
  };

  const handleResizeMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingLogo(true);
    setResizeStart({
      size: logoSize,
      x: e.clientX
    });
  };

  const handlePaddingMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingPadding(true);
    setPaddingDragStart({
      padding: headerPaddingTop,
      y: e.clientY
    });
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDraggingLogo) {
        const newPosition = {
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y
        };
        setLogoPosition(newPosition);
      }
      if (isResizingLogo) {
        const delta = e.clientX - resizeStart.x;
        const newSize = Math.max(100, Math.min(400, resizeStart.size + delta));
        setLogoSize(newSize);
      }
      if (isDraggingPadding) {
        const delta = e.clientY - paddingDragStart.y;
        // Drag down = increase padding, drag up = decrease padding
        const newPadding = Math.max(-20, Math.min(60, paddingDragStart.padding + delta));
        setHeaderPaddingTop(newPadding);
      }
    };

    const handleMouseUp = () => {
      if (isDraggingLogo) {
        setIsDraggingLogo(false);
        localStorage.setItem('logoPosition', JSON.stringify(logoPosition));
      }
      if (isResizingLogo) {
        setIsResizingLogo(false);
        localStorage.setItem('logoSize', JSON.stringify(logoSize));
      }
      if (isDraggingPadding) {
        setIsDraggingPadding(false);
        localStorage.setItem('headerPaddingTop', JSON.stringify(headerPaddingTop));
      }
    };

    if (isDraggingLogo || isResizingLogo || isDraggingPadding) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDraggingLogo, isResizingLogo, isDraggingPadding, logoPosition, logoSize, headerPaddingTop, dragStart, resizeStart, paddingDragStart]);

  // Fetch land leads from database
  const fetchLeads = async (teamId) => {
    try {
      console.log('🔍 DEBUG: Fetching leads for teamId:', teamId);

      // Get lead IDs assigned to this team from junction table
      const { data: assignments, error: assignError } = await supabase
        .from('lead_assignments')
        .select('lead_id')
        .eq('team_id', teamId);

      if (assignError) {
        console.error('Error fetching assignments:', assignError);
        setLeads([]);
        return;
      }

      const assignedLeadIds = assignments?.map(a => a.lead_id) || [];
      console.log('📋 DEBUG: Assigned lead IDs:', assignedLeadIds);

      // Fetch the actual leads
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .in('id', assignedLeadIds.length > 0 ? assignedLeadIds : ['00000000-0000-0000-0000-000000000000']) // Use dummy UUID if no assignments
        .order('created_at', { ascending: false});

      if (error) {
        console.error('Error fetching leads:', error);
      } else {
        console.log('✅ DEBUG: Fetched', data?.length, 'leads from database');
        console.log('📋 DEBUG: All lead names:', data?.map(l => `${l.full_name || l.name} (team_id: ${l.team_id}, dealtype: ${l.dealtype}, status: ${l.status})`));

        // Check specifically for Jon burns lead
        const jonBurns = data?.find(l => (l.full_name || l.name)?.toLowerCase().includes('jon burns'));
        if (jonBurns) {
          console.log('🎯 DEBUG: FOUND Jon burns lead:', jonBurns);
        } else {
          console.log('❌ DEBUG: Jon burns lead NOT in database results');
        }

        // Normalize field names: database uses lowercase, but we want both for compatibility
        const normalizedLeads = (data || []).map(lead => ({
          ...lead,
          offerMade: lead.offermade,
          contractSigned: lead.contractsigned,
          projectedProfit: lead.projectedrevenue,
          offerPrice: lead.offerprice
        }));
        setLeads(normalizedLeads);

        // Auto-assign unassigned leads to this team
        const unassignedLeads = data?.filter(l => !l.team_id) || [];
        if (unassignedLeads.length > 0) {
          console.log(`Auto-assigning ${unassignedLeads.length} leads to team ${teamId}`);
          for (const lead of unassignedLeads) {
            await supabase
              .from('leads')
              .update({ team_id: teamId })
              .eq('id', lead.id);
          }
        }
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fix missing coordinates for existing leads
  const fixMissingCoordinates = async () => {
    const leadsNeedingFix = leads.filter(l => !l.latitude || !l.longitude);
    console.log(`Fixing ${leadsNeedingFix.length} leads...`);

    for (const lead of leadsNeedingFix) {
      try {
        // Geocode the address
        const query = encodeURIComponent(`${lead.address}, ${lead.city}, TX ${lead.zip || ''}`);
        const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`;

        const response = await fetch(geocodeUrl);
        const data = await response.json();

        if (data.length > 0) {
          const { lat, lon } = data[0];

          // Update in database
          await supabase
            .from('leads')
            .update({ latitude: parseFloat(lat), longitude: parseFloat(lon) })
            .eq('id', lead.id);

          console.log(`Fixed ${lead.name}: ${lat}, ${lon}`);
        }

        // Wait 1 second between requests (Nominatim rate limit)
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error fixing ${lead.name}:`, error);
      }
    }

    // Refresh leads
    const { data } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
    setLeads(data || []);
    alert('Coordinates updated! Refresh the page.');
  };

  const filteredLeads = dealTypeFilter === 'all'
    ? leads
    : leads.filter(lead => lead.dealtype === dealTypeFilter);

  // DEBUG: Log filtering results
  console.log('🔎 DEBUG: dealTypeFilter =', dealTypeFilter);
  console.log('🔎 DEBUG: Total leads before filter:', leads.length);
  console.log('🔎 DEBUG: Total leads after filter:', filteredLeads.length);
  if (leads.length !== filteredLeads.length) {
    console.log('⚠️ DEBUG: Some leads were filtered out!');
    const jonInAll = leads.find(l => (l.full_name || l.name)?.toLowerCase().includes('jon burns'));
    const jonInFiltered = filteredLeads.find(l => (l.full_name || l.name)?.toLowerCase().includes('jon burns'));
    if (jonInAll && !jonInFiltered) {
      console.log('❌ DEBUG: Jon burns was FILTERED OUT by dealtype filter!');
      console.log('   Jon burns dealtype:', jonInAll.dealtype);
      console.log('   Active filter:', dealTypeFilter);
    }
  }

  // Land-related stats
  const newLeads = leads.filter(l => !l.offerMade && !l.contractSigned).length;
  const offersOut = leads.filter(l => l.offerMade).length; // Count ALL offers made
  const signedContracts = leads.filter(l => l.contractSigned).length;
  const projectedRevenue = leads.reduce((sum, l) => sum + (l.projectedProfit || 0), 0);

  // Open lead detail modal
  const openLeadDetail = (lead) => {
    setSelectedLead(lead);
    setModalOpen(true);
  };

  // Handle property card click (single = zoom, double = open details)
  const handleCardClick = (lead) => {
    // Clear any existing timeout
    if (clickTimeout) {
      clearTimeout(clickTimeout);
      setClickTimeout(null);
      // Double click detected - open details
      openLeadDetail(lead);
    } else {
      // Single click - set timeout to zoom after delay
      const timeout = setTimeout(() => {
        // Single click confirmed - zoom to property
        setZoomToLead(lead);
        setClickTimeout(null);
      }, 300); // 300ms delay to detect double-click
      setClickTimeout(timeout);
    }
  };

  // Update lead data
  const updateLead = async (leadId, updates, debounce = false) => {
    // Map field names to match both camelCase (UI) and lowercase (DB)
    const normalizedUpdates = { ...updates };
    if ('offermade' in updates) {
      normalizedUpdates.offerMade = updates.offermade;
      normalizedUpdates.offermade = updates.offermade;
    }
    if ('contractsigned' in updates) {
      normalizedUpdates.contractSigned = updates.contractsigned;
      normalizedUpdates.contractsigned = updates.contractsigned;
    }
    if ('projectedrevenue' in updates) {
      normalizedUpdates.projectedProfit = updates.projectedrevenue;
      normalizedUpdates.projectedrevenue = updates.projectedrevenue;
    }
    if ('offerprice' in updates) {
      normalizedUpdates.offerPrice = updates.offerprice;
      normalizedUpdates.offerprice = updates.offerprice;
    }

    // Update local state immediately for responsive UI
    const updatedLeads = leads.map(l => l.id === leadId ? { ...l, ...normalizedUpdates } : l);
    setLeads(updatedLeads);
    if (selectedLead && selectedLead.id === leadId) {
      setSelectedLead({ ...selectedLead, ...normalizedUpdates });
    }

    // Debounce database updates for text inputs - DON'T show toast on auto-save
    if (debounce) {
      if (saveTimeout) clearTimeout(saveTimeout);
      const timeout = setTimeout(async () => {
        try {
          const { error } = await supabase
            .from('leads')
            .update(updates)
            .eq('id', leadId);
          if (error) {
            console.error('Error updating lead:', error.message);
          }
          // Silent auto-save, no toast
        } catch (err) {
          console.error('Error:', err.message);
        }
      }, 1000); // Wait 1 second after typing stops
      setSaveTimeout(timeout);
    } else {
      // Immediate save for checkboxes, file uploads - DON'T show toast
      try {
        const { error } = await supabase
          .from('leads')
          .update(updates)
          .eq('id', leadId);
        if (error) {
          console.error('Error updating lead:', error.message);
        }
        // Silent save, no toast
      } catch (err) {
        console.error('Error:', err.message);
      }
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
          <h1 className="text-4xl font-bold text-white mb-2">ParcelReach</h1>
          <p className="text-lg text-slate-400 mb-8">Land Lead Intelligence</p>

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
    <>
      <div className="h-screen flex overflow-hidden">
        {/* Premium Dark Sidebar - Full Height */}
        <aside className={`
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 transition-transform duration-300
        w-80 lg:w-96 bg-gradient-to-b from-slate-900 to-slate-800 border-r border-slate-700/50 shadow-2xl
        absolute lg:relative h-full z-20
        flex flex-col
      `}>
        {/* Sidebar Header with User Info */}
        <div className="px-5 pb-4 border-b border-slate-700/50" style={{ paddingTop: `${headerPaddingTop}px` }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex flex-col gap-1 w-full">
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <img
                  src="/parcelreach-logo.png"
                  alt="ParcelReach AI"
                  onMouseDown={logoEditMode ? handleLogoMouseDown : undefined}
                  style={{
                    width: `${logoSize}px`,
                    height: 'auto',
                    position: 'relative',
                    left: `${logoPosition.x}px`,
                    top: `${logoPosition.y}px`,
                    userSelect: 'none',
                    pointerEvents: logoEditMode ? 'auto' : 'none',
                    cursor: logoEditMode ? 'move' : 'default',
                    border: logoEditMode ? '2px dashed rgba(59, 130, 246, 0.5)' : 'none'
                  }}
                />
                {logoEditMode && (
                  <div
                    onMouseDown={handleResizeMouseDown}
                    style={{
                      position: 'absolute',
                      right: '0',
                      bottom: '0',
                      width: '20px',
                      height: '20px',
                      background: 'rgba(59, 130, 246, 0.8)',
                      cursor: 'nwse-resize',
                      borderRadius: '0 0 4px 0'
                    }}
                  />
                )}
              </div>
              <div className="flex items-center gap-2">
                <p className="text-slate-400 text-sm">{leads.length} Active Leads</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {/* Campaigns Button */}
              <button
                onClick={() => setCampaignsOpen(true)}
                className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors"
                title="Campaigns"
              >
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </button>

              {/* Notifications */}
              {currentUser && (
                <NotificationsPanel
                  userId={currentUser.id}
                  onLeadClick={(leadId) => {
                    const lead = leads.find(l => l.id === leadId);
                    if (lead) openLeadDetail(lead);
                  }}
                />
              )}

              {/* Account Button */}
              <button
                onClick={() => setAccountOpen(true)}
                className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors"
                title="Account Settings"
              >
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Organization Name */}
          {currentTeam && (
            <div className="text-xs text-slate-400 truncate">
              {currentTeam.name || 'Organization'}
            </div>
          )}
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
                    className="bg-slate-800/40 backdrop-blur-sm border border-slate-700/50 rounded-lg p-3 hover:bg-slate-800/60 hover:border-slate-600/50 transition-all group relative"
                  >
                    {/* Gear Icon */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setLeadToDelete(lead);
                      }}
                      className="absolute top-2 right-2 p-1.5 hover:bg-slate-700/50 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      title="Remove Lead"
                    >
                      <svg className="w-4 h-4 text-slate-400 hover:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>

                    <div className="flex gap-3 cursor-pointer" onClick={() => handleCardClick(lead)}>
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
                              {(lead.acreage || lead.acres) > 0 ? (lead.acreage || lead.acres).toFixed(1) : 'N/A'}
                            </div>
                          </div>
                          <div className="relative flex-1">
                            <div className="text-[10px] text-slate-400 uppercase mb-0.5">Exit</div>
                            <select
                              value={lead.dealtype || ''}
                              onClick={(e) => e.stopPropagation()}
                              onChange={async (e) => {
                                e.stopPropagation();
                                const newDealType = e.target.value;

                                if (!newDealType) return; // Don't save if "Select Exit" is chosen

                                // Update in database
                                try {
                                  const { data, error } = await supabase
                                    .from('leads')
                                    .update({ dealtype: newDealType })
                                    .eq('id', lead.id)
                                    .select();

                                  if (error) {
                                    console.error('Error updating dealType:', error);
                                    alert(`Failed to update: ${error.message}`);
                                  } else {
                                    console.log('Successfully updated dealType:', data);
                                    // Update local state
                                    const updatedLeads = leads.map(l =>
                                      l.id === lead.id ? { ...l, dealtype: newDealType } : l
                                    );
                                    setLeads(updatedLeads);
                                  }
                                } catch (err) {
                                  console.error('Exception updating dealType:', err);
                                  alert(`Error: ${err.message}`);
                                }
                              }}
                              className="w-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] px-1.5 py-0.5 rounded appearance-none cursor-pointer hover:bg-blue-500/20 transition-colors pr-4 font-bold"
                            >
                              <option value="" disabled>Select Exit</option>
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
                                src={(() => {
                                  // Check all possible field name variations for parcel geometry
                                  const geometry = lead.parcel_geometry || lead.parcelgeometry || lead.parcelGeometry;

                                  if (geometry) {
                                    // Create GeoJSON for the parcel
                                    const geojson = {
                                      type: 'Feature',
                                      properties: { stroke: '#EF4444', 'stroke-width': 2, 'stroke-opacity': 1, fill: '#EF4444', 'fill-opacity': 0.3 },
                                      geometry: geometry
                                    };
                                    const encodedGeojson = encodeURIComponent(JSON.stringify(geojson));
                                    return `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/geojson(${encodedGeojson})/auto/80x80@2x?logo=false&attribution=false&access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`;
                                  }

                                  return `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/${lead.longitude},${lead.latitude},14,0/80x80@2x?logo=false&attribution=false&access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`;
                                })()}
                                alt="Property aerial view"
                                className="absolute inset-0 w-full h-full object-cover"
                              />
                              {/* GeoJSON overlay now handled by Mapbox Static API */}
                              {false && (lead.parcelgeometry || lead.parcelGeometry) && (
                                <svg
                                  viewBox="0 0 100 100"
                                  className="absolute inset-0 w-full h-full"
                                  preserveAspectRatio="xMidYMid meet"
                                >
                                  {(() => {
                                    const geometry = lead.parcelgeometry
                                      ? (typeof lead.parcelgeometry === 'string' ? JSON.parse(lead.parcelgeometry) : lead.parcelgeometry)
                                      : lead.parcelGeometry;

                                    const coords = geometry.type === 'Polygon'
                                      ? geometry.coordinates[0]
                                      : geometry.coordinates[0][0];

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
          {/* Mobile Menu Button */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden absolute top-4 left-4 z-30 p-3 bg-slate-900/90 backdrop-blur-sm rounded-lg shadow-lg border border-slate-700/50 text-white hover:bg-slate-800 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <LeadsMap leads={leads} zoomToLead={zoomToLead} />
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
                        <span className="text-white font-semibold">{(selectedLead.acreage || selectedLead.acres) > 0 ? (selectedLead.acreage || selectedLead.acres).toFixed(2) : 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Parcel ID:</span>
                        <input
                          type="text"
                          value={selectedLead.parcel_id || selectedLead.parcelid || ''}
                          onChange={(e) => updateLead(selectedLead.id, { parcel_id: e.target.value, parcelid: e.target.value }, true)}
                          placeholder="Enter parcel ID"
                          className="text-right bg-slate-900/50 border border-slate-700/50 rounded px-2 py-1 text-white font-mono text-xs focus:outline-none focus:border-blue-500/50"
                        />
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">County:</span>
                        <input
                          type="text"
                          value={selectedLead.county || ''}
                          onChange={(e) => updateLead(selectedLead.id, { county: e.target.value }, true)}
                          placeholder="Enter county"
                          className="text-right bg-slate-900/50 border border-slate-700/50 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-blue-500/50"
                        />
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
                      value={selectedLead.projectedrevenue || selectedLead.projectedProfit || selectedLead.projected_revenue || ''}
                      onChange={(e) => updateLead(selectedLead.id, { projectedrevenue: Number(e.target.value) }, true)}
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
                            onChange={(e) => updateLead(selectedLead.id, { offermade: e.target.checked })}
                            className="w-5 h-5 bg-slate-900/50 border-2 border-slate-700/50 rounded checked:bg-blue-500 checked:border-blue-500 cursor-pointer"
                          />
                          <span className="text-white group-hover:text-blue-300 transition-colors">Offer Made</span>
                        </label>
                        {selectedLead.offerMade && (
                          <div className="ml-8">
                            <input
                              type="number"
                              value={selectedLead.offerPrice || ''}
                              onChange={(e) => updateLead(selectedLead.id, { offerprice: Number(e.target.value) }, true)}
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
                            onChange={(e) => updateLead(selectedLead.id, { contractsigned: e.target.checked })}
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
                                    contractfile: { url: fileUrl, name: file.name }
                                  });
                                }
                              }}
                              className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-green-500 file:text-white file:cursor-pointer hover:file:bg-green-600 file:text-xs"
                            />
                            {(selectedLead.contractfile || selectedLead.contractFile) && (
                              <div className="mt-2 flex items-center gap-2 text-xs text-green-400 bg-green-500/10 border border-green-500/30 rounded px-2 py-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span className="flex-1 truncate">{(selectedLead.contractfile || selectedLead.contractFile).name}</span>
                                <a
                                  href={(selectedLead.contractfile || selectedLead.contractFile).url}
                                  download={(selectedLead.contractfile || selectedLead.contractFile).name}
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
                    {currentUser && (
                      <LeadNotes
                        leadId={selectedLead.id}
                        currentUserId={currentUser.id}
                        teamMembers={teamMembers}
                      />
                    )}
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
                      <div className="mt-3 grid grid-cols-4 gap-2">
                        {selectedLead.pictures.map((pic, idx) => (
                          <div key={idx} className="relative group">
                            <img
                              src={pic}
                              alt={`Upload ${idx + 1}`}
                              onClick={() => {
                                setLightboxImage(pic);
                                setLightboxOpen(true);
                              }}
                              className="w-full h-24 object-cover rounded-lg border border-slate-700/50 cursor-pointer hover:border-blue-500/50 transition-all"
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
                  setShowSaveToast('Changes saved');
                  setTimeout(() => setShowSaveToast(false), 2000);
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

      {/* Image Lightbox Modal */}
      {lightboxOpen && lightboxImage && (
        <div
          className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 text-white bg-slate-800/80 hover:bg-slate-700 rounded-full p-3 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={lightboxImage}
            alt="Full size view"
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Campaigns Modal */}
      {campaignsOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setCampaignsOpen(false)}>
          <div className="bg-gradient-to-b from-slate-800 to-slate-900 rounded-xl shadow-2xl max-w-2xl w-full border border-slate-700/50 p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Campaign Settings</h2>
              <button
                onClick={() => setCampaignsOpen(false)}
                className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors"
              >
                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-6">
              {/* View Campaigns Button */}
              <button
                onClick={() => setViewingCampaigns(true)}
                className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg hover:bg-slate-600 transition-colors font-semibold flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                View All Campaigns
              </button>

              <div className="border-t border-slate-700/50 pt-6">
                <h3 className="text-lg font-bold text-white mb-4">Create New Campaign</h3>
              </div>

              {/* Campaign Name */}
              <div>
                <label className="block text-sm font-semibold text-white mb-2">Campaign Name</label>
                <input
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g., Texas Land Deals Q1 2025"
                  className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
                />
              </div>

              {/* Daily Lead Limit */}
              <div>
                <label className="block text-sm font-semibold text-white mb-2">Daily Lead Limit</label>
                <input
                  type="number"
                  min="1"
                  value={dailyLeadLimit}
                  onChange={(e) => setDailyLeadLimit(e.target.value)}
                  placeholder="e.g., 10"
                  className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
                />
                <p className="text-xs text-slate-400 mt-1">Maximum number of leads to receive per day</p>
              </div>

              {/* Targeting */}
              <div>
                <label className="block text-sm font-semibold text-white mb-3">Targeting</label>

                {/* Nationwide Toggle */}
                <label className="flex items-center gap-3 mb-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isNationwide}
                    onChange={(e) => {
                      setIsNationwide(e.target.checked);
                      if (e.target.checked) setSelectedStates([]);
                    }}
                    className="w-5 h-5 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                  />
                  <span className="text-white font-medium">Nationwide</span>
                </label>

                {/* State Selection */}
                {!isNationwide && (
                  <div className="border border-slate-700/50 rounded-lg p-4 bg-slate-900/30 max-h-60 overflow-y-auto">
                    <div className="grid grid-cols-2 gap-2">
                      {US_STATES.map((state) => (
                        <label key={state} className="flex items-center gap-2 cursor-pointer hover:bg-slate-800/50 p-2 rounded">
                          <input
                            type="checkbox"
                            checked={selectedStates.includes(state)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedStates([...selectedStates, state]);
                              } else {
                                setSelectedStates(selectedStates.filter(s => s !== state));
                              }
                            }}
                            className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                          />
                          <span className="text-sm text-slate-300">{state}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {!isNationwide && selectedStates.length > 0 && (
                  <div className="mt-2 text-xs text-blue-400">
                    {selectedStates.length} state{selectedStates.length !== 1 ? 's' : ''} selected
                  </div>
                )}
              </div>

              {/* Acreage Range */}
              <div>
                <label className="block text-sm font-semibold text-white mb-3">Acreage Range</label>
                <div className="grid grid-cols-2 gap-3">
                  {ACREAGE_RANGES.map((range) => (
                    <button
                      key={range.value}
                      onClick={() => setSelectedAcreageRange(range.value)}
                      className={`px-4 py-3 rounded-lg font-semibold text-sm transition-all ${
                        selectedAcreageRange === range.value
                          ? 'bg-blue-500 text-white border-2 border-blue-400'
                          : 'bg-slate-900/50 text-slate-300 border border-slate-700/50 hover:bg-slate-800 hover:border-slate-600'
                      }`}
                    >
                      {range.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setCampaignsOpen(false)}
                  className="flex-1 px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    // TODO: Save campaign settings to database
                    if (!campaignName.trim()) {
                      alert('Please enter a campaign name');
                      return;
                    }

                    // Create new campaign object
                    const newCampaign = {
                      id: Date.now(), // Simple ID generation
                      campaignName,
                      dailyLeadLimit,
                      isNationwide,
                      selectedStates,
                      selectedAcreageRange,
                      status: 'draft', // Default to draft when creating
                      createdAt: new Date().toISOString()
                    };

                    // Add to campaigns array
                    setCampaigns([...campaigns, newCampaign]);

                    // Clear form
                    setCampaignName('');
                    setDailyLeadLimit('');
                    setIsNationwide(true);
                    setSelectedStates([]);
                    setSelectedAcreageRange('');
                    setCampaignsOpen(false);
                    alert('Campaign saved as draft!');
                  }}
                  className="flex-1 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-400 transition-colors font-semibold"
                >
                  Save Campaign
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Account Settings Modal */}
      {accountOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-b from-slate-800 to-slate-900 rounded-xl shadow-2xl max-w-2xl w-full border border-slate-700/50 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Account Settings</h2>
              <button
                onClick={() => setAccountOpen(false)}
                className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors"
              >
                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-6">
              {/* Organization Name */}
              <div>
                <label className="block text-sm font-semibold text-white mb-2">Organization Name</label>
                <input
                  type="text"
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  placeholder="Your Company Name"
                  className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
                />
              </div>

              {/* Your Name */}
              <div>
                <label className="block text-sm font-semibold text-white mb-2">Your Email</label>
                <input
                  type="text"
                  value={currentUser?.email || ''}
                  disabled
                  className="w-full bg-slate-900/30 border border-slate-700/50 rounded-lg px-4 py-3 text-slate-400 cursor-not-allowed"
                />
              </div>

              {/* Team Members */}
              <div>
                <label className="block text-sm font-semibold text-white mb-2">Team Members</label>
                <div className="space-y-2 mb-3">
                  {teamMembers?.map((member) => (
                    <div key={member.users.id} className="flex items-center justify-between bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-2">
                      <div>
                        <p className="text-white text-sm">{member.users.full_name}</p>
                        <p className="text-slate-400 text-xs">{member.users.email}</p>
                      </div>
                      <button
                        onClick={() => alert('Remove team member feature coming soon')}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => {
                    if (!currentTeam?.id) {
                      alert('Please wait for your team to load before inviting members.');
                      return;
                    }
                    setInviteEmail('');
                    setInviteModalOpen(true);
                  }}
                  className="w-full bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-400 transition-colors text-sm font-semibold"
                >
                  + Add Team Member
                </button>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-semibold text-white mb-2">Change Password</label>
                <button
                  onClick={async () => {
                    try {
                      const { error } = await supabase.auth.resetPasswordForEmail(currentUser.email, {
                        redirectTo: `${window.location.origin}/reset-password`,
                      });
                      if (error) throw error;
                      alert('Password reset email sent! Please check your inbox.');
                    } catch (error) {
                      console.error('Error sending password reset:', error);
                      alert('Failed to send password reset email. Please try again.');
                    }
                  }}
                  className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg hover:bg-slate-600 transition-colors text-sm font-semibold"
                >
                  Update Password
                </button>
              </div>

              {/* Billing */}
              <div>
                <label className="block text-sm font-semibold text-white mb-2">Billing</label>
                <button
                  onClick={() => alert('Billing management coming soon')}
                  className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg hover:bg-slate-600 transition-colors text-sm font-semibold"
                >
                  Manage Billing
                </button>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-700/50">
                <button
                  onClick={async () => {
                    // Save organization name to database
                    if (organizationName.trim() && currentTeam?.id) {
                      try {
                        const { error } = await supabase
                          .from('teams')
                          .update({ name: organizationName.trim() })
                          .eq('id', currentTeam.id);

                        if (error) {
                          console.error('Error updating team name:', error);
                          alert('Failed to update organization name. Please try again.');
                        } else {
                          // Update local state
                          setCurrentTeam({ ...currentTeam, name: organizationName.trim() });
                          alert('Organization name updated successfully!');
                        }
                      } catch (error) {
                        console.error('Error updating team name:', error);
                        alert('Failed to update organization name. Please try again.');
                      }
                    }
                    setAccountOpen(false);
                  }}
                  className="flex-1 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-400 transition-colors font-semibold"
                >
                  Save Changes
                </button>
                <button
                  onClick={async () => {
                    await supabase.auth.signOut();
                    router.push('/login');
                  }}
                  className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors font-semibold"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invite Team Member Modal */}
      {inviteModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setInviteModalOpen(false)}>
          <div className="bg-gradient-to-b from-slate-800 to-slate-900 rounded-xl shadow-2xl max-w-md w-full border border-slate-700/50 p-8" onClick={(e) => e.stopPropagation()}>
            {/* Logo */}
            <div className="flex justify-center mb-6">
              <img
                src="/parcelreach-logo.png"
                alt="ParcelReach AI"
                style={{ width: '180px', height: 'auto' }}
              />
            </div>

            <h2 className="text-2xl font-bold text-white mb-2 text-center">Invite Team Member</h2>
            <p className="text-slate-400 text-sm mb-6 text-center">Send an invitation to join your team</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-white mb-2">Email Address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && inviteEmail.trim()) {
                      e.preventDefault();
                      document.getElementById('invite-submit-btn').click();
                    }
                  }}
                  autoFocus
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setInviteModalOpen(false)}
                  className="flex-1 px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors font-semibold"
                >
                  Cancel
                </button>
                <button
                  id="invite-submit-btn"
                  onClick={async () => {
                    if (inviteEmail && inviteEmail.trim()) {
                      try {
                        if (!currentTeam?.id) {
                          throw new Error('No team found. Please refresh the page and try again.');
                        }

                        const response = await fetch('/api/team/invite', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            email: inviteEmail.trim().toLowerCase(),
                            teamId: currentTeam.id,
                            inviterName: currentUser?.user_metadata?.full_name || currentUser?.email || 'Team member'
                          })
                        });

                        const result = await response.json();

                        if (!response.ok) {
                          throw new Error(result.error || 'Failed to send invitation');
                        }

                        alert(`Successfully sent invitation to ${inviteEmail}! They will receive an email with a link to join your team.`);
                        setInviteModalOpen(false);
                        setInviteEmail('');
                      } catch (error) {
                        console.error('Error inviting team member:', error);
                        alert(`Failed to invite team member: ${error.message}`);
                      }
                    }
                  }}
                  className="flex-1 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-400 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!inviteEmail.trim()}
                >
                  Send Invite
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Lead Confirmation Modal */}
      {leadToDelete && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setLeadToDelete(null)}>
          <div className="bg-gradient-to-b from-slate-800 to-slate-900 rounded-xl shadow-2xl max-w-md w-full border border-slate-700/50 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-red-500/10 rounded-full">
                <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Remove Lead</h3>
                <p className="text-sm text-slate-400">This action cannot be undone</p>
              </div>
            </div>

            <div className="mb-6 p-4 bg-slate-900/50 rounded-lg border border-slate-700/50">
              <p className="text-white font-semibold">{leadToDelete.name}</p>
              <p className="text-slate-400 text-sm mt-1">{leadToDelete.address}</p>
            </div>

            <p className="text-slate-300 text-sm mb-6">
              Are you sure you want to remove this lead? This will permanently delete it from your account.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setLeadToDelete(null)}
                className="flex-1 px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    const { error } = await supabase
                      .from('leads')
                      .delete()
                      .eq('id', leadToDelete.id);

                    if (error) throw error;

                    // Remove from local state
                    setLeads(leads.filter(l => l.id !== leadToDelete.id));
                    setLeadToDelete(null);
                  } catch (error) {
                    console.error('Error deleting lead:', error);
                    alert('Failed to delete lead. Please try again.');
                  }
                }}
                className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors font-semibold"
              >
                Remove Lead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Campaigns Modal */}
      {viewingCampaigns && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setViewingCampaigns(false)}>
          <div className="bg-gradient-to-b from-slate-800 to-slate-900 rounded-xl shadow-2xl max-w-4xl w-full border border-slate-700/50 p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">All Campaigns</h2>
              <button
                onClick={() => setViewingCampaigns(false)}
                className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
              >
                <svg className="w-6 h-6 text-slate-400 hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {campaigns.length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-16 h-16 text-slate-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-slate-400 text-lg">No campaigns yet</p>
                <p className="text-slate-500 text-sm mt-2">Create your first campaign to get started</p>
              </div>
            ) : (
              <div className="space-y-4">
                {campaigns.map((campaign) => (
                  <div key={campaign.id} className="bg-slate-900/50 border border-slate-700/50 rounded-lg p-5 hover:border-slate-600 transition-colors">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-white mb-2">{campaign.campaignName}</h3>
                        <div className="flex items-center gap-2">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            campaign.status === 'running' ? 'bg-green-500/20 text-green-400 border border-green-500/50' :
                            campaign.status === 'paused' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50' :
                            'bg-slate-500/20 text-slate-400 border border-slate-500/50'
                          }`}>
                            {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {campaign.status === 'draft' && (
                          <button
                            onClick={() => {
                              setCampaigns(campaigns.map(c =>
                                c.id === campaign.id ? {...c, status: 'running'} : c
                              ));
                            }}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-colors font-semibold text-sm"
                          >
                            Start
                          </button>
                        )}
                        {campaign.status === 'running' && (
                          <button
                            onClick={() => {
                              setCampaigns(campaigns.map(c =>
                                c.id === campaign.id ? {...c, status: 'paused'} : c
                              ));
                            }}
                            className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-500 transition-colors font-semibold text-sm"
                          >
                            Pause
                          </button>
                        )}
                        {campaign.status === 'paused' && (
                          <button
                            onClick={() => {
                              setCampaigns(campaigns.map(c =>
                                c.id === campaign.id ? {...c, status: 'running'} : c
                              ));
                            }}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-colors font-semibold text-sm"
                          >
                            Resume
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (confirm(`Delete campaign "${campaign.campaignName}"?`)) {
                              setCampaigns(campaigns.filter(c => c.id !== campaign.id));
                            }
                          }}
                          className="p-2 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-slate-500 mb-1">Daily Limit</p>
                        <p className="text-white font-semibold">{campaign.dailyLeadLimit || 'Unlimited'}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 mb-1">Targeting</p>
                        <p className="text-white font-semibold">
                          {campaign.isNationwide ? 'Nationwide' : `${campaign.selectedStates.length} states`}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500 mb-1">Acreage</p>
                        <p className="text-white font-semibold">{campaign.selectedAcreageRange || 'Not set'}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 mb-1">Created</p>
                        <p className="text-white font-semibold">
                          {new Date(campaign.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    {!campaign.isNationwide && campaign.selectedStates.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-700/50">
                        <p className="text-slate-500 text-xs mb-2">Selected States:</p>
                        <div className="flex flex-wrap gap-2">
                          {campaign.selectedStates.map((state) => (
                            <span key={state} className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs border border-blue-500/50">
                              {state}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 pt-6 border-t border-slate-700/50">
              <button
                onClick={() => setViewingCampaigns(false)}
                className="w-full px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Toast Notification */}
      {showSaveToast && (
        <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-green-500 text-white px-8 py-4 rounded-lg shadow-2xl flex items-center gap-3 z-50">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-lg font-semibold">{showSaveToast}</span>
        </div>
      )}
    </>
  );
}
