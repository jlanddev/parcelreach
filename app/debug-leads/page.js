'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function DebugLeadsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [teamInfo, setTeamInfo] = useState(null);
  const [leads, setLeads] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [teamLeadData, setTeamLeadData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDebugInfo();
  }, []);

  const loadDebugInfo = async () => {
    try {
      // Get current user
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        router.push('/login');
        return;
      }
      setUser(currentUser);

      // Get user's team
      const { data: teams } = await supabase
        .from('team_members')
        .select('team_id, teams(*)')
        .eq('user_id', currentUser.id);

      if (teams && teams.length > 0) {
        const team = teams[0].teams;
        setTeamInfo(team);

        // Get lead assignments
        const { data: assignmentData } = await supabase
          .from('lead_assignments')
          .select('*')
          .eq('team_id', team.id);
        setAssignments(assignmentData || []);

        // Get team_lead_data
        const { data: teamData } = await supabase
          .from('team_lead_data')
          .select('*')
          .eq('team_id', team.id);
        setTeamLeadData(teamData || []);

        // Get all leads (not filtered)
        const { data: allLeads } = await supabase
          .from('leads')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20);
        setLeads(allLeads || []);
      }
    } catch (error) {
      console.error('Debug error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8 bg-slate-900 min-h-screen text-white">Loading...</div>;
  }

  return (
    <div className="p-8 bg-slate-900 min-h-screen text-white">
      <h1 className="text-3xl font-bold mb-6">Debug: Leads Data</h1>

      {/* User Info */}
      <div className="bg-slate-800 p-4 rounded mb-4">
        <h2 className="text-xl font-bold mb-2">User</h2>
        <p>Email: {user?.email}</p>
        <p>ID: {user?.id}</p>
      </div>

      {/* Team Info */}
      <div className="bg-slate-800 p-4 rounded mb-4">
        <h2 className="text-xl font-bold mb-2">Team</h2>
        {teamInfo ? (
          <>
            <p>Name: {teamInfo.name}</p>
            <p>ID: {teamInfo.id}</p>
          </>
        ) : (
          <p className="text-red-400">No team found</p>
        )}
      </div>

      {/* Lead Assignments */}
      <div className="bg-slate-800 p-4 rounded mb-4">
        <h2 className="text-xl font-bold mb-2">Lead Assignments ({assignments.length})</h2>
        {assignments.length > 0 ? (
          <div className="text-xs overflow-auto max-h-40">
            {assignments.map(a => (
              <div key={a.id} className="border-b border-slate-700 py-1">
                Lead ID: {a.lead_id}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-red-400">No assignments found</p>
        )}
      </div>

      {/* Team Lead Data */}
      <div className="bg-slate-800 p-4 rounded mb-4">
        <h2 className="text-xl font-bold mb-2">Team Lead Data ({teamLeadData.length})</h2>
        {teamLeadData.length > 0 ? (
          <div className="text-xs overflow-auto max-h-40">
            {teamLeadData.map(tld => (
              <div key={tld.id} className="border-b border-slate-700 py-1">
                Lead ID: {tld.lead_id} | Status: {tld.status}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-red-400">No team_lead_data found</p>
        )}
      </div>

      {/* All Leads */}
      <div className="bg-slate-800 p-4 rounded mb-4">
        <h2 className="text-xl font-bold mb-2">All Leads in Database ({leads.length})</h2>
        <div className="space-y-2">
          {leads.map(lead => {
            const isAssigned = assignments.some(a => a.lead_id === lead.id);
            const hasTeamData = teamLeadData.some(tld => tld.lead_id === lead.id);

            return (
              <div
                key={lead.id}
                className={`p-3 rounded ${
                  isAssigned && hasTeamData
                    ? 'bg-green-900/30 border border-green-500/50'
                    : 'bg-red-900/30 border border-red-500/50'
                }`}
              >
                <div className="font-bold">{lead.full_name || 'No name'}</div>
                <div className="text-sm text-slate-400">
                  {lead.street_address}, {lead.city}
                </div>
                <div className="text-xs mt-1">
                  <span className={isAssigned ? 'text-green-400' : 'text-red-400'}>
                    {isAssigned ? '✓' : '✗'} Assigned
                  </span>
                  {' | '}
                  <span className={hasTeamData ? 'text-green-400' : 'text-red-400'}>
                    {hasTeamData ? '✓' : '✗'} Has Team Data
                  </span>
                </div>
                <div className="text-xs text-slate-500">ID: {lead.id}</div>
              </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={() => router.push('/dashboard')}
        className="bg-blue-600 px-6 py-3 rounded hover:bg-blue-500"
      >
        Back to Dashboard
      </button>
    </div>
  );
}
