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
    county: '',
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
    <div className="min-h-screen flex">
      {/* Left Side - Image with Overlay */}
      <div className="hidden lg:flex lg:w-1/2 relative">
        <Image
          src="/garage-hero.png"
          alt="Garage Door"
          fill
          className="object-cover"
          priority
        />
        {/* Navy Blue Overlay */}
        <div className="absolute inset-0 bg-blue-900/60"></div>
      </div>

      {/* Right Side - Payment Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white">
        <div className="max-w-md w-full p-6 rounded-xl border-4 border-transparent bg-gradient-to-r from-blue-600 to-green-600 bg-clip-border" style={{background: 'linear-gradient(white, white) padding-box, linear-gradient(to right, #2563eb, #16a34a) border-box'}}>
          {/* Header with Logo */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base font-medium text-gray-600">Welcome to</span>
              <Image src="/logo.png" alt="GarageLeadly" width={180} height={45} className="h-10 w-auto" />
            </div>
            <p className="text-gray-600 text-sm">Complete your membership to start receiving leads</p>
          </div>

          {/* Pricing */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-700 font-medium">Annual membership</span>
              <span className="text-sm text-gray-500">1x</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">$1,200</div>
            <div className="text-sm text-gray-500 mt-1">Billed annually</div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
              <input
                type="text"
                name="company_name"
                required
                value={formData.company_name}
                onChange={handleInputChange}
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                placeholder="ABC Garage Doors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input
                type="text"
                name="name"
                required
                value={formData.name}
                onChange={handleInputChange}
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                placeholder="John Smith"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                name="email"
                required
                value={formData.email}
                onChange={handleInputChange}
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="tel"
                name="phone"
                required
                value={formData.phone}
                onChange={handleInputChange}
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                placeholder="(832) 555-1234"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Service Area</label>
              <select
                name="county"
                required
                value={formData.county}
                onChange={handleInputChange}
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              >
                <option value="">Select county</option>
                <option value="Harris">Harris County</option>
                <option value="Fort Bend">Fort Bend County</option>
                <option value="Montgomery">Montgomery County</option>
                <option value="Galveston">Galveston County</option>
                <option value="Brazoria">Brazoria County</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Leads per day: <span className="text-blue-600 font-bold">{formData.leads_per_day}</span></label>
              <input
                type="range"
                name="leads_per_day"
                required
                min="1"
                max="10"
                step="1"
                value={formData.leads_per_day}
                onChange={handleInputChange}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>1</span>
                <span>5</span>
                <span>10</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-green-600 text-white py-3 px-6 rounded font-semibold hover:shadow-xl transition disabled:opacity-50 mt-4"
            >
              {loading ? 'Processing...' : 'Continue to Payment'}
            </button>

            <div className="flex items-center justify-center gap-2 text-sm text-gray-500 mt-3">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              Secure checkout powered by Stripe
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-gray-600">Loading...</div></div>}>
      <OnboardingContent />
    </Suspense>
  );
}
