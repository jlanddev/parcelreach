'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function FixLeadsPage() {
  const [user, setUser] = useState(null);
  const [team, setTeam] = useState(null);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({});

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (user && team) {
      // Auto-run fix when user and team are loaded
      fixAll();
    }
  }, [user, team]);

  const log = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, message, type }]);
  };

  const loadUser = async () => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) return;

      setUser(currentUser);
      log(`Logged in as: ${currentUser.email}`, 'success');

      // Get team
      const { data: teams } = await supabase
        .from('team_members')
        .select('team_id, teams(*)')
        .eq('user_id', currentUser.id);

      if (teams && teams.length > 0) {
        setTeam(teams[0].teams);
        log(`Team: ${teams[0].teams.name} (${teams[0].teams.id})`, 'success');
      }
    } catch (error) {
      log(`Error loading user: ${error.message}`, 'error');
    }
  };

  const checkStats = async () => {
    if (!team) return;

    log('Checking current stats...', 'info');

    try {
      // Count total leads
      const { count: totalLeads } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true });

      // Count lead assignments for this team
      const { count: assignments } = await supabase
        .from('lead_assignments')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', team.id);

      // Count team_lead_data for this team
      const { count: teamData } = await supabase
        .from('team_lead_data')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', team.id);

      const newStats = {
        totalLeads,
        assignments,
        teamData
      };

      setStats(newStats);
      log(`Total leads in database: ${totalLeads}`, 'info');
      log(`Leads assigned to your team: ${assignments}`, 'info');
      log(`Team lead data entries: ${teamData}`, 'info');
    } catch (error) {
      log(`Error checking stats: ${error.message}`, 'error');
    }
  };

  const fixAssignments = async () => {
    if (!team) return;

    log('Fixing lead assignments...', 'info');

    try {
      // Get all leads
      const { data: allLeads } = await supabase
        .from('leads')
        .select('id, team_id');

      if (!allLeads) {
        log('No leads found', 'error');
        return;
      }

      log(`Found ${allLeads.length} total leads`, 'info');

      // Get leads that belong to this team
      const teamLeads = allLeads.filter(l => l.team_id === team.id);
      log(`${teamLeads.length} leads have your team_id`, 'info');

      // Get existing assignments
      const { data: existingAssignments } = await supabase
        .from('lead_assignments')
        .select('lead_id')
        .eq('team_id', team.id);

      const existingLeadIds = new Set(existingAssignments?.map(a => a.lead_id) || []);

      // Insert missing assignments
      const toInsert = teamLeads
        .filter(l => !existingLeadIds.has(l.id))
        .map(l => ({
          team_id: team.id,
          lead_id: l.id
        }));

      if (toInsert.length > 0) {
        const { error } = await supabase
          .from('lead_assignments')
          .insert(toInsert);

        if (error) {
          log(`Error inserting assignments: ${error.message}`, 'error');
        } else {
          log(`✓ Inserted ${toInsert.length} lead assignments`, 'success');
        }
      } else {
        log('All leads already assigned', 'success');
      }

      await checkStats();
    } catch (error) {
      log(`Error fixing assignments: ${error.message}`, 'error');
    }
  };

  const fixTeamLeadData = async () => {
    if (!team) return;

    log('Fixing team_lead_data...', 'info');

    try {
      // Get lead assignments
      const { data: assignments } = await supabase
        .from('lead_assignments')
        .select('lead_id')
        .eq('team_id', team.id);

      if (!assignments || assignments.length === 0) {
        log('No lead assignments found. Run "Fix Assignments" first.', 'error');
        return;
      }

      const leadIds = assignments.map(a => a.lead_id);
      log(`Found ${leadIds.length} assigned leads`, 'info');

      // Get existing team_lead_data
      const { data: existingData } = await supabase
        .from('team_lead_data')
        .select('lead_id')
        .eq('team_id', team.id);

      const existingLeadIds = new Set(existingData?.map(d => d.lead_id) || []);

      // Filter out leads that already have team_lead_data
      const leadsToCreate = leadIds.filter(id => !existingLeadIds.has(id));

      if (leadsToCreate.length === 0) {
        log('All leads already have team_lead_data', 'success');
        await checkStats();
        return;
      }

      // Get leads data
      const { data: leadsNeedingData } = await supabase
        .from('leads')
        .select('id, status')
        .in('id', leadsToCreate);

      log(`Creating team_lead_data for ${leadsNeedingData.length} leads`, 'info');

      // Insert team_lead_data
      const toInsert = leadsNeedingData.map(lead => ({
        team_id: team.id,
        lead_id: lead.id,
        status: lead.status || 'new'
      }));

      const { error } = await supabase
        .from('team_lead_data')
        .insert(toInsert);

      if (error) {
        log(`Error inserting team_lead_data: ${error.message}`, 'error');
      } else {
        log(`✓ Created ${toInsert.length} team_lead_data entries`, 'success');
      }

      await checkStats();
    } catch (error) {
      log(`Error fixing team_lead_data: ${error.message}`, 'error');
    }
  };

  const fixAll = async () => {
    log('=== Starting full fix ===', 'info');
    await checkStats();
    await fixAssignments();
    await fixTeamLeadData();
    log('=== Fix complete ===', 'success');
  };

  return (
    <div className="min-h-screen bg-slate-900 p-8 text-white">
      <h1 className="text-3xl font-bold mb-6">Fix Leads - Automated</h1>

      {/* User/Team Info */}
      <div className="bg-slate-800 p-4 rounded mb-4">
        <div>User: {user?.email || 'Not logged in'}</div>
        <div>Team: {team?.name || 'No team'} ({team?.id || 'N/A'})</div>
      </div>

      {/* Stats */}
      <div className="bg-slate-800 p-4 rounded mb-4">
        <h2 className="font-bold mb-2">Current Stats</h2>
        <div>Total Leads: {stats.totalLeads || 0}</div>
        <div>Assigned to Team: {stats.assignments || 0}</div>
        <div>Team Lead Data: {stats.teamData || 0}</div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={checkStats}
          className="bg-blue-600 px-6 py-3 rounded hover:bg-blue-500 font-semibold"
        >
          1. Check Stats
        </button>
        <button
          onClick={fixAssignments}
          className="bg-green-600 px-6 py-3 rounded hover:bg-green-500 font-semibold"
        >
          2. Fix Assignments
        </button>
        <button
          onClick={fixTeamLeadData}
          className="bg-purple-600 px-6 py-3 rounded hover:bg-purple-500 font-semibold"
        >
          3. Fix Team Data
        </button>
        <button
          onClick={fixAll}
          className="bg-red-600 px-6 py-3 rounded hover:bg-red-500 font-semibold"
        >
          FIX ALL
        </button>
      </div>

      {/* Logs */}
      <div className="bg-slate-800 p-4 rounded">
        <h2 className="font-bold mb-2">Logs</h2>
        <div className="space-y-1 max-h-96 overflow-y-auto font-mono text-sm">
          {logs.map((log, i) => (
            <div
              key={i}
              className={`${
                log.type === 'error'
                  ? 'text-red-400'
                  : log.type === 'success'
                  ? 'text-green-400'
                  : 'text-slate-300'
              }`}
            >
              [{log.timestamp}] {log.message}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
