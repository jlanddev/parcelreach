'use client';

import Image from 'next/image';
import Link from 'next/link';

export default function LandingPage() {
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

      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
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

        {/* Nav */}
        <nav className="relative z-20 flex justify-between items-center px-6 py-4 max-w-7xl mx-auto">
          <Image
            src="/parcelreach-logo.png"
            alt="ParcelReach AI"
            width={200}
            height={67}
            priority
            className="w-auto h-12"
          />
          <Link
            href="/login"
            className="px-4 py-2 text-sm font-semibold text-slate-300 hover:text-white transition-colors"
          >
            Sign In
          </Link>
        </nav>

        {/* Hero Section */}
        <div className="relative z-10 px-4 pt-12 pb-20 max-w-7xl mx-auto">
          <div className="text-center max-w-4xl mx-auto mb-16">
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
              Turn Land Leads Into
              <span className="block bg-gradient-to-r from-blue-400 to-orange-400 bg-clip-text text-transparent">
                Closed Deals
              </span>
            </h1>
            <p className="text-xl sm:text-2xl text-slate-400 mb-10 max-w-2xl mx-auto">
              AI-powered lead intelligence that finds motivated land sellers and delivers them straight to your team
            </p>
            <a
              href="https://calendly.com/jordan-parcelreach"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-8 py-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-lg font-bold rounded-xl shadow-lg shadow-blue-500/30 transition-all transform hover:scale-105"
            >
              Book a Demo Call
            </a>
            <p className="mt-4 text-sm text-slate-500">Free 15-minute strategy session</p>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-20">
            {/* Feature 1 */}
            <div className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-2xl p-8 hover:border-blue-500/50 transition-all">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mb-6">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold mb-3">Smart Lead Sourcing</h3>
              <p className="text-slate-400">
                Our AI identifies motivated land sellers through multiple channels - PPC, direct outreach, and market analysis
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-2xl p-8 hover:border-orange-500/50 transition-all">
              <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center mb-6">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold mb-3">Team Dashboard</h3>
              <p className="text-slate-400">
                Manage leads, track progress, and collaborate with your team all in one beautiful 3D map interface
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-2xl p-8 hover:border-green-500/50 transition-all">
              <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center mb-6">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold mb-3">Instant Notifications</h3>
              <p className="text-slate-400">
                Get notified the moment a new qualified lead comes in. Never miss an opportunity
              </p>
            </div>
          </div>

          {/* CTA Section */}
          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur border border-slate-700/50 rounded-3xl p-12 text-center max-w-4xl mx-auto">
            <h2 className="text-4xl font-bold mb-4">Ready to Scale Your Land Business?</h2>
            <p className="text-xl text-slate-400 mb-8 max-w-2xl mx-auto">
              Book a free 15-minute demo call and see how ParcelReach can help you close more deals
            </p>
            <a
              href="https://calendly.com/jordan-parcelreach"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-10 py-5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-xl font-bold rounded-xl shadow-lg shadow-blue-500/30 transition-all transform hover:scale-105"
            >
              Schedule Your Demo
            </a>
          </div>
        </div>

        {/* Footer */}
        <footer className="relative z-10 border-t border-slate-800 py-8">
          <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center text-sm text-slate-500">
            <p>© 2025 ParcelReach AI. All rights reserved.</p>
            <div className="flex gap-6 mt-4 md:mt-0">
              <Link href="/privacy-policy" className="hover:text-slate-300 transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms-of-use" className="hover:text-slate-300 transition-colors">
                Terms of Use
              </Link>
              <Link href="/refund-policy" className="hover:text-slate-300 transition-colors">
                Refund Policy
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
