'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect } from 'react';

export default function LandingPage() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const dashImages = ['/dash-1.png', '/dash-2.png', '/dash-3.png'];

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % dashImages.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  // Track ViewContent on page load
  useEffect(() => {
    fetch('/api/fb-conversion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventName: 'ViewContent',
        contentName: 'ParcelReach Landing Page',
        eventId: `vc_${Date.now()}`
      })
    }).catch(console.error);
  }, []);

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
          @keyframes panBackground {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          @keyframes fadeInUp {
            from {
              opacity: 0;
              transform: translateY(30px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          .animate-fade-in-up {
            animation: fadeInUp 0.8s ease-out forwards;
          }
          .animate-delay-100 { animation-delay: 0.1s; }
          .animate-delay-200 { animation-delay: 0.2s; }
          .animate-delay-300 { animation-delay: 0.3s; }
          .animate-delay-400 { animation-delay: 0.4s; }
          @keyframes float1 {
            0%, 100% { transform: translateY(0) rotate(-2deg); }
            50% { transform: translateY(-8px) rotate(-2deg); }
          }
          @keyframes float2 {
            0%, 100% { transform: translateY(0) rotate(-6deg); }
            50% { transform: translateY(-6px) rotate(-6deg); }
          }
          @keyframes float3 {
            0%, 100% { transform: translateY(0) rotate(-10deg); }
            50% { transform: translateY(-4px) rotate(-10deg); }
          }
        `
      }} />

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 font-sans">
        {/* Navigation */}
        <nav className="border-b border-slate-700">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 sm:py-4 flex justify-between items-center">
            <Image
              src="/parcelreach-logo.png"
              alt="ParcelReach"
              width={500}
              height={167}
              priority
              className="h-12 sm:h-20 lg:h-28 w-auto"
            />
            <Link
              href="/login"
              className="text-slate-300 hover:text-white font-medium transition-colors text-sm sm:text-base"
            >
              Sign In
            </Link>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="relative overflow-x-clip">
          <div className="relative max-w-7xl mx-auto px-3 sm:px-6 pt-8 sm:pt-16 lg:py-24">
            <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
              {/* Left side - Text */}
              <div className="max-w-xl">
                <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold leading-tight mb-4 sm:mb-6 text-white animate-fade-in-up">
                  Tap Into America's Most Proven Land Pipeline
                </h1>
                <p className="text-base sm:text-lg lg:text-xl text-slate-400 mb-6 sm:mb-8 leading-relaxed animate-fade-in-up animate-delay-100" style={{opacity: 0}}>
                  Access our battle-tested PPC campaigns that have generated millions in land deals nationwide. Premium leads in premium locations, ready when you are.
                </p>
                <div className="animate-fade-in-up animate-delay-200 relative z-10" style={{opacity: 0}}>
                  {/* Ambient glow behind button */}
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-32 bg-blue-500/20 blur-[60px] rounded-full pointer-events-none"></div>
                  <Link
                    href="/signup"
                    className="relative inline-block w-full sm:w-auto text-center px-6 sm:px-10 py-4 sm:py-5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-bold text-base sm:text-xl rounded-lg transition-all transform hover:scale-105 shadow-2xl shadow-blue-500/40"
                  >
                    Start My 7-Day Free Trial
                  </Link>
                </div>
              </div>

              {/* Right side - Slanted Dashboard Screenshot Slideshow (Desktop) */}
              <div className="hidden lg:block absolute -right-20 top-1/2 -translate-y-1/2 w-[55%] z-0">
                <div
                  className="relative"
                  style={{
                    transform: 'perspective(2000px) rotateY(-15deg) rotateX(2deg)',
                    transformOrigin: 'left center'
                  }}
                >
                  {/* Real dashboard screenshots */}
                  <div className="relative rounded-xl shadow-2xl overflow-hidden border-2 border-slate-500/50">
                    {dashImages.map((src, i) => (
                      <Image
                        key={src}
                        src={src}
                        alt={`ParcelReach Dashboard ${i + 1}`}
                        width={1200}
                        height={700}
                        className={`w-full h-auto transition-opacity duration-1000 ${i === currentSlide ? 'opacity-100' : 'opacity-0 absolute inset-0'}`}
                        priority={i === 0}
                      />
                    ))}
                  </div>
                  {/* Slide indicators */}
                  <div className="flex justify-center gap-2 mt-4">
                    {dashImages.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentSlide(i)}
                        className={`w-2 h-2 rounded-full transition-all ${i === currentSlide ? 'bg-blue-500 w-6' : 'bg-slate-600'}`}
                      />
                    ))}
                  </div>
                  {/* Glow effect */}
                  <div className="absolute -inset-4 bg-blue-500/10 rounded-2xl blur-2xl -z-10"></div>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Dashboard Preview - 3 tablet layout like Prophetic */}
          <div
            className="lg:hidden relative pb-16"
            style={{
              zIndex: 1,
              marginTop: '-40px',
            }}
          >
            {/* Large ambient glow */}
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[140%] h-[140%] bg-blue-500/10 blur-[100px] rounded-full pointer-events-none"
            ></div>

            {/* LEFT PEEK TABLET - 20% visible */}
            <div
              className="absolute top-8"
              style={{
                left: '-35%',
                width: '75%',
                transform: 'perspective(1000px) rotateY(-35deg) rotateX(-2deg)',
                transformOrigin: 'right center',
                zIndex: 0,
              }}
            >
              <div
                style={{
                  background: '#1a1a2e',
                  padding: '8px',
                  borderRadius: '12px',
                  boxShadow: '0 50px 100px rgba(0,0,0,0.6)',
                }}
              >
                <div className="rounded-lg overflow-hidden">
                  <Image
                    src="/dash-2.png"
                    alt="ParcelReach Dashboard"
                    width={900}
                    height={550}
                    className="w-full h-auto"
                  />
                </div>
              </div>
            </div>

            {/* RIGHT PEEK TABLET - 10-15% visible */}
            <div
              className="absolute top-8"
              style={{
                right: '-38%',
                width: '75%',
                transform: 'perspective(1000px) rotateY(35deg) rotateX(-2deg)',
                transformOrigin: 'left center',
                zIndex: 0,
              }}
            >
              <div
                style={{
                  background: '#1a1a2e',
                  padding: '8px',
                  borderRadius: '12px',
                  boxShadow: '0 50px 100px rgba(0,0,0,0.6)',
                }}
              >
                <div className="rounded-lg overflow-hidden">
                  <Image
                    src="/dash-3.png"
                    alt="ParcelReach Dashboard"
                    width={900}
                    height={550}
                    className="w-full h-auto"
                  />
                </div>
              </div>
            </div>

            {/* MAIN CENTER TABLET - left toward viewer, right away */}
            <div
              className="relative mx-auto"
              style={{
                width: '95%',
                transform: 'perspective(1000px) rotateY(12deg) rotateX(-2deg)',
                transformOrigin: 'center center',
                zIndex: 2,
              }}
            >
              <div
                style={{
                  background: '#1a1a2e',
                  padding: '10px',
                  borderRadius: '16px',
                  boxShadow: '0 50px 100px rgba(0,0,0,0.6)',
                }}
              >
                <div className="rounded-lg overflow-hidden">
                  {dashImages.map((src, i) => (
                    <Image
                      key={src}
                      src={src}
                      alt={`ParcelReach Dashboard ${i + 1}`}
                      width={900}
                      height={550}
                      className={`w-full h-auto transition-opacity duration-700 ${i === currentSlide ? 'opacity-100' : 'opacity-0 absolute inset-0'}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Logo Bar */}
        <section className="py-10 sm:py-16 border-y border-slate-700 overflow-hidden relative">
          {/* Animated plat map background */}
          <div className="absolute inset-0 overflow-hidden">
            <div
              className="absolute inset-0 opacity-35"
              style={{
                backgroundImage: 'url(/plat-map-bg.png)',
                backgroundRepeat: 'repeat-x',
                backgroundSize: 'auto 100%',
                width: '200%',
                animation: 'panBackground 60s linear infinite',
              }}
            />
            {/* Gradient fades on edges */}
            <div className="absolute inset-y-0 left-0 w-16 sm:w-32 bg-gradient-to-r from-slate-900 to-transparent z-10" />
            <div className="absolute inset-y-0 right-0 w-16 sm:w-32 bg-gradient-to-l from-slate-900 to-transparent z-10" />
          </div>

          <p className="text-center text-slate-400 text-xs sm:text-sm uppercase tracking-widest mb-6 sm:mb-12 font-medium relative z-20">
            Trusted by industry leaders
          </p>
          <div className="relative z-20">
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
                  className="flex-shrink-0 mx-3 sm:mx-6 px-4 sm:px-8 py-2 sm:py-4 bg-slate-800/60 backdrop-blur-md border border-slate-600/50 rounded-lg sm:rounded-xl shadow-lg"
                >
                  <span className="text-white font-bold text-sm sm:text-xl lg:text-2xl whitespace-nowrap">
                    {logo}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-12 sm:py-20 lg:py-28 relative overflow-hidden">
          {/* Topographic background */}
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage: 'url(/topo-bg.png)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
          {/* Gradient overlay for depth */}
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900/50 via-transparent to-slate-900/50" />

          <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
            <h2 className="text-2xl sm:text-3xl lg:text-5xl font-bold text-white text-center mb-8 sm:mb-16">
              Premium Pipeline Performance
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-8 lg:gap-12">
              {/* Stat 1 */}
              <div className="relative text-center p-5 sm:p-8 rounded-xl bg-gradient-to-b from-slate-800 to-slate-800/80 border border-slate-700 shadow-xl shadow-black/20">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent rounded-full" />
                <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 sm:mb-6 bg-blue-500/20 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 sm:w-8 sm:h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <h3 className="text-lg sm:text-2xl font-bold text-white mb-2 sm:mb-3">Highly Vetted Leads</h3>
                <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
                  Premium properties in premium locations with motivated sellers ready to transact.
                </p>
              </div>

              {/* Stat 2 */}
              <div className="relative text-center p-5 sm:p-8 rounded-xl bg-gradient-to-b from-slate-800 to-slate-800/80 border border-slate-700 shadow-xl shadow-black/20">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent rounded-full" />
                <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 sm:mb-6 bg-blue-500/20 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 sm:w-8 sm:h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                </div>
                <h3 className="text-lg sm:text-2xl font-bold text-white mb-2 sm:mb-3">1 in 10 Close Rate</h3>
                <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
                  Consistent results from our proven system.
                </p>
              </div>

              {/* Stat 3 */}
              <div className="relative text-center p-5 sm:p-8 rounded-xl bg-gradient-to-b from-slate-800 to-slate-800/80 border border-slate-700 shadow-xl shadow-black/20">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent rounded-full" />
                <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 sm:mb-6 bg-blue-500/20 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 sm:w-8 sm:h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <h3 className="text-lg sm:text-2xl font-bold text-white mb-2 sm:mb-3">8-10x ROI on Ad Spend</h3>
                <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
                  Years of optimization working for you from day one.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Dashboard Preview Section */}
        <section className="py-12 sm:py-20 lg:py-28 border-t border-slate-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center">
              {/* Left side - Mock app window */}
              <div className="order-2 lg:order-1">
                <div
                  className="rounded-xl sm:rounded-2xl overflow-hidden"
                  style={{
                    background: 'rgba(20, 28, 40, 0.9)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)',
                  }}
                >
                  {/* Window title bar */}
                  <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-3 border-b border-white/5">
                    <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full" style={{ background: '#ff5f57' }}></div>
                    <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full" style={{ background: '#febc2e' }}></div>
                    <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full" style={{ background: '#28c840' }}></div>
                    <span className="ml-2 sm:ml-3 text-xs sm:text-sm text-slate-500">Available Deals</span>
                  </div>

                  {/* Deal rows */}
                  <div className="p-3 sm:p-4">
                    {/* Row 1 */}
                    <div className="flex items-center justify-between p-3 sm:p-4 rounded-lg border-l-2" style={{ borderColor: '#c9a962', background: 'rgba(255,255,255,0.03)' }}>
                      <div className="min-w-0 flex-1">
                        <p className="text-white font-semibold text-sm sm:text-base">Hill County, Texas</p>
                        <p className="text-slate-500 text-xs sm:text-sm truncate">50 Acres - Rural Subdivision</p>
                      </div>
                      <div className="text-right ml-2 flex-shrink-0">
                        <span className="inline-block px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-medium bg-blue-500/20 text-blue-400">4 Tracts</span>
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="h-px my-2 sm:my-3" style={{ background: 'rgba(255,255,255,0.05)' }}></div>

                    {/* Row 2 */}
                    <div className="flex items-center justify-between p-3 sm:p-4 rounded-lg border-l-2" style={{ borderColor: '#c9a962', background: 'rgba(255,255,255,0.03)' }}>
                      <div className="min-w-0 flex-1">
                        <p className="text-white font-semibold text-sm sm:text-base">Davidson County, TN</p>
                        <p className="text-slate-500 text-xs sm:text-sm truncate">3.3 Acres - Residential Dev</p>
                      </div>
                      <div className="text-right ml-2 flex-shrink-0">
                        <span className="inline-block px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-medium bg-emerald-500/20 text-emerald-400">33 Homes</span>
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="h-px my-2 sm:my-3" style={{ background: 'rgba(255,255,255,0.05)' }}></div>

                    {/* Row 3 */}
                    <div className="flex items-center justify-between p-3 sm:p-4 rounded-lg border-l-2" style={{ borderColor: '#c9a962', background: 'rgba(255,255,255,0.03)' }}>
                      <div className="min-w-0 flex-1">
                        <p className="text-white font-semibold text-sm sm:text-base">Garfield County, MT</p>
                        <p className="text-slate-500 text-xs sm:text-sm truncate">28 Acres - Land Flip</p>
                      </div>
                      <div className="text-right ml-2 flex-shrink-0">
                        <span className="inline-block px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-medium bg-purple-500/20 text-purple-400">Quick Turn</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right side - Text content */}
              <div className="order-1 lg:order-2">
                <h2 className="text-2xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 sm:mb-8 leading-tight">
                  Your Dashboard, Your Deals
                </h2>
                <p className="text-sm sm:text-lg text-slate-400 leading-relaxed mb-4 sm:mb-6">
                  Log into your dashboard and see exactly what's available. Fresh leads with timestamps, location details, acreage specs, and all the intel you need to move fast.
                </p>
                <p className="text-sm sm:text-lg text-slate-400 leading-relaxed">
                  Buy leads when you want them. No monthly commitments, no wasted budget.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-12 sm:py-20 lg:py-28 border-t border-slate-700">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
            <h2 className="text-2xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 sm:mb-6">
              Ready to Access Premium Land Leads?
            </h2>
            <p className="text-base sm:text-xl text-slate-400 mb-6 sm:mb-10">
              Start your 7-day free trial and see the quality difference.
            </p>
            <Link
              href="/signup"
              className="inline-block w-full sm:w-auto px-6 sm:px-10 py-4 sm:py-5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-bold text-base sm:text-xl rounded-lg transition-all transform hover:scale-105 shadow-lg"
            >
              Start My 7-Day Free Trial
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-slate-700 py-8 sm:py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 sm:gap-6">
              <Image
                src="/parcelreach-logo.png"
                alt="ParcelReach"
                width={400}
                height={133}
                className="h-12 sm:h-16 lg:h-20 w-auto"
              />
              <div className="flex flex-wrap justify-center gap-4 sm:gap-6 text-xs sm:text-sm">
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
            <div className="mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-slate-700 text-center text-xs sm:text-sm text-slate-500">
              <p>&copy; 2025 ParcelReach. All rights reserved.</p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
