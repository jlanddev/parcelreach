'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    company_name: '',
    phone: '',
    target_state: '',
    leads_per_day: '3',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    // Create the Stripe checkout session
    const response = await fetch('/api/create-membership-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });

    const { url } = await response.json();
    window.location.href = url;
  };

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
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

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4 sm:p-8 relative overflow-hidden">
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

        <div className="max-w-md w-full bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-6 sm:p-8 relative z-10">
          {/* Header with Logo */}
          <div className="mb-6 text-center">
            <div className="flex justify-center mb-4">
              <Image
                src="/parcelreach-logo.png"
                alt="ParcelReach AI"
                width={240}
                height={80}
                className="w-auto h-auto max-w-[200px] sm:max-w-[240px]"
              />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Complete Your Membership</h1>
            <p className="text-slate-400 text-sm">Start receiving qualified land seller leads</p>
          </div>

          {/* Pricing */}
          <div className="bg-slate-900/50 rounded-lg p-4 mb-6 border border-slate-700">
            <div className="flex justify-between items-center mb-2">
              <span className="text-slate-300 font-medium">Annual Membership</span>
              <span className="text-sm text-slate-500">1x</span>
            </div>
            <div className="text-3xl font-bold text-white">$1,200</div>
            <div className="text-sm text-slate-500 mt-1">Billed annually</div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Company Name</label>
              <input
                type="text"
                name="company_name"
                required
                value={formData.company_name}
                onChange={handleInputChange}
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="ABC Land Investments"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Full Name</label>
              <input
                type="text"
                name="name"
                required
                value={formData.name}
                onChange={handleInputChange}
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="John Smith"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
              <input
                type="email"
                name="email"
                required
                value={formData.email}
                onChange={handleInputChange}
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Phone</label>
              <input
                type="tel"
                name="phone"
                required
                value={formData.phone}
                onChange={handleInputChange}
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="(555) 123-4567"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Primary Target State</label>
              <select
                name="target_state"
                required
                value={formData.target_state}
                onChange={handleInputChange}
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select your primary state</option>
                <option value="Texas">Texas</option>
                <option value="Florida">Florida</option>
                <option value="California">California</option>
                <option value="Arizona">Arizona</option>
                <option value="Colorado">Colorado</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Leads per day: <span className="text-blue-400 font-bold">{formData.leads_per_day}</span>
              </label>
              <input
                type="range"
                name="leads_per_day"
                required
                min="1"
                max="10"
                step="1"
                value={formData.leads_per_day}
                onChange={handleInputChange}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>1</span>
                <span>5</span>
                <span>10</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white py-3 px-6 rounded-lg font-semibold hover:shadow-xl transition disabled:opacity-50 mt-4"
            >
              {loading ? 'Processing...' : 'Continue to Payment'}
            </button>

            <div className="flex items-center justify-center gap-2 text-sm text-slate-400 mt-3">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              Secure checkout powered by Stripe
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-900"><div className="text-slate-400">Loading...</div></div>}>
      <OnboardingContent />
    </Suspense>
  );
}
