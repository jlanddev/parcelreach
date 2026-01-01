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
  const [needsPassword, setNeedsPassword] = useState(false);
  const [stripeData, setStripeData] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [creatingAccount, setCreatingAccount] = useState(false);

  useEffect(() => {
    if (sessionId) {
      checkAndCreateAccount();
    } else {
      setLoading(false);
      setError('No session ID found');
    }
  }, [sessionId]);

  // Redirect to login after successful signup
  useEffect(() => {
    if (accountCreated) {
      const timer = setTimeout(() => {
        window.location.href = '/login?welcome=true';
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [accountCreated]);

  async function checkAndCreateAccount() {
    try {
      // Get stored signup data from sessionStorage
      const signupDataStr = sessionStorage.getItem('signupData');

      if (!signupDataStr) {
        // No sessionStorage - need to get data from Stripe and ask for password
        const verifyResponse = await fetch(`/api/verify-checkout-session?session_id=${sessionId}`);
        const verifyData = await verifyResponse.json();

        if (!verifyResponse.ok) {
          throw new Error(verifyData.error || 'Failed to verify payment');
        }

        // Store Stripe session data and show password form
        setStripeData(verifyData);
        setNeedsPassword(true);
        setLoading(false);
        return;
      }

      const signupData = JSON.parse(signupDataStr);
      await createAccount(signupData);
    } catch (err) {
      console.error('Account creation error:', err);
      setError(err.message || 'Failed to create account');
      setLoading(false);
    }
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setCreatingAccount(true);

    try {
      // Build signup data from Stripe metadata
      const metadata = stripeData.session?.metadata || {};
      const signupData = {
        email: metadata.email || stripeData.session?.customer_email,
        firstName: metadata.first_name || '',
        lastName: metadata.last_name || '',
        organizationName: metadata.organization_name || 'My Organization',
        password: password
      };

      await createAccount(signupData);
    } catch (err) {
      console.error('Account creation error:', err);
      setError(err.message || 'Failed to create account');
      setCreatingAccount(false);
    }
  }

  async function createAccount(signupData) {
    try {
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

      // Send welcome email
      try {
        await fetch('/api/send-welcome-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email,
            firstName: firstName
          })
        });
      } catch (welcomeError) {
        console.error('Welcome email error:', welcomeError);
      }

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

  // Show password form if sessionStorage was lost
  if (needsPassword) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-slate-800 rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Payment Successful!</h1>
            <p className="text-slate-400">Set your password to complete signup</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white"
                placeholder="Min 8 characters"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">Confirm Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white"
              />
            </div>
            <button
              type="submit"
              disabled={creatingAccount}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white py-3 rounded-lg font-semibold hover:from-blue-700 hover:to-blue-600 transition-all disabled:opacity-50"
            >
              {creatingAccount ? 'Creating Account...' : 'Complete Signup'}
            </button>
          </form>
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
