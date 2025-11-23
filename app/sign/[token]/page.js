'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

export default function SignaturePage() {
  const params = useParams();
  const token = params.token;

  const [loading, setLoading] = useState(true);
  const [sigRequest, setSigRequest] = useState(null);
  const [error, setError] = useState(null);
  const [signed, setSigned] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [debugInfo, setDebugInfo] = useState([]);
  const [signatureName, setSignatureName] = useState('');
  const [signatureDate, setSignatureDate] = useState(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));
  const [showSignatureModal, setShowSignatureModal] = useState(false);

  const addDebug = (msg) => {
    setDebugInfo(prev => [...prev, `${new Date().toISOString().split('T')[1].split('.')[0]} - ${msg}`]);
  };

  useEffect(() => {
    addDebug('useEffect started');
    addDebug(`Token from URL: ${token}`);

    const loadSignatureRequest = async () => {
      try {
        if (!token) {
          throw new Error('No token provided');
        }

        const apiUrl = `/api/signature-request/${token}`;
        addDebug(`Fetching: ${apiUrl}`);

        // Fetch signature request from API route
        const response = await fetch(apiUrl);
        addDebug(`Response status: ${response.status}`);

        const result = await response.json();
        addDebug(`Response received: ${JSON.stringify(result).substring(0, 100)}...`);

        if (!response.ok) {
          throw new Error(result.error || 'Failed to load signature request');
        }

        const data = result.data;

        if (data.status === 'signed') {
          addDebug('Status is signed, showing signed confirmation');
          setSigned(true);
        }

        addDebug('Setting signature request data');
        setSigRequest(data);
      } catch (err) {
        console.error('Error loading signature request:', err);
        addDebug(`ERROR: ${err.message}`);
        setError(err.message || 'Failed to load signature request');
      } finally {
        addDebug('Setting loading to false');
        setLoading(false);
      }
    };

    loadSignatureRequest();
  }, [token]);

  const handleSubmit = async () => {
    if (!signatureName || signatureName.trim() === '') {
      alert('Please enter your signature');
      return;
    }

    setSubmitting(true);

    try {
      const signatureData = {
        name: signatureName,
        date: signatureDate
      };

      // Submit signature via API route
      const response = await fetch(`/api/signature-request/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatureData: JSON.stringify(signatureData) })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit signature');
      }

      setSigned(true);
    } catch (err) {
      console.error('Error submitting signature:', err);
      alert('Error submitting signature: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-8 max-w-md">
          <h1 className="text-2xl font-bold text-red-400 mb-4">Error</h1>
          <p className="text-white">{error}</p>
        </div>
      </div>
    );
  }

  if (signed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-green-900/20 border border-green-500/50 rounded-lg p-8 max-w-md text-center">
          <svg className="w-16 h-16 text-green-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h1 className="text-2xl font-bold text-green-400 mb-4">Agreement Signed!</h1>
          <p className="text-white">
            Thank you for signing the Purchase Agreement. The buyer has been notified and will be in touch shortly.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      <div className="max-w-4xl mx-auto py-8">
        {/* Header */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">Purchase Agreement</h1>
          <p className="text-slate-300">
            Seller: <span className="text-white font-semibold">{sigRequest.seller_name}</span>
          </p>
          <p className="text-slate-300">
            Property: <span className="text-white font-semibold">{sigRequest.property_address}</span>
          </p>
          <p className="text-slate-300">
            Purchase Price: <span className="text-green-400 font-semibold">${sigRequest.purchase_price?.toLocaleString()}</span>
          </p>
        </div>

        {/* PA Document */}
        <div className="bg-white rounded-lg p-8 mb-6 shadow-lg">
          <div dangerouslySetInnerHTML={{ __html: sigRequest.pa_html }} />
        </div>

        {/* Signature Section */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-6">Complete Your Signature</h2>

          {/* Signature Name Field */}
          <div className="mb-6">
            <label className="block text-slate-300 mb-2 font-semibold">
              Signature <span className="text-purple-400">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
                placeholder="Type your full name"
                className="w-full bg-white border-2 border-slate-600 rounded-lg px-4 py-3 text-gray-900 focus:border-purple-500 focus:outline-none"
                style={{ fontFamily: "'Dancing Script', cursive", fontSize: '24px' }}
              />
              {signatureName && (
                <div className="mt-2 text-slate-400 text-sm flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Signature added
                </div>
              )}
            </div>
          </div>

          {/* Date Field */}
          <div className="mb-6">
            <label className="block text-slate-300 mb-2 font-semibold">
              Date <span className="text-purple-400">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={signatureDate}
                readOnly
                className="w-full bg-slate-700/50 border-2 border-slate-600 rounded-lg px-4 py-3 text-white cursor-not-allowed"
              />
              <div className="mt-2 text-slate-400 text-sm flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Today's date
              </div>
            </div>
          </div>

          <div className="bg-yellow-900/20 border border-yellow-500/50 rounded-lg p-4 mb-6">
            <p className="text-yellow-200 text-sm">
              By clicking "Finish & Sign" below, you agree to the terms and conditions outlined in the Purchase Agreement above. This constitutes a legally binding electronic signature.
            </p>
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting || !signatureName}
            className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white font-bold py-4 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Submitting...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Finish & Sign
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
