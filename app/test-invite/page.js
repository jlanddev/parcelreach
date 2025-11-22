'use client';

import { useState } from 'react';

export default function TestInvitePage() {
  const [email, setEmail] = useState('');
  const [teamId, setTeamId] = useState('6670fe56-266f-4665-9eba-0caa6d16bb76');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function testInvite() {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          teamId: teamId,
          inviterName: 'Test User'
        })
      });

      const data = await response.json();

      setResult({
        status: response.status,
        ok: response.ok,
        data: data
      });
    } catch (error) {
      setResult({
        status: 'ERROR',
        ok: false,
        data: { error: error.message }
      });
    }

    setLoading(false);
  }

  return (
    <div style={{ padding: '40px', fontFamily: 'monospace' }}>
      <h1>Team Invite Test</h1>

      <div style={{ marginBottom: '20px' }}>
        <label>
          Email to invite:
          <br />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="test@example.com"
            style={{ width: '300px', padding: '8px', marginTop: '5px' }}
          />
        </label>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label>
          Team ID:
          <br />
          <input
            type="text"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            style={{ width: '400px', padding: '8px', marginTop: '5px' }}
          />
        </label>
      </div>

      <button
        onClick={testInvite}
        disabled={!email || loading}
        style={{
          padding: '10px 20px',
          background: loading ? '#ccc' : '#0070f3',
          color: 'white',
          border: 'none',
          cursor: loading ? 'not-allowed' : 'pointer'
        }}
      >
        {loading ? 'Sending...' : 'Send Test Invite'}
      </button>

      {result && (
        <div style={{
          marginTop: '30px',
          padding: '20px',
          background: result.ok ? '#d4edda' : '#f8d7da',
          border: `1px solid ${result.ok ? '#c3e6cb' : '#f5c6cb'}`,
          borderRadius: '4px'
        }}>
          <h3>Result:</h3>
          <p><strong>Status:</strong> {result.status}</p>
          <p><strong>Success:</strong> {result.ok ? 'YES' : 'NO'}</p>
          <pre style={{
            background: '#f5f5f5',
            padding: '15px',
            borderRadius: '4px',
            overflow: 'auto'
          }}>
            {JSON.stringify(result.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
