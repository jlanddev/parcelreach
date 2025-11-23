'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleResetRequest = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      setSent(true);
    } catch (error) {
      setError(error.message);
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

        <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-6 sm:p-8 w-full max-w-md relative z-10">
          <div className="text-center mb-6">
            <Image
              src="/parcelreach-logo.png"
              alt="ParcelReach"
              width={320}
              height={107}
              className="mx-auto w-auto h-auto max-w-[280px] sm:max-w-[320px]"
            />
          </div>

          {!sent ? (
            <>
              <h2 className="text-2xl font-bold text-white text-center mb-2">Reset Password</h2>
              <p className="text-slate-400 text-center mb-6 text-sm">
                Enter your email and we'll send you a password reset link
              </p>

              <form onSubmit={handleResetRequest} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white"
                    placeholder="you@example.com"
                  />
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white py-3 rounded-lg font-semibold hover:from-blue-700 hover:to-blue-600 transition-all disabled:opacity-50"
                >
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>

                <div className="text-center">
                  <Link href="/login" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
                    Back to Sign In
                  </Link>
                </div>
              </form>
            </>
          ) : (
            <div className="text-center">
              <div className="bg-green-500/10 border border-green-500/50 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <h2 className="text-2xl font-bold text-white mb-2">Check Your Email</h2>
              <p className="text-slate-400 mb-6">
                We've sent a password reset link to <span className="text-white font-semibold">{email}</span>
              </p>

              <p className="text-sm text-slate-500 mb-6">
                The link will expire in 1 hour. If you don't see the email, check your spam folder.
              </p>

              <Link
                href="/login"
                className="inline-block w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white py-3 rounded-lg font-semibold hover:from-blue-700 hover:to-blue-600 transition-all text-center"
              >
                Back to Sign In
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
