'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sessionData, setSessionData] = useState(null);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);
  const [formData, setFormData] = useState({
    organizationName: '',
    password: '',
    confirmPassword: ''
  });

  useEffect(() => {
    if (sessionId) {
      fetchSessionData();
    } else {
      setLoading(false);
    }
  }, [sessionId]);

  async function fetchSessionData() {
    try {
      const response = await fetch(`/api/verify-checkout-session?session_id=${sessionId}`);
      const data = await response.json();

      if (response.ok && data.session) {
        setSessionData(data.session);
      } else {
        setError('Unable to verify payment session');
      }
    } catch (err) {
      console.error('Error fetching session:', err);
      setError('Unable to verify payment session');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateAccount(e) {
    e.preventDefault();
    setCreatingAccount(true);
    setError('');

    try {
      if (formData.password !== formData.confirmPassword) {
        throw new Error('Passwords do not match');
      }

      if (formData.password.length < 8) {
        throw new Error('Password must be at least 8 characters');
      }

      const email = sessionData?.customer_email || sessionData?.metadata?.email;
      const firstName = sessionData?.metadata?.first_name || '';
      const lastName = sessionData?.metadata?.last_name || '';
      const fullName = `${firstName} ${lastName}`.trim();

      // Create Supabase auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: {
            full_name: fullName,
            first_name: firstName,
            last_name: lastName,
            organization_name: formData.organizationName,
            stripe_customer_id: sessionData?.customer,
            stripe_subscription_id: sessionData?.subscription
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
          stripe_customer_id: sessionData?.customer,
          created_at: new Date().toISOString()
        }], {
          onConflict: 'id'
        });

      if (userError) throw userError;

      // Create team/organization
      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .insert([{
          name: formData.organizationName,
          subscription_type: 'monthly',
          stripe_customer_id: sessionData?.customer,
          stripe_subscription_id: sessionData?.subscription,
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

      setAccountCreated(true);

    } catch (err) {
      console.error('Account creation error:', err);
      setError(err.message || 'Failed to create account');
    } finally {
      setCreatingAccount(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-forest mx-auto mb-4"></div>
          <p className="text-charcoal/60">Verifying your payment...</p>
        </div>
      </div>
    );
  }

  if (accountCreated) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-4">
        <div className="max-w-2xl w-full bg-white rounded-2xl shadow-2xl p-8 md:p-12 text-center">
          <div className="w-24 h-24 bg-forest rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="font-serif text-4xl md:text-5xl font-bold text-charcoal mb-4">
            Welcome to ParcelReach!
          </h1>
          <p className="text-xl text-charcoal/70 mb-8">
            Your account is ready. Check your email to confirm, then log in to access premium land leads.
          </p>

          <div className="bg-cream rounded-xl p-6 mb-8 text-left border border-earth/10">
            <h2 className="font-serif text-2xl font-bold text-charcoal mb-4">Your 7-Day Free Trial:</h2>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-forest text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold">1</div>
                <div>
                  <div className="font-semibold text-charcoal">Check your email</div>
                  <div className="text-charcoal/60">Confirm your email address to activate your account</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-forest text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold">2</div>
                <div>
                  <div className="font-semibold text-charcoal">Login to your dashboard</div>
                  <div className="text-charcoal/60">Browse available land leads in your area</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-gold text-charcoal rounded-full flex items-center justify-center flex-shrink-0 font-bold">3</div>
                <div>
                  <div className="font-semibold text-charcoal">Start closing deals!</div>
                  <div className="text-charcoal/60">Purchase leads and connect with motivated sellers</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/login"
              className="bg-gold text-charcoal px-8 py-4 rounded-lg font-bold text-lg hover:bg-gold/90 transition shadow-lg"
            >
              Login to Dashboard
            </Link>
            <Link
              href="/"
              className="bg-cream text-charcoal px-8 py-4 rounded-lg font-bold text-lg hover:bg-cream/80 transition border border-earth/20"
            >
              Back to Home
            </Link>
          </div>

          <div className="mt-8 pt-8 border-t border-earth/10">
            <p className="text-charcoal/60">
              Questions? Email us at{' '}
              <a href="mailto:support@parcelreach.ai" className="text-forest hover:underline font-semibold">
                support@parcelreach.ai
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4">
      <div className="max-w-xl w-full bg-white rounded-2xl shadow-2xl p-8 md:p-12">
        <div className="text-center mb-8">
          <Image
            src="/parcelreach-logo.png"
            alt="ParcelReach"
            width={200}
            height={65}
            className="mx-auto mb-6"
          />
          <div className="w-16 h-16 bg-forest rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="font-serif text-3xl font-bold text-charcoal mb-2">
            Payment Successful!
          </h1>
          <p className="text-charcoal/70">
            Complete your account setup to get started.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleCreateAccount} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-charcoal mb-2">Organization Name</label>
            <input
              type="text"
              required
              value={formData.organizationName}
              onChange={(e) => setFormData(prev => ({ ...prev, organizationName: e.target.value }))}
              className="w-full px-5 py-4 border border-earth/20 rounded-lg text-charcoal focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest"
              placeholder="Your Company Name"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-charcoal mb-2">Create Password</label>
            <input
              type="password"
              required
              value={formData.password}
              onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
              className="w-full px-5 py-4 border border-earth/20 rounded-lg text-charcoal focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest"
              placeholder="Minimum 8 characters"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-charcoal mb-2">Confirm Password</label>
            <input
              type="password"
              required
              value={formData.confirmPassword}
              onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
              className="w-full px-5 py-4 border border-earth/20 rounded-lg text-charcoal focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest"
            />
          </div>

          <button
            type="submit"
            disabled={creatingAccount}
            className="w-full py-4 bg-gold hover:bg-gold/90 text-charcoal font-bold text-lg rounded-lg transition-all disabled:opacity-50"
          >
            {creatingAccount ? 'Creating Account...' : 'Complete Setup'}
          </button>
        </form>

        <p className="text-center text-charcoal/50 text-sm mt-6">
          Your 7-day free trial starts now. $97/month after trial period.
        </p>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-forest mx-auto mb-4"></div>
          <p className="text-charcoal/60">Loading...</p>
        </div>
      </div>
    }>
      <SuccessContent />
    </Suspense>
  );
}
