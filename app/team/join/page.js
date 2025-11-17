'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import Image from 'next/image';

// Service role client for accepting invitations
const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function JoinTeamPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [token, setToken] = useState(null);
  const [invitation, setInvitation] = useState(null);
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accepting, setAccepting] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const urlToken = searchParams.get('token');
    if (!urlToken) {
      setError('No invitation token provided');
      setLoading(false);
      return;
    }
    setToken(urlToken);
    loadInvitation(urlToken);
    checkUser();
  }, [searchParams]);

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
  }

  async function loadInvitation(inviteToken) {
    try {
      // Fetch invitation details
      const { data: invite, error: inviteError } = await supabaseService
        .from('team_invitations')
        .select('*')
        .eq('token', inviteToken)
        .single();

      if (inviteError || !invite) {
        setError('Invalid or expired invitation');
        setLoading(false);
        return;
      }

      // Check if already accepted
      if (invite.accepted) {
        setError('This invitation has already been accepted');
        setLoading(false);
        return;
      }

      // Check if expired
      if (new Date(invite.expires_at) < new Date()) {
        setError('This invitation has expired');
        setLoading(false);
        return;
      }

      setInvitation(invite);

      // Fetch team details
      const { data: teamData, error: teamError } = await supabaseService
        .from('teams')
        .select('id, name')
        .eq('id', invite.team_id)
        .single();

      if (teamError || !teamData) {
        setError('Team not found');
        setLoading(false);
        return;
      }

      setTeam(teamData);
      setLoading(false);
    } catch (err) {
      console.error('Error loading invitation:', err);
      setError('Failed to load invitation');
      setLoading(false);
    }
  }

  async function acceptInvitation() {
    setAccepting(true);
    setError(null);

    try {
      // Check if user is logged in
      const { data: { user: currentUser } } = await supabase.auth.getUser();

      if (!currentUser) {
        // Redirect to signup with token parameter
        router.push(`/signup?inviteToken=${token}`);
        return;
      }

      // Verify email matches invitation
      if (currentUser.email.toLowerCase() !== invitation.email.toLowerCase()) {
        setError(`This invitation was sent to ${invitation.email}. Please sign in with that email address.`);
        setAccepting(false);
        return;
      }

      // Accept invitation via API
      const response = await fetch('/api/team/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || 'Failed to accept invitation');
        setAccepting(false);
        return;
      }

      // Success! Redirect to dashboard
      router.push('/dashboard?welcome=team');
    } catch (err) {
      console.error('Error accepting invitation:', err);
      setError('An unexpected error occurred');
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading invitation...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-8 text-center">
          <div className="mb-4">
            <div className="inline-block p-3 bg-red-500/10 rounded-full">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-bold mb-2">Invalid Invitation</h1>
          <p className="text-slate-400 mb-6">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition"
          >
            Go to Homepage
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <Image
            src="/parcelreach-logo.png"
            alt="ParcelReach AI"
            width={280}
            height={80}
            className="mx-auto"
          />
        </div>

        {/* Invitation Card */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-8">
          <div className="text-center mb-6">
            <div className="inline-block p-3 bg-green-500/10 rounded-full mb-4">
              <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-2">Team Invitation</h1>
            <p className="text-slate-400">
              You've been invited to join
            </p>
            <p className="text-xl font-semibold text-blue-400 mt-2">
              {team?.name}
            </p>
          </div>

          <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Invited email:</span>
              <span className="font-medium">{invitation?.email}</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-2">
              <span className="text-slate-400">Expires:</span>
              <span className="font-medium">
                {invitation?.expires_at && new Date(invitation.expires_at).toLocaleDateString()}
              </span>
            </div>
          </div>

          {!user && (
            <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-sm text-blue-400">
                You'll need to create an account or sign in to accept this invitation.
              </p>
            </div>
          )}

          {user && user.email.toLowerCase() !== invitation?.email.toLowerCase() && (
            <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <p className="text-sm text-yellow-400">
                You're currently signed in as <strong>{user.email}</strong>, but this invitation was sent to <strong>{invitation?.email}</strong>. Please sign out and sign in with the invited email address.
              </p>
            </div>
          )}

          <button
            onClick={acceptInvitation}
            disabled={accepting || (user && user.email.toLowerCase() !== invitation?.email.toLowerCase())}
            className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition flex items-center justify-center"
          >
            {accepting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Accepting...
              </>
            ) : user ? (
              'Accept Invitation'
            ) : (
              'Sign Up to Accept'
            )}
          </button>

          {user && (
            <button
              onClick={() => {
                supabase.auth.signOut();
                setUser(null);
              }}
              className="w-full mt-3 py-2 px-4 text-slate-400 hover:text-white transition text-sm"
            >
              Sign out and use different account
            </button>
          )}
        </div>

        <p className="text-center text-slate-500 text-sm mt-6">
          Questions? Contact support at support@parcelreach.ai
        </p>
      </div>
    </div>
  );
}
