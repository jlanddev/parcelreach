'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

export default function TestSignaturePage() {
  const [logs, setLogs] = useState([]);
  const [testResults, setTestResults] = useState({});
  const [running, setRunning] = useState(false);

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, message, type }]);
    console.log(`[${type.toUpperCase()}] ${message}`);
  };

  const runAllTests = async () => {
    setRunning(true);
    setLogs([]);
    setTestResults({});

    addLog('🚀 Starting automated tests...', 'info');

    // Test 1: Environment Variables
    addLog('Test 1: Checking environment variables...', 'info');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      addLog('❌ FAILED: Missing environment variables', 'error');
      setTestResults(prev => ({ ...prev, envVars: false }));
      setRunning(false);
      return;
    }
    addLog('✅ PASSED: Environment variables are set', 'success');
    setTestResults(prev => ({ ...prev, envVars: true }));

    // Test 2: Supabase Connection
    addLog('Test 2: Testing Supabase connection...', 'info');
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data, error } = await supabase.from('signature_requests').select('count').limit(1);

      if (error) throw error;

      addLog('✅ PASSED: Supabase connection successful', 'success');
      setTestResults(prev => ({ ...prev, supabaseConnection: true }));
    } catch (err) {
      addLog(`❌ FAILED: Supabase connection error: ${err.message}`, 'error');
      setTestResults(prev => ({ ...prev, supabaseConnection: false }));
      setRunning(false);
      return;
    }

    // Test 3: Create Test Signature Request
    addLog('Test 3: Creating test signature request...', 'info');
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const testToken = `autotest-${Date.now()}`;

      const { data, error: insertError } = await supabase
        .from('signature_requests')
        .insert([{
          token: testToken,
          pa_html: '<div><h1>AUTO TEST PA</h1></div>',
          seller_name: 'Auto Test Seller',
          seller_email: 'autotest@example.com',
          seller_phone: '555-0000',
          buyer_entity: 'Auto Test LLC',
          purchase_price: 999999,
          property_address: 'Auto Test Address',
          status: 'pending'
        }])
        .select()
        .single();

      if (insertError) throw insertError;

      addLog(`✅ PASSED: Test signature request created (token: ${testToken})`, 'success');
      setTestResults(prev => ({ ...prev, createRequest: true, testToken }));

      // Test 4: Fetch Test Request
      addLog('Test 4: Fetching test signature request...', 'info');
      const { data: fetchedData, error: fetchError } = await supabase
        .from('signature_requests')
        .select('*')
        .eq('token', testToken)
        .single();

      if (fetchError) throw fetchError;

      addLog('✅ PASSED: Test signature request fetched successfully', 'success');
      setTestResults(prev => ({ ...prev, fetchRequest: true, requestData: fetchedData }));

      // Test 5: Signature Page URL
      const signatureUrl = `${window.location.origin}/sign/${testToken}`;
      addLog(`Test 5: Signature page URL generated: ${signatureUrl}`, 'info');
      addLog('✅ PASSED: Signature URL created', 'success');
      setTestResults(prev => ({ ...prev, signatureUrl, urlGeneration: true }));

      // Test 6: Test iframe load (optional)
      addLog('Test 6: Testing signature page accessibility...', 'info');
      try {
        const response = await fetch(signatureUrl);
        if (response.ok) {
          addLog('✅ PASSED: Signature page is accessible', 'success');
          setTestResults(prev => ({ ...prev, pageAccessible: true }));
        } else {
          addLog(`⚠️ WARNING: Signature page returned ${response.status}`, 'warning');
          setTestResults(prev => ({ ...prev, pageAccessible: false }));
        }
      } catch (err) {
        addLog(`⚠️ WARNING: Could not verify page accessibility: ${err.message}`, 'warning');
        setTestResults(prev => ({ ...prev, pageAccessible: false }));
      }

    } catch (err) {
      addLog(`❌ FAILED: ${err.message}`, 'error');
      setTestResults(prev => ({ ...prev, createRequest: false }));
    }

    addLog('🏁 All automated tests complete!', 'info');
    setRunning(false);
  };

  // Auto-run tests on mount
  useEffect(() => {
    runAllTests();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-white">Automated Signature System Tests</h1>
            <button
              onClick={runAllTests}
              disabled={running}
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 px-6 rounded-lg transition-colors disabled:opacity-50"
            >
              {running ? '⏳ Running...' : '🔄 Re-run Tests'}
            </button>
          </div>

          {/* Test Results Summary */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <div className={`p-4 rounded-lg border-2 ${testResults.envVars ? 'bg-green-900/20 border-green-500/50' : 'bg-slate-900/50 border-slate-600'}`}>
              <div className="text-sm text-slate-400">Environment</div>
              <div className="text-lg font-bold text-white">
                {testResults.envVars ? '✅ Pass' : '⏳ Pending'}
              </div>
            </div>

            <div className={`p-4 rounded-lg border-2 ${testResults.supabaseConnection ? 'bg-green-900/20 border-green-500/50' : 'bg-slate-900/50 border-slate-600'}`}>
              <div className="text-sm text-slate-400">Connection</div>
              <div className="text-lg font-bold text-white">
                {testResults.supabaseConnection ? '✅ Pass' : '⏳ Pending'}
              </div>
            </div>

            <div className={`p-4 rounded-lg border-2 ${testResults.createRequest ? 'bg-green-900/20 border-green-500/50' : 'bg-slate-900/50 border-slate-600'}`}>
              <div className="text-sm text-slate-400">Create Request</div>
              <div className="text-lg font-bold text-white">
                {testResults.createRequest ? '✅ Pass' : '⏳ Pending'}
              </div>
            </div>

            <div className={`p-4 rounded-lg border-2 ${testResults.fetchRequest ? 'bg-green-900/20 border-green-500/50' : 'bg-slate-900/50 border-slate-600'}`}>
              <div className="text-sm text-slate-400">Fetch Request</div>
              <div className="text-lg font-bold text-white">
                {testResults.fetchRequest ? '✅ Pass' : '⏳ Pending'}
              </div>
            </div>

            <div className={`p-4 rounded-lg border-2 ${testResults.urlGeneration ? 'bg-green-900/20 border-green-500/50' : 'bg-slate-900/50 border-slate-600'}`}>
              <div className="text-sm text-slate-400">URL Generation</div>
              <div className="text-lg font-bold text-white">
                {testResults.urlGeneration ? '✅ Pass' : '⏳ Pending'}
              </div>
            </div>

            <div className={`p-4 rounded-lg border-2 ${testResults.pageAccessible ? 'bg-green-900/20 border-green-500/50' : testResults.pageAccessible === false ? 'bg-yellow-900/20 border-yellow-500/50' : 'bg-slate-900/50 border-slate-600'}`}>
              <div className="text-sm text-slate-400">Page Accessible</div>
              <div className="text-lg font-bold text-white">
                {testResults.pageAccessible ? '✅ Pass' : testResults.pageAccessible === false ? '⚠️ Check' : '⏳ Pending'}
              </div>
            </div>
          </div>

          {/* Test URL */}
          {testResults.signatureUrl && (
            <div className="bg-blue-900/20 border border-blue-500/50 rounded-lg p-4 mb-6">
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-sm text-slate-400 mb-1">Test Signature URL:</div>
                  <div className="text-white font-mono text-sm break-all">{testResults.signatureUrl}</div>
                </div>
                <a
                  href={testResults.signatureUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-4 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-lg transition-colors whitespace-nowrap"
                >
                  Open →
                </a>
              </div>
            </div>
          )}

          {/* Logs */}
          <div className="bg-slate-900/50 border border-slate-600 rounded-lg p-4">
            <h3 className="text-white font-semibold mb-3">Test Logs</h3>
            <div className="space-y-1 max-h-96 overflow-y-auto font-mono text-sm">
              {logs.length === 0 ? (
                <div className="text-slate-400">No logs yet...</div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className={`
                    ${log.type === 'error' ? 'text-red-400' : ''}
                    ${log.type === 'success' ? 'text-green-400' : ''}
                    ${log.type === 'warning' ? 'text-yellow-400' : ''}
                    ${log.type === 'info' ? 'text-slate-300' : ''}
                  `}>
                    <span className="text-slate-500">[{log.timestamp}]</span> {log.message}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
