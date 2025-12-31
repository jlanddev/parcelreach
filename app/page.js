'use client';

import Image from 'next/image';
import Link from 'next/link';

export default function LandingPage() {
  const logos = [
    'D.R. Horton', 'KB Homes', 'T. Wilson', 'Pyramid Land',
    'Land Exit Solutions', 'Go Westlands LLC', 'Gibson Communities', 'Ranch Road Development'
  ];

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes scrollLogos {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
        `
      }} />

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 font-sans">
        {/* Navigation */}
        <nav className="border-b border-slate-700">
          <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
            <Image
              src="/parcelreach-logo.png"
              alt="ParcelReach"
              width={500}
              height={167}
              priority
              className="h-28 w-auto"
            />
            <Link
              href="/login"
              className="text-slate-300 hover:text-white font-medium transition-colors"
            >
              Sign In
            </Link>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="relative overflow-hidden">
          {/* Topo background image - faded right side */}
          <div
            className="absolute right-0 top-0 w-2/3 h-full pointer-events-none"
            style={{
              backgroundImage: 'url(/hero-topo.png)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              opacity: 0.4,
              maskImage: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.5) 30%, rgba(0,0,0,1) 100%)',
              WebkitMaskImage: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.5) 30%, rgba(0,0,0,1) 100%)'
            }}
          />
          <div className="relative max-w-7xl mx-auto px-6 py-24 lg:py-32">
            <div className="max-w-3xl">
              <h1 className="text-5xl lg:text-6xl xl:text-7xl font-bold leading-tight mb-6 text-white">
                Tap Into America's Most Proven Land Pipeline
              </h1>
              <p className="text-xl lg:text-2xl text-slate-400 mb-10 leading-relaxed">
                Access our battle-tested PPC campaigns that have generated millions in land deals nationwide. Premium leads in premium locations, ready when you are.
              </p>
              <Link
                href="/signup"
                className="inline-block px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-bold text-lg rounded-lg transition-all transform hover:scale-105 shadow-lg"
              >
                Start My 7-Day Free Trial
              </Link>
            </div>
          </div>
        </section>

        {/* Logo Bar */}
        <section className="py-16 border-y border-slate-700 overflow-hidden">
          <p className="text-center text-slate-500 text-sm uppercase tracking-widest mb-12 font-medium">
            Trusted by industry leaders
          </p>
          <div className="relative">
            <div
              className="flex items-center"
              style={{
                animation: 'scrollLogos 60s linear infinite',
                width: 'fit-content'
              }}
            >
              {[...logos, ...logos].map((logo, i) => (
                <div
                  key={i}
                  className="flex-shrink-0 mx-6 px-8 py-4 bg-slate-800 border border-slate-700 rounded-xl"
                >
                  <span className="text-white font-bold text-xl lg:text-2xl whitespace-nowrap">
                    {logo}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-20 lg:py-28">
          <div className="max-w-7xl mx-auto px-6">
            <h2 className="text-4xl lg:text-5xl font-bold text-white text-center mb-16">
              Premium Pipeline Performance
            </h2>

            <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
              {/* Stat 1 */}
              <div className="text-center p-8 rounded-xl bg-slate-800 border border-slate-700">
                <div className="w-16 h-16 mx-auto mb-6 bg-blue-500/20 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">Highly Vetted Leads</h3>
                <p className="text-slate-400 leading-relaxed">
                  Premium properties in premium locations with motivated sellers ready to transact.
                </p>
              </div>

              {/* Stat 2 */}
              <div className="text-center p-8 rounded-xl bg-slate-800 border border-slate-700">
                <div className="w-16 h-16 mx-auto mb-6 bg-blue-500/20 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">1 in 10 Close Rate</h3>
                <p className="text-slate-400 leading-relaxed">
                  Consistent results from our proven system.
                </p>
              </div>

              {/* Stat 3 */}
              <div className="text-center p-8 rounded-xl bg-slate-800 border border-slate-700">
                <div className="w-16 h-16 mx-auto mb-6 bg-blue-500/20 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">8-10x ROI on Ad Spend</h3>
                <p className="text-slate-400 leading-relaxed">
                  Years of optimization working for you from day one.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Dashboard Preview Section */}
        <section className="py-20 lg:py-28 border-t border-slate-700">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              <div>
                <h2 className="text-4xl lg:text-5xl font-bold text-white mb-6">
                  Your Dashboard, Your Deals
                </h2>
                <p className="text-lg text-slate-400 leading-relaxed mb-6">
                  Log into your dashboard and see exactly what's available. Fresh leads with timestamps, location details, acreage specs, and all the intel you need to move fast on the right opportunities.
                </p>
                <p className="text-lg text-slate-400 leading-relaxed">
                  Buy leads when you want them. No monthly commitments, no wasted budget on leads that don't fit your criteria.
                </p>
              </div>
              <div className="relative">
                <div className="bg-slate-800 rounded-lg shadow-2xl overflow-hidden border border-slate-700">
                  {/* Mock Dashboard */}
                  <div className="bg-slate-900 p-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-400"></div>
                      <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                      <div className="w-3 h-3 rounded-full bg-green-400"></div>
                    </div>
                  </div>
                  <div className="p-6 space-y-4">
                    {/* Sample Lead Cards */}
                    {[
                      { time: '2 min ago', location: 'Travis County, TX', acres: '15.2 acres', type: 'Residential' },
                      { time: '18 min ago', location: 'Williamson County, TX', acres: '8.5 acres', type: 'Agricultural' },
                      { time: '45 min ago', location: 'Hays County, TX', acres: '22.1 acres', type: 'Commercial' },
                    ].map((lead, i) => (
                      <div key={i} className="flex items-center justify-between p-4 bg-slate-900 rounded-lg border border-slate-700">
                        <div>
                          <p className="font-semibold text-white">{lead.location}</p>
                          <p className="text-sm text-slate-500">{lead.acres} - {lead.type}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-500">{lead.time}</p>
                          <span className="inline-block mt-1 px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded font-medium">New</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 lg:py-28 border-t border-slate-700">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <h2 className="text-4xl lg:text-5xl font-bold text-white mb-6">
              Ready to Access Premium Land Leads?
            </h2>
            <p className="text-xl text-slate-400 mb-10">
              Start your 7-day free trial and see the quality difference.
            </p>
            <Link
              href="/signup"
              className="inline-block px-10 py-5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-bold text-xl rounded-lg transition-all transform hover:scale-105 shadow-lg"
            >
              Start My 7-Day Free Trial
            </Link>
            <p className="text-slate-500 text-sm mt-6">
              No credit card required. Cancel anytime.
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-slate-700 py-12">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-6">
              <Image
                src="/parcelreach-logo.png"
                alt="ParcelReach"
                width={400}
                height={133}
                className="h-20 w-auto"
              />
              <div className="flex flex-wrap justify-center gap-6 text-sm">
                <Link href="/privacy-policy" className="text-slate-400 hover:text-white transition-colors">
                  Privacy Policy
                </Link>
                <Link href="/terms-of-use" className="text-slate-400 hover:text-white transition-colors">
                  Terms of Use
                </Link>
                <Link href="/refund-policy" className="text-slate-400 hover:text-white transition-colors">
                  Refund Policy
                </Link>
              </div>
            </div>
            <div className="mt-8 pt-8 border-t border-slate-700 text-center text-sm text-slate-500">
              <p>&copy; 2025 ParcelReach. All rights reserved.</p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
