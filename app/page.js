'use client';

import Link from 'next/link';
import { useState } from 'react';
import Image from 'next/image';

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white relative overflow-hidden">
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

        {/* Navigation */}
        <nav className="fixed top-0 w-full bg-slate-900/80 backdrop-blur-md border-b border-slate-700/50 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/">
              <Image
                src="/parcelreach-logo.png"
                alt="ParcelReach"
                width={320}
                height={107}
              />
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-6">
              <a href="#features" className="text-slate-300 hover:text-white transition-colors">Features</a>
              <a href="#how-it-works" className="text-slate-300 hover:text-white transition-colors">How It Works</a>
              <Link href="/login" className="text-slate-300 hover:text-white transition-colors">
                Login
              </Link>
              <a
                href="#demo"
                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-semibold transition-colors"
              >
                Book Demo
              </a>
            </div>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-slate-800"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-700/50 bg-slate-900">
            <div className="px-4 py-4 space-y-3">
              <a href="#features" className="block text-slate-300 hover:text-white">Features</a>
              <a href="#how-it-works" className="block text-slate-300 hover:text-white">How It Works</a>
              <Link href="/login" className="block text-slate-300 hover:text-white">Login</Link>
              <a
                href="#demo"
                className="block text-center px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-semibold"
              >
                Book Demo
              </a>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
              Land Opportunities{' '}
              <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
                Delivered Daily
              </span>
            </h1>
            <h2 className="text-3xl sm:text-4xl font-bold mb-6 text-slate-300">
              AI Intelligence Optimizing Daily
            </h2>
            <p className="text-xl sm:text-2xl text-slate-400 mb-10 leading-relaxed">
              Tap into a Land PPC pipeline that constantly provides a 10x Return on Ads Spend
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="#demo"
                className="px-8 py-4 bg-blue-600 hover:bg-blue-500 rounded-lg font-semibold text-lg transition-all transform hover:scale-105"
              >
                Book Your Demo
              </a>
              <Link
                href="/signup"
                className="px-8 py-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg font-semibold text-lg transition-all"
              >
                Get Started
              </Link>
            </div>
          </div>

          {/* Hero Visual */}
          <div className="mt-16 relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 blur-3xl"></div>
            <div className="relative bg-slate-900/50 border border-slate-700/50 rounded-2xl p-8 backdrop-blur-sm">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-4xl font-bold text-blue-400">93%</div>
                  <div className="text-slate-400 mt-2">Contact Rate</div>
                </div>
                <div>
                  <div className="text-4xl font-bold text-blue-400">10x</div>
                  <div className="text-slate-400 mt-2">ROAS</div>
                </div>
                <div>
                  <div className="text-4xl font-bold text-blue-400">AI</div>
                  <div className="text-slate-400 mt-2">Parcel Mapping</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-900/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-bold mb-4">Why ParcelReach?</h2>
            <p className="text-xl text-slate-400">The cleanest land pipeline in the industry</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Feature 1 */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-8 hover:border-blue-500/50 transition-all">
              <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold mb-4">Instant Lead Notification</h3>
              <p className="text-slate-400 leading-relaxed">
                We differ with proprietary AI mapping technology - when a land seller is filling out forms they are also syncing with their exact land parcel. Cleaning up the contact rate on leads to nearly 93 percent.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-8 hover:border-blue-500/50 transition-all">
              <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold mb-4">Contact Info Verification</h3>
              <p className="text-slate-400 leading-relaxed">
                All of our leads go through rigorous info verification process so nothing hits your pipeline that isn't wanting to be contacted and nothing that can't be contacted. We aim to have the cleanest land pipeline in the industry.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-bold mb-4">How It Works</h2>
            <p className="text-xl text-slate-400">Start getting qualified land leads in 3 simple steps</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-bold text-blue-400">
                1
              </div>
              <h3 className="text-xl font-bold mb-3">Choose Your Markets</h3>
              <p className="text-slate-400">
                Select the states and counties you're actively buying in
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-bold text-blue-400">
                2
              </div>
              <h3 className="text-xl font-bold mb-3">Set Your Criteria</h3>
              <p className="text-slate-400">
                Acreage range, property type, daily lead limit - you're in control
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-bold text-blue-400">
                3
              </div>
              <h3 className="text-xl font-bold mb-3">Close Deals Faster</h3>
              <p className="text-slate-400">
                Get qualified leads instantly with all the data you need
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section id="demo" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl sm:text-5xl font-bold mb-6">
            See ParcelReach In Action
          </h2>
          <p className="text-xl text-slate-400 mb-10">
            Book a 15-minute demo to see how we're delivering the cleanest, highest-converting land seller leads in the industry.
          </p>

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-8 mb-8">
            <h3 className="text-2xl font-bold mb-6">During your demo, we'll show you:</h3>
            <ul className="space-y-4 text-left max-w-2xl mx-auto mb-8">
              <li className="flex items-start gap-3">
                <svg className="w-6 h-6 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                <span className="text-lg">Live lead examples from your markets</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-6 h-6 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
                <span className="text-lg">How our AI parcel mapping works</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-6 h-6 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <span className="text-lg">Real ROAS data from current users</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-6 h-6 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-lg">Your custom pricing</span>
              </li>
            </ul>
          </div>

          <a
            href="#"
            className="inline-block px-10 py-4 bg-blue-600 hover:bg-blue-500 rounded-lg font-semibold text-lg transition-all transform hover:scale-105"
          >
            Schedule Demo Now
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <Image
              src="/parcelreach-logo.png"
              alt="ParcelReach"
              width={260}
              height={87}
            />
            <div className="flex gap-8 text-sm text-slate-400">
              <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
              <Link href="/login" className="hover:text-white transition-colors">Login</Link>
            </div>
            <div className="text-sm text-slate-500">
              © 2025 ParcelReach. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
    </>
  );
}
