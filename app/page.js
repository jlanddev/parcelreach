'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

export default function LandingPage() {
  const [showLead, setShowLead] = useState(false);

  useEffect(() => {
    // Animate lead card appearing
    setTimeout(() => setShowLead(true), 500);
  }, []);

  const sampleLeads = [
    {
      name: "Michael Rodriguez",
      phone: "(832) 555-1847",
      email: "mrodriguez@gmail.com",
      address: "2847 Oak Valley Dr",
      city: "Houston",
      zip: "77084",
      county: "Harris County",
      issue: "Garage door won't close - sensor keeps beeping"
    },
    {
      name: "Sarah Thompson",
      phone: "(281) 555-2934",
      email: "sarah.t@yahoo.com",
      address: "156 Maple Ridge Ln",
      city: "Sugar Land",
      zip: "77479",
      county: "Fort Bend County",
      issue: "Spring broke this morning, door stuck halfway"
    }
  ];

  const [currentLead, setCurrentLead] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentLead((prev) => (prev + 1) % sampleLeads.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <div className="flex justify-between items-center">
          <Link href="/">
            <img src="/logo.png" alt="GarageLeadly" className="h-16 md:h-20" />
          </Link>
          <Link
            href="/login"
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Member Login
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <div className="inline-block bg-gradient-to-r from-blue-600 to-green-600 text-white px-6 py-2 rounded-full text-sm font-semibold mb-6 animate-pulse">
            Houston Launch - First 20 Contractors Only
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-black text-gray-900 mb-6 leading-tight">
            Stop Fighting For Leads.<br />
            <span className="bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent">
              Get Them Delivered.
            </span>
          </h1>
          <p className="text-lg sm:text-xl md:text-2xl lg:text-3xl text-gray-700 mb-8 max-w-4xl mx-auto font-semibold">
            100% exclusive garage door leads sent to your phone in 30 seconds.<br className="hidden sm:block"/>
            <span className="text-gray-600 font-normal">Territory-protected. No sharing. No competition.</span>
          </p>
        </div>

        {/* How It Works - Horizontal Bars */}
        <div className="max-w-6xl mx-auto mb-12 space-y-4">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-2xl p-4 sm:p-6 shadow-xl hover:shadow-2xl transition">
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
              <div className="flex-shrink-0 w-12 h-12 sm:w-16 sm:h-16 bg-white/20 rounded-xl flex items-center justify-center">
                <span className="text-3xl sm:text-4xl font-black">1</span>
              </div>
              <div className="text-center sm:text-left">
                <h3 className="text-xl sm:text-2xl font-bold mb-2">We Run The Ads, You Get The Calls</h3>
                <p className="text-blue-100 text-base sm:text-lg">
                  Set your daily lead cap in the dashboard. We handle all the advertising, landing pages, and customer screening. You just answer the phone.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-green-600 to-green-700 text-white rounded-2xl p-4 sm:p-6 shadow-xl hover:shadow-2xl transition">
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
              <div className="flex-shrink-0 w-12 h-12 sm:w-16 sm:h-16 bg-white/20 rounded-xl flex items-center justify-center">
                <span className="text-3xl sm:text-4xl font-black">2</span>
              </div>
              <div className="text-center sm:text-left">
                <h3 className="text-xl sm:text-2xl font-bold mb-2">Exclusive Leads Delivered in 30 Seconds</h3>
                <p className="text-green-100 text-base sm:text-lg">
                  Every lead is 100% exclusive to you. SMS hits your phone instantly with customer's name, number, address, and issue. Nobody else ever sees it.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-2xl p-4 sm:p-6 shadow-xl hover:shadow-2xl transition">
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
              <div className="flex-shrink-0 w-12 h-12 sm:w-16 sm:h-16 bg-white/20 rounded-xl flex items-center justify-center">
                <span className="text-3xl sm:text-4xl font-black">3</span>
              </div>
              <div className="text-center sm:text-left">
                <h3 className="text-xl sm:text-2xl font-bold mb-2">Close Jobs, Track Everything, Scale Up</h3>
                <p className="text-purple-100 text-base sm:text-lg">
                  Fix garages and make money. Track every lead, job, and dollar in your dashboard. See your ROI. Adjust your daily cap. Total control.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Live Lead Demo */}
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center mb-12">
          {/* Left: SMS Preview */}
          <div className="relative">
            <div className="absolute -top-4 -left-4 bg-green-500 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg animate-bounce">
              NEW LEAD!
            </div>
            <div className="bg-white rounded-2xl shadow-2xl p-8 border-4 border-green-500 transform transition-all duration-500 hover:scale-105">
              <div className="text-xs text-gray-500 mb-4">SMS to (832) 555-YOUR-PHONE</div>
              <div className={`transition-opacity duration-1000 ${showLead ? 'opacity-100' : 'opacity-0'}`}>
                <div className="bg-blue-600 text-white p-6 rounded-2xl rounded-bl-none shadow-lg">
                  <div className="text-sm font-semibold mb-4">🔧 NEW EXCLUSIVE LEAD</div>

                  <div className="space-y-3">
                    <div className="flex items-start">
                      <span className="font-bold mr-2">👤</span>
                      <div>
                        <div className="font-semibold">{sampleLeads[currentLead].name}</div>
                        <div className="text-blue-100">{sampleLeads[currentLead].phone}</div>
                        <div className="text-blue-100">{sampleLeads[currentLead].email}</div>
                      </div>
                    </div>

                    <div className="flex items-start">
                      <span className="font-bold mr-2">📍</span>
                      <div>
                        <div>{sampleLeads[currentLead].address}</div>
                        <div className="text-blue-100">{sampleLeads[currentLead].city}, {sampleLeads[currentLead].zip}</div>
                      </div>
                    </div>

                    <div className="flex items-start">
                      <span className="font-bold mr-2">⚠️</span>
                      <div className="italic">"{sampleLeads[currentLead].issue}"</div>
                    </div>

                    <div className="pt-3 border-t border-blue-400 text-sm">
                      <div className="text-blue-100">Call within 5 minutes for best results</div>
                      <div className="text-blue-200 mt-1">County: {sampleLeads[currentLead].county}</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-4 text-center">
                <div className="inline-flex items-center gap-2 bg-gray-100 px-4 py-2 rounded-full text-sm">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-gray-600">Delivered instantly to your phone</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Value Props */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-lg border-2 border-transparent hover:border-green-500 transition">
              <h3 className="text-xl font-bold mb-2">High-Intent, Motivated Customers</h3>
              <p className="text-gray-600">
                These aren't tire kickers. They have a broken garage door RIGHT NOW and need it fixed today.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-lg border-2 border-transparent hover:border-green-500 transition">
              <h3 className="text-xl font-bold mb-2">100% Exclusive - No Sharing</h3>
              <p className="text-gray-600">
                Every lead goes to ONE contractor only. No bidding wars. No competing with 5 other companies. Just you.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-lg border-2 border-transparent hover:border-green-500 transition">
              <h3 className="text-xl font-bold mb-2">Instant SMS Delivery</h3>
              <p className="text-gray-600">
                Lead hits your phone in seconds. Call them before anyone else can. First to respond = highest close rate.
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <div className="inline-block bg-blue-50 border-2 border-blue-600 rounded-xl px-8 py-4 mb-6 max-w-2xl">
            <p className="text-gray-700 font-semibold mb-2">
              We want the best operators in the Houston market
            </p>
            <p className="text-gray-600 text-sm">
              This call we will demo the platform and do a short interview with each other to make sure we are a fit
            </p>
          </div>
          <div>
            <Link
              href="/signup"
              className="inline-block bg-gradient-to-r from-blue-600 to-green-600 text-white px-12 py-5 rounded-xl text-xl font-bold hover:shadow-2xl transform hover:scale-105 transition"
            >
              Book Your Call
            </Link>
          </div>
          <p className="text-sm text-gray-500 mt-4">
            Exclusive leads · Instant delivery · Full control
          </p>
        </div>
      </section>

      {/* Dashboard Preview */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                Professional Dashboard + Complete CRM
              </h2>
              <p className="text-base sm:text-lg md:text-xl text-gray-600">
                Track every lead, every job, every dollar. Everything you need to run your garage door business.
              </p>
            </div>

            {/* Dashboard Screenshot Mockup */}
            <div className="bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl shadow-2xl p-6 border-4 border-gray-300">
              <div className="bg-white rounded-xl overflow-hidden shadow-lg">
                {/* Dashboard Header */}
                <div className="bg-gradient-to-r from-blue-600 to-green-600 text-white px-6 py-4 flex justify-between items-center">
                  <div className="font-bold text-lg">Your Garage Door Business Dashboard</div>
                  <div className="text-sm">Harris County, TX</div>
                </div>

                {/* Stats Cards */}
                <div className="p-4 sm:p-6 grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                  <div className="bg-blue-50 p-3 sm:p-4 rounded-lg">
                    <div className="text-xs sm:text-sm text-gray-600">Total Leads</div>
                    <div className="text-2xl sm:text-3xl font-bold text-blue-600">47</div>
                  </div>
                  <div className="bg-green-50 p-3 sm:p-4 rounded-lg">
                    <div className="text-xs sm:text-sm text-gray-600">Jobs Closed</div>
                    <div className="text-2xl sm:text-3xl font-bold text-green-600">32</div>
                  </div>
                  <div className="bg-purple-50 p-3 sm:p-4 rounded-lg">
                    <div className="text-xs sm:text-sm text-gray-600">Close Rate</div>
                    <div className="text-2xl sm:text-3xl font-bold text-purple-600">68%</div>
                  </div>
                  <div className="bg-orange-50 p-3 sm:p-4 rounded-lg">
                    <div className="text-xs sm:text-sm text-gray-600">ROI</div>
                    <div className="text-2xl sm:text-3xl font-bold text-orange-600">4.2x</div>
                  </div>
                </div>

                {/* Lead Table Preview */}
                <div className="px-6 pb-6">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="font-semibold mb-3">Recent Leads</div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center bg-white p-3 rounded">
                        <div>
                          <div className="font-medium">Michael Rodriguez</div>
                          <div className="text-sm text-gray-600">Spring replacement - $385</div>
                        </div>
                        <div className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-medium">
                          CLOSED
                        </div>
                      </div>
                      <div className="flex justify-between items-center bg-white p-3 rounded">
                        <div>
                          <div className="font-medium">Sarah Thompson</div>
                          <div className="text-sm text-gray-600">Opener repair - $245</div>
                        </div>
                        <div className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-medium">
                          SCHEDULED
                        </div>
                      </div>
                      <div className="flex justify-between items-center bg-white p-3 rounded">
                        <div>
                          <div className="font-medium">James Wilson</div>
                          <div className="text-sm text-gray-600">Door installation - $890</div>
                        </div>
                        <div className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-sm font-medium">
                          QUOTED
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Features Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
              <div className="text-center">
                <h3 className="font-bold text-base sm:text-lg mb-2">Lead CRM</h3>
                <p className="text-sm sm:text-base text-gray-600">Track every lead from first call to job completion. Update status, add notes, record job values.</p>
              </div>
              <div className="text-center">
                <h3 className="font-bold text-base sm:text-lg mb-2">ROI Analytics</h3>
                <p className="text-sm sm:text-base text-gray-600">See exactly how much you spend vs. how much you make. Know your numbers like a pro.</p>
              </div>
              <div className="text-center">
                <h3 className="font-bold text-base sm:text-lg mb-2">Budget Control</h3>
                <p className="text-sm sm:text-base text-gray-600">Set daily budgets, pause anytime, adjust on the fly. You're in complete control.</p>
              </div>
            </div>
          </div>
        </div>
      </section>


      {/* Why Join */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-center text-gray-900 mb-12">
            Why Top Contractors Choose GarageLeadly
          </h2>

          <div className="max-w-lg mx-auto bg-gradient-to-br from-blue-600 to-green-600 rounded-2xl shadow-2xl p-6 sm:p-8 text-white">
            <div className="text-center mb-8">
              <div className="text-2xl sm:text-3xl font-bold mb-4">Join Houston's Elite Garage Door Network</div>
              <div className="text-sm sm:text-base text-blue-100">We're building a network of the best operators in the market</div>
            </div>

            <div className="mb-8">
              <div className="text-xl font-bold mb-4">What You Get:</div>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <span className="text-green-400 text-xl">✓</span>
                  <span>100% Exclusive leads - no sharing, ever</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-green-400 text-xl">✓</span>
                  <span>Territory protection in your county</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-green-400 text-xl">✓</span>
                  <span>Professional dashboard + full CRM</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-green-400 text-xl">✓</span>
                  <span>Instant SMS delivery to your phone</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-green-400 text-xl">✓</span>
                  <span>Complete control - pause anytime</span>
                </li>
              </ul>
            </div>

            <Link
              href="/signup"
              className="block w-full bg-white text-blue-600 text-center px-8 py-4 rounded-xl font-bold text-lg hover:bg-gray-100 transition shadow-xl"
            >
              Book Your Call
            </Link>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-gray-900 text-white py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-6">
            Ready to Join Houston's Top Garage Door Contractors?
          </h2>
          <p className="text-base sm:text-lg md:text-xl text-gray-300 mb-4 max-w-2xl mx-auto">
            We're looking for the best operators in the Houston market.
          </p>
          <p className="text-sm sm:text-base md:text-lg text-gray-400 mb-8 max-w-2xl mx-auto">
            Book a call to see a live demo and discuss if we're a fit. Get exclusive leads delivered instantly to your phone. Track everything in your professional dashboard.
          </p>
          <Link
            href="/signup"
            className="inline-block bg-gradient-to-r from-blue-600 to-green-600 text-white px-8 sm:px-12 py-4 sm:py-5 rounded-xl text-lg sm:text-xl font-bold hover:shadow-2xl transform hover:scale-105 transition"
          >
            Book Your Call
          </Link>
          <p className="text-gray-400 mt-6 text-sm">
            Exclusive leads · Territory protection · Full control
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-800 text-gray-400 py-4">
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
