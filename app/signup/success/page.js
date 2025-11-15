'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function SuccessPage() {
  const [sessionId, setSessionId] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSessionId(params.get('session_id'));
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center px-4">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-2xl p-8 md:p-12 text-center">
        {/* Success Icon */}
        <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        {/* Header */}
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
          Welcome to GarageLeadly!
        </h1>
        <p className="text-xl text-gray-700 mb-8">
          Your payment was successful. You're now activated and ready to receive leads!
        </p>

        {/* What's Next */}
        <div className="bg-blue-50 border-2 border-blue-500 rounded-xl p-6 mb-8 text-left">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">What happens next:</h2>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold">1</div>
              <div>
                <div className="font-semibold text-gray-900">Check your email</div>
                <div className="text-gray-600">We've sent your login credentials and dashboard access</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold">2</div>
              <div>
                <div className="font-semibold text-gray-900">Login to your dashboard</div>
                <div className="text-gray-600">Set your daily lead cap and preferences</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold">3</div>
              <div>
                <div className="font-semibold text-gray-900">Start receiving leads!</div>
                <div className="text-gray-600">You'll get instant SMS notifications when new leads come in</div>
              </div>
            </div>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/login"
            className="bg-blue-600 text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-blue-700 transition shadow-lg"
          >
            Login to Dashboard
          </Link>
          <Link
            href="/"
            className="bg-gray-100 text-gray-700 px-8 py-4 rounded-lg font-bold text-lg hover:bg-gray-200 transition"
          >
            Back to Home
          </Link>
        </div>

        {/* Support */}
        <div className="mt-8 pt-8 border-t border-gray-200">
          <p className="text-gray-600">
            Questions? Email us at{' '}
            <a href="mailto:support@garageleadly.com" className="text-blue-600 hover:underline font-semibold">
              support@garageleadly.com
            </a>
          </p>
        </div>

        {sessionId && (
          <div className="mt-4 text-xs text-gray-400">
            Session ID: {sessionId}
          </div>
        )}
      </div>
    </div>
  );
}
