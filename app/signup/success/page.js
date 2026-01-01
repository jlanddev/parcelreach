'use client';

import Link from 'next/link';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accountCreated, setAccountCreated] = useState(false);

  useEffect(() => {
    if (sessionId) {
      createAccount();
    } else {
      setLoading(false);
      setError('No session ID found');
    }
  }, [sessionId]);

  async function createAccount() {
    try {
      // Get stored signup data from sessionStorage
      const signupDataStr = sessionStorage.getItem('signupData');
      if (!signupDataStr) {
        throw new Error('Signup data not found. Please try signing up again.');
      }

      const signupData = JSON.parse(signupDataStr);
      const { email, firstName, lastName, organizationName, password } = signupData;

      // Verify the Stripe session
      const verifyResponse = await fetch(`/api/verify-checkout-session?session_id=${sessionId}`);
      const verifyData = await verifyResponse.json();

      if (!verifyResponse.ok) {
        throw new Error(verifyData.error || 'Failed to verify payment');
      }

      const fullName = `${firstName.trim()} ${lastName.trim()}`;

      // Create Supabase auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: {
            full_name: fullName,
            first_name: firstName,
            last_name: lastName,
            organization_name: organizationName,
            stripe_customer_id: verifyData.session?.customer,
            stripe_subscription_id: verifyData.session?.subscription
          }
        }
      });

      if (authError) throw authError;

      // Create user profile in users table
      const { error: userError } = await supabase
        .from('users')
        .upsert([{
          id: authData.user.id,
          email: email,
          full_name: fullName,
          first_name: firstName,
          last_name: lastName,
          created_at: new Date().toISOString()
        }], {
          onConflict: 'id'
        });

      if (userError) throw userError;

      // Create team/organization
      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .insert([{
          name: organizationName,
          owner_id: authData.user.id,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (teamError) throw teamError;

      // Create team member record
      const { error: memberError } = await supabase
        .from('team_members')
        .insert([{
          team_id: teamData.id,
          user_id: authData.user.id,
          role: 'owner'
        }]);

      if (memberError) throw memberError;

      // Clear the stored signup data
      sessionStorage.removeItem('signupData');

      // Track Facebook Conversion API - CompleteRegistration
      try {
        const timestamp = Date.now();
        await fetch('/api/fb-conversion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventName: 'CompleteRegistration',
            email: email,
            firstName: firstName,
            lastName: lastName,
            value: 97,
            currency: 'USD',
            contentName: 'ParcelReach Monthly Subscription',
            eventId: `cr_${timestamp}`
          })
        });

        // Also track StartTrial event
        await fetch('/api/fb-conversion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventName: 'StartTrial',
            email: email,
            firstName: firstName,
            lastName: lastName,
            value: 97,
            currency: 'USD',
            contentName: '7-Day Free Trial',
            eventId: `st_${timestamp}`
          })
        });
      } catch (fbError) {
        console.error('FB Conversion tracking error:', fbError);
      }

      setAccountCreated(true);

    } catch (err) {
      console.error('Account creation error:', err);
      setError(err.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Creating your account...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-slate-800 rounded-2xl shadow-2xl p-8 text-center">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-4">Something went wrong</h1>
          <p className="text-slate-400 mb-6">{error}</p>
          <Link
            href="/signup"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition"
          >
            Try Again
          </Link>
        </div>
      </div>
    );
  }

  // Redirect to login after successful signup
  useEffect(() => {
    if (accountCreated) {
      const timer = setTimeout(() => {
        window.location.href = '/login?welcome=true';
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [accountCreated]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-xl text-slate-300 mb-4">Account created successfully.</p>
        <p className="text-slate-400">Redirecting to login...</p>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    }>
      <SuccessContent />
    </Suspense>
  );
}
