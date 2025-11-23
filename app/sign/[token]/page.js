'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import SignatureCanvas from 'react-signature-canvas';

export default function SignaturePage() {
  const params = useParams();
  const token = params.token;
  const sigPad = useRef(null);

  const [loading, setLoading] = useState(true);
  const [sigRequest, setSigRequest] = useState(null);
  const [error, setError] = useState(null);
  const [signed, setSigned] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Create Supabase client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  useEffect(() => {
    loadSignatureRequest();
  }, [token]);

  const loadSignatureRequest = async () => {
    try {
      const { data, error } = await supabase
        .from('signature_requests')
        .select('*')
        .eq('token', token)
        .single();

      if (error) throw error;

      if (!data) {
        setError('Signature request not found');
        return;
      }

      if (data.status === 'signed') {
        setSigned(true);
      }

      if (new Date(data.expires_at) < new Date()) {
        setError('This signature request has expired');
        return;
      }

      setSigRequest(data);
    } catch (err) {
      console.error('Error loading signature request:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const clearSignature = () => {
    sigPad.current.clear();
  };

  const handleSubmit = async () => {
    if (sigPad.current.isEmpty()) {
      alert('Please provide your signature');
      return;
    }

    setSubmitting(true);

    try {
      const signatureData = sigPad.current.toDataURL();

      // Update signature request with seller signature
      const { error } = await supabase
        .from('signature_requests')
        .update({
          seller_signature: signatureData,
          seller_signed_at: new Date().toISOString(),
          status: 'signed'
        })
        .eq('token', token);

      if (error) throw error;

      // Update lead contract status
      await supabase
        .from('team_lead_data')
        .update({
          contract_status: 'signed',
          contract_signed_date: new Date().toISOString()
        })
        .eq('lead_id', sigRequest.lead_id)
        .eq('team_id', sigRequest.team_id);

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
          <h2 className="text-xl font-bold text-white mb-4">Sign Agreement</h2>

          <div className="mb-4">
            <label className="block text-slate-300 mb-2">Seller Signature</label>
            <div className="border-2 border-slate-600 rounded bg-white">
              <SignatureCanvas
                ref={sigPad}
                canvasProps={{
                  className: 'w-full h-40'
                }}
              />
            </div>
            <button
              onClick={clearSignature}
              className="mt-2 text-sm text-slate-400 hover:text-white"
            >
              Clear Signature
            </button>
          </div>

          <div className="bg-yellow-900/20 border border-yellow-500/50 rounded p-4 mb-4">
            <p className="text-yellow-200 text-sm">
              By signing this document, you agree to the terms and conditions outlined in the Purchase Agreement above.
            </p>
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit Signature'}
          </button>
        </div>
      </div>
    </div>
  );
}
