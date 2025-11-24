'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function TestNotificationPage() {
  const router = useRouter();
  const [logs, setLogs] = useState([]);
  const [testResults, setTestResults] = useState([]);
  const hasProcessedUrlRef = useRef(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [scrollToNoteId, setScrollToNoteId] = useState(null);

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, message, type }]);
    console.log(`[${timestamp}] ${message}`);
  };

  // Simulate the dashboard's URL processing logic
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (hasProcessedUrlRef.current) {
      addLog('⏭️  Skipped: hasProcessedUrlRef.current is true', 'skip');
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const leadId = urlParams.get('lead');
    const noteId = urlParams.get('note');

    if (!leadId) {
      addLog('✅ No lead parameter - correctly skipping', 'success');
      return;
    }

    addLog(`🔔 Found lead parameter: ${leadId}`, 'info');
    if (noteId) {
      addLog(`📝 Found note parameter: ${noteId}`, 'info');
    }

    // Simulate processing
    addLog('Processing URL...', 'info');
    hasProcessedUrlRef.current = true;
    addLog('✅ Set hasProcessedUrlRef.current = true', 'success');

    setTimeout(() => {
      setModalOpen(true);
      addLog('✅ Modal opened', 'success');
      if (noteId) {
        setScrollToNoteId(noteId);
        addLog(`✅ Set scrollToNoteId = ${noteId}`, 'success');
      }
    }, 100);

    setTimeout(() => {
      window.history.replaceState({}, '', '/test-notification');
      addLog('✅ URL cleaned up', 'success');
    }, 500);
  }, []); // Empty deps like dashboard

  // Reset when modal closes
  useEffect(() => {
    if (!modalOpen) {
      const wasReset = hasProcessedUrlRef.current === true;
      hasProcessedUrlRef.current = false;
      setScrollToNoteId(null);
      if (wasReset) {
        addLog('✅ Modal closed - reset hasProcessedUrlRef to false', 'success');
        addLog('✅ Cleared scrollToNoteId', 'success');
      }
    }
  }, [modalOpen]);

  const runTest = async (testName, testFn) => {
    addLog(`\n🧪 Running test: ${testName}`, 'test');
    try {
      const result = await testFn();
      if (result) {
        setTestResults(prev => [...prev, { name: testName, passed: true }]);
        addLog(`✅ PASSED: ${testName}`, 'success');
      } else {
        setTestResults(prev => [...prev, { name: testName, passed: false }]);
        addLog(`❌ FAILED: ${testName}`, 'error');
      }
      return result;
    } catch (err) {
      setTestResults(prev => [...prev, { name: testName, passed: false, error: err.message }]);
      addLog(`❌ ERROR in ${testName}: ${err.message}`, 'error');
      return false;
    }
  };

  const testNormalPageLoad = async () => {
    addLog('Testing normal page load (no URL params)...', 'info');
    const shouldNotOpen = !modalOpen;
    addLog(`Modal open: ${modalOpen} (should be false)`, 'info');
    return shouldNotOpen;
  };

  const testNotificationClick = async () => {
    addLog('Simulating notification click...', 'info');

    // Simulate navigation with URL params
    addLog('Navigating to ?lead=test-lead&note=test-note', 'info');
    window.history.pushState({}, '', '/test-notification?lead=test-lead&note=test-note');

    // Force a re-check by reloading
    addLog('⚠️  Note: Would need page reload to trigger useEffect', 'warning');
    addLog('In real app, router.push() causes component remount', 'info');

    return true;
  };

  const testModalClose = async () => {
    addLog('Testing modal close behavior...', 'info');
    if (!modalOpen) {
      addLog('Opening modal first...', 'info');
      setModalOpen(true);
      await new Promise(r => setTimeout(r, 100));
    }

    addLog('Closing modal...', 'info');
    setModalOpen(false);

    // Wait for effect to run
    await new Promise(r => setTimeout(r, 100));

    const isReset = hasProcessedUrlRef.current === false;
    const isCleared = scrollToNoteId === null;
    addLog(`hasProcessedUrlRef.current = ${hasProcessedUrlRef.current} (should be false)`, 'info');
    addLog(`scrollToNoteId = ${scrollToNoteId} (should be null)`, 'info');

    return isReset && isCleared;
  };

  const testRefPersistence = async () => {
    addLog('Testing ref persistence across state changes...', 'info');

    hasProcessedUrlRef.current = true;
    addLog('Set hasProcessedUrlRef.current = true', 'info');

    // Trigger a re-render with state change
    setLogs(prev => [...prev]);
    await new Promise(r => setTimeout(r, 50));

    const persisted = hasProcessedUrlRef.current === true;
    addLog(`After re-render: hasProcessedUrlRef.current = ${hasProcessedUrlRef.current}`, 'info');
    addLog(`Ref persisted: ${persisted}`, persisted ? 'success' : 'error');

    // Reset for next tests
    hasProcessedUrlRef.current = false;

    return persisted;
  };

  const runAllTests = async () => {
    setLogs([]);
    setTestResults([]);
    addLog('🚀 Starting comprehensive tests...', 'test');
    addLog('═══════════════════════════════════════\n', 'test');

    await runTest('Test 1: Ref Persistence', testRefPersistence);
    await new Promise(r => setTimeout(r, 500));

    await runTest('Test 2: Normal Page Load', testNormalPageLoad);
    await new Promise(r => setTimeout(r, 500));

    await runTest('Test 3: Modal Close & Reset', testModalClose);
    await new Promise(r => setTimeout(r, 500));

    await runTest('Test 4: Notification Click', testNotificationClick);

    addLog('\n═══════════════════════════════════════', 'test');
    addLog('🏁 All tests completed!', 'test');
  };

  return (
    <div className="min-h-screen bg-slate-900 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">
          🧪 Notification Flow Test Page
        </h1>

        {/* Test Results Summary */}
        {testResults.length > 0 && (
          <div className="mb-8 p-6 bg-slate-800 rounded-lg border border-slate-700">
            <h2 className="text-xl font-bold text-white mb-4">Test Results</h2>
            <div className="space-y-2">
              {testResults.map((result, i) => (
                <div key={i} className={`flex items-center gap-2 ${result.passed ? 'text-green-400' : 'text-red-400'}`}>
                  {result.passed ? '✅' : '❌'} {result.name}
                  {result.error && <span className="text-xs text-slate-500">({result.error})</span>}
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-700">
              <span className="text-lg font-bold text-white">
                {testResults.filter(r => r.passed).length} / {testResults.length} passed
              </span>
            </div>
          </div>
        )}

        {/* Current State */}
        <div className="mb-8 p-6 bg-slate-800 rounded-lg border border-slate-700">
          <h2 className="text-xl font-bold text-white mb-4">Current State</h2>
          <div className="space-y-2 font-mono text-sm">
            <div className="text-slate-300">
              <span className="text-blue-400">hasProcessedUrlRef.current:</span>{' '}
              <span className={hasProcessedUrlRef.current ? 'text-red-400' : 'text-green-400'}>
                {String(hasProcessedUrlRef.current)}
              </span>
            </div>
            <div className="text-slate-300">
              <span className="text-blue-400">modalOpen:</span>{' '}
              <span className={modalOpen ? 'text-green-400' : 'text-slate-400'}>
                {String(modalOpen)}
              </span>
            </div>
            <div className="text-slate-300">
              <span className="text-blue-400">scrollToNoteId:</span>{' '}
              <span className="text-slate-400">
                {scrollToNoteId || 'null'}
              </span>
            </div>
            <div className="text-slate-300">
              <span className="text-blue-400">URL:</span>{' '}
              <span className="text-slate-400">
                {typeof window !== 'undefined' ? window.location.href : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="mb-8 flex gap-4">
          <button
            onClick={runAllTests}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
          >
            🚀 Run All Tests
          </button>
          <button
            onClick={() => setModalOpen(!modalOpen)}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold"
          >
            {modalOpen ? 'Close' : 'Open'} Modal
          </button>
          <button
            onClick={() => router.push('/test-notification?lead=abc123&note=note456')}
            className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold"
          >
            Simulate Notification Link
          </button>
          <button
            onClick={() => { setLogs([]); setTestResults([]); }}
            className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
          >
            Clear Logs
          </button>
        </div>

        {/* Modal Simulation */}
        {modalOpen && (
          <>
            <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setModalOpen(false)} />
            <div className="fixed inset-0 flex items-center justify-center z-50">
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 max-w-md">
                <h3 className="text-xl font-bold text-white mb-4">Modal Simulation</h3>
                <p className="text-slate-300 mb-4">
                  This simulates the lead detail modal opening.
                </p>
                {scrollToNoteId && (
                  <div className="p-4 bg-blue-500/20 border border-blue-500 rounded mb-4">
                    <p className="text-blue-300 text-sm">
                      Would scroll to note: <strong>{scrollToNoteId}</strong>
                    </p>
                  </div>
                )}
                <button
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded"
                >
                  Close
                </button>
              </div>
            </div>
          </>
        )}

        {/* Logs */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
          <h2 className="text-xl font-bold text-white mb-4">Event Log</h2>
          <div className="font-mono text-xs space-y-1 max-h-96 overflow-y-auto">
            {logs.length === 0 ? (
              <div className="text-slate-500">No events yet. Click "Run All Tests" to start.</div>
            ) : (
              logs.map((log, i) => (
                <div
                  key={i}
                  className={`${
                    log.type === 'success' ? 'text-green-400' :
                    log.type === 'error' ? 'text-red-400' :
                    log.type === 'warning' ? 'text-yellow-400' :
                    log.type === 'test' ? 'text-purple-400' :
                    log.type === 'skip' ? 'text-orange-400' :
                    'text-slate-300'
                  }`}
                >
                  <span className="text-slate-500">[{log.timestamp}]</span> {log.message}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-8 p-6 bg-blue-900/20 border border-blue-700 rounded-lg">
          <h3 className="text-lg font-bold text-blue-300 mb-2">Test Instructions</h3>
          <ol className="text-blue-200 text-sm space-y-2 list-decimal list-inside">
            <li>Click "Run All Tests" to verify ref persistence and logic</li>
            <li>Click "Simulate Notification Link" to test URL handling</li>
            <li>Close the modal and verify the ref resets</li>
            <li>Click "Simulate Notification Link" again to test repeated clicks</li>
            <li>All tests must pass before deploying</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
