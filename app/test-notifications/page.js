'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function TestNotificationsPage() {
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedFromUserId, setSelectedFromUserId] = useState('');
  const [notificationType, setNotificationType] = useState('mention');
  const [testResult, setTestResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    const { data } = await supabase
      .from('users')
      .select('id, email, full_name')
      .order('created_at', { ascending: false })
      .limit(20);

    if (data) {
      setUsers(data);
      if (data.length > 0) {
        setSelectedUserId(data[0].id);
        if (data.length > 1) {
          setSelectedFromUserId(data[1].id);
        }
      }
    }
  }

  async function testNotification() {
    setLoading(true);
    setTestResult(null);

    try {
      const notifications = {
        mention: {
          type: 'mention',
          title: '=â You were mentioned',
          message: 'John Doe mentioned you in a note on the Smith Property',
          notePreview: '@you Check out this amazing parcel! We should make an offer.',
          link: '/dashboard?lead=test-123'
        },
        team_join: {
          type: 'team_join',
          title: '=K New Team Member',
          message: 'Jane Smith has joined your team',
          link: '/team/settings'
        },
        lead_assigned: {
          type: 'lead_assigned',
          title: '<¯ New Lead Assigned',
          message: 'Johnson Ranch - 45 acres in Travis County, TX',
          link: '/dashboard?lead=test-456'
        },
        lead_added: {
          type: 'lead_added',
          title: '=Í New Lead Available',
          message: 'New property added: Anderson Farm - 120 acres in Williamson County, TX',
          link: '/dashboard?lead=test-789'
        }
      };

      const notification = notifications[notificationType];

      const response = await fetch('/api/notifications/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUserId,
          fromUserId: selectedFromUserId || undefined,
          ...notification,
          sendEmail: true
        })
      });

      const result = await response.json();

      setTestResult({
        success: response.ok,
        ...result
      });

    } catch (error) {
      setTestResult({
        success: false,
        error: error.message
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">>ê Notification Testing</h1>
          <p className="text-slate-400">Test notifications and email delivery</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Test Notification</h2>

          <div className="space-y-4">
            {/* User to Notify */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Send notification to:
              </label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
              >
                <option value="">Select user...</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.full_name || user.email} ({user.email})
                  </option>
                ))}
              </select>
            </div>

            {/* From User */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Notification from (for @mentions):
              </label>
              <select
                value={selectedFromUserId}
                onChange={(e) => setSelectedFromUserId(e.target.value)}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
              >
                <option value="">Select user...</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.full_name || user.email}
                  </option>
                ))}
              </select>
            </div>

            {/* Notification Type */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Notification Type:
              </label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'mention', label: '=â @Mention', desc: 'User tagged in a note' },
                  { value: 'team_join', label: '=K Team Join', desc: 'New team member' },
                  { value: 'lead_assigned', label: '<¯ Lead Assigned', desc: 'Lead assigned to team' },
                  { value: 'lead_added', label: '=Í Lead Added', desc: 'New lead in dashboard' }
                ].map(type => (
                  <button
                    key={type.value}
                    onClick={() => setNotificationType(type.value)}
                    className={`p-4 rounded-lg border text-left transition-all ${
                      notificationType === type.value
                        ? 'bg-blue-500/20 border-blue-500'
                        : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <div className="font-semibold">{type.label}</div>
                    <div className="text-xs text-slate-400 mt-1">{type.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Send Button */}
            <button
              onClick={testNotification}
              disabled={!selectedUserId || loading}
              className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
            >
              {loading ? 'Sending...' : 'Send Test Notification + Email'}
            </button>
          </div>
        </div>

        {/* Results */}
        {testResult && (
          <div className={`bg-slate-900 border rounded-lg p-6 ${
            testResult.success ? 'border-green-500/50' : 'border-red-500/50'
          }`}>
            <div className="flex items-center gap-2 mb-4">
              {testResult.success ? (
                <>
                  <div className="text-2xl"></div>
                  <h3 className="text-lg font-semibold text-green-400">Success!</h3>
                </>
              ) : (
                <>
                  <div className="text-2xl">L</div>
                  <h3 className="text-lg font-semibold text-red-400">Failed</h3>
                </>
              )}
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <span className="text-slate-400">Notification ID:</span>
                <span className="text-white font-mono">{testResult.notification?.id || 'N/A'}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-slate-400">Email Sent:</span>
                <span className={testResult.emailSent ? 'text-green-400' : 'text-red-400'}>
                  {testResult.emailSent ? ' Yes' : ' No'}
                </span>
              </div>
              {testResult.error && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded text-red-400">
                  {testResult.error}
                </div>
              )}
            </div>

            <div className="mt-4 p-4 bg-slate-800 rounded-lg">
              <div className="text-xs text-slate-500 mb-2">Full Response:</div>
              <pre className="text-xs text-slate-300 overflow-x-auto">
                {JSON.stringify(testResult, null, 2)}
              </pre>
            </div>

            <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm text-blue-300">
              <strong>Next Steps:</strong>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Check the user's email inbox for the notification email</li>
                <li>Check the notifications bell in the dashboard</li>
                <li>Verify the notification appears in the database</li>
              </ul>
            </div>
          </div>
        )}

        {/* Info Panel */}
        <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm">
          <div className="font-semibold text-yellow-400 mb-2">9 How it works:</div>
          <ul className="list-disc list-inside text-yellow-300/80 space-y-1">
            <li><strong>Notification:</strong> Created in database, shows in dashboard bell icon</li>
            <li><strong>Email:</strong> Sent via SendGrid to the user's email address</li>
            <li><strong>Link:</strong> Click notification or email to jump to relevant page</li>
            <li><strong>Real-time:</strong> Notifications poll every 30 seconds in production</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
