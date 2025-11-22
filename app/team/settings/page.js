'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function TeamSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [team, setTeam] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState(null);
  const [inviteSuccess, setInviteSuccess] = useState(null);

  useEffect(() => {
    checkUser();
  }, []);

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }
    setUser(user);
    loadTeamData(user.id);
  }

  async function loadTeamData(userId) {
    try {
      // Get user's team through team_members junction table
      const { data: teamMemberships, error: memberError } = await supabase
        .from('team_members')
        .select('team_id, teams(*)')
        .eq('user_id', userId);

      if (memberError || !teamMemberships || teamMemberships.length === 0) {
        setLoading(false);
        return;
      }

      // Use the first team (users can be in multiple teams)
      const userTeamId = teamMemberships[0].team_id;
      const teamData = teamMemberships[0].teams;

      if (!teamData) {
        setLoading(false);
        return;
      }

      setTeam(teamData);

      // Get team members
      const { data: members, error: membersError } = await supabase
        .from('team_members')
        .select(`
          id,
          role,
          created_at,
          users (
            id,
            email,
            full_name
          )
        `)
        .eq('team_id', userTeamId);

      if (!membersError && members) {
        setTeamMembers(members);
      }

      // Get pending invitations (if team owner)
      if (teamData.owner_id === userId) {
        const { data: invites, error: invitesError } = await supabase
          .from('team_invitations')
          .select('*')
          .eq('team_id', userTeamId)
          .eq('accepted', false)
          .gt('expires_at', new Date().toISOString());

        if (!invitesError && invites) {
          setInvitations(invites);
        }
      }

      setLoading(false);
    } catch (err) {
      console.error('Error loading team data:', err);
      setLoading(false);
    }
  }

  async function sendInvitation(e) {
    e.preventDefault();
    setInviting(true);
    setInviteError(null);
    setInviteSuccess(null);

    try {
      const response = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail.toLowerCase(),
          teamId: team.id,
          inviterName: user.user_metadata?.full_name || user.email
        })
      });

      const result = await response.json();

      if (!response.ok) {
        setInviteError(result.error || 'Failed to send invitation');
        setInviting(false);
        return;
      }

      setInviteSuccess(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');

      // Reload invitations
      loadTeamData(user.id);

      setTimeout(() => setInviteSuccess(null), 5000);
    } catch (err) {
      console.error('Error sending invitation:', err);
      setInviteError('An unexpected error occurred');
    }

    setInviting(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading team settings...</p>
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold mb-4">No Team Found</h1>
          <p className="text-slate-400 mb-6">You need to be part of a team to access this page.</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const isOwner = team.owner_id === user?.id;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">{team.name}</h1>
              <p className="text-slate-400 mt-1">Team Settings</p>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Invite New Member - Only for team owners */}
          {isOwner && (
            <div className="lg:col-span-3">
              <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                  <svg className="w-5 h-5 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Invite Team Member
                </h2>
                <form onSubmit={sendInvitation} className="flex gap-3">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="team-member@example.com"
                    required
                    className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-slate-500"
                  />
                  <button
                    type="submit"
                    disabled={inviting}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 rounded-lg font-semibold transition flex items-center"
                  >
                    {inviting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Sending...
                      </>
                    ) : (
                      'Send Invite'
                    )}
                  </button>
                </form>

                {inviteError && (
                  <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                    {inviteError}
                  </div>
                )}

                {inviteSuccess && (
                  <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm">
                    {inviteSuccess}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Team Members */}
          <div className="lg:col-span-2">
            <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Team Members ({teamMembers.length})</h2>
              <div className="space-y-3">
                {teamMembers.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold mr-3">
                        {member.users?.full_name?.charAt(0).toUpperCase() || member.users?.email?.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div>
                        <div className="font-medium">{member.users?.full_name || 'Unknown'}</div>
                        <div className="text-sm text-slate-400">{member.users?.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        member.role === 'owner' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-slate-700 text-slate-300'
                      }`}>
                        {member.role}
                      </span>
                      {member.users?.id === team.owner_id && (
                        <span className="text-xs text-yellow-500">Owner</span>
                      )}
                    </div>
                  </div>
                ))}

                {teamMembers.length === 0 && (
                  <div className="text-center py-8 text-slate-500">
                    No team members yet
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Pending Invitations */}
          {isOwner && (
            <div className="lg:col-span-1">
              <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-4">Pending Invites</h2>
                <div className="space-y-3">
                  {invitations.map((invite) => (
                    <div key={invite.id} className="p-3 bg-slate-800/50 rounded-lg">
                      <div className="text-sm font-medium truncate">{invite.email}</div>
                      <div className="text-xs text-slate-400 mt-1">
                        Expires {new Date(invite.expires_at).toLocaleDateString()}
                      </div>
                    </div>
                  ))}

                  {invitations.length === 0 && (
                    <div className="text-center py-6 text-slate-500 text-sm">
                      No pending invitations
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
