'use client';

import Link from 'next/link';
import Image from 'next/image';

export default function ComingSoonPage() {
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

      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white relative overflow-hidden flex items-center justify-center">
        {/* Animated Topographic Lines Background */}
        <div className="absolute inset-x-0 bottom-0 pointer-events-none" style={{ height: '40%' }}>
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: 'url(/topo-lines.png)',
              backgroundSize: 'cover',
              backgroundPosition: 'bottom center',
              backgroundRepeat: 'no-repeat',
              opacity: 0.12,
              animation: 'topoFloat 20s ease-in-out infinite',
              maskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0) 100%)',
              WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0) 100%)'
            }}
          />
        </div>

        {/* Content */}
        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          {/* Logo */}
          <div className="mb-8 sm:mb-12 flex justify-center">
            <Image
              src="/parcelreach-logo.png"
              alt="ParcelReach AI"
              width={480}
              height={160}
              priority
              className="w-auto h-auto max-w-[300px] sm:max-w-[400px] lg:max-w-[480px]"
            />
          </div>

          {/* Coming Soon Message */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold mb-4 sm:mb-6">
            Coming Soon
          </h1>
          <p className="text-lg sm:text-2xl text-slate-400 mb-12 sm:mb-16 px-4">
            AI-powered land development intelligence
          </p>

          {/* Quick Links */}
          <div className="bg-slate-900/50 border border-slate-700/50 rounded-2xl p-5 sm:p-8 backdrop-blur-sm">
            <h2 className="text-lg sm:text-xl font-semibold mb-6 text-slate-300">Quick Access</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <Link
                href="/login"
                className="px-6 py-3 sm:py-4 bg-blue-600 hover:bg-blue-500 rounded-lg font-semibold transition-all transform hover:scale-105 text-base sm:text-lg"
              >
                Login
              </Link>
              <Link
                href="/dashboard"
                className="px-6 py-3 sm:py-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg font-semibold transition-all text-base sm:text-lg"
              >
                Dashboard
              </Link>
              <Link
                href="/signup"
                className="px-6 py-3 sm:py-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg font-semibold transition-all text-base sm:text-lg"
              >
                Sign Up
              </Link>
              <Link
                href="/admin"
                className="px-6 py-3 sm:py-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg font-semibold transition-all text-base sm:text-lg"
              >
                Admin
              </Link>
            </div>

            {/* Additional Links */}
            <div className="mt-8 pt-6 border-t border-slate-700/50">
              <div className="flex flex-wrap justify-center gap-4 text-sm">
                <Link href="/admin/land" className="text-slate-400 hover:text-white transition-colors">
                  Admin - Add Land
                </Link>
                <Link href="/onboarding" className="text-slate-400 hover:text-white transition-colors">
                  Onboarding
                </Link>
                <Link href="/signup/monthly" className="text-slate-400 hover:text-white transition-colors">
                  Monthly Signup
                </Link>
              </div>
            </div>
          </div>

          {/* Footer Note */}
          <p className="mt-12 text-slate-500 text-sm">
            © 2025 ParcelReach AI. All rights reserved.
          </p>
        </div>
      </div>
    </>
  );
}
