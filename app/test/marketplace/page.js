'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function MarketplaceTestPage() {
  const [testResults, setTestResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const addResult = (test, success, message, data = null) => {
    setTestResults(prev => [...prev, {
      test,
      success,
      message,
      data,
      timestamp: new Date().toISOString()
    }]);
  };

  const runTests = async () => {
    setTestResults([]);
    setLoading(true);

    try {
      // Test 1: Check if price column exists
      addResult('Database Schema', true, 'Testing price column...', null);
      const { data: leads, error: leadsError } = await supabase
        .from('leads')
        .select('id, price')
        .limit(1);

      if (leadsError) {
        addResult('Price Column', false, `Error: ${leadsError.message}`, null);
      } else {
        addResult('Price Column', true, 'Price column exists on leads table', leads);
      }

      // Test 2: Check if lead_purchases table exists
      const { data: purchases, error: purchasesError } = await supabase
        .from('lead_purchases')
        .select('*')
        .limit(1);

      if (purchasesError) {
        addResult('Purchases Table', false, `Error: ${purchasesError.message}`, null);
      } else {
        addResult('Purchases Table', true, 'lead_purchases table exists', purchases);
      }

      // Test 3: Create test lead with price
      const { data: testLead, error: createError } = await supabase
        .from('leads')
        .insert([{
          name: 'Test Marketplace Lead',
          email: 'test@example.com',
          phone: '555-1234',
          address: '123 Test St',
          city: 'Austin',
          property_state: 'TX',
          property_county: 'Travis',
          acres: 10,
          price: 197.00,
          source: 'test'
        }])
        .select()
        .single();

      if (createError) {
        addResult('Create Priced Lead', false, `Error: ${createError.message}`, null);
      } else {
        addResult('Create Priced Lead', true, 'Created test lead with $197 price', testLead);
      }

      // Test 4: Query priced leads
      const { data: pricedLeads, error: queryError } = await supabase
        .from('leads')
        .select('*')
        .not('price', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5);

      if (queryError) {
        addResult('Query Priced Leads', false, `Error: ${queryError.message}`, null);
      } else {
        addResult('Query Priced Leads', true, `Found ${pricedLeads.length} priced leads`, pricedLeads);
      }

      // Test 5: Check current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (user) {
        addResult('Current User', true, `Logged in as ${user.email}`, { id: user.id, email: user.email });
      } else {
        addResult('Current User', false, 'Not logged in', null);
      }

      // Test 6: Test purchase function (simulated)
      if (user && testLead) {
        const { data: purchaseTest, error: purchaseError } = await supabase
          .from('lead_purchases')
          .insert([{
            lead_id: testLead.id,
            user_id: user.id,
            team_id: user.id, // Simplified for test
            price_paid: 197.00,
            stripe_payment_intent_id: 'test_pi_123'
          }])
          .select()
          .single();

        if (purchaseError) {
          addResult('Simulate Purchase', false, `Error: ${purchaseError.message}`, null);
        } else {
          addResult('Simulate Purchase', true, 'Successfully simulated purchase', purchaseTest);
        }

        // Test 7: Check if user has purchased
        const { data: checkPurchase } = await supabase
          .rpc('user_has_purchased_lead', {
            p_user_id: user.id,
            p_lead_id: testLead.id
          });

        addResult('Check Purchase Status', true, `User has purchased: ${checkPurchase}`, { hasPurchased: checkPurchase });
      }

    } catch (error) {
      addResult('General Error', false, error.message, null);
    }

    setLoading(false);
  };

  const clearTestData = async () => {
    setLoading(true);
    try {
      // Delete test leads
      await supabase
        .from('leads')
        .delete()
        .eq('source', 'test');

      addResult('Cleanup', true, 'Deleted test leads', null);
    } catch (error) {
      addResult('Cleanup', false, error.message, null);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-3xl font-bold mb-2">Marketplace Functionality Test Page</h1>
          <p className="text-gray-600 mb-4">Live testing environment for marketplace features</p>

          <div className="flex gap-4">
            <button
              onClick={runTests}
              disabled={loading}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Running Tests...' : 'Run All Tests'}
            </button>

            <button
              onClick={clearTestData}
              disabled={loading}
              className="bg-red-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50"
            >
              Clear Test Data
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-bold mb-4">Test Results</h2>

          {testResults.length === 0 ? (
            <p className="text-gray-500">No tests run yet. Click "Run All Tests" to start.</p>
          ) : (
            <div className="space-y-4">
              {testResults.map((result, index) => (
                <div
                  key={index}
                  className={`border-l-4 p-4 rounded ${
                    result.success
                      ? 'border-green-500 bg-green-50'
                      : 'border-red-500 bg-red-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-lg font-semibold ${
                          result.success ? 'text-green-700' : 'text-red-700'
                        }`}>
                          {result.success ? '✓' : '✗'} {result.test}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(result.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className={result.success ? 'text-green-600' : 'text-red-600'}>
                        {result.message}
                      </p>
                      {result.data && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800">
                            View Data
                          </summary>
                          <pre className="mt-2 p-3 bg-gray-800 text-green-400 rounded overflow-x-auto text-xs">
                            {JSON.stringify(result.data, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-6">
          <h3 className="font-semibold text-yellow-800 mb-2">Environment Info</h3>
          <div className="text-sm text-yellow-700 space-y-1">
            <div>Supabase URL: {process.env.NEXT_PUBLIC_SUPABASE_URL}</div>
            <div>App URL: {typeof window !== 'undefined' ? window.location.origin : 'N/A'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
