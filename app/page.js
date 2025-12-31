'use client';

import Image from 'next/image';
import Link from 'next/link';

export default function LandingPage() {
  const logos = [
    'D.R. Horton', 'KB Homes', 'T. Wilson', 'Pyramid Land',
    'Land Exit Solutions', 'Go Westlands LLC', 'Gibson Communities', 'Ranch Road Development'
  ];

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* Navigation */}
      <nav className="bg-primary">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <Image
            src="/parcelreach-logo.png"
            alt="ParcelReach"
            width={180}
            height={60}
            priority
            className="h-10 w-auto brightness-0 invert"
          />
          <Link
            href="/login"
            className="text-white/90 hover:text-white font-medium transition-colors"
          >
            Sign In
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative bg-primary text-white overflow-hidden">
        <div className="relative max-w-7xl mx-auto px-6 py-24 lg:py-32">
          <div className="max-w-3xl">
            <h1 className="text-5xl lg:text-6xl xl:text-7xl font-bold leading-tight mb-6">
              Tap Into America's Most Proven Land Pipeline
            </h1>
            <p className="text-xl lg:text-2xl text-white/80 mb-10 leading-relaxed">
              Access our battle-tested PPC campaigns that have generated millions in land deals nationwide. Premium leads in premium locations, ready when you are.
            </p>
            <Link
              href="/signup"
              className="inline-block px-8 py-4 bg-white hover:bg-gray-100 text-primary font-bold text-lg rounded transition-all transform hover:scale-105"
            >
              Start My 7-Day Free Trial
            </Link>
          </div>
        </div>
      </section>

      {/* Logo Bar */}
      <section className="bg-gray-50 border-y border-gray-200 py-16 overflow-hidden">
        <p className="text-center text-gray-500 text-sm uppercase tracking-widest mb-12 font-medium">
          Trusted by industry leaders
        </p>
        <div className="relative">
          <div className="flex animate-scroll items-center">
            {[...logos, ...logos].map((logo, i) => (
              <div
                key={i}
                className="flex-shrink-0 mx-12 lg:mx-20 px-10 py-6 bg-white rounded-xl shadow-sm border border-gray-100"
              >
                <span className="text-gray-800 font-bold text-3xl lg:text-4xl whitespace-nowrap">
                  {logo}
                </span>
              </div>
            ))}
          </div>
        </div>
        <style jsx>{`
          @keyframes scroll {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          .animate-scroll {
            animation: scroll 35s linear infinite;
          }
        `}</style>
      </section>

      {/* Stats Section */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 text-center mb-16">
            Premium Pipeline Performance
          </h2>

          <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
            {/* Stat 1 */}
            <div className="text-center p-8 rounded-xl bg-gray-50">
              <div className="w-16 h-16 mx-auto mb-6 bg-primary/10 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">Highly Vetted Leads</h3>
              <p className="text-gray-600 leading-relaxed">
                Premium properties in premium locations with motivated sellers ready to transact.
              </p>
            </div>

            {/* Stat 2 */}
            <div className="text-center p-8 rounded-xl bg-gray-50">
              <div className="w-16 h-16 mx-auto mb-6 bg-primary/10 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">1 in 10 Close Rate</h3>
              <p className="text-gray-600 leading-relaxed">
                Consistent results from our proven system.
              </p>
            </div>

            {/* Stat 3 */}
            <div className="text-center p-8 rounded-xl bg-gray-50">
              <div className="w-16 h-16 mx-auto mb-6 bg-primary/10 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">8-10x ROI on Ad Spend</h3>
              <p className="text-gray-600 leading-relaxed">
                Years of optimization working for you from day one.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Dashboard Preview Section */}
      <section className="py-20 lg:py-28 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
                Your Dashboard, Your Deals
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed mb-6">
                Log into your dashboard and see exactly what's available. Fresh leads with timestamps, location details, acreage specs, and all the intel you need to move fast on the right opportunities.
              </p>
              <p className="text-lg text-gray-600 leading-relaxed">
                Buy leads when you want them. No monthly commitments, no wasted budget on leads that don't fit your criteria.
              </p>
            </div>
            <div className="relative">
              <div className="bg-white rounded-lg shadow-2xl overflow-hidden border border-gray-200">
                {/* Mock Dashboard */}
                <div className="bg-primary p-4">
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
                    <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100">
                      <div>
                        <p className="font-semibold text-gray-900">{lead.location}</p>
                        <p className="text-sm text-gray-500">{lead.acres} - {lead.type}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-400">{lead.time}</p>
                        <span className="inline-block mt-1 px-2 py-1 bg-primary/10 text-primary text-xs rounded font-medium">New</span>
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
      <section className="py-20 lg:py-28 bg-primary">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-4xl lg:text-5xl font-bold text-white mb-6">
            Ready to Access Premium Land Leads?
          </h2>
          <p className="text-xl text-white/80 mb-10">
            Start your 7-day free trial and see the quality difference.
          </p>
          <Link
            href="/signup"
            className="inline-block px-10 py-5 bg-white hover:bg-gray-100 text-primary font-bold text-xl rounded-lg transition-all transform hover:scale-105"
          >
            Start My 7-Day Free Trial
          </Link>
          <p className="text-white/60 text-sm mt-6">
            No credit card required. Cancel anytime.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white/80 py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <Image
              src="/parcelreach-logo.png"
              alt="ParcelReach"
              width={150}
              height={50}
              className="h-8 w-auto brightness-0 invert"
            />
            <div className="flex flex-wrap justify-center gap-6 text-sm">
              <Link href="/privacy-policy" className="hover:text-white transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms-of-use" className="hover:text-white transition-colors">
                Terms of Use
              </Link>
              <Link href="/refund-policy" className="hover:text-white transition-colors">
                Refund Policy
              </Link>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-white/10 text-center text-sm text-white/50">
            <p>&copy; 2025 ParcelReach. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
