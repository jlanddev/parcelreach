'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

export default function TestSignaturePage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const createTestSignature = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Check environment variables
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase environment variables');
      }

      const supabase = createClient(supabaseUrl, supabaseKey);

      // Generate test token
      const testToken = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Create test signature request
      const { data, error: insertError } = await supabase
        .from('signature_requests')
        .insert([{
          token: testToken,
          pa_html: `
            <div style="font-family: Arial; padding: 20px;">
              <h1>TEST PURCHASE AGREEMENT</h1>
              <p>This is a test agreement for debugging purposes.</p>
              <p><strong>Seller:</strong> Test Seller</p>
              <p><strong>Buyer:</strong> Test Buyer LLC</p>
              <p><strong>Property:</strong> 123 Test St, Test City, TX</p>
              <p><strong>Price:</strong> $100,000</p>
            </div>
          `,
          seller_name: 'Test Seller',
          seller_email: 'test@example.com',
          seller_phone: '555-1234',
          buyer_entity: 'Test Buyer LLC',
          purchase_price: 100000,
          property_address: '123 Test St, Test City, TX',
          status: 'pending'
        }])
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      const signatureUrl = `${window.location.origin}/sign/${testToken}`;

      setResult({
        token: testToken,
        signatureUrl,
        data
      });

    } catch (err) {
      console.error('Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-8">
          <h1 className="text-3xl font-bold text-white mb-6">Signature System Test</h1>

          <div className="space-y-4">
            {/* Environment Check */}
            <div className="bg-slate-900/50 border border-slate-600 rounded p-4">
              <h2 className="text-white font-semibold mb-2">Environment Variables</h2>
              <div className="text-sm space-y-1">
                <div className={process.env.NEXT_PUBLIC_SUPABASE_URL ? 'text-green-400' : 'text-red-400'}>
                  NEXT_PUBLIC_SUPABASE_URL: {process.env.NEXT_PUBLIC_SUPABASE_URL ? '✓ Set' : '✗ Missing'}
                </div>
                <div className={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'text-green-400' : 'text-red-400'}>
                  NEXT_PUBLIC_SUPABASE_ANON_KEY: {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✓ Set' : '✗ Missing'}
                </div>
              </div>
            </div>

            {/* Create Test Button */}
            <button
              onClick={createTestSignature}
              disabled={loading}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-6 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Creating Test...' : 'Create Test Signature Request'}
            </button>

            {/* Error Display */}
            {error && (
              <div className="bg-red-900/20 border border-red-500/50 rounded p-4">
                <h3 className="text-red-400 font-semibold mb-2">Error</h3>
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}

            {/* Success Display */}
            {result && (
              <div className="bg-green-900/20 border border-green-500/50 rounded p-4 space-y-3">
                <h3 className="text-green-400 font-semibold">Test Created Successfully!</h3>

                <div className="space-y-2">
                  <div>
                    <label className="text-slate-400 text-sm">Token:</label>
                    <div className="text-white font-mono text-sm bg-slate-900/50 p-2 rounded">
                      {result.token}
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-400 text-sm">Signature URL:</label>
                    <div className="text-white font-mono text-sm bg-slate-900/50 p-2 rounded break-all">
                      {result.signatureUrl}
                    </div>
                  </div>

                  <a
                    href={result.signatureUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full text-center bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                  >
                    Open Signature Page →
                  </a>
                </div>
              </div>
            )}

            {/* Instructions */}
            <div className="bg-yellow-900/20 border border-yellow-500/50 rounded p-4">
              <h3 className="text-yellow-400 font-semibold mb-2">Instructions</h3>
              <ol className="text-yellow-200 text-sm space-y-1 list-decimal list-inside">
                <li>Click "Create Test Signature Request" to generate a test</li>
                <li>Click "Open Signature Page" to test the signature flow</li>
                <li>If the signature page is blank, check browser console for errors</li>
                <li>Make sure the SQL schema has been run in Supabase</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
