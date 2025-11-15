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
    password: '',
    confirmPassword: '',
  });

  const getPasswordStrength = (password) => {
    if (!password) return { strength: 0, label: '', color: '' };
    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;

    if (strength <= 2) return { strength, label: 'Weak', color: 'bg-red-500' };
    if (strength <= 3) return { strength, label: 'Fair', color: 'bg-yellow-500' };
    if (strength <= 4) return { strength, label: 'Good', color: 'bg-blue-500' };
    return { strength, label: 'Strong', color: 'bg-green-500' };
  };

  const validateEmail = async (email) => {
    // Basic format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return false;

    // Check for disposable/invalid email domains
    const disposableDomains = ['tempmail', 'throwaway', 'guerrillamail', 'mailinator', '10minutemail'];
    const domain = email.split('@')[1]?.toLowerCase();
    if (disposableDomains.some(d => domain?.includes(d))) return false;

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    // Validate email
    const isValidEmail = await validateEmail(formData.email);
    if (!isValidEmail) {
      alert('Please enter a valid email address');
      setLoading(false);
      return;
    }

    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      alert('Passwords do not match');
      setLoading(false);
      return;
    }

    // Validate password strength
    const passwordStrength = getPasswordStrength(formData.password);
    if (passwordStrength.strength < 3) {
      alert('Password is too weak. Use at least 8 characters with uppercase, lowercase, and numbers.');
      setLoading(false);
      return;
    }

    // Create the Stripe checkout session (card on file, no charge)
    const response = await fetch('/api/create-free-checkout', {
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

      {/* Right Side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white">
        <div className="max-w-md w-full p-6 rounded-xl border-4 border-transparent bg-gradient-to-r from-blue-600 to-green-600 bg-clip-border" style={{background: 'linear-gradient(white, white) padding-box, linear-gradient(to right, #2563eb, #16a34a) border-box'}}>
          {/* Header with Logo */}
          <div className="mb-6 text-center">
            <Image src="/logo.png" alt="GarageLeadly" width={240} height={60} className="h-16 w-auto mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Complete Your Setup</h1>
            <p className="text-gray-600">Start receiving quality leads today</p>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                name="password"
                required
                value={formData.password}
                onChange={handleInputChange}
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                placeholder="Create a strong password"
                minLength="8"
              />
              {formData.password && (
                <div className="mt-2">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div className={`h-2 rounded-full transition-all ${getPasswordStrength(formData.password).color}`} style={{width: `${(getPasswordStrength(formData.password).strength / 5) * 100}%`}}></div>
                    </div>
                    <span className={`text-xs font-medium ${getPasswordStrength(formData.password).strength <= 2 ? 'text-red-600' : getPasswordStrength(formData.password).strength <= 3 ? 'text-yellow-600' : getPasswordStrength(formData.password).strength <= 4 ? 'text-blue-600' : 'text-green-600'}`}>
                      {getPasswordStrength(formData.password).label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">Use 8+ characters with uppercase, lowercase, numbers & symbols</p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <input
                type="password"
                name="confirmPassword"
                required
                value={formData.confirmPassword}
                onChange={handleInputChange}
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                placeholder="Re-enter your password"
              />
              {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                <p className="text-xs text-red-600 mt-1">Passwords do not match</p>
              )}
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
