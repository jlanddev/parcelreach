'use client';

import { useState, useEffect } from 'react';

export default function ErrorLogPage() {
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    fetchErrors();
  }, []);

  async function fetchErrors() {
    setLoading(true);
    try {
      const response = await fetch('/api/debug/errors');
      const data = await response.json();
      setErrors(data.errors || []);
    } catch (error) {
      console.error('Failed to fetch errors:', error);
    }
    setLoading(false);
  }

  async function clearErrors() {
    if (!confirm('Clear all error logs?')) return;
    try {
      await fetch('/api/debug/errors', { method: 'DELETE' });
      setErrors([]);
    } catch (error) {
      console.error('Failed to clear errors:', error);
    }
  }

  const filteredErrors = errors.filter(err =>
    !filter ||
    err.context.toLowerCase().includes(filter.toLowerCase()) ||
    err.error.message.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Error Log</h1>
          <div className="flex gap-4">
            <button
              onClick={fetchErrors}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition"
            >
              Refresh
            </button>
            <button
              onClick={clearErrors}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition"
            >
              Clear All
            </button>
          </div>
        </div>

        <div className="mb-6">
          <input
            type="text"
            placeholder="Filter errors..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
          />
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-slate-400">Loading errors...</p>
          </div>
        ) : (
          <>
            <div className="mb-4 text-slate-400">
              Showing {filteredErrors.length} of {errors.length} errors
            </div>

            <div className="space-y-4">
              {filteredErrors.length === 0 ? (
                <div className="text-center py-12 bg-slate-900 rounded-lg border border-slate-800">
                  <p className="text-slate-400">No errors logged</p>
                </div>
              ) : (
                filteredErrors.map((error, idx) => (
                  <div key={idx} className="bg-slate-900 border border-slate-800 rounded-lg p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <span className="inline-block px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm font-semibold mb-2">
                          {error.context}
                        </span>
                        <p className="text-sm text-slate-500">
                          {new Date(error.timestamp).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right text-sm text-slate-400">
                        <div>{error.method} {error.url}</div>
                      </div>
                    </div>

                    <div className="mb-4">
                      <h3 className="font-semibold mb-2 text-red-400">Error Message:</h3>
                      <p className="text-slate-300 font-mono text-sm bg-slate-950 p-3 rounded">
                        {error.error.message}
                      </p>
                    </div>

                    {error.metadata && Object.keys(error.metadata).length > 0 && (
                      <div className="mb-4">
                        <h3 className="font-semibold mb-2 text-blue-400">Metadata:</h3>
                        <pre className="text-slate-300 font-mono text-xs bg-slate-950 p-3 rounded overflow-x-auto">
                          {JSON.stringify(error.metadata, null, 2)}
                        </pre>
                      </div>
                    )}

                    {error.error.stack && (
                      <details className="cursor-pointer">
                        <summary className="font-semibold mb-2 text-yellow-400">Stack Trace</summary>
                        <pre className="text-slate-400 font-mono text-xs bg-slate-950 p-3 rounded overflow-x-auto mt-2">
                          {error.error.stack}
                        </pre>
                      </details>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
