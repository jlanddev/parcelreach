'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Image from 'next/image';

function SignupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [inviteToken, setInviteToken] = useState(null);
  const [invitation, setInvitation] = useState(null);

  const [formData, setFormData] = useState({
    organizationName: '',
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  // Check for invite token on mount
  useEffect(() => {
    const token = searchParams.get('inviteToken');
    if (token) {
      setInviteToken(token);
      loadInvitation(token);
    }
  }, [searchParams]);

  async function loadInvitation(token) {
    try {
      const { data: invite, error } = await supabase
        .from('team_invitations')
        .select('*, teams(name)')
        .eq('token', token)
        .single();

      if (!error && invite && !invite.accepted && new Date(invite.expires_at) > new Date()) {
        setInvitation(invite);
        // Pre-fill email if invited
        setFormData(prev => ({ ...prev, email: invite.email }));
      }
    } catch (err) {
      console.error('Error loading invitation:', err);
    }
  }

  // Calculate password strength
  useEffect(() => {
    const pass = formData.password;
    let strength = 0;

    if (pass.length >= 8) strength += 25;
    if (pass.length >= 12) strength += 15;
    if (/[a-z]/.test(pass) && /[A-Z]/.test(pass)) strength += 20;
    if (/\d/.test(pass)) strength += 20;
    if (/[^a-zA-Z0-9]/.test(pass)) strength += 20;

    setPasswordStrength(Math.min(strength, 100));
  }, [formData.password]);

  const getStrengthColor = () => {
    if (passwordStrength < 40) return 'bg-red-500';
    if (passwordStrength < 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getStrengthText = () => {
    if (passwordStrength < 40) return 'Weak';
    if (passwordStrength < 70) return 'Good';
    return 'Strong';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Validation
      if (formData.password !== formData.confirmPassword) {
        throw new Error('Passwords do not match');
      }

      if (formData.password.length < 8) {
        throw new Error('Password must be at least 8 characters');
      }

      if (passwordStrength < 40) {
        throw new Error('Please use a stronger password');
      }

      // If user was invited to a team, use old flow (no payment needed)
      if (inviteToken && invitation) {
        const fullName = `${formData.firstName.trim()} ${formData.lastName.trim()}`;

        // Create Supabase auth user
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: {
              full_name: fullName,
              first_name: formData.firstName,
              last_name: formData.lastName
            }
          }
        });

        if (authError) throw authError;

        // Create user profile
        await supabase.from('users').upsert([{
          id: authData.user.id,
          email: formData.email,
          full_name: fullName,
          first_name: formData.firstName,
          last_name: formData.lastName,
          created_at: new Date().toISOString()
        }], { onConflict: 'id' });

        // Accept the invitation
        const inviteResponse = await fetch('/api/team/accept-invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: inviteToken })
        });

        if (!inviteResponse.ok) {
          const inviteResult = await inviteResponse.json();
          throw new Error(inviteResult.error || 'Failed to accept team invitation');
        }

        router.push('/dashboard?welcome=team');
      } else {
        // Track Lead event - user submitted signup form
        const eventId = `lead_${Date.now()}`;
        fetch('/api/fb-conversion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventName: 'Lead',
            email: formData.email,
            firstName: formData.firstName,
            lastName: formData.lastName,
            contentName: 'ParcelReach Signup',
            eventId
          })
        }).catch(console.error);

        // New signups go to Stripe checkout
        const response = await fetch('/api/create-subscription-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.email,
            firstName: formData.firstName,
            lastName: formData.lastName,
            organizationName: formData.organizationName,
            password: formData.password
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to create checkout session');
        }

        // Store form data in sessionStorage for after Stripe redirect
        sessionStorage.setItem('signupData', JSON.stringify({
          email: formData.email,
          firstName: formData.firstName,
          lastName: formData.lastName,
          organizationName: formData.organizationName,
          password: formData.password
        }));

        // Track AddPaymentInfo - user going to Stripe checkout
        fetch('/api/fb-conversion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventName: 'AddPaymentInfo',
            email: formData.email,
            firstName: formData.firstName,
            lastName: formData.lastName,
            value: 97,
            currency: 'USD',
            contentName: 'ParcelReach Checkout',
            eventId: `api_${Date.now()}`
          })
        }).catch(console.error);

        // Redirect to Stripe
        window.location.href = data.url;
      }

    } catch (err) {
      console.error('Signup error:', err);
      setError(err.message || 'An error occurred during signup');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes topoFloat {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-15px); }
          }
        `
      }} />

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
        {/* Animated Topographic Lines Background */}
        <div className="absolute inset-x-0 bottom-0 pointer-events-none" style={{ height: '50%' }}>
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: 'url(/topo-lines.png)',
              backgroundSize: 'cover',
              backgroundPosition: 'bottom center',
              backgroundRepeat: 'no-repeat',
              opacity: 0.15,
              animation: 'topoFloat 20s ease-in-out infinite',
              maskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0) 100%)',
              WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0) 100%)'
            }}
          />
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-8 w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-6">
          <Image
            src="/parcelreach-logo.png"
            alt="ParcelReach"
            width={400}
            height={130}
            className="mx-auto"
          />
        </div>

        {/* Team Invitation Message */}
        {invitation && (
          <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
            <p className="text-green-400 text-sm">
              You've been invited to join <strong>{invitation.teams?.name || 'a team'}</strong>
            </p>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Organization Name - Only show if NOT joining via invitation */}
          {!invitation && (
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">Organization Name</label>
              <input
                type="text"
                required={!invitation}
                value={formData.organizationName}
                onChange={(e) => setFormData(prev => ({ ...prev, organizationName: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white"
              />
            </div>
          )}

          {/* First Name */}
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">First Name</label>
            <input
              type="text"
              required
              value={formData.firstName}
              onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white"
              placeholder="John"
            />
          </div>

          {/* Last Name */}
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">Last Name</label>
            <input
              type="text"
              required
              value={formData.lastName}
              onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white"
              placeholder="Doe"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">Email</label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              disabled={!!invitation}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white disabled:opacity-60 disabled:cursor-not-allowed"
              placeholder="you@example.com"
            />
            {invitation && (
              <p className="text-xs text-slate-400 mt-1">This email was invited to the team</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">Password</label>
            <input
              type="password"
              required
              value={formData.password}
              onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white"
            />

            {/* Password Strength Indicator */}
            {formData.password && (
              <div className="mt-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-400">Password Strength</span>
                  <span className={`text-xs font-medium ${
                    passwordStrength < 40 ? 'text-red-400' :
                    passwordStrength < 70 ? 'text-yellow-400' :
                    'text-green-400'
                  }`}>
                    {getStrengthText()}
                  </span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${getStrengthColor()}`}
                    style={{ width: `${passwordStrength}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Use 8+ characters with uppercase, lowercase, numbers & symbols
                </p>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">Confirm Password</label>
            <input
              type="password"
              required
              value={formData.confirmPassword}
              onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || passwordStrength < 40}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white py-3 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-slate-400">
            Already have an account?{' '}
            <a href="/login" className="text-blue-400 hover:text-blue-300 font-medium">
              Sign In
            </a>
          </p>
        </div>
      </div>
    </div>
    </>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    }>
      <SignupContent />
    </Suspense>
  );
}
