'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

// Contractor signup form

export default function SignupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    companyName: '',
    contactName: '',
    email: '',
    phone: '',
    county: '',
    currentLeads: '',
    smsConsent: false,
  });
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleNext = async () => {
    if (step === 2) {
      // Save to database when moving to step 3
      setSubmitting(true);
      try {
        const { error } = await supabase
          .from('contractor_signups')
          .insert([{
            company_name: formData.companyName,
            contact_name: formData.contactName,
            email: formData.email,
            phone: formData.phone,
            county: formData.county,
            current_leads: formData.currentLeads,
          }]);

        if (error) {
          console.error('Error saving signup:', error);
          alert('Error: ' + (error.message || error.details || 'Please try again'));
          setSubmitting(false);
          return;
        }

        // Save to localStorage for thank you page
        localStorage.setItem('garageleadly_latest_signup', JSON.stringify(formData));

        // Success - redirect to thank you page
        router.push('/signup/thank-you');
        return;
      } catch (err) {
        console.error('Error:', err);
        alert('Error: ' + (err.message || 'Please try again'));
        setSubmitting(false);
        return;
      }
    }
    setStep(step + 1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <img src="/logo.png" alt="GarageLeadly" className="h-16 mx-auto" />
          </Link>
          <p className="text-gray-600 mt-2 text-lg">Get Exclusive Garage Door Leads in Your Territory</p>
        </div>

        {/* Value Props */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg p-6 mb-8">
          <div className="text-center mb-4">
            <h2 className="text-2xl font-bold mb-2">Tired of Fighting for the Same Leads?</h2>
            <p className="text-blue-100">Get hot garage door repair leads sent directly to your phone</p>
          </div>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div className="bg-white/10 rounded p-3">
              <div className="font-semibold mb-1">✓ Exclusive Territory</div>
              <div className="text-blue-100">Limited contractors per county</div>
            </div>
            <div className="bg-white/10 rounded p-3">
              <div className="font-semibold mb-1">✓ Instant Notifications</div>
              <div className="text-blue-100">SMS alerts within seconds</div>
            </div>
            <div className="bg-white/10 rounded p-3">
              <div className="font-semibold mb-1">✓ Qualified Leads</div>
              <div className="text-blue-100">Real customers ready to hire</div>
            </div>
          </div>
        </div>

        {/* Signup Form */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* Progress Steps */}
          <div className="flex items-center justify-center mb-8">
            <div className="flex items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                1
              </div>
              <div className={`w-20 h-1 ${step >= 2 ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                2
              </div>
              <div className={`w-20 h-1 ${step >= 3 ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${step >= 3 ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                3
              </div>
            </div>
          </div>

          {/* Step 1: Company Info */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-2xl font-bold mb-2">Tell us about your business</h3>
                <p className="text-gray-600">We'll check if your territory is still available</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Company Name *
                </label>
                <input
                  type="text"
                  name="companyName"
                  required
                  value={formData.companyName}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
                  placeholder="Your Garage Door Co."
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Your Name *
                </label>
                <input
                  type="text"
                  name="contactName"
                  required
                  value={formData.contactName}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
                  placeholder="John Smith"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  name="phone"
                  required
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
                  placeholder="(555) 123-4567"
                />
                <p className="text-sm text-gray-500 mt-1">
                  This is where we'll send your leads
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Email *
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
                  placeholder="john@yourgaragedoor.com"
                />
              </div>

              <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    name="smsConsent"
                    required
                    checked={formData.smsConsent}
                    onChange={(e) => setFormData({ ...formData, smsConsent: e.target.checked })}
                    className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 mt-0.5 flex-shrink-0"
                  />
                  <span className="text-sm text-gray-700">
                    I consent to receive text messages (SMS) with lead notifications at the phone number provided. Message frequency varies. Message and data rates may apply. Reply STOP to opt out.
                  </span>
                </label>
              </div>

              <button
                type="button"
                onClick={handleNext}
                disabled={!formData.companyName || !formData.contactName || !formData.phone || !formData.email || !formData.smsConsent}
                className="w-full bg-blue-600 text-white py-4 rounded-lg font-bold text-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue →
              </button>
            </div>
          )}

          {/* Step 2: Territory */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-2xl font-bold mb-2">What's your service area?</h3>
                <p className="text-gray-600">We limit each county to ensure quality leads</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Select Your County *
                </label>
                <select
                  name="county"
                  required
                  value={formData.county}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
                >
                  <option value="">Choose your county...</option>
                  <option value="Harris">Harris</option>
                  <option value="Montgomery">Montgomery</option>
                  <option value="Fort Bend">Fort Bend</option>
                  <option value="Waller">Waller</option>
                  <option value="Brazoria">Brazoria</option>
                  <option value="Liberty">Liberty</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  How many leads do you get per month currently? *
                </label>
                <select
                  name="currentLeads"
                  required
                  value={formData.currentLeads}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
                >
                  <option value="">Select range...</option>
                  <option value="0-10">0-10 leads</option>
                  <option value="10-25">10-25 leads</option>
                  <option value="25-50">25-50 leads</option>
                  <option value="50-100">50-100 leads</option>
                  <option value="100+">100+ leads</option>
                </select>
              </div>

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={submitting}
                  className="flex-1 bg-gray-200 text-gray-700 py-4 rounded-lg font-bold text-lg hover:bg-gray-300 transition disabled:opacity-50"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!formData.county || !formData.currentLeads || submitting}
                  className="flex-1 bg-blue-600 text-white py-4 rounded-lg font-bold text-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Saving...' : 'Continue →'}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Success */}
          {step === 3 && (
            <div className="space-y-6 text-center py-8">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <div>
                <h3 className="text-3xl font-bold mb-3">You're All Set!</h3>
                <p className="text-xl text-gray-600 mb-6">
                  We'll reach out within 24 hours to discuss your territory
                </p>
              </div>

              <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6 max-w-md mx-auto text-left">
                <h4 className="font-bold text-lg mb-3 text-center">What Happens Next?</h4>
                <ul className="space-y-3 text-gray-700">
                  <li className="flex items-start">
                    <span className="text-blue-600 mr-3 text-xl">1.</span>
                    <span>We'll review your territory availability</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-blue-600 mr-3 text-xl">2.</span>
                    <span>We'll call you to discuss the program details</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-blue-600 mr-3 text-xl">3.</span>
                    <span>If it's a fit, we'll get you set up and sending leads!</span>
                  </li>
                </ul>
              </div>

              <div className="pt-6">
                <Link
                  href="/"
                  className="inline-block bg-blue-600 text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-blue-700 transition"
                >
                  Return to Home
                </Link>
              </div>
            </div>
          )}
        </div>

        <div className="text-center mt-6">
          <Link href="/" className="text-gray-600 hover:text-gray-800">
            ← Back to home
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-800 text-gray-400 py-4 mt-12">
        <div className="container mx-auto px-4 text-center">
          <div className="flex justify-center gap-4 mb-2 flex-wrap text-xs">
            <Link href="/privacy-policy" className="hover:text-white">Privacy Policy</Link>
            <span>·</span>
            <Link href="/terms-of-use" className="hover:text-white">Terms of Use</Link>
            <span>·</span>
            <Link href="/refund-policy" className="hover:text-white">Refund Policy</Link>
            <span>·</span>
            <a href="mailto:support@garageleadly.com" className="hover:text-white">support@garageleadly.com</a>
          </div>
          <div className="text-xs">
            © 2025 GarageLeadly. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
