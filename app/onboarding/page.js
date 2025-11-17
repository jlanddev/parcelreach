'use client';

import Image from 'next/image';

export default function OnboardingPage() {
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

          {/* Footer Note */}
          <p className="mt-12 text-slate-500 text-sm">
            © 2025 ParcelReach AI. All rights reserved.
          </p>
        </div>
      </div>
    </>
  );
}
