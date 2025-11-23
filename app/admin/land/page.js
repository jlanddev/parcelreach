'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

export default function LandLeadsAdminPage() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState([]);
  const [allLeads, setAllLeads] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('organizations');
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [selectedOrgsForAssignment, setSelectedOrgsForAssignment] = useState([]);
  const [leadPrice, setLeadPrice] = useState(''); // Price for marketplace leads
  const [findMapModalOpen, setFindMapModalOpen] = useState(false);
  const [leadForMapSearch, setLeadForMapSearch] = useState(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [leadAssignments, setLeadAssignments] = useState({}); // leadId -> array of {teamId, assigned_at}

  // Create Lead states
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [foundParcels, setFoundParcels] = useState([]);
  const [selectedParcelIndex, setSelectedParcelIndex] = useState(0);
  const [parcelLocated, setParcelLocated] = useState(false);
  const [searchType, setSearchType] = useState('parcel_id'); // 'parcel_id', 'address', 'owner'
  const [inputMode, setInputMode] = useState('search'); // 'search', 'upload', or 'click'
  const [kmlFile, setKmlFile] = useState(null);
  const [csvFile, setCsvFile] = useState(null);
  const [uploadedGeometry, setUploadedGeometry] = useState(null);
  const [clickToFindActive, setClickToFindActive] = useState(false);
  const [newLead, setNewLead] = useState({
    full_name: '',
    email: '',
    phone: '',
    property_state: 'TX',
    property_county: '',
    street_address: '',
    zip_code: '',
    acres: '',
    parcel_id: '',
    owner_name: '' // Name on title for owner search
  });
  const [selectedOrgsForLead, setSelectedOrgsForLead] = useState([]);
  const [creatingLead, setCreatingLead] = useState(false);
  const [locatingParcel, setLocatingParcel] = useState(false);

  // Admin access control
  useEffect(() => {
    const checkAdminAccess = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      const adminEmails = ['admin@parcelreach.ai', 'jordan@havenground.com', 'jordan@landreach.co'];
      if (!user) {
        console.log('❌ Not authenticated - redirecting to admin login');
        router.push('/admin/login');
        return;
      }

      if (!adminEmails.includes(user.email)) {
        console.log('❌ Access denied - not an admin');
        router.push('/dashboard');
        return;
      }
    };

    checkAdminAccess();
  }, [router]);

  useEffect(() => {
    fetchAllData();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchAllData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchAllData = async () => {
    setLoading(true);

    // Fetch organizations (teams)
    const { data: orgsData } = await supabase
      .from('teams')
      .select(`
        *,
        team_members(count)
      `)
      .order('created_at', { ascending: false });

    // Fetch all leads
    const { data: leadsData } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });

    // Fetch all assignments
    const { data: assignmentsData } = await supabase
      .from('lead_assignments')
      .select('lead_id, team_id, assigned_at')
      .order('assigned_at', { ascending: false });

    // Group assignments by lead_id
    const assignmentsByLead = {};
    assignmentsData?.forEach(assignment => {
      if (!assignmentsByLead[assignment.lead_id]) {
        assignmentsByLead[assignment.lead_id] = [];
      }
      assignmentsByLead[assignment.lead_id].push(assignment);
    });

    setOrganizations(orgsData || []);
    setAllLeads(leadsData || []);
    setLeadAssignments(assignmentsByLead);
    setLoading(false);
  };

  const handleViewDashboard = (orgId) => {
    // Store selected org in session and redirect to dashboard
    console.log('🔍 Admin viewing org:', orgId);
    sessionStorage.setItem('admin_viewing_org', orgId);
    router.push('/dashboard');
  };

  const handleAssignLead = async (leadId, teamIds) => {
    setIsAssigning(true);
    try {
      console.log('🔍 Assigning lead:', leadId, 'to teams:', teamIds);

      // Get lead details for notification and team_lead_data creation
      const { data: leadData } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();

      // Insert into lead_assignments junction table (allows multiple assignments)
      const assignments = teamIds.map(teamId => ({
        lead_id: leadId,
        team_id: teamId,
        assigned_at: new Date().toISOString()
      }));

      console.log('📝 Creating assignments:', assignments);

      // Insert each assignment individually, ignoring duplicates
      for (const assignment of assignments) {
        const { error } = await supabase
          .from('lead_assignments')
          .insert([assignment]);

        // Ignore duplicate errors (23505 is PostgreSQL unique violation code)
        if (error && !error.message.includes('duplicate') && error.code !== '23505') {
          console.error('❌ Assignment error:', error);
          alert(`Failed to assign lead: ${error.message}`);
          return;
        }

        // Create team_lead_data record (only use columns that exist in base schema)
        const { error: teamDataError } = await supabase
          .from('team_lead_data')
          .insert([{
            team_id: assignment.team_id,
            lead_id: leadId,
            status: 'new'
          }]);

        // Ignore duplicate errors (team already has this lead)
        if (teamDataError && !teamDataError.message.includes('duplicate') && teamDataError.code !== '23505') {
          console.error('❌ Team data creation error:', teamDataError);
        }
      }

      console.log('✅ Assignments and team data created successfully');

      // Update lead price if set (makes it a marketplace lead)
      const priceValue = leadPrice ? parseFloat(leadPrice) : null;
      if (priceValue !== null) {
        await supabase
          .from('leads')
          .update({ price: priceValue })
          .eq('id', leadId);
        console.log(`💰 Lead price set to $${priceValue}`);
      }

      // Update lead status if not already assigned
      await supabase
        .from('leads')
        .update({ status: 'assigned' })
        .eq('id', leadId);

      // Create notifications for all team members of assigned teams
      for (const teamId of teamIds) {
        const { data: teamMembers } = await supabase
          .from('team_members')
          .select('user_id')
          .eq('team_id', teamId);

        if (teamMembers && teamMembers.length > 0) {
          const location = leadData?.property_county || leadData?.county || 'Unknown';
          const state = leadData?.property_state || leadData?.state || 'TX';
          const acres = leadData?.acres || leadData?.acreage || 'N/A';

          // Check if this is a priced lead (for purchase)
          const isPricedLead = priceValue && priceValue > 0;

          // For priced leads, DON'T show owner name (prevents lookup without purchase)
          const title = isPricedLead ? 'New Lead Available for Purchase' : 'New Lead';
          const message = isPricedLead
            ? `${acres} acres in ${location}, ${state} - $${priceValue}`
            : `${leadData?.full_name || leadData?.name || 'Property'} - ${acres} in ${location}`;

          // Create notification for each team member via API (sends email too)
          for (const member of teamMembers) {
            try {
              await fetch('/api/notifications/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userId: member.user_id,
                  type: isPricedLead ? 'lead_available_purchase' : 'lead_assigned',
                  title: title,
                  message: message,
                  sendEmail: true
                })
              });
            } catch (err) {
              console.error('Failed to send notification:', err);
            }
          }
        }
      }

      alert(`✅ Successfully assigned lead to ${teamIds.length} organization(s)!`);

      setAssignModalOpen(false);
      setSelectedLead(null);
      setSelectedOrgsForAssignment([]);
      setLeadPrice(''); // Reset price
      fetchAllData();
    } catch (err) {
      console.error('❌ Error assigning lead:', err);
      alert(`Error: ${err.message}`);
    } finally {
      setIsAssigning(false);
    }
  };

  // Initialize Mapbox when Create Lead tab is active
  useEffect(() => {
    if (activeTab === 'create-lead' && !map.current && mapContainer.current) {
      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center: [-98.5795, 39.8283], // Center of USA
        zoom: 4
      });

      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
    }
  }, [activeTab]);

  // Add map click handler when click mode is active
  useEffect(() => {
    if (!map.current) return;

    const handleClick = async (e) => {
      if (inputMode !== 'click' || !clickToFindActive) return;

      const { lng, lat } = e.lngLat;

      // Show loading state
      setLocatingParcel(true);

      try {
        console.log('🖱️ Clicked map at:', { lat, lng });

        // Call Regrid Tile Query API
        const response = await fetch(`/api/regrid/query?lat=${lat}&lon=${lng}`);
        const data = await response.json();

        if (data.success && data.results && data.results.length > 0) {
          const parcel = data.results[0];
          console.log('✅ Found parcel:', parcel);

          // Set found parcels
          setFoundParcels(data.results);
          setSelectedParcelIndex(0);

          // Auto-populate form with parcel data
          setNewLead(prev => ({
            ...prev,
            parcel_id: parcel.properties?.apn || '',
            street_address: parcel.properties?.address || '',
            property_county: parcel.properties?.county || '',
            property_state: parcel.properties?.state || 'TX',
            zip_code: parcel.properties?.zip || '',
            acres: parcel.properties?.acres || ''
          }));

          // Draw parcel on map
          drawParcelOnMap(parcel);

          // Fly to parcel
          if (parcel.geometry && map.current) {
            map.current.flyTo({
              center: [lng, lat],
              zoom: 17,
              essential: true
            });
          }

          setParcelLocated(true);
          alert('✅ Parcel found! Review the data and click "Publish Lead"');
        } else {
          alert('❌ No parcel found at this location. Try clicking on a different area.');
        }
      } catch (error) {
        console.error('Error finding parcel:', error);
        alert('❌ Error finding parcel: ' + error.message);
      } finally {
        setLocatingParcel(false);
      }
    };

    // Add click handler
    map.current.on('click', handleClick);

    // Cleanup
    return () => {
      if (map.current) {
        map.current.off('click', handleClick);
      }
    };
  }, [inputMode, clickToFindActive]);

  const drawParcelOnMap = (parcelData) => {
    if (parcelData.geometry && map.current) {
      // Remove existing parcel layers if they exist
      if (map.current.getLayer('parcel-fill')) {
        map.current.removeLayer('parcel-fill');
      }
      if (map.current.getLayer('parcel-boundary')) {
        map.current.removeLayer('parcel-boundary');
      }
      if (map.current.getSource('parcel')) {
        map.current.removeSource('parcel');
      }

      // Add the parcel boundary as a red outline
      map.current.addSource('parcel', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: parcelData.geometry,
          properties: parcelData.properties
        }
      });

      map.current.addLayer({
        id: 'parcel-fill',
        type: 'fill',
        source: 'parcel',
        paint: {
          'fill-color': '#FF0000',
          'fill-opacity': 0.2
        }
      });

      map.current.addLayer({
        id: 'parcel-boundary',
        type: 'line',
        source: 'parcel',
        paint: {
          'line-color': '#FF0000',
          'line-width': 3
        }
      });
    }
  };

  const locateParcel = async () => {
    // Validate based on what info is provided
    if (!newLead.parcel_id && !newLead.street_address && !newLead.owner_name) {
      alert('❌ Please enter either:\n• Parcel ID + County\n• Owner Name + County\n• Address');
      return;
    }

    setLocatingParcel(true);

    try {
      let regridData = null;

      // Priority 1: Parcel ID (search all, then filter by county)
      if (newLead.parcel_id && newLead.parcel_id.trim()) {
        console.log('🎯 Using APN lookup for parcel:', newLead.parcel_id, 'filtering for county:', newLead.property_county);
        // Search by parcel ID only, will filter by county in results
        const url = `/api/regrid/lookup?apn=${encodeURIComponent(newLead.parcel_id)}${newLead.property_county ? `&county=${encodeURIComponent(newLead.property_county)}` : ''}`;
        const regridResponse = await fetch(url);
        regridData = await regridResponse.json();
      }
      // Priority 2: Owner Name + County
      else if (newLead.owner_name && newLead.owner_name.trim()) {
        console.log('👤 Searching by owner name:', newLead.owner_name);
        const queryParts = [newLead.owner_name];
        if (newLead.property_county) queryParts.push(newLead.property_county);
        if (newLead.property_state) queryParts.push(newLead.property_state);

        const searchQuery = queryParts.join(', ');
        const regridResponse = await fetch(`/api/regrid/lookup?address=${encodeURIComponent(searchQuery)}`);
        regridData = await regridResponse.json();
      }
      // Priority 3: Address (can return multiple results - EXPENSIVE!)
      else {
        console.log('⚠️ Searching by address (may return multiple parcels - uses more API credits)');
        const queryParts = [];
        if (newLead.street_address) queryParts.push(newLead.street_address);
        if (newLead.property_county) queryParts.push(newLead.property_county);
        if (newLead.property_state) queryParts.push(newLead.property_state);
        if (newLead.zip_code) queryParts.push(newLead.zip_code);

        const searchQuery = queryParts.join(', ');
        const regridResponse = await fetch(`/api/regrid/lookup?address=${encodeURIComponent(searchQuery)}`);
        regridData = await regridResponse.json();
      }

      // Process results
      if (regridData && regridData.success && regridData.results && regridData.results.length > 0) {
        setFoundParcels(regridData.results);
        setSelectedParcelIndex(0);

        // Get centroid from first parcel for map positioning
        const firstParcel = regridData.results[0];
        let lng, lat;

        if (firstParcel.geometry) {
          if (firstParcel.geometry.type === 'Point') {
            [lng, lat] = firstParcel.geometry.coordinates;
          } else if (firstParcel.geometry.type === 'Polygon') {
            const bounds = firstParcel.geometry.coordinates[0];
            const lngs = bounds.map(c => c[0]);
            const lats = bounds.map(c => c[1]);
            lng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
            lat = (Math.min(...lats) + Math.max(...lats)) / 2;
          }
        }

        // Fly to location and add marker
        if (lng && lat && map.current) {
          map.current.flyTo({
            center: [lng, lat],
            zoom: 16,
            essential: true
          });

          new mapboxgl.Marker()
            .setLngLat([lng, lat])
            .addTo(map.current);
        }

        // Draw the first parcel by default
        drawParcelOnMap(regridData.results[0]);

        setParcelLocated(true);
        if (regridData.results.length > 1) {
          alert(`Found ${regridData.results.length} parcels. Select the correct one below.`);
        } else {
          alert('✅ Parcel found! Verify and click "Publish Lead"');
        }
      } else {
        alert('❌ No parcel found. Please verify the Parcel ID or address.');
      }
    } catch (error) {
      console.error('Error locating parcel:', error);
      alert('Error locating property: ' + error.message);
    } finally {
      setLocatingParcel(false);
    }
  };

  const selectParcel = (index) => {
    setSelectedParcelIndex(index);
    drawParcelOnMap(foundParcels[index]);
  };

  // Handle KML file upload and parsing
  const handleKmlUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setKmlFile(file);

    try {
      const text = await file.text();
      const parser = new DOMParser();
      const kml = parser.parseFromString(text, 'text/xml');

      // Extract coordinates from KML
      const coordinates = kml.getElementsByTagName('coordinates')[0]?.textContent.trim();

      if (!coordinates) {
        alert('❌ No coordinates found in KML file');
        return;
      }

      // Parse KML coordinates (lon,lat,alt format) to GeoJSON
      const coordPairs = coordinates.split(/\s+/).map(coord => {
        const [lon, lat] = coord.split(',').map(Number);
        return [lon, lat];
      });

      // Create GeoJSON Polygon
      const geometry = {
        type: 'Polygon',
        coordinates: [coordPairs]
      };

      setUploadedGeometry(geometry);

      // Draw on map
      drawParcelOnMap({ geometry, properties: {} });

      // Center map on parcel
      if (coordPairs.length > 0 && map.current) {
        const [lon, lat] = coordPairs[0];
        map.current.flyTo({
          center: [lon, lat],
          zoom: 16,
          essential: true
        });
      }

      setParcelLocated(true);
      alert('✅ KML file loaded! Parcel boundary displayed on map.');
    } catch (error) {
      console.error('Error parsing KML:', error);
      alert('❌ Error parsing KML file: ' + error.message);
    }
  };

  // Handle pasted property data from GIS
  const handlePastedData = (pastedText) => {
    try {
      console.log('📋 Pasted text:', pastedText);

      const updatedLead = { ...newLead };

      // Extract County from "Location" line (e.g., "Grimes County, TX")
      const locationMatch = pastedText.match(/Location[:\s]*\n([^\n]+)/i);
      if (locationMatch) {
        const location = locationMatch[1].trim();
        // Extract county name (before "County")
        const countyMatch = location.match(/^([^,]+)\s+County/i);
        if (countyMatch) {
          updatedLead.property_county = countyMatch[1].trim();
        }
        // Extract state
        const stateMatch = location.match(/,\s*([A-Z]{2})/);
        if (stateMatch) {
          updatedLead.property_state = stateMatch[1];
        }
      }

      // Extract Acres
      const acresMatch = pastedText.match(/Acres[:\s]*\n([0-9.,]+)/i);
      if (acresMatch) {
        updatedLead.acres = acresMatch[1].replace(',', '');
      }

      // Extract Parcel #
      const parcelMatch = pastedText.match(/Parcel\s*#?[:\s]*\n([^\n]+)/i);
      if (parcelMatch) {
        updatedLead.parcel_id = parcelMatch[1].trim();
      }

      // Extract Owner 1
      const ownerMatch = pastedText.match(/Owner\s*1?[:\s]*\n([^\n]+)/i);
      if (ownerMatch) {
        updatedLead.owner_name = ownerMatch[1].trim();
      }

      // Extract Property Address
      const propAddressMatch = pastedText.match(/Property\s+Address[:\s]*\n([^\n]+)/i);
      if (propAddressMatch) {
        const address = propAddressMatch[1].trim();
        updatedLead.street_address = address;

        // Extract ZIP code from address (5 or 9 digit)
        const zipMatch = address.match(/\b(\d{5})(?:\d{4})?\b/);
        if (zipMatch) {
          updatedLead.zip_code = zipMatch[1];
        }
      }

      setNewLead(updatedLead);
      console.log('✅ Auto-populated from pasted data:', updatedLead);
      alert('✅ Property data auto-populated! Review and fill in Name/Email/Phone.');
    } catch (error) {
      console.error('Error parsing pasted data:', error);
      alert('❌ Error parsing pasted data: ' + error.message);
    }
  };

  // Handle CSV file upload and parsing
  const handleCsvUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setCsvFile(file);

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());

      if (lines.length < 2) {
        alert('❌ CSV file must have a header row and data row');
        return;
      }

      // Parse CSV (handle quoted values)
      const parseCSVLine = (line) => {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current.trim());
        return result;
      };

      const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/"/g, ''));
      const values = parseCSVLine(lines[1]).map(v => v.replace(/"/g, ''));

      // Create data object
      const data = {};
      headers.forEach((header, i) => {
        data[header] = values[i] || '';
      });

      console.log('📄 CSV Headers:', headers);
      console.log('📄 CSV Values:', values);
      console.log('📄 Parsed CSV data:', data);

      // Map CSV fields to lead fields (flexible mapping)
      const updatedLead = { ...newLead };

      // Try to find owner/name (many variations)
      const ownerFields = ['owner', 'owner name', 'owner_name', 'name', 'ownername', 'owner1', 'mail_name'];
      for (const field of ownerFields) {
        if (data[field]) {
          updatedLead.owner_name = data[field];
          break;
        }
      }

      // Try to find parcel ID (many variations)
      const parcelFields = ['apn', 'parcel id', 'parcel_id', 'parcelid', 'parcelnumb', 'parcel_number', 'account', 'account_number'];
      for (const field of parcelFields) {
        if (data[field]) {
          updatedLead.parcel_id = data[field];
          break;
        }
      }

      // Try to find acres (many variations)
      const acresFields = ['acres', 'acreage', 'gisacre', 'gis_acre', 'calc_acres', 'calculated_acres', 'area_acres'];
      for (const field of acresFields) {
        if (data[field]) {
          updatedLead.acres = data[field];
          break;
        }
      }

      // Try to find address
      const addressFields = ['address', 'street address', 'street_address', 'situs_address', 'situs', 'property_address'];
      for (const field of addressFields) {
        if (data[field]) {
          updatedLead.street_address = data[field];
          break;
        }
      }

      // Try to find county
      const countyFields = ['county', 'county_name'];
      for (const field of countyFields) {
        if (data[field]) {
          updatedLead.property_county = data[field];
          break;
        }
      }

      // Try to find state
      const stateFields = ['state', 'state_code', 'st'];
      for (const field of stateFields) {
        if (data[field]) {
          updatedLead.property_state = data[field];
          break;
        }
      }

      // Try to find zip
      const zipFields = ['zip', 'zipcode', 'zip_code', 'postal_code', 'postalcode'];
      for (const field of zipFields) {
        if (data[field]) {
          updatedLead.zip_code = data[field];
          break;
        }
      }

      setNewLead(updatedLead);
      console.log('✅ Updated lead data:', updatedLead);
      alert('✅ CSV data loaded! Check the console for details.');
    } catch (error) {
      console.error('Error parsing CSV:', error);
      alert('❌ Error parsing CSV file: ' + error.message);
    }
  };

  const handleCreateLead = async () => {
    if (!parcelLocated) {
      alert('Please locate the property on the map first');
      return;
    }

    setCreatingLead(true);

    try {
      // Determine geometry source based on input mode
      let geometry = null;
      let properties = {};

      if (inputMode === 'upload') {
        // Use uploaded geometry from KML file
        geometry = uploadedGeometry;
        console.log('📤 Using uploaded geometry:', geometry);
      } else if (inputMode === 'click' || inputMode === 'search') {
        // Use Regrid result geometry (from click or search)
        const selectedParcel = foundParcels[selectedParcelIndex];
        geometry = selectedParcel?.geometry;
        properties = selectedParcel?.properties || {};

        console.log(`${inputMode === 'click' ? '🖱️' : '🔍'} Using Regrid geometry:`, {
          mode: inputMode,
          foundParcelsLength: foundParcels.length,
          selectedParcelIndex: selectedParcelIndex,
          hasGeometry: !!geometry
        });
      }

      if (!geometry) {
        console.error('❌ NO GEOMETRY FOUND!', {
          inputMode,
          uploadedGeometry,
          foundParcels,
          selectedParcelIndex
        });
        alert('⚠️ ERROR: No parcel geometry! Lead will be created but won\'t show on map. Check console.');
      }

      // Calculate centroid from geometry for lat/lng
      let latitude = null;
      let longitude = null;
      if (geometry && geometry.coordinates && geometry.coordinates[0]) {
        const coords = geometry.coordinates[0];
        const lats = coords.map(c => c[1]);
        const lngs = coords.map(c => c[0]);
        latitude = lats.reduce((a, b) => a + b) / lats.length;
        longitude = lngs.reduce((a, b) => a + b) / lngs.length;
        console.log('📍 Calculated centroid:', { latitude, longitude });
      }

      const leadToInsert = {
        full_name: newLead.full_name,
        name: newLead.full_name,
        email: newLead.email,
        phone: newLead.phone,
        street_address: newLead.street_address,
        address: newLead.street_address,
        city: properties?.city || 'Unknown',
        property_state: newLead.property_state,
        state: newLead.property_state,
        property_county: newLead.property_county,
        county: newLead.property_county,
        zip: newLead.zip_code,
        acres: parseFloat(newLead.acres) || null,
        acreage: parseFloat(newLead.acres) || null,
        parcel_id: newLead.parcel_id,
        parcel_geometry: geometry,
        latitude: latitude,
        longitude: longitude,
        source: inputMode === 'upload' ? 'admin-upload' : inputMode === 'click' ? 'admin-click' : 'admin-search',
        status: 'new',
        dealtype: 'flips',
        created_at: new Date().toISOString()
      };

      console.log('🚀 INSERTING LEAD:', {
        name: leadToInsert.full_name,
        inputMode,
        hasGeometry: !!geometry,
        geometryType: geometry?.type,
        acres: leadToInsert.acres,
        parcel_id: leadToInsert.parcel_id
      });

      const { data: leadData, error: leadError } = await supabase
        .from('leads')
        .insert([leadToInsert])
        .select();

      if (leadError) throw leadError;

      // Notify all teams about the new lead
      if (leadData && leadData.length > 0) {
        const newLeadData = leadData[0];
        const location = newLeadData.property_county || 'Unknown';
        const state = newLeadData.property_state || newLeadData.state || 'TX';
        const acres = newLeadData.acres || 'N/A';
        const price = newLeadData.price;

        // Check if this is a priced lead (for purchase)
        const isPricedLead = price && parseFloat(price) > 0;

        const title = isPricedLead ? 'New Lead Available for Purchase' : 'New Lead Available';
        const message = isPricedLead
          ? `${acres} acres in ${location}, ${state} - $${price}`
          : `${newLeadData.full_name || 'Property'} - ${acres} in ${location}`;

        // Get all teams
        const { data: allTeams } = await supabase
          .from('teams')
          .select('id');

        if (allTeams && allTeams.length > 0) {
          for (const team of allTeams) {
            // Get all team members
            const { data: teamMembers } = await supabase
              .from('team_members')
              .select('user_id')
              .eq('team_id', team.id);

            if (teamMembers && teamMembers.length > 0) {
              // Notify each team member
              for (const member of teamMembers) {
                try {
                  await fetch('/api/notifications/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      userId: member.user_id,
                      type: isPricedLead ? 'lead_available_purchase' : 'lead_added',
                      title: title,
                      message: message,
                      sendEmail: true
                    })
                  });
                } catch (err) {
                  console.error('Failed to send notification:', err);
                }
              }
            }
          }
        }
      }

      // Reset form
      setNewLead({
        full_name: '',
        email: '',
        phone: '',
        property_state: '',
        property_county: '',
        street_address: '',
        zip_code: '',
        acres: '',
        parcel_id: ''
      });
      setFoundParcels([]);
      setSelectedParcelIndex(0);
      setParcelLocated(false);

      // Refresh data and switch to unassigned tab
      await fetchAllData();
      setActiveTab('unassigned');
      alert('Lead published successfully! You can now assign it to organizations.');
    } catch (error) {
      console.error('Error creating lead:', error);
      alert('Error creating lead: ' + error.message);
    } finally {
      setCreatingLead(false);
    }
  };

  const unassignedLeads = allLeads.filter(l => !l.purchased_by);
  const assignedLeads = allLeads.filter(l => l.purchased_by);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header */}
      <div className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700/50 px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src="/parcelreach-logo.png" alt="ParcelReach" className="h-20" />
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="bg-slate-700 px-4 py-2 rounded-lg hover:bg-slate-600 transition-colors text-sm font-semibold"
            >
              Exit Admin
            </Link>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-slate-800/30 border-b border-slate-700/50 px-6">
        <div className="flex gap-4">
          {['organizations', 'ppc-inflow', 'all-leads', 'unassigned', 'create-lead'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 font-medium capitalize border-b-2 transition ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {tab === 'ppc-inflow' && (
                <svg className="w-4 h-4 inline-block mr-1 -mt-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 13h2v8H3v-8zm4-6h2v14H7V7zm4-4h2v18h-2V3zm4 9h2v9h-2v-9zm4-3h2v12h-2V9z"/>
                </svg>
              )}
              {tab.replace('-', ' ')}
              {tab === 'unassigned' && ` (${unassignedLeads.length})`}
              {tab === 'ppc-inflow' && ` (${allLeads.filter(l => l.source?.includes('Haven Ground')).length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {/* ORGANIZATIONS TAB */}
        {activeTab === 'organizations' && (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 border border-blue-500/30 rounded-xl p-6">
                <div className="text-3xl font-bold text-blue-400">{organizations.length}</div>
                <div className="text-slate-300 text-sm mt-1">Total Organizations</div>
              </div>
              <div className="bg-gradient-to-br from-green-500/20 to-green-600/20 border border-green-500/30 rounded-xl p-6">
                <div className="text-3xl font-bold text-green-400">{allLeads.length}</div>
                <div className="text-slate-300 text-sm mt-1">Total Leads</div>
              </div>
              <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/20 border border-purple-500/30 rounded-xl p-6">
                <div className="text-3xl font-bold text-purple-400">{unassignedLeads.length}</div>
                <div className="text-slate-300 text-sm mt-1">Unassigned Leads</div>
              </div>
              <div className="bg-gradient-to-br from-orange-500/20 to-orange-600/20 border border-orange-500/30 rounded-xl p-6">
                <div className="text-3xl font-bold text-orange-400">{assignedLeads.length}</div>
                <div className="text-slate-300 text-sm mt-1">Assigned Leads</div>
              </div>
            </div>

            {/* Organizations List */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
              <div className="p-4 border-b border-slate-700/50">
                <h3 className="text-xl font-bold">All Organizations</h3>
              </div>
              <div className="divide-y divide-slate-700/50">
                {organizations.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    No organizations yet
                  </div>
                ) : (
                  organizations.map((org) => {
                    // Count leads assigned to this org from junction table
                    const orgLeadCount = Object.entries(leadAssignments).filter(([leadId, assignments]) =>
                      assignments.some(a => a.team_id === org.id)
                    ).length;
                    const monthlyLeads = organizations.filter(o => o.subscription_type === 'monthly').length;

                    return (
                      <div key={org.id} className="p-6 hover:bg-slate-700/30 transition-colors">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <h4 className="text-lg font-semibold text-white">{org.name}</h4>
                              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                org.subscription_type === 'monthly'
                                  ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                                  : org.subscription_type === 'enterprise'
                                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50'
                                  : 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                              }`}>
                                {org.subscription_type || 'pay-per-lead'}
                              </span>
                            </div>
                            <div className="mt-3 grid grid-cols-4 gap-4 text-sm">
                              <div>
                                <span className="text-slate-400">Members:</span>
                                <span className="ml-2 font-semibold text-white">
                                  {org.team_members?.[0]?.count || 0}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400">Total Leads:</span>
                                <span className="ml-2 font-semibold text-white">{orgLeadCount}</span>
                              </div>
                              <div>
                                <span className="text-slate-400">Joined:</span>
                                <span className="ml-2 font-semibold text-white">
                                  {new Date(org.created_at).toLocaleDateString()}
                                </span>
                              </div>
                              {org.subscription_type === 'monthly' && (
                                <div>
                                  <span className="text-slate-400">Monthly Allocation:</span>
                                  <span className="ml-2 font-semibold text-white">
                                    {org.leads_used_this_month || 0} / {org.monthly_lead_allocation || 0}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleViewDashboard(org.id)}
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors font-semibold text-sm"
                            >
                              View Dashboard
                            </button>
                            <button
                              onClick={() => {
                                setSelectedOrg(org);
                                setActiveTab('unassigned');
                              }}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-colors font-semibold text-sm"
                            >
                              Assign Lead
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* PPC INFLOW TAB */}
        {activeTab === 'ppc-inflow' && (
          <div className="space-y-6">
            {/* PPC Stats */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-orange-500/20 to-orange-600/20 border border-orange-500/30 rounded-xl p-6">
                <div className="text-3xl font-bold text-orange-400">{allLeads.filter(l => l.source?.includes('Haven Ground')).length}</div>
                <div className="text-slate-300 text-sm mt-1">PPC Inflow Leads</div>
              </div>
              <div className="bg-gradient-to-br from-green-500/20 to-green-600/20 border border-green-500/30 rounded-xl p-6">
                <div className="text-3xl font-bold text-green-400">{allLeads.filter(l => l.source?.includes('Haven Ground') && l.form_data?.homeOnProperty === 'no').length}</div>
                <div className="text-slate-300 text-sm mt-1">No Home (Qualified)</div>
              </div>
              <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 border border-blue-500/30 rounded-xl p-6">
                <div className="text-3xl font-bold text-blue-400">{allLeads.filter(l => l.source?.includes('Haven Ground') && l.form_data?.acres?.includes('50') || l.form_data?.acres?.includes('100')).length}</div>
                <div className="text-slate-300 text-sm mt-1">50+ Acres</div>
              </div>
              <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/20 border border-purple-500/30 rounded-xl p-6">
                <div className="text-3xl font-bold text-purple-400">{allLeads.filter(l => l.source?.includes('Haven Ground') && new Date(l.created_at) > new Date(Date.now() - 24*60*60*1000)).length}</div>
                <div className="text-slate-300 text-sm mt-1">Last 24 Hours</div>
              </div>
            </div>

            {/* PPC Leads Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {allLeads
                .filter(l => l.source?.includes('Haven Ground'))
                .map((lead) => (
                  <div
                    key={lead.id}
                    className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 hover:border-blue-500/50 hover:shadow-xl hover:shadow-blue-500/10 transition-all"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-white font-semibold text-lg mb-1">{lead.name}</h3>
                        {lead.form_data?.position && (
                          <span className="inline-block px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs font-medium rounded capitalize">
                            {lead.form_data.position}
                          </span>
                        )}
                      </div>
                      <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs font-semibold rounded whitespace-nowrap ml-2">
                        NEW
                      </span>
                    </div>

                    {/* Property Location */}
                    <div className="space-y-1 mb-3 pb-3 border-b border-slate-700/50">
                      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Property Location</div>
                      {lead.form_data?.streetAddress && (
                        <div className="text-sm text-slate-300">{lead.form_data.streetAddress}</div>
                      )}
                      <div className="flex gap-2 text-sm text-slate-300">
                        {lead.form_data?.propertyCounty && (
                          <span>{lead.form_data.propertyCounty} County</span>
                        )}
                        {lead.form_data?.propertyState && (
                          <span className="text-slate-400">• {lead.form_data.propertyState}</span>
                        )}
                      </div>
                      {lead.form_data?.acres && (
                        <div className="text-sm font-semibold text-orange-400">{lead.form_data.acres}</div>
                      )}
                    </div>

                    {/* Property Details */}
                    <div className="space-y-2 mb-3 pb-3 border-b border-slate-700/50">
                      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Property Details</div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {lead.form_data?.homeOnProperty && (
                          <div>
                            <span className="text-slate-500">Home:</span>{' '}
                            <span className={lead.form_data.homeOnProperty === 'no' ? 'text-green-400 font-semibold' : 'text-yellow-400'}>
                              {lead.form_data.homeOnProperty.toUpperCase()}
                            </span>
                          </div>
                        )}
                        {lead.form_data?.propertyListed && (
                          <div>
                            <span className="text-slate-500">Listed:</span>{' '}
                            <span className={lead.form_data.propertyListed === 'no' ? 'text-green-400 font-semibold' : 'text-yellow-400'}>
                              {lead.form_data.propertyListed.toUpperCase()}
                            </span>
                          </div>
                        )}
                        {lead.form_data?.ownedFourYears && (
                          <div>
                            <span className="text-slate-500">4+ Years:</span>{' '}
                            <span className={lead.form_data.ownedFourYears === 'yes' ? 'text-green-400 font-semibold' : 'text-yellow-400'}>
                              {lead.form_data.ownedFourYears.toUpperCase()}
                            </span>
                          </div>
                        )}
                        {lead.form_data?.namesOnDeed && (
                          <div className="col-span-2">
                            <span className="text-slate-500">On Deed:</span>{' '}
                            <span className="text-slate-300">{lead.form_data.namesOnDeed}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Contact Info */}
                    <div className="space-y-2 text-sm mb-3">
                      {lead.email && (
                        <div className="flex items-center gap-2 text-slate-300 truncate">
                          <svg className="w-4 h-4 flex-shrink-0 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          <span className="truncate">{lead.email}</span>
                        </div>
                      )}
                      {lead.phone && (
                        <div className="flex items-center gap-2 text-slate-300">
                          <svg className="w-4 h-4 flex-shrink-0 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          {lead.phone}
                        </div>
                      )}
                      {lead.ip_address && (
                        <div className="flex items-center gap-2 text-slate-400 text-xs">
                          <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                          </svg>
                          IP: {lead.ip_address}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="mt-4 pt-4 border-t border-slate-700/50 flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setLeadForMapSearch(lead);
                          setFindMapModalOpen(true);
                          setKmlFile(null);
                          setUploadedGeometry(null);
                        }}
                        className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                        </svg>
                        Attach Map
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLead(lead);
                        }}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold rounded-lg transition-colors"
                      >
                        View Details
                      </button>
                    </div>

                    {/* Footer */}
                    <div className="mt-2 text-xs text-slate-500 text-center">
                      {new Date(lead.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
            </div>

            {allLeads.filter(l => l.source?.includes('Haven Ground')).length === 0 && (
              <div className="text-center py-12 text-slate-400">
                No PPC leads yet. Leads from Haven Ground form will appear here.
              </div>
            )}
          </div>
        )}

        {/* ALL LEADS TAB */}
        {activeTab === 'all-leads' && (
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="p-4 border-b border-slate-700/50">
              <h3 className="text-xl font-bold">All Leads</h3>
              <p className="text-sm text-slate-400 mt-1">{allLeads.length} total leads</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-700/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Location</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Acres</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Assigned To</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {allLeads.map((lead) => {
                    const assignments = leadAssignments[lead.id] || [];
                    const assignedOrgs = assignments.map(a => ({
                      org: organizations.find(o => o.id === a.team_id),
                      assignedAt: a.assigned_at
                    })).filter(a => a.org);

                    return (
                      <tr key={lead.id} className="hover:bg-slate-700/30">
                        <td className="px-6 py-4 text-sm">
                          {new Date(lead.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium">{lead.full_name || lead.name}</div>
                          <div className="text-sm text-slate-400">{lead.email}</div>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {lead.property_county || lead.county}, {lead.property_state || lead.state}
                        </td>
                        <td className="px-6 py-4 text-sm">{lead.acres || lead.acreage || '-'}</td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            lead.status === 'assigned' ? 'bg-green-500/20 text-green-400' :
                            lead.status === 'new' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-slate-500/20 text-slate-400'
                          }`}>
                            {lead.status || 'new'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {assignedOrgs.length > 0 ? (
                            <div className="space-y-1.5">
                              {assignedOrgs.map((assignment, idx) => (
                                <div key={idx} className="text-sm">
                                  <div className="font-medium text-white">{assignment.org.name}</div>
                                  <div className="text-xs text-slate-400">
                                    {new Date(assignment.assignedAt).toLocaleDateString()}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-500">Unassigned</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => {
                              setSelectedLead(lead);
                              setAssignModalOpen(true);
                            }}
                            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors text-sm font-medium"
                          >
                            Assign
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* UNASSIGNED LEADS TAB */}
        {activeTab === 'unassigned' && (
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold">Unassigned Leads</h3>
                <p className="text-sm text-slate-400 mt-1">
                  {unassignedLeads.length} leads awaiting assignment
                </p>
              </div>
              {selectedOrg && (
                <div className="text-sm">
                  <span className="text-slate-400">Assigning to:</span>
                  <span className="ml-2 font-semibold text-blue-400">{selectedOrg.name}</span>
                  <button
                    onClick={() => setSelectedOrg(null)}
                    className="ml-3 text-red-400 hover:text-red-300"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
            <div className="divide-y divide-slate-700/50">
              {unassignedLeads.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  All leads have been assigned!
                </div>
              ) : (
                unassignedLeads.map((lead) => (
                  <div key={lead.id} className="p-6 hover:bg-slate-700/30 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="text-lg font-semibold text-white">
                          {lead.full_name || lead.name}
                        </h4>
                        <div className="mt-2 grid grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-slate-400">Location:</span>
                            <span className="ml-2 text-white">
                              {lead.property_county || lead.county}, {lead.property_state || lead.state}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400">Acres:</span>
                            <span className="ml-2 text-white">{lead.acres || lead.acreage || '-'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400">Email:</span>
                            <span className="ml-2 text-white">{lead.email}</span>
                          </div>
                          <div>
                            <span className="text-slate-400">Phone:</span>
                            <span className="ml-2 text-white">{lead.phone}</span>
                          </div>
                        </div>
                        {lead.parcel_id && (
                          <div className="mt-2 text-sm">
                            <span className="text-slate-400">Parcel ID:</span>
                            <span className="ml-2 text-white font-mono">{lead.parcel_id}</span>
                          </div>
                        )}
                      </div>
                      <div>
                        <button
                          onClick={() => {
                            setSelectedLead(lead);
                            setAssignModalOpen(true);
                          }}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-colors font-semibold text-sm"
                        >
                          Assign to Organization
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* CREATE LEAD TAB */}
        {activeTab === 'create-lead' && (
          <div className="grid grid-cols-2 gap-6">
            {/* Left: Map */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
              <div className="p-4 border-b border-slate-700/50">
                <h3 className="text-xl font-bold">Property Location</h3>
                <p className="text-sm text-slate-400 mt-1">Fill in the form and locate the property on the map</p>
              </div>

              <div className="p-4">
                <div ref={mapContainer} className="h-96 rounded-lg overflow-hidden" />

                {foundParcels.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <h4 className="font-semibold text-white mb-2">
                      {foundParcels.length > 1 ? `Select Parcel (${foundParcels.length} found)` : 'Parcel Found'}
                    </h4>
                    {foundParcels.map((parcel, index) => (
                      <div
                        key={index}
                        onClick={() => selectParcel(index)}
                        className={`p-4 rounded-lg cursor-pointer transition-all ${
                          selectedParcelIndex === index
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="opacity-75">Address:</span>
                            <span className="ml-2 font-medium">{parcel.properties.address}</span>
                          </div>
                          <div>
                            <span className="opacity-75">Acres:</span>
                            <span className="ml-2 font-medium">{parcel.properties.acres}</span>
                          </div>
                          <div>
                            <span className="opacity-75">County:</span>
                            <span className="ml-2 font-medium">{parcel.properties.county}</span>
                          </div>
                          <div>
                            <span className="opacity-75">APN:</span>
                            <span className="ml-2 font-medium">{parcel.properties.apn}</span>
                          </div>
                          {parcel.properties.owner && (
                            <div className="col-span-2">
                              <span className="opacity-75">Owner:</span>
                              <span className="ml-2 font-medium">{parcel.properties.owner}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Form */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
              <div className="p-4 border-b border-slate-700/50">
                <h3 className="text-xl font-bold">Lead Information</h3>
                <p className="text-sm text-slate-400 mt-1">Fill in the landowner details</p>
              </div>

              <div className="p-6 space-y-4">
                {/* Input Mode Toggle */}
                <div className="grid grid-cols-3 gap-2 p-1 bg-slate-900/50 rounded-lg border border-slate-700">
                  <button
                    onClick={() => setInputMode('search')}
                    className={`px-3 py-2 rounded-md font-medium transition-all text-sm ${
                      inputMode === 'search'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Search
                  </button>
                  <button
                    onClick={() => {
                      setInputMode('click');
                      setClickToFindActive(false);
                    }}
                    className={`px-3 py-2 rounded-md font-medium transition-all text-sm ${
                      inputMode === 'click'
                        ? 'bg-orange-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Click Map
                  </button>
                  <button
                    onClick={() => setInputMode('upload')}
                    className={`px-3 py-2 rounded-md font-medium transition-all text-sm ${
                      inputMode === 'upload'
                        ? 'bg-green-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Upload
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Full Name</label>
                  <input
                    type="text"
                    value={newLead.full_name}
                    onChange={(e) => setNewLead({ ...newLead, full_name: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="John Doe"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                    <input
                      type="email"
                      value={newLead.email}
                      onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="john@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Phone</label>
                    <input
                      type="tel"
                      value={newLead.phone}
                      onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </div>

                {/* Search Mode - Regrid API */}
                {inputMode === 'search' && (
                  <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
                    <p className="text-sm text-blue-300 mb-3">Search by ONE of the following:</p>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                          Parcel ID / APN <span className="text-green-400">(Recommended - 1 API call)</span>
                        </label>
                        <input
                          type="text"
                          value={newLead.parcel_id}
                          onChange={(e) => setNewLead({ ...newLead, parcel_id: e.target.value })}
                          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500"
                          placeholder="R67873"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                          Owner Name on Title
                        </label>
                        <input
                          type="text"
                          value={newLead.owner_name}
                          onChange={(e) => setNewLead({ ...newLead, owner_name: e.target.value })}
                          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="John Smith"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Property Address <span className="text-yellow-400">(Multiple results - more API calls)</span>
                      </label>
                      <input
                        type="text"
                        value={newLead.street_address}
                        onChange={(e) => setNewLead({ ...newLead, street_address: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                        placeholder="123 Main St (optional if using Parcel ID)"
                      />
                    </div>
                  </div>
                )}

                {/* Click to Find Mode */}
                {inputMode === 'click' && (
                  <div className="bg-orange-900/20 border border-orange-500/30 rounded-lg p-4 space-y-4">
                    <p className="text-sm text-orange-300 mb-3">Click on the map to find a parcel (1 API call per click)</p>

                    <div className="bg-slate-900/50 border border-slate-700 rounded p-3 space-y-2">
                      <p className="text-xs text-slate-400">
                        <strong className="text-slate-300">How it works:</strong><br/>
                        1. Enable click mode below<br/>
                        2. Navigate to the property location on the map<br/>
                        3. Click directly on the parcel<br/>
                        4. Parcel data will auto-populate
                      </p>
                      <p className="text-xs text-yellow-400">
                        ⚠️ Warning: Each click = 1 API call. Only use when you know exactly where the parcel is!
                      </p>
                    </div>

                    <button
                      onClick={() => setClickToFindActive(!clickToFindActive)}
                      className={`w-full px-4 py-3 rounded-lg font-medium transition-all ${
                        clickToFindActive
                          ? 'bg-orange-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {clickToFindActive ? 'Click Mode Active - Click on Map' : 'Enable Click to Find'}
                    </button>

                    {clickToFindActive && (
                      <div className="bg-orange-500/10 border border-orange-500/50 rounded p-3 animate-pulse">
                        <p className="text-sm text-orange-300 font-medium text-center">
                          👆 Click anywhere on the map to find a parcel
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Upload Mode - File Upload */}
                {inputMode === 'upload' && (
                  <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4 space-y-4">
                    <p className="text-sm text-green-300 mb-3">Upload parcel files from County GIS (0 API calls)</p>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        KML File <span className="text-green-400">(Parcel Boundary - Required)</span>
                      </label>
                      <input
                        type="file"
                        accept=".kml"
                        onChange={handleKmlUpload}
                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-green-600 file:text-white hover:file:bg-green-700"
                      />
                      {kmlFile && (
                        <p className="text-xs text-green-400 mt-1">✅ {kmlFile.name}</p>
                      )}
                    </div>

                    <div className="border-t border-slate-700 pt-4">
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        📋 Paste Property Data from GIS <span className="text-yellow-400">(Easiest!)</span>
                      </label>
                      <textarea
                        placeholder="Paste property details from County GIS here...&#10;&#10;Example:&#10;Location&#10;Grimes County, TX&#10;&#10;Acres&#10;139.71&#10;&#10;Parcel #&#10;R11600&#10;&#10;Owner 1&#10;JOHN DOE&#10;&#10;Property Address&#10;123 COUNTY ROAD 407, CITY, TX 77777"
                        onChange={(e) => handlePastedData(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500 font-mono text-sm"
                        rows="8"
                      />
                      <p className="text-xs text-slate-400 mt-1">
                        Just copy the property details from the GIS website and paste here - it will auto-fill!
                      </p>
                    </div>

                    <div className="bg-slate-900/50 border border-slate-700 rounded p-3">
                      <p className="text-xs text-slate-400">
                        <strong className="text-slate-300">Quick Start:</strong><br/>
                        1. Upload KML file (for parcel boundary)<br/>
                        2. Paste property data above (auto-fills form)<br/>
                        3. Fill in Name, Email, Phone<br/>
                        4. Click "Publish Lead"
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">County</label>
                    <input
                      type="text"
                      value={newLead.property_county}
                      onChange={(e) => setNewLead({ ...newLead, property_county: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Travis"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">State</label>
                    <input
                      type="text"
                      value={newLead.property_state}
                      onChange={(e) => setNewLead({ ...newLead, property_state: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="TX"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Zip Code</label>
                    <input
                      type="text"
                      value={newLead.zip_code}
                      onChange={(e) => setNewLead({ ...newLead, zip_code: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="78701"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Acres (optional)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newLead.acres}
                    onChange={(e) => setNewLead({ ...newLead, acres: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="10.5"
                  />
                </div>

                {/* Only show Locate Property button for Search and Click modes */}
                {inputMode !== 'upload' && (
                  <button
                    onClick={locateParcel}
                    disabled={locatingParcel}
                    className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {locatingParcel ? 'Locating Property...' : 'Locate Property'}
                  </button>
                )}

                {parcelLocated && (
                  <button
                    onClick={handleCreateLead}
                    disabled={creatingLead || !newLead.full_name}
                    className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {creatingLead ? 'Publishing Lead...' : 'Publish Lead'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Assign Modal */}
      {assignModalOpen && selectedLead && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => {
            setAssignModalOpen(false);
            setSelectedLead(null);
          }}
        >
          <div
            className="bg-slate-800 rounded-xl border border-slate-700 max-w-2xl w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold mb-4">Assign Lead to Organizations</h3>
            <div className="mb-6 p-4 bg-slate-900/50 rounded-lg">
              <p className="font-semibold text-white">{selectedLead.full_name || selectedLead.name}</p>
              <p className="text-sm text-slate-400 mt-1">
                {selectedLead.property_county || selectedLead.county}, {selectedLead.property_state || selectedLead.state}
              </p>
            </div>

            {/* Price Input for Marketplace Leads */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                Lead Price (Optional)
              </label>
              <div className="flex items-center gap-3">
                <div className="flex-1 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">$</span>
                  <input
                    type="number"
                    value={leadPrice}
                    onChange={(e) => setLeadPrice(e.target.value)}
                    placeholder="197"
                    min="0"
                    step="1"
                    className="w-full pl-8 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div className="text-sm text-slate-400">
                  Leave empty for free/allocated leads
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                💡 If price is set, lead will be masked until purchased
              </p>
            </div>

            <p className="text-sm text-slate-300 mb-3">Select one or more organizations:</p>
            <div className="space-y-2 max-h-96 overflow-y-auto mb-6">
              {organizations.map((org) => (
                <label
                  key={org.id}
                  className="flex items-center p-4 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors border border-slate-600 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedOrgsForAssignment.includes(org.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedOrgsForAssignment([...selectedOrgsForAssignment, org.id]);
                      } else {
                        setSelectedOrgsForAssignment(selectedOrgsForAssignment.filter(id => id !== org.id));
                      }
                    }}
                    className="w-5 h-5 mr-3 rounded border-slate-500 text-blue-500 focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <div className="font-semibold">{org.name}</div>
                    <div className="text-sm text-slate-400 mt-1">
                      {org.subscription_type || 'pay-per-lead'} • {
                        allLeads.filter(l => l.purchased_by === org.id).length
                      } leads
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setAssignModalOpen(false);
                  setSelectedLead(null);
                  setSelectedOrgsForAssignment([]);
                  setLeadPrice(''); // Reset price
                }}
                className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (selectedOrgsForAssignment.length > 0) {
                    handleAssignLead(selectedLead.id, selectedOrgsForAssignment);
                  }
                }}
                disabled={selectedOrgsForAssignment.length === 0 || isAssigning}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-semibold flex items-center justify-center gap-2"
              >
                {isAssigning ? (
                  <>
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Assigning...
                  </>
                ) : (
                  `Assign to ${selectedOrgsForAssignment.length} Org${selectedOrgsForAssignment.length !== 1 ? 's' : ''}`
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attach Map Modal */}
      {findMapModalOpen && leadForMapSearch && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => {
            setFindMapModalOpen(false);
            setLeadForMapSearch(null);
            setKmlFile(null);
            setUploadedGeometry(null);
            setNewLead({...newLead, parcel_id: '', notes: '', acres: ''});
          }}
        >
          <div
            className="bg-slate-800 rounded-xl border border-slate-700 max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold mb-4">Attach Map to Lead</h3>

            {/* Lead Details */}
            <div className="mb-6 p-4 bg-slate-900/50 rounded-lg border border-slate-700">
              <h4 className="font-semibold text-white mb-3">{leadForMapSearch.name}</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-slate-500">Email:</span>
                  <span className="ml-2 text-slate-300">{leadForMapSearch.email}</span>
                </div>
                <div>
                  <span className="text-slate-500">Phone:</span>
                  <span className="ml-2 text-slate-300">{leadForMapSearch.phone}</span>
                </div>
                <div>
                  <span className="text-slate-500">Address:</span>
                  <span className="ml-2 text-slate-300">{leadForMapSearch.form_data?.streetAddress}</span>
                </div>
                <div>
                  <span className="text-slate-500">County:</span>
                  <span className="ml-2 text-slate-300">{leadForMapSearch.form_data?.propertyCounty}, {leadForMapSearch.form_data?.propertyState}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500">Acres:</span>
                  <span className="ml-2 text-orange-400 font-semibold">{leadForMapSearch.form_data?.acres}</span>
                </div>
              </div>
            </div>

            {/* Exact Acreage */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                Exact Acreage <span className="text-orange-400">(Replaces range from form)</span>
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="Enter exact acreage (e.g. 10.25)"
                value={newLead.acres || ''}
                onChange={(e) => setNewLead({...newLead, acres: e.target.value})}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-slate-500 mt-1">Form shows: {leadForMapSearch.form_data?.acres || 'N/A'}</p>
            </div>

            {/* Parcel ID */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-300 mb-2">Parcel ID (Optional)</label>
              <input
                type="text"
                placeholder="Enter parcel ID"
                value={newLead.parcel_id || ''}
                onChange={(e) => setNewLead({...newLead, parcel_id: e.target.value})}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Notes */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-300 mb-2">Notes (Optional)</label>
              <textarea
                placeholder="Add notes about this property..."
                value={newLead.notes || ''}
                onChange={(e) => setNewLead({...newLead, notes: e.target.value})}
                rows={3}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>

            {/* KML Upload */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-300 mb-2">Upload KML File</label>
              <input
                type="file"
                accept=".kml"
                onChange={async (e) => {
                  const file = e.target.files[0];
                  if (file) {
                    setKmlFile(file);
                    const text = await file.text();
                    const parser = new DOMParser();
                    const xml = parser.parseFromString(text, 'text/xml');
                    const coordinates = xml.querySelector('coordinates')?.textContent.trim();
                    if (coordinates) {
                      const coords = coordinates.split(/\s+/).map(coord => {
                        const [lng, lat] = coord.split(',').map(Number);
                        return [lng, lat];
                      });
                      setUploadedGeometry({
                        type: 'Polygon',
                        coordinates: [coords]
                      });
                    }
                  }
                }}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:cursor-pointer hover:file:bg-blue-700"
              />
            </div>

            {uploadedGeometry && (
              <div className="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                <div className="flex items-center gap-2 text-green-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="font-semibold">KML file loaded successfully!</span>
                </div>
                <p className="text-sm text-slate-400 mt-1">Geometry contains {uploadedGeometry.coordinates[0].length} points</p>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setFindMapModalOpen(false);
                  setLeadForMapSearch(null);
                  setKmlFile(null);
                  setUploadedGeometry(null);
                  setNewLead({...newLead, parcel_id: '', notes: '', acres: ''});
                }}
                className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!uploadedGeometry) return;

                  setIsAssigning(true);
                  try {
                    // Calculate center coordinates for latitude/longitude
                    const coords = uploadedGeometry.coordinates[0];
                    const lngs = coords.map(c => c[0]);
                    const lats = coords.map(c => c[1]);
                    const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
                    const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;

                    const { error } = await supabase
                      .from('leads')
                      .update({
                        parcel_geometry: uploadedGeometry,
                        latitude: centerLat,
                        longitude: centerLng,
                        parcel_id: newLead.parcel_id || null,
                        notes: newLead.notes || null,
                        acres: newLead.acres ? parseFloat(newLead.acres) : null,
                        acreage: newLead.acres ? parseFloat(newLead.acres) : null
                      })
                      .eq('id', leadForMapSearch.id);

                    if (error) throw error;

                    // If notes were provided, also add to lead_notes table
                    if (newLead.notes && newLead.notes.trim()) {
                      const { data: { user } } = await supabase.auth.getUser();
                      if (user) {
                        await supabase
                          .from('lead_notes')
                          .insert([{
                            lead_id: leadForMapSearch.id,
                            user_id: user.id,
                            content: newLead.notes,
                            mentioned_users: []
                          }]);
                      }
                    }

                    alert('Map attached successfully!');

                    // Refresh leads
                    const { data } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
                    if (data) setAllLeads(data);

                    // Close modal
                    setFindMapModalOpen(false);
                    setLeadForMapSearch(null);
                    setKmlFile(null);
                    setUploadedGeometry(null);
                  } catch (err) {
                    console.error('Error attaching map:', err);
                    alert('Failed to attach map');
                  } finally {
                    setIsAssigning(false);
                  }
                }}
                disabled={!uploadedGeometry || isAssigning}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-semibold flex items-center justify-center gap-2"
              >
                {isAssigning ? (
                  <>
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Attaching...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Attach Map
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
