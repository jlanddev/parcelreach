'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamicImport from 'next/dynamic';
import { createClient } from '@supabase/supabase-js';
import NotificationsPanel from '@/components/NotificationsPanel';
import NotificationBell from '@/components/NotificationBell';
import LeadNotes from '@/components/LeadNotes';
import Toast from '@/components/Toast';
import MaskedLeadCard from '@/components/MaskedLeadCard';

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

// LOGO CONFIGURATION - Adjust these values to position logo for ALL users
const LOGO_CONFIG = {
  width: '260px',
  marginLeft: '0px',    // Adjust to move left/right
  marginTop: '0px',     // Adjust to move up/down
  display: 'block',     // Can be 'block' or 'inline-block'
};

export default function DashboardPage() {
  const router = useRouter();
  const [leads, setLeads] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dealTypeFilter, setDealTypeFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [selectedLead, setSelectedLead] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentTeam, setCurrentTeam] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [userRole, setUserRole] = useState(null); // owner, executive, or member
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
  const [paModalOpen, setPaModalOpen] = useState(false);
  const [generatedPA, setGeneratedPA] = useState('');
  const [sendingPA, setSendingPA] = useState(false);
  const [sellerEmailToSend, setSellerEmailToSend] = useState('');
  const [accountTab, setAccountTab] = useState('general');
  const [legalEntities, setLegalEntities] = useState([]);
  const [newEntity, setNewEntity] = useState('');
  const [selectedBuyerEntity, setSelectedBuyerEntity] = useState('');
  const [notificationToast, setNotificationToast] = useState({ show: false, message: '', type: 'success' });
  const [zoomToLead, setZoomToLead] = useState(null);
  const [clickTimeout, setClickTimeout] = useState(null);

  // Developments layer state
  const [developments, setDevelopments] = useState([]);
  const [showDevelopments, setShowDevelopments] = useState(false);
  const [developmentsLoading, setDevelopmentsLoading] = useState(false);

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

  // Purchase success modal
  const [purchaseSuccessModal, setPurchaseSuccessModal] = useState(false);
  const [purchasedLeadId, setPurchasedLeadId] = useState(null);

  // Helper function to show toasts
  const showToast = (message, type = 'success') => {
    setNotificationToast({ show: true, message, type });
  };

  // Account settings state
  const [organizationName, setOrganizationName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');

  // Check authentication and load team data
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      // Get or create user profile
      const { data: userData } = await supabase
        .from('users')
        .select('id, full_name, first_name, last_name, email')
        .eq('id', user.id)
        .single();

      if (!userData) {
        await supabase.from('users').insert([{
          id: user.id,
          email: user.email,
          full_name: user.email.split('@')[0]
        }]);
        // Fetch the newly created user data
        const { data: newUserData } = await supabase
          .from('users')
          .select('id, full_name, first_name, last_name, email')
          .eq('id', user.id)
          .single();

        // Merge user data with auth user
        setCurrentUser({ ...user, ...newUserData });
      } else {
        // If full_name is missing, update it from email
        if (!userData.full_name) {
          const defaultName = user.email.split('@')[0];
          await supabase
            .from('users')
            .update({ full_name: defaultName })
            .eq('id', user.id);
          userData.full_name = defaultName;
        }
        // Merge user data with auth user
        setCurrentUser({ ...user, ...userData });
      }

      console.log('✅ Current user loaded:', { ...user, ...userData });

      // Check if user is admin
      const isAdmin = user.email === 'admin@parcelreach.ai' || user.email === 'jordan@havenground.com' || user.email === 'jordan@landreach.co';

      // Check if admin is viewing a specific organization
      const adminViewingOrg = typeof window !== 'undefined' ? sessionStorage.getItem('admin_viewing_org') : null;
      console.log('🔍 Dashboard checking admin_viewing_org:', adminViewingOrg, 'isAdmin:', isAdmin);

      // Clear admin viewing mode if user is not an admin
      if (!isAdmin && adminViewingOrg) {
        console.log('🚫 Clearing admin_viewing_org for non-admin user');
        sessionStorage.removeItem('admin_viewing_org');
      }

      if (isAdmin && adminViewingOrg) {
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
          setLegalEntities(team.legal_entities || []);
          loadTeamMembers(team.id);
          fetchLeads(team.id);
        }
      } else {
        // Get user's teams
        const { data: teams } = await supabase
          .from('team_members')
          .select('team_id, role, teams(*)')
          .eq('user_id', user.id);

        if (teams && teams.length > 0) {
          console.log('🔍 DEBUG: Team data loaded:', teams[0]);
          console.log('🔍 DEBUG: Setting currentTeam to:', teams[0].teams);
          console.log('🔍 DEBUG: Team ID:', teams[0].teams?.id);
          console.log('🔍 DEBUG: User role:', teams[0].role);
          setCurrentTeam(teams[0].teams);
          setUserRole(teams[0].role || 'owner'); // Default to owner if not set
          setLegalEntities(teams[0].teams?.legal_entities || []);
          loadTeamMembers(teams[0].team_id);
          fetchLeads(teams[0].team_id);
        } else {
          // No team found - user should have team from signup
          // Don't auto-create to avoid duplicates
          console.error('No team found for user:', user.id);
          setCurrentTeam(null);
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

  const updateMemberRole = async (userId, newRole) => {
    if (!currentTeam?.id) return;

    try {
      const { error } = await supabase
        .from('team_members')
        .update({ role: newRole })
        .eq('team_id', currentTeam.id)
        .eq('user_id', userId);

      if (error) throw error;

      showToast(`Role updated to ${newRole}`, 'success');
      loadTeamMembers(currentTeam.id);
    } catch (error) {
      console.error('Error updating role:', error);
      showToast('Failed to update role', 'error');
    }
  };

  // Fetch recent developments from open data portals
  const fetchDevelopments = async () => {
    setDevelopmentsLoading(true);
    try {
      const response = await fetch('/api/developments?cities=austin,dallas,houston&limit=100');
      const data = await response.json();

      if (data.success) {
        setDevelopments(data.developments);
        console.log(`📍 Loaded ${data.developments.length} recent developments`);
      }
    } catch (error) {
      console.error('Error fetching developments:', error);
    } finally {
      setDevelopmentsLoading(false);
    }
  };

  // Load organization name when modal opens or team changes
  useEffect(() => {
    if (currentTeam?.name) {
      setOrganizationName(currentTeam.name);
    }
  }, [currentTeam, accountOpen]);

  // Load user profile data when modal opens or user changes
  useEffect(() => {
    const loadUserProfile = async () => {
      if (!currentUser?.id) return;

      const { data: profileData } = await supabase
        .from('users')
        .select('first_name, last_name, phone')
        .eq('id', currentUser.id)
        .single();

      if (profileData) {
        setFirstName(profileData.first_name || '');
        setLastName(profileData.last_name || '');
        setPhone(profileData.phone || '');
      }
    };

    if (accountOpen) {
      loadUserProfile();
    }
  }, [currentUser, accountOpen]);

  // Check for purchase success
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const urlParams = new URLSearchParams(window.location.search);
    const purchaseStatus = urlParams.get('purchase');
    const leadId = urlParams.get('lead_id');

    if (purchaseStatus === 'success' && leadId) {
      setPurchasedLeadId(leadId);
      setPurchaseSuccessModal(true);

      // Clean up URL
      window.history.replaceState({}, '', '/dashboard');

      // Reload leads after a brief delay to allow webhook to process
      setTimeout(() => {
        if (currentTeam?.id) {
          fetchLeads(currentTeam.id);
        }
      }, 2000);
    }
  }, []);

  // Store note ID for scrolling
  const [scrollToNoteId, setScrollToNoteId] = useState(null);
  const hasProcessedUrlRef = useState({ current: false })[0];

  // Reset URL processing flag when modal closes
  useEffect(() => {
    if (!modalOpen) {
      hasProcessedUrlRef.current = false;
      setScrollToNoteId(null);
    }
  }, [modalOpen]);

  // Auto-open lead from notification link
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (hasProcessedUrlRef.current) return; // Only process once

    const urlParams = new URLSearchParams(window.location.search);
    const leadIdFromNotif = urlParams.get('lead');
    const noteIdFromNotif = urlParams.get('note');

    // If no lead parameter, skip
    if (!leadIdFromNotif) return;

    console.log('🔔 Notification link detected, opening lead:', leadIdFromNotif);
    if (noteIdFromNotif) {
      console.log('📝 Note ID to scroll to:', noteIdFromNotif);
    }
    console.log('📊 Leads currently loaded:', leads.length);

    // If leads haven't loaded yet, wait for them
    if (!leads.length) {
      console.log('⏳ Waiting for leads to load...');
      return;
    }

    // Find the lead in the loaded leads
    const leadToOpen = leads.find(l => l.id === leadIdFromNotif);

    if (leadToOpen) {
      console.log('✅ Found lead, opening modal:', leadToOpen.name);
      hasProcessedUrlRef.current = true; // Mark as processed

      // Use a small delay to ensure React state is ready
      setTimeout(() => {
        setSelectedLead(leadToOpen);
        setModalOpen(true);
        if (noteIdFromNotif) {
          setScrollToNoteId(noteIdFromNotif);
        }
        console.log('✅ Modal opened for:', leadToOpen.name);
      }, 100);

      // Clean up URL after modal opens
      setTimeout(() => {
        window.history.replaceState({}, '', '/dashboard');
        console.log('✅ URL cleaned up');
      }, 500);
    } else {
      console.warn('⚠️ Lead not found in current leads list:', leadIdFromNotif);
      console.log('Available lead IDs:', leads.map(l => l.id));
      console.log('Available lead names:', leads.map(l => l.name));

      hasProcessedUrlRef.current = true; // Mark as processed even if not found

      // Clean up URL even if lead not found
      setTimeout(() => {
        window.history.replaceState({}, '', '/dashboard');
      }, 500);
    }
  }, [leads]);

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

  // Helper function to mask unpurchased priced leads
  const maskLead = (lead) => {
    // Use county center instead of offset to avoid misleading direction
    // Round to 1 decimal place = ~7 mile precision (general county area)
    const countyLat = lead.latitude ? Math.round(parseFloat(lead.latitude) * 10) / 10 : null;
    const countyLon = lead.longitude ? Math.round(parseFloat(lead.longitude) * 10) / 10 : null;

    return {
      ...lead,
      // Keep these fields visible
      county: lead.county || lead.propertyCounty,
      propertyCounty: lead.county || lead.propertyCounty,
      state: lead.state || lead.propertyState,
      propertyState: lead.state || lead.propertyState,
      acres: lead.acres,
      price: lead.price, // Show the price

      // Mask these fields
      fullname: '████████',
      fullName: '████████',
      name: '████████',
      email: 'masked@masked.com',
      phone: '███-███-████',
      address: '████████',
      streetAddress: '████████',
      city: '████████',
      zip: '█████',
      parcelid: '████████',
      parcelId: '████████',

      // General county area (not exact parcel location)
      latitude: countyLat,
      longitude: countyLon,

      // Add flag to identify masked leads
      isMasked: true,
      isPriced: true, // Mark as priced for green marker
      originalLeadId: lead.id
    };
  };

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

      // Fetch the actual leads with team-specific data
      // Use LEFT join so leads without team_lead_data still show
      const { data, error } = await supabase
        .from('leads')
        .select(`
          *,
          team_data:team_lead_data(
            team_id,
            status,
            offer_price,
            purchase_price,
            contract_status,
            contract_sent_date,
            contract_signed_date,
            closing_date,
            earnest_money,
            down_payment,
            custom_data
          )
        `)
        .in('id', assignedLeadIds.length > 0 ? assignedLeadIds : ['00000000-0000-0000-0000-000000000000'])
        .order('created_at', { ascending: false});

      if (error) {
        console.error('Error fetching leads:', error);
        setLeads([]);
        return;
      }

      console.log('✅ Fetched', data?.length, 'leads with team data');

      // For leads without team_lead_data, create it with ALL lead data
      for (const lead of data || []) {
        if (!lead.team_data || lead.team_data.length === 0) {
          const { error: insertError } = await supabase
            .from('team_lead_data')
            .insert([{
              team_id: teamId,
              lead_id: lead.id,
              status: lead.status || 'new',
              offer_price: lead.offerprice,
              full_name: lead.fullname,
              email: lead.email,
              phone: lead.phone,
              street_address: lead.address,
              city: lead.city,
              property_state: lead.state,
              property_county: lead.county,
              zip: lead.zip,
              acres: lead.acres,
              parcel_id: lead.parcelid,
              dealtype: lead.dealtype,
              notes: lead.notes,
              projected_revenue: lead.projectedrevenue
            }]);

          if (insertError && !insertError.message.includes('duplicate')) {
            console.error('Error creating team_lead_data:', insertError);
          }
        }
      }

      // Normalize: merge team_data into lead object
      // Filter team_data to only this team's data
      const normalizedLeads = (data || []).map(lead => {
        // Find team_data for THIS team only
        let teamData = null;
        if (Array.isArray(lead.team_data)) {
          teamData = lead.team_data.find(td => td.team_id === teamId);
        } else if (lead.team_data?.team_id === teamId) {
          teamData = lead.team_data;
        }
        return {
          ...lead,
          // Team-specific data (status, offers, contracts, pricing)
          status: teamData?.status || lead.status || 'new',
          offerPrice: teamData?.offer_price || lead.offerprice,
          offerprice: teamData?.offer_price || lead.offerprice,
          purchasePrice: teamData?.purchase_price, // Per-org marketplace price
          contractStatus: teamData?.contract_status,
          contractSigned: teamData?.contract_signed_date,
          contractsigned: teamData?.contract_signed_date,
          closingDate: teamData?.closing_date,
          earnestMoney: teamData?.earnest_money,
          downPayment: teamData?.down_payment,
          // Property details (team-isolated)
          fullname: teamData?.full_name || lead.fullname,
          fullName: teamData?.full_name || lead.fullname,
          email: teamData?.email || lead.email,
          phone: teamData?.phone || lead.phone,
          address: teamData?.street_address || lead.address,
          streetAddress: teamData?.street_address || lead.address,
          city: teamData?.city || lead.city,
          state: teamData?.property_state || lead.state,
          propertyState: teamData?.property_state || lead.state,
          county: teamData?.property_county || lead.county,
          propertyCounty: teamData?.property_county || lead.county,
          zip: teamData?.zip || lead.zip,
          acres: teamData?.acres || lead.acres,
          parcelid: teamData?.parcel_id || lead.parcelid,
          parcelId: teamData?.parcel_id || lead.parcelid,
          dealtype: teamData?.dealtype || lead.dealtype,
          dealType: teamData?.dealtype || lead.dealtype,
          notes: teamData?.notes || lead.notes,
          projectedrevenue: teamData?.projected_revenue || lead.projectedrevenue,
          projectedRevenue: teamData?.projected_revenue || lead.projectedrevenue,
          projectedProfit: teamData?.projected_revenue || lead.projectedrevenue,
          // Keep offerMade from lead (not team-specific)
          offerMade: lead.offermade
        };
      });

      // Fetch TEAM purchases (any team member) to check which priced leads have been bought
      // Get all team members first
      const { data: members } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('team_id', teamId);

      const teamUserIds = members?.map(m => m.user_id) || [];

      // Get purchases by ANY team member
      const { data: purchases } = await supabase
        .from('lead_purchases')
        .select('lead_id')
        .in('user_id', teamUserIds);

      const purchasedLeadIds = new Set(purchases?.map(p => p.lead_id) || []);

      // Apply masking to leads with purchase_price that haven't been purchased
      // Use purchasePrice (team-specific) instead of price (global)
      const maskedLeads = normalizedLeads.map(lead => {
        const hasPrice = lead.purchasePrice && parseFloat(lead.purchasePrice) > 0;
        const isPurchased = purchasedLeadIds.has(lead.id);

        if (hasPrice && !isPurchased) {
          // Pass purchasePrice to maskLead so it shows correct price
          return maskLead({ ...lead, price: lead.purchasePrice });
        }
        return lead;
      });

      setLeads(maskedLeads);

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

    // Refresh leads - IMPORTANT: Filter by team to maintain data isolation!
    if (currentTeam) {
      await fetchLeads(currentTeam.id);
    }
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
    // Prevent opening full details for masked leads
    if (lead.isMasked) {
      alert('This lead is locked. Purchase to unlock full details.');
      return;
    }
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

    // Separate team-specific updates from lead updates
    // ALL editable fields are team-specific for complete isolation
    const teamFields = [
      'status', 'offerprice', 'offer_price', 'contractsigned', 'contract_signed_date', 'contract_status',
      'fullname', 'full_name', 'email', 'phone',
      'address', 'street_address', 'city', 'state', 'property_state', 'county', 'property_county', 'zip',
      'acres', 'parcelid', 'parcel_id', 'dealtype', 'notes', 'projectedrevenue', 'projected_revenue',
      'purchase_price', 'comp1_acres', 'comp1_price', 'comp2_acres', 'comp2_price', 'comp3_acres', 'comp3_price',
      'financing_costs', 'closing_costs', 'misc_costs'
    ];
    const teamUpdates = {};
    const leadUpdates = {};

    Object.keys(updates).forEach(key => {
      if (teamFields.includes(key)) {
        // Map to team_lead_data column names
        if (key === 'offerprice') teamUpdates.offer_price = updates[key];
        else if (key === 'contractsigned') teamUpdates.contract_signed_date = updates[key];
        else if (key === 'fullname') teamUpdates.full_name = updates[key];
        else if (key === 'address') teamUpdates.street_address = updates[key];
        else if (key === 'state') teamUpdates.property_state = updates[key];
        else if (key === 'county') teamUpdates.property_county = updates[key];
        else if (key === 'parcelid') teamUpdates.parcel_id = updates[key];
        else if (key === 'projectedrevenue') teamUpdates.projected_revenue = updates[key];
        else teamUpdates[key] = updates[key];
      } else {
        leadUpdates[key] = updates[key];
      }
    });

    // Debounce database updates for text inputs
    if (debounce) {
      if (saveTimeout) clearTimeout(saveTimeout);
      const timeout = setTimeout(async () => {
        try {
          // Update team-specific data
          if (Object.keys(teamUpdates).length > 0 && currentTeam) {
            const { error } = await supabase
              .from('team_lead_data')
              .update(teamUpdates)
              .eq('team_id', currentTeam.id)
              .eq('lead_id', leadId);
            if (error) console.error('Error updating team data:', error.message);
          }

          // Update shared lead data
          if (Object.keys(leadUpdates).length > 0) {
            const { error } = await supabase
              .from('leads')
              .update(leadUpdates)
              .eq('id', leadId);
            if (error) console.error('Error updating lead:', error.message);
          }
        } catch (err) {
          console.error('Error:', err.message);
        }
      }, 1000);
      setSaveTimeout(timeout);
    } else {
      // Immediate save
      try {
        // Update team-specific data
        if (Object.keys(teamUpdates).length > 0 && currentTeam) {
          const { error } = await supabase
            .from('team_lead_data')
            .update(teamUpdates)
            .eq('team_id', currentTeam.id)
            .eq('lead_id', leadId);
          if (error) console.error('Error updating team data:', error.message);
        }

        // Update shared lead data
        if (Object.keys(leadUpdates).length > 0) {
          const { error } = await supabase
            .from('leads')
            .update(leadUpdates)
            .eq('id', leadId);
          if (error) console.error('Error updating lead:', error.message);
        }
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

  // Animate loading progress
  useEffect(() => {
    if (isLoading) {
      const interval = setInterval(() => {
        setLoadingProgress((prev) => {
          if (prev >= 95) return prev; // Stop at 95% until actually loaded
          return prev + Math.random() * 15;
        });
      }, 200);
      return () => clearInterval(interval);
    } else {
      setLoadingProgress(100);
    }
  }, [isLoading]);

  // Loading Screen
  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center">
          {/* Animated Logo - Much Bigger */}
          <div className="relative mb-12 flex justify-center">
            <div className="relative">
              <img
                src="/parcelreach-logo.png"
                alt="ParcelReach"
                className="w-[500px] h-auto relative z-10"
              />
              {/* Spinning ring around map portion of logo */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48">
                <div className="absolute inset-0 border-[6px] border-transparent border-t-blue-400 border-r-orange-400 rounded-full animate-spin" style={{ animationDuration: '3s' }}></div>
              </div>
            </div>
          </div>

          {/* Loading bar with actual progress */}
          <div className="w-96 h-2.5 bg-slate-700 rounded-full mx-auto overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-orange-400 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${Math.min(loadingProgress, 100)}%` }}
            ></div>
          </div>

          <p className="text-sm text-slate-500 mt-4">
            {loadingProgress < 30 && "Loading map layers..."}
            {loadingProgress >= 30 && loadingProgress < 60 && "Initializing 3D terrain..."}
            {loadingProgress >= 60 && loadingProgress < 90 && "Loading your leads..."}
            {loadingProgress >= 90 && "Almost ready..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Admin Viewing Mode Banner */}
      {typeof window !== 'undefined' && sessionStorage.getItem('admin_viewing_org') && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-orange-500 text-white px-4 py-2 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span className="font-semibold">Admin Viewing Mode: {currentTeam?.name || 'Organization Dashboard'}</span>
          </div>
          <button
            onClick={() => {
              sessionStorage.removeItem('admin_viewing_org');
              window.location.href = '/admin/land';
            }}
            className="bg-white/20 hover:bg-white/30 px-4 py-1 rounded transition-colors font-semibold"
          >
            Exit Admin View
          </button>
        </div>
      )}

      <div className={`h-screen flex overflow-hidden ${typeof window !== 'undefined' && sessionStorage.getItem('admin_viewing_org') ? 'pt-12' : ''}`}>
        {/* Premium Dark Sidebar - Full Height */}
        <aside className={`
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 transition-transform duration-300
        w-80 lg:w-96 bg-gradient-to-b from-slate-900 to-slate-800 border-r border-slate-700/50 shadow-2xl
        absolute lg:relative h-full z-20
        flex flex-col
      `}>
        {/* Sidebar Header with User Info */}
        <div className="px-5 pb-4 border-b border-slate-700/50" style={{ paddingTop: '8px' }}>
          <div className="flex items-center justify-between">
            <p className="text-white text-lg font-semibold">{leads.length} Active Leads</p>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {/* Developments Layer Toggle */}
              <button
                onClick={() => {
                  if (!showDevelopments && developments.length === 0) {
                    fetchDevelopments();
                  }
                  setShowDevelopments(!showDevelopments);
                }}
                className={`p-2 rounded-lg transition-colors ${showDevelopments ? 'bg-green-600 text-white' : 'hover:bg-slate-700/50 text-slate-400'}`}
                title={showDevelopments ? 'Hide Developments' : 'Show Recent Developments'}
              >
                {developmentsLoading ? (
                  <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                )}
              </button>

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

              {/* Notifications - hide when admin viewing another org */}
              {currentUser && !sessionStorage.getItem('admin_viewing_org') && (
                <NotificationBell userId={currentUser.id} />
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
                {type.icon && <span className="mr-1.5">{type.icon}</span>}
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
                filteredLeads.map((lead) => lead.isMasked ? (
                  <MaskedLeadCard
                    key={lead.id}
                    lead={lead}
                    userRole={userRole}
                    onPurchase={async (lead) => {
                      try {
                        const { data: { user } } = await supabase.auth.getUser();
                        if (!user) {
                          showToast('Please log in to purchase', 'error');
                          return;
                        }

                        // Call Stripe checkout API
                        const response = await fetch('/api/stripe/checkout', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            leadId: lead.originalLeadId || lead.id,
                            userId: user.id,
                            teamId: currentTeam.id
                          })
                        });

                        const data = await response.json();

                        if (!response.ok) {
                          showToast(data.error || 'Failed to start checkout', 'error');
                          return;
                        }

                        // Redirect to Stripe checkout
                        window.location.href = data.url;
                      } catch (error) {
                        console.error('Purchase error:', error);
                        showToast('Failed to purchase lead', 'error');
                      }
                    }}
                  />
                ) : (
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
                            <div className="flex items-center gap-1.5 mt-1">
                              {/* Location Badge */}
                              <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-md">
                                <svg className="w-3 h-3 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                </svg>
                                <span className="text-[10px] font-medium text-blue-300">
                                  {lead.county || lead.propertyCounty || 'Unknown'} County, {lead.state || lead.propertyState || 'Unknown'}
                                </span>
                              </div>
                              {/* Parcel ID Badge */}
                              {(lead.parcelid || lead.parcelId) && lead.parcelid !== 'N/A' && lead.parcelId !== 'N/A' && (
                                <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-700/50 border border-slate-600/50 rounded-md">
                                  <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                  </svg>
                                  <span className="text-[9px] font-mono text-slate-300 truncate max-w-[80px]">
                                    {lead.parcelid || lead.parcelId}
                                  </span>
                                </div>
                              )}
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
                                    showToast(`Failed to update: ${error.message}`, 'error');
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
                                  showToast(`Error: ${err.message}`, 'error');
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
                )
              )
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

          <LeadsMap
            leads={leads}
            zoomToLead={zoomToLead}
            developments={showDevelopments ? developments : []}
          />
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
                      <div className="flex justify-between">
                        <span className="text-slate-400">State:</span>
                        <input
                          type="text"
                          value={selectedLead.state || ''}
                          onChange={(e) => updateLead(selectedLead.id, { state: e.target.value }, true)}
                          placeholder="Enter state"
                          className="text-right bg-slate-900/50 border border-slate-700/50 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-blue-500/50"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Contact Information */}
                  <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                    <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                      <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      Contact Information
                    </h3>
                    <div className="space-y-2 text-sm">
                      {selectedLead.email && (
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Email:</span>
                          <a href={`mailto:${selectedLead.email}`} className="text-blue-400 hover:text-blue-300 underline">{selectedLead.email}</a>
                        </div>
                      )}
                      {selectedLead.phone && (
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Phone:</span>
                          <a href={`tel:${selectedLead.phone}`} className="text-blue-400 hover:text-blue-300 underline">{selectedLead.phone}</a>
                        </div>
                      )}
                      {selectedLead.ip_address && (
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">IP Address:</span>
                          <span className="text-white font-mono text-xs">{selectedLead.ip_address}</span>
                        </div>
                      )}
                      {selectedLead.source && (
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Source:</span>
                          <span className="text-white text-xs">{selectedLead.source.replace(/Haven Ground\s*-\s*/gi, '')}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Form Responses (Haven Ground) */}
                  {selectedLead.form_data && (
                    <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                      <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                        <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Form Responses
                      </h3>
                      <div className="space-y-2 text-sm max-h-96 overflow-y-auto pr-2">
                        {selectedLead.form_data.fullName && (
                          <div className="flex justify-between border-b border-slate-700/50 pb-2">
                            <span className="text-slate-400">Full Name:</span>
                            <span className="text-white font-semibold">{selectedLead.form_data.fullName}</span>
                          </div>
                        )}
                        {selectedLead.form_data.position && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Position:</span>
                            <span className="text-white capitalize">{selectedLead.form_data.position.replace('-', ' ')}</span>
                          </div>
                        )}
                        {selectedLead.form_data.homeOnProperty && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Home on Property:</span>
                            <span className={`font-semibold uppercase ${selectedLead.form_data.homeOnProperty === 'no' ? 'text-green-400' : 'text-yellow-400'}`}>{selectedLead.form_data.homeOnProperty}</span>
                          </div>
                        )}
                        {selectedLead.form_data.propertyListed && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Property Listed:</span>
                            <span className={`font-semibold uppercase ${selectedLead.form_data.propertyListed === 'no' ? 'text-green-400' : 'text-yellow-400'}`}>{selectedLead.form_data.propertyListed}</span>
                          </div>
                        )}
                        {selectedLead.form_data.ownedFourYears && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Owned 4+ Years:</span>
                            <span className={`font-semibold uppercase ${selectedLead.form_data.ownedFourYears === 'yes' ? 'text-green-400' : 'text-yellow-400'}`}>{selectedLead.form_data.ownedFourYears}</span>
                          </div>
                        )}
                        {selectedLead.form_data.propertyState && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">State:</span>
                            <span className="text-white">{selectedLead.form_data.propertyState}</span>
                          </div>
                        )}
                        {selectedLead.form_data.propertyCounty && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">County:</span>
                            <span className="text-white">{selectedLead.form_data.propertyCounty}</span>
                          </div>
                        )}
                        {selectedLead.form_data.streetAddress && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Street Address:</span>
                            <span className="text-white text-right max-w-[60%]">{selectedLead.form_data.streetAddress}</span>
                          </div>
                        )}
                        {selectedLead.form_data.acres && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Acres:</span>
                            <span className="text-white font-semibold">{selectedLead.form_data.acres}</span>
                          </div>
                        )}
                        {selectedLead.form_data.namesOnDeed && (
                          <div className="flex justify-between border-t border-slate-700/50 pt-2 mt-2">
                            <span className="text-slate-400">Names on Deed:</span>
                            <span className="text-white text-right max-w-[60%]">{selectedLead.form_data.namesOnDeed}</span>
                          </div>
                        )}
                        {selectedLead.form_data.email && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Email:</span>
                            <a href={`mailto:${selectedLead.form_data.email}`} className="text-blue-400 hover:text-blue-300 underline text-right max-w-[60%] truncate">{selectedLead.form_data.email}</a>
                          </div>
                        )}
                        {selectedLead.form_data.phone && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Phone:</span>
                            <a href={`tel:${selectedLead.form_data.phone}`} className="text-blue-400 hover:text-blue-300 underline">{selectedLead.form_data.phone}</a>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

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

                  {/* Deal Underwriting Calculator */}
                  <div className="bg-gradient-to-br from-slate-800/50 to-purple-900/20 rounded-lg p-4 border border-purple-500/30">
                    <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                      <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      Deal Underwriting
                    </h3>
                    <div className="space-y-3 text-sm">
                      {/* Purchase Price */}
                      <div>
                        <label className="text-slate-300 block mb-1 font-medium">Purchase Price</label>
                        <input
                          type="number"
                          value={selectedLead.purchase_price || ''}
                          onChange={(e) => updateLead(selectedLead.id, { purchase_price: Number(e.target.value) }, true)}
                          placeholder="$0"
                          className="w-full bg-slate-900/50 border border-slate-700/50 rounded px-3 py-2 text-white focus:outline-none focus:border-purple-500/50"
                        />
                        {selectedLead.purchase_price && selectedLead.acres && (
                          <div className="mt-1 text-purple-300 font-semibold">
                            ${(selectedLead.purchase_price / selectedLead.acres).toFixed(2)} per acre
                          </div>
                        )}
                      </div>

                      {/* Comps Section */}
                      <div className="border-t border-slate-700/50 pt-3">
                        <label className="text-slate-300 block mb-2 font-medium">Comparable Properties</label>

                        {/* Comp 1 */}
                        <div className="bg-slate-900/30 rounded p-2 mb-2">
                          <div className="text-xs text-slate-400 mb-1">Comp #1</div>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="number"
                              placeholder="Acres"
                              value={selectedLead.comp1_acres || ''}
                              onChange={(e) => updateLead(selectedLead.id, { comp1_acres: Number(e.target.value) }, true)}
                              className="bg-slate-900/50 border border-slate-700/50 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-purple-500/50"
                            />
                            <input
                              type="number"
                              placeholder="Price"
                              value={selectedLead.comp1_price || ''}
                              onChange={(e) => updateLead(selectedLead.id, { comp1_price: Number(e.target.value) }, true)}
                              className="bg-slate-900/50 border border-slate-700/50 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-purple-500/50"
                            />
                          </div>
                          {selectedLead.comp1_acres && selectedLead.comp1_price && (
                            <div className="text-xs text-purple-300 mt-1">
                              ${(selectedLead.comp1_price / selectedLead.comp1_acres).toFixed(2)}/acre
                            </div>
                          )}
                        </div>

                        {/* Comp 2 */}
                        <div className="bg-slate-900/30 rounded p-2 mb-2">
                          <div className="text-xs text-slate-400 mb-1">Comp #2</div>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="number"
                              placeholder="Acres"
                              value={selectedLead.comp2_acres || ''}
                              onChange={(e) => updateLead(selectedLead.id, { comp2_acres: Number(e.target.value) }, true)}
                              className="bg-slate-900/50 border border-slate-700/50 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-purple-500/50"
                            />
                            <input
                              type="number"
                              placeholder="Price"
                              value={selectedLead.comp2_price || ''}
                              onChange={(e) => updateLead(selectedLead.id, { comp2_price: Number(e.target.value) }, true)}
                              className="bg-slate-900/50 border border-slate-700/50 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-purple-500/50"
                            />
                          </div>
                          {selectedLead.comp2_acres && selectedLead.comp2_price && (
                            <div className="text-xs text-purple-300 mt-1">
                              ${(selectedLead.comp2_price / selectedLead.comp2_acres).toFixed(2)}/acre
                            </div>
                          )}
                        </div>

                        {/* Comp 3 */}
                        <div className="bg-slate-900/30 rounded p-2">
                          <div className="text-xs text-slate-400 mb-1">Comp #3</div>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="number"
                              placeholder="Acres"
                              value={selectedLead.comp3_acres || ''}
                              onChange={(e) => updateLead(selectedLead.id, { comp3_acres: Number(e.target.value) }, true)}
                              className="bg-slate-900/50 border border-slate-700/50 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-purple-500/50"
                            />
                            <input
                              type="number"
                              placeholder="Price"
                              value={selectedLead.comp3_price || ''}
                              onChange={(e) => updateLead(selectedLead.id, { comp3_price: Number(e.target.value) }, true)}
                              className="bg-slate-900/50 border border-slate-700/50 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-purple-500/50"
                            />
                          </div>
                          {selectedLead.comp3_acres && selectedLead.comp3_price && (
                            <div className="text-xs text-purple-300 mt-1">
                              ${(selectedLead.comp3_price / selectedLead.comp3_acres).toFixed(2)}/acre
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Costs Section */}
                      <div className="border-t border-slate-700/50 pt-3 space-y-2">
                        <div>
                          <label className="text-slate-400 text-xs block mb-1">Financing Costs</label>
                          <input
                            type="number"
                            value={selectedLead.financing_costs || ''}
                            onChange={(e) => updateLead(selectedLead.id, { financing_costs: Number(e.target.value) }, true)}
                            placeholder="$0"
                            className="w-full bg-slate-900/50 border border-slate-700/50 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-purple-500/50"
                          />
                        </div>
                        <div>
                          <label className="text-slate-400 text-xs block mb-1">Closing Costs</label>
                          <input
                            type="number"
                            value={selectedLead.closing_costs || ''}
                            onChange={(e) => updateLead(selectedLead.id, { closing_costs: Number(e.target.value) }, true)}
                            placeholder="$0"
                            className="w-full bg-slate-900/50 border border-slate-700/50 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-purple-500/50"
                          />
                        </div>
                        <div>
                          <label className="text-slate-400 text-xs block mb-1">Miscellaneous Costs</label>
                          <input
                            type="number"
                            value={selectedLead.misc_costs || ''}
                            onChange={(e) => updateLead(selectedLead.id, { misc_costs: Number(e.target.value) }, true)}
                            placeholder="$0"
                            className="w-full bg-slate-900/50 border border-slate-700/50 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-purple-500/50"
                          />
                        </div>
                      </div>

                      {/* Deal Summary */}
                      {selectedLead.purchase_price && selectedLead.acres && (
                        <div className="border-t border-purple-500/30 pt-3 bg-purple-900/20 rounded p-3 -mx-1">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-slate-300">Total Investment:</span>
                            <span className="text-white font-semibold">
                              ${(selectedLead.purchase_price + (selectedLead.financing_costs || 0) + (selectedLead.closing_costs || 0) + (selectedLead.misc_costs || 0)).toLocaleString()}
                            </span>
                          </div>
                          {selectedLead.projectedrevenue && (
                            <>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-slate-300">Projected Revenue:</span>
                                <span className="text-green-400 font-semibold">${selectedLead.projectedrevenue.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between text-sm border-t border-purple-500/20 pt-2 mt-2">
                                <span className="text-slate-200 font-medium">Deal Return:</span>
                                <span className={`font-bold ${(selectedLead.projectedrevenue - (selectedLead.purchase_price + (selectedLead.financing_costs || 0) + (selectedLead.closing_costs || 0) + (selectedLead.misc_costs || 0))) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  ${(selectedLead.projectedrevenue - (selectedLead.purchase_price + (selectedLead.financing_costs || 0) + (selectedLead.closing_costs || 0) + (selectedLead.misc_costs || 0))).toLocaleString()}
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {/* Generate PA Button */}
                      <button
                        onClick={() => {
                          // Check if they have legal entities
                          if (!legalEntities || legalEntities.length === 0) {
                            showToast('Please add legal entities in Account Settings → Legal Entities tab first.', 'info');
                            return;
                          }
                          // Open PA modal to select LLC
                          setPaModalOpen(true);
                        }}
                        className="w-full bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg font-semibold transition-colors mt-3 flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Generate Purchase Agreement
                      </button>
                    </div>
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
                        lead={selectedLead}
                        currentUserId={currentUser.id}
                        currentUserName={currentUser.full_name}
                        teamMembers={teamMembers}
                        teamId={currentTeam?.id}
                        scrollToNoteId={scrollToNoteId}
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
                      showToast('Please enter a campaign name', 'error');
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
                    showToast('Campaign saved as draft!', 'success');
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

            {/* Tabs */}
            <div className="flex gap-2 mb-6 border-b border-slate-700/50">
              <button
                onClick={() => setAccountTab('general')}
                className={`px-4 py-2 font-semibold transition-colors border-b-2 ${
                  accountTab === 'general'
                    ? 'text-blue-400 border-blue-400'
                    : 'text-slate-400 border-transparent hover:text-white'
                }`}
              >
                General
              </button>
              <button
                onClick={() => setAccountTab('legal')}
                className={`px-4 py-2 font-semibold transition-colors border-b-2 ${
                  accountTab === 'legal'
                    ? 'text-blue-400 border-blue-400'
                    : 'text-slate-400 border-transparent hover:text-white'
                }`}
              >
                Legal Entities
              </button>
            </div>

            {/* General Tab */}
            {accountTab === 'general' && (
            <div className="space-y-6">
              {/* Profile Section */}
              <div className="bg-slate-900/30 border border-slate-700/50 rounded-lg p-4">
                <h3 className="text-lg font-bold text-white mb-4">Personal Profile</h3>

                <div className="space-y-4">
                  {/* First Name */}
                  <div>
                    <label className="block text-sm font-semibold text-white mb-2">First Name</label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="John"
                      className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
                    />
                  </div>

                  {/* Last Name */}
                  <div>
                    <label className="block text-sm font-semibold text-white mb-2">Last Name</label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Doe"
                      className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
                    />
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-sm font-semibold text-white mb-2">Phone Number (Optional)</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(555) 123-4567"
                      className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
                    />
                  </div>

                  {/* Save Profile Button */}
                  <button
                    onClick={async () => {
                      try {
                        const fullName = `${firstName.trim()} ${lastName.trim()}`;

                        const { error } = await supabase
                          .from('users')
                          .update({
                            first_name: firstName,
                            last_name: lastName,
                            full_name: fullName,
                            phone: phone || null
                          })
                          .eq('id', currentUser.id);

                        if (error) throw error;

                        // Update currentUser in state to reflect changes
                        setCurrentUser(prev => ({
                          ...prev,
                          user_metadata: {
                            ...prev.user_metadata,
                            full_name: fullName,
                            first_name: firstName,
                            last_name: lastName
                          }
                        }));

                        showToast('Profile updated successfully!', 'success');
                      } catch (error) {
                        console.error('Error updating profile:', error);
                        showToast('Failed to update profile. Please try again.', 'error');
                      }
                    }}
                    className="w-full bg-blue-500 text-white px-4 py-3 rounded-lg hover:bg-blue-400 transition-colors text-sm font-semibold"
                  >
                    Save Profile Changes
                  </button>
                </div>
              </div>

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

              {/* Your Email */}
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
                    <div key={member.users.id} className="flex items-center justify-between bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-3">
                      <div className="flex-1">
                        <p className="text-white text-sm font-medium">{member.users.full_name}</p>
                        <p className="text-slate-400 text-xs">{member.users.email}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {userRole === 'owner' ? (
                          <select
                            value={member.role || 'member'}
                            onChange={(e) => updateMemberRole(member.user_id, e.target.value)}
                            className="bg-slate-800 border border-slate-600 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500"
                          >
                            <option value="owner">Owner</option>
                            <option value="executive">Executive</option>
                            <option value="member">Member</option>
                          </select>
                        ) : (
                          <span className="text-slate-400 text-xs px-2 py-1">
                            {member.role || 'member'}
                          </span>
                        )}
                        {userRole === 'owner' && (
                          <button
                            onClick={() => alert('Remove team member feature coming soon')}
                            className="text-red-400 hover:text-red-300 text-sm"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => {
                    if (!currentTeam?.id) {
                      showToast('Please wait for your team to load before inviting members.', 'info');
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
                      showToast('Password reset email sent! Please check your inbox.', 'success');
                    } catch (error) {
                      console.error('Error sending password reset:', error);
                      showToast('Failed to send password reset email. Please try again.', 'error');
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
                          showToast('Failed to update organization name. Please try again.', 'error');
                        } else {
                          // Update local state
                          setCurrentTeam({ ...currentTeam, name: organizationName.trim() });
                          showToast('Organization name updated successfully!', 'success');
                        }
                      } catch (error) {
                        console.error('Error updating team name:', error);
                        showToast('Failed to update organization name. Please try again.', 'error');
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
            )}

            {/* Legal Entities Tab */}
            {accountTab === 'legal' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-white mb-2">Legal Entities / LLCs</label>
                <p className="text-slate-400 text-sm mb-4">Add the legal entities you use for purchasing properties. These will be available when generating purchase agreements.</p>

                {/* List of entities */}
                <div className="space-y-2 mb-3">
                  {legalEntities.map((entity, index) => (
                    <div key={index} className="flex items-center justify-between bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-3">
                      <span className="text-white">{entity}</span>
                      <button
                        onClick={() => {
                          setLegalEntities(legalEntities.filter((_, i) => i !== index));
                        }}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  {legalEntities.length === 0 && (
                    <div className="text-slate-400 text-sm text-center py-4 bg-slate-900/30 rounded-lg border border-slate-700/50">
                      No legal entities added yet
                    </div>
                  )}
                </div>

                {/* Add new entity */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newEntity}
                    onChange={(e) => setNewEntity(e.target.value)}
                    placeholder="Enter LLC name (e.g., ABC Land Holdings LLC)"
                    className="flex-1 bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && newEntity.trim()) {
                        setLegalEntities([...legalEntities, newEntity.trim()]);
                        setNewEntity('');
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      if (newEntity.trim()) {
                        setLegalEntities([...legalEntities, newEntity.trim()]);
                        setNewEntity('');
                      }
                    }}
                    className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-400 transition-colors text-sm font-semibold"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Save button */}
              <div className="flex gap-3 pt-4 border-t border-slate-700/50">
                <button
                  onClick={async () => {
                    // Save legal entities to database
                    if (currentTeam?.id) {
                      try {
                        const { error } = await supabase
                          .from('teams')
                          .update({ legal_entities: legalEntities })
                          .eq('id', currentTeam.id);

                        if (error) {
                          console.error('Error updating legal entities:', error);
                          showToast('Failed to update legal entities. Please try again.', 'error');
                        } else {
                          showToast('Legal entities updated successfully!', 'success');
                          setAccountOpen(false);
                        }
                      } catch (error) {
                        console.error('Error updating legal entities:', error);
                        showToast('Failed to update legal entities. Please try again.', 'error');
                      }
                    }
                  }}
                  className="flex-1 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-400 transition-colors font-semibold"
                >
                  Save Legal Entities
                </button>
              </div>
            </div>
            )}
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
                        console.log('🔍 DEBUG: Attempting to invite with currentTeam:', currentTeam);
                        console.log('🔍 DEBUG: Team ID being sent:', currentTeam?.id);

                        if (!currentTeam?.id) {
                          throw new Error('No team found. Please refresh the page and try again.');
                        }

                        const payload = {
                          email: inviteEmail.trim().toLowerCase(),
                          teamId: currentTeam.id,
                          inviterName: currentUser?.user_metadata?.full_name || currentUser?.email || 'Team member'
                        };

                        console.log('🔍 DEBUG: Sending invite payload:', payload);

                        const response = await fetch('/api/team/invite', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(payload)
                        });

                        const result = await response.json();

                        if (!response.ok) {
                          throw new Error(result.error || 'Failed to send invitation');
                        }

                        showToast(`Successfully sent invitation to ${inviteEmail}! They will receive an email with a link to join your team.`, 'success');
                        setInviteModalOpen(false);
                        setInviteEmail('');
                      } catch (error) {
                        console.error('Error inviting team member:', error);
                        showToast(`Failed to invite team member: ${error.message}`, 'error');
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

      {/* Purchase Agreement Generator Modal */}
      {paModalOpen && selectedLead && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setPaModalOpen(false)}>
          <div className="bg-gradient-to-b from-slate-800 to-slate-900 rounded-xl shadow-2xl max-w-3xl w-full border border-slate-700/50 p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Generate Purchase Agreement</h2>
              <button
                onClick={() => setPaModalOpen(false)}
                className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors"
              >
                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Contract Status Progress Indicator */}
            <div className="mb-6 bg-slate-800/50 border border-slate-700 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-slate-300 mb-4">Contract Status</h3>
              <div className="relative">
                {/* Progress Bar Background */}
                <div className="absolute top-5 left-0 right-0 h-1 bg-slate-700"></div>
                {/* Progress Bar Fill */}
                <div
                  className="absolute top-5 left-0 h-1 bg-gradient-to-r from-purple-500 to-green-500 transition-all duration-500"
                  style={{
                    width: selectedLead?.contractStatus === 'signed' ? '100%' :
                           selectedLead?.contractStatus === 'sent' ? '50%' : '0%'
                  }}
                ></div>

                {/* Status Steps */}
                <div className="relative flex justify-between">
                  {/* Draft */}
                  <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                      !selectedLead?.contractStatus || selectedLead?.contractStatus === 'draft'
                        ? 'bg-purple-600 border-purple-400 text-white'
                        : 'bg-green-500 border-green-400 text-white'
                    }`}>
                      {selectedLead?.contractStatus && selectedLead?.contractStatus !== 'draft' ? (
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      )}
                    </div>
                    <span className={`mt-2 text-xs font-semibold ${
                      !selectedLead?.contractStatus || selectedLead?.contractStatus === 'draft'
                        ? 'text-white'
                        : 'text-slate-400'
                    }`}>Draft</span>
                  </div>

                  {/* Sent */}
                  <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                      selectedLead?.contractStatus === 'sent'
                        ? 'bg-purple-600 border-purple-400 text-white animate-pulse'
                        : selectedLead?.contractStatus === 'signed'
                        ? 'bg-green-500 border-green-400 text-white'
                        : 'bg-slate-700 border-slate-600 text-slate-400'
                    }`}>
                      {selectedLead?.contractStatus === 'signed' ? (
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      )}
                    </div>
                    <span className={`mt-2 text-xs font-semibold ${
                      selectedLead?.contractStatus === 'sent'
                        ? 'text-white'
                        : 'text-slate-400'
                    }`}>
                      {selectedLead?.contractStatus === 'sent' ? 'Waiting for Signature' : 'Sent'}
                    </span>
                  </div>

                  {/* Signed */}
                  <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                      selectedLead?.contractStatus === 'signed'
                        ? 'bg-green-500 border-green-400 text-white'
                        : 'bg-slate-700 border-slate-600 text-slate-400'
                    }`}>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <span className={`mt-2 text-xs font-semibold ${
                      selectedLead?.contractStatus === 'signed'
                        ? 'text-white'
                        : 'text-slate-400'
                    }`}>Signed</span>
                  </div>
                </div>
              </div>

              {/* Status Message */}
              {selectedLead?.contractStatus === 'sent' && (
                <div className="mt-4 bg-yellow-900/20 border border-yellow-500/50 rounded-lg p-3">
                  <p className="text-yellow-200 text-sm flex items-center gap-2">
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Waiting for seller signature...
                  </p>
                </div>
              )}
              {selectedLead?.contractStatus === 'signed' && (
                <div className="mt-4 space-y-3">
                  <div className="bg-green-900/20 border border-green-500/50 rounded-lg p-3">
                    <p className="text-green-200 text-sm flex items-center gap-2">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Contract signed on {selectedLead?.contractSigned ? new Date(selectedLead.contractSigned).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        const response = await fetch('/api/signed-pa-by-lead', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            leadId: selectedLead.id,
                            teamId: currentTeam.id
                          })
                        });

                        const data = await response.json();

                        if (!response.ok) {
                          throw new Error(data.error || 'Failed to fetch signed agreement');
                        }

                        // Open signed PA in new tab
                        window.open(data.url, '_blank');
                      } catch (error) {
                        console.error('Error opening signed PA:', error);
                        showToast('Error opening signed agreement: ' + error.message, 'error');
                      }
                    }}
                    className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    View Signed Agreement
                  </button>
                </div>
              )}
            </div>

            {!generatedPA ? (
              // LLC Selector
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-white mb-2">Select Buyer Entity (LLC)</label>
                  <select
                    value={selectedBuyerEntity}
                    onChange={(e) => setSelectedBuyerEntity(e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50"
                  >
                    <option value="">-- Select an LLC --</option>
                    {legalEntities.map((entity, index) => (
                      <option key={index} value={entity}>{entity}</option>
                    ))}
                  </select>
                </div>

                <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-4">
                  <h3 className="text-white font-semibold mb-2">Property Details</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-slate-400">Seller:</span>
                      <span className="ml-2 text-white">{selectedLead.name || selectedLead.fullname || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Acres:</span>
                      <span className="ml-2 text-white">{selectedLead.acres || selectedLead.acreage || 'N/A'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-slate-400">Address:</span>
                      <span className="ml-2 text-white">{selectedLead.address}, {selectedLead.city}, {selectedLead.state}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">County:</span>
                      <span className="ml-2 text-white">{selectedLead.county}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Purchase Price:</span>
                      <span className="ml-2 text-green-400 font-semibold">${selectedLead.purchase_price?.toLocaleString() || selectedLead.offerprice?.toLocaleString() || 'N/A'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setPaModalOpen(false)}
                    className="flex-1 px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (!selectedBuyerEntity) {
                        showToast('Please select a buyer entity (LLC)', 'error');
                        return;
                      }

                      // Generate PA text
                      const purchasePrice = selectedLead.purchase_price || selectedLead.offerprice || 0;
                      const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

                      // Debug: Log the full selectedLead object to see what fields exist
                      console.log('📋 Selected Lead Data:', selectedLead);
                      console.log('📋 Available fields:', Object.keys(selectedLead));

                      // Use the correct field names from the leads table schema
                      const sellerName = selectedLead.name || selectedLead.fullname || selectedLead.full_name || selectedLead.fullName || '[Seller Name]';
                      const sellerEmail = selectedLead.email || '[Email]';
                      const sellerPhone = selectedLead.phone || '[Phone]';
                      const propertyAddress = selectedLead.address || selectedLead.street_address || selectedLead.streetaddress || '[Property Address]';
                      const propertyCity = selectedLead.city || '[City]';
                      const propertyState = selectedLead.state || selectedLead.property_state || selectedLead.propertystate || 'OK';
                      const propertyCounty = selectedLead.county || selectedLead.property_county || selectedLead.propertycounty || '[County]';
                      const propertyZip = selectedLead.zip || selectedLead.zipcode || '[ZIP]';
                      const parcelNumber = selectedLead.parcelid || selectedLead.parcel_id || selectedLead.parcelId || selectedLead.parcel_number || '[Parcel Number]';
                      const acreage = selectedLead.acreage || selectedLead.acres || '[Acreage]';
                      const offerAmount = purchasePrice > 0 ? `$${purchasePrice.toLocaleString()}` : '[Offer Amount]';

                      console.log('📋 Extracted values:', { sellerName, sellerEmail, sellerPhone, propertyAddress, propertyCity, propertyState, propertyCounty });

                      const paText = `
<style>
  .pa-container { font-family: Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; }
  .pa-title { text-align: center; font-weight: bold; font-size: 18px; margin-bottom: 20px; }
  .pa-section { margin-bottom: 15px; }
  .pa-section-title { font-weight: bold; margin-bottom: 5px; }
  .pa-indent { margin-left: 30px; }
  .pa-signature-line { border-bottom: 1px solid #000; width: 300px; display: inline-block; margin: 0 20px; }
  .pa-small-line { border-bottom: 1px solid #000; width: 150px; display: inline-block; }
  .pa-large-line { border-bottom: 1px solid #000; width: 600px; display: inline-block; }
</style>
<div class="pa-container">
  <div class="pa-title">PURCHASE AND SALE AGREEMENT</div>

  <div class="pa-section">
    <strong>SELLER:</strong> ${sellerName}<br>
    <strong>BUYER:</strong> ${selectedBuyerEntity || '[Buyer Entity]'}<br>
    PO BOX 188, Bluff Dale, TX. 76433
  </div>

  <div class="pa-section">
    This is a contract for the purchase and sale of real estate (Property) located in ${propertyCounty} county, ${propertyState}.<br>
    The Buyer and Seller agree to the following terms:
  </div>

  <div class="pa-section">
    <strong>1. PROPERTY DESCRIPTION:</strong><br>
    <div class="pa-indent">
      <strong>Parcel Number:</strong> ${parcelNumber}<br>
      <strong>Legal Description:</strong> ${propertyAddress}, ${propertyCity}, ${propertyCounty} County, ${propertyState}<br>
      <strong>Acreage:</strong> ${acreage} acres
    </div>
  </div>

  <div class="pa-section">
    <strong>2. Offer Amounts:</strong> Buyer will pay <strong>${offerAmount} total</strong> for the properties
  </div>

  <div class="pa-section">
    <strong>3. PAYMENT:</strong> Buyer will pay the purchase price in cash or utilizing another funding partner.
  </div>

  <div class="pa-section">
    <strong>4. TITLE AND CONVEYANCE:</strong> Seller will transfer marketable title to the Property by Warranty Deed. Seller will clear all liens and encumbrances from title. Buyer will clear unpaid taxes and current year's proration's unless otherwise noted.
  </div>

  <div class="pa-section">
    <strong>5. CLOSING:</strong><br>
    <div class="pa-indent">
      a) Buyer will pay for any escrow fees, attorney fees, title insurance, transfer taxes, and recording fees for the Property.<br>
      b) Seller will pay for any liens or judgments against the Property.<br>
      c) This transaction will be closed by a reputable notary public, title company or attorney, as determined by buyer.<br>
      d) A survey will be needed prior to closing to ensure access and the location.
    </div>
  </div>

  <div class="pa-section">
    <strong>6. CLOSING DATE:</strong> Deed and possession will be delivered to Buyer on or before ${selectedLead.closingDate ? new Date(selectedLead.closingDate).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }) : '[Closing Date]'}, with time being of the essence
  </div>

  <div class="pa-section">
    <strong>7. CANCELLATION:</strong> Buyer retains the right to terminate this agreement for any reason.
  </div>

  <div class="pa-section">
    <strong>8. DISCLOSURE:</strong> Each party represents itself. Buyer represents itself exclusively and Seller represents itself exclusively. Neither party has reviewed documents or negotiated in the best interests of the other. Buyer agrees and both parties are advised and agrees to consult with licensed real estate professionals, like attorneys, Realtors, or appraisers, as necessary.
  </div>

  <div class="pa-section">
    <strong>9. ASSIGNMENT:</strong> Buyer has an unqualified right to assign its rights under this contract to a third party. No notice to the Seller of an assignment is necessary. Such an assignment will create a novation and release the original Buyer from this contract and substitute the assignee in its place. Investor or contractor may inspect property prior to agreed upon closing date.
  </div>

  <div class="pa-section">
    <strong>10. BINDING AGREEMENT:</strong> This agreement is binding on the heirs, administrators, executors, successors, personal representatives and assigns of Buyer and Seller and supersedes all other agreements, written or oral, regarding the subject matter hereof.
  </div>

  <div class="pa-section">
    <strong>11. CONTINGENCY:</strong> Property has maintained legal road access and meets Buyer's purchasing requirements.
  </div>

  <div class="pa-section">
    <strong>12. DEADLINE FOR ACCEPTANCE:</strong> This agreement is submitted to the Seller as an offer to purchase the Property under the terms listed above. This agreement will only be valid if Seller signs
  </div>

  <div style="margin-top: 40px; margin-bottom: 20px;">
    this agreement and returns to Buyer via mail, fax or email by <strong>08-31-25 at 11:59 PM CST</strong>. If Buyer does not receive the executed agreement by that date and time, this offer will automatically expire.
  </div>

  <div style="margin-top: 60px;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="width: 45%; padding: 10px 0; vertical-align: bottom;">
          <div style="border-bottom: 1px solid #000; margin-bottom: 5px;">&nbsp;</div>
          <strong>Seller:</strong> ${sellerName}
        </td>
        <td style="width: 10%;">&nbsp;</td>
        <td style="width: 45%; padding: 10px 0; vertical-align: bottom;">
          <div style="border-bottom: 1px solid #000; margin-bottom: 5px;">&nbsp;</div>
          <strong>Buyer:</strong> ${selectedBuyerEntity || '[Buyer Entity]'}
        </td>
      </tr>
      <tr>
        <td style="padding: 10px 0; vertical-align: bottom;">
          <div style="border-bottom: 1px solid #000; margin-bottom: 5px;">&nbsp;</div>
          <strong>Date:</strong>
        </td>
        <td>&nbsp;</td>
        <td style="padding: 10px 0; vertical-align: bottom;">
          <div style="border-bottom: 1px solid #000; margin-bottom: 5px;">&nbsp;</div>
          <strong>Date:</strong>
        </td>
      </tr>
    </table>

    <div style="margin-top: 30px;">
      <strong>Phone and Email:</strong><br>
      <div style="border-bottom: 1px solid #000; margin-top: 5px; padding-bottom: 5px;">${sellerPhone} / ${sellerEmail}</div>
    </div>

    <div style="margin-top: 20px;">
      <strong>Agreed Sales Price:</strong><br>
      <div style="border-bottom: 1px solid #000; margin-top: 5px; padding-bottom: 5px;">${offerAmount}</div>
    </div>
  </div>
</div>`;


                      setGeneratedPA(paText);
                      setSellerEmailToSend(sellerEmail);
                    }}
                    className="flex-1 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition-colors font-semibold disabled:opacity-50"
                    disabled={!selectedBuyerEntity}
                  >
                    Generate Agreement
                  </button>
                </div>
              </div>
            ) : (
              // Show generated PA
              <div className="space-y-4">
                <div id="pa-document" className="bg-white text-black p-8 rounded-lg border border-slate-300 max-h-[500px] overflow-y-auto">
                  <div dangerouslySetInnerHTML={{ __html: generatedPA }} />
                </div>

                {/* Email input for sending */}
                <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-4">
                  <label className="block text-white font-semibold mb-2">
                    Send Contract To:
                  </label>
                  <input
                    type="email"
                    value={sellerEmailToSend}
                    onChange={(e) => setSellerEmailToSend(e.target.value)}
                    placeholder="seller@example.com"
                    className="w-full bg-slate-900/50 border border-slate-700/50 rounded px-3 py-2 text-white focus:outline-none focus:border-purple-500/50"
                  />
                  <p className="text-slate-400 text-xs mt-1">
                    You can edit the email address before sending
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      window.print();
                    }}
                    className="flex-1 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-400 transition-colors font-semibold flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    Print / Save as PDF
                  </button>
                  <button
                    onClick={async () => {
                      if (!sellerEmailToSend) {
                        showToast('Seller email is required to send for signature', 'error');
                        return;
                      }

                      setSendingPA(true);
                      try {
                        const sellerName = selectedLead.name || selectedLead.fullname || selectedLead.full_name || 'Seller';
                        const sellerPhone = selectedLead.phone || '';
                        const propertyAddress = `${selectedLead.address || ''}, ${selectedLead.city || ''}, ${selectedLead.state || ''}`.trim();
                        const purchasePrice = selectedLead.purchase_price || selectedLead.offerprice || 0;

                        const response = await fetch('/api/send-pa', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            leadId: selectedLead.id,
                            teamId: currentTeam.id,
                            paHtml: generatedPA,
                            sellerName,
                            sellerEmail: sellerEmailToSend,
                            sellerPhone,
                            buyerEntity: selectedBuyerEntity,
                            purchasePrice,
                            propertyAddress
                          })
                        });

                        const data = await response.json();

                        if (!response.ok) {
                          throw new Error(data.error || 'Failed to send PA');
                        }

                        showToast(`✅ Purchase Agreement sent to ${sellerEmailToSend}! The seller will receive an email with a link to review and sign the agreement.`, 'success');

                        // Refresh leads to show updated contract status
                        fetchLeads();
                      } catch (error) {
                        console.error('Error sending PA:', error);
                        showToast('Error sending PA: ' + error.message, 'error');
                      } finally {
                        setSendingPA(false);
                      }
                    }}
                    disabled={sendingPA || !sellerEmailToSend}
                    className="flex-1 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition-colors font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    {sendingPA ? 'Sending...' : 'Send for Signature'}
                  </button>
                  <button
                    onClick={() => {
                      const element = document.getElementById('pa-document');
                      const htmlContent = element.innerHTML;
                      const blob = new Blob([htmlContent], { type: 'text/html' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `PA_${selectedLead.full_name || selectedLead.fullname || 'Property'}_${new Date().toISOString().split('T')[0]}.html`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="flex-1 px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-400 transition-colors font-semibold flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download HTML
                  </button>
                  <button
                    onClick={() => {
                      setGeneratedPA('');
                      setSelectedBuyerEntity('');
                    }}
                    className="px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors font-semibold"
                  >
                    New PA
                  </button>
                </div>
              </div>
            )}
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
                    // ONLY remove assignment, NOT the lead itself!
                    // This preserves the lead in admin dashboard

                    // 1. Remove lead assignment for this team
                    const { error: assignError } = await supabase
                      .from('lead_assignments')
                      .delete()
                      .eq('lead_id', leadToDelete.id)
                      .eq('team_id', currentTeam.id);

                    if (assignError) throw assignError;

                    // 2. Remove team-specific data
                    const { error: dataError } = await supabase
                      .from('team_lead_data')
                      .delete()
                      .eq('lead_id', leadToDelete.id)
                      .eq('team_id', currentTeam.id);

                    if (dataError) throw dataError;

                    // Remove from local state
                    setLeads(leads.filter(l => l.id !== leadToDelete.id));
                    setLeadToDelete(null);
                    showToast('Lead removed from your dashboard', 'success');
                  } catch (error) {
                    console.error('Error removing lead:', error);
                    showToast('Failed to remove lead. Please try again.', 'error');
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

      {/* Custom Toast Notifications */}
      {notificationToast.show && (
        <Toast
          type={notificationToast.type}
          message={notificationToast.message}
          onClose={() => setNotificationToast({ show: false, message: '', type: 'success' })}
        />
      )}

      {/* Purchase Success Modal */}
      {purchaseSuccessModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl shadow-2xl max-w-lg w-full border border-green-500/30 overflow-hidden">
            {/* Success Header */}
            <div className="bg-gradient-to-r from-green-600 to-green-500 p-6 text-center">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white">Purchase Successful!</h2>
            </div>

            {/* Content */}
            <div className="p-8 text-center">
              <p className="text-lg text-slate-300 mb-6">
                Your lead purchase was successful. You can now view all details in your team dashboard.
              </p>

              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-6">
                <p className="text-green-400 text-sm">
                  The lead information has been unlocked and is now available in your dashboard.
                </p>
              </div>

              <button
                onClick={() => {
                  setPurchaseSuccessModal(false);
                  // Refresh leads to show unlocked lead
                  if (currentTeam?.id) {
                    fetchLeads(currentTeam.id);
                  }
                }}
                className="w-full px-6 py-3 bg-gradient-to-r from-green-600 to-green-500 text-white rounded-lg font-semibold hover:from-green-500 hover:to-green-400 transition-all shadow-lg"
              >
                View Your Leads
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
