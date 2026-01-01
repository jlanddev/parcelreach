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
          subscription_type: 'monthly',
          stripe_customer_id: verifyData.session?.customer,
          stripe_subscription_id: verifyData.session?.subscription,
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4">
      <div className="max-w-2xl w-full bg-slate-800 rounded-2xl shadow-2xl p-8 md:p-12 text-center">
        <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
          Welcome to ParcelReach!
        </h1>
        <p className="text-xl text-slate-300 mb-8">
          Your account is ready. Check your email to confirm, then log in to access premium land leads.
        </p>

        <div className="bg-slate-900 rounded-xl p-6 mb-8 text-left">
          <h2 className="text-xl font-bold text-white mb-4">Your 7-Day Free Trial:</h2>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold">1</div>
              <div>
                <div className="font-semibold text-white">Check your email</div>
                <div className="text-slate-400">Confirm your email address to activate your account</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold">2</div>
              <div>
                <div className="font-semibold text-white">Login to your dashboard</div>
                <div className="text-slate-400">Browse available land leads in your area</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold">3</div>
              <div>
                <div className="font-semibold text-white">Start closing deals!</div>
                <div className="text-slate-400">Purchase leads and connect with motivated sellers</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/login"
            className="bg-blue-600 text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-blue-700 transition shadow-lg"
          >
            Login to Dashboard
          </Link>
          <Link
            href="/"
            className="bg-slate-700 text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-slate-600 transition"
          >
            Back to Home
          </Link>
        </div>

        <div className="mt-8 pt-8 border-t border-slate-700">
          <p className="text-slate-400">
            Questions? Email us at{' '}
            <a href="mailto:support@parcelreach.ai" className="text-blue-400 hover:underline font-semibold">
              support@parcelreach.ai
            </a>
          </p>
        </div>
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
