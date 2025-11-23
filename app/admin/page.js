'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function AdminPage() {
  const router = useRouter();
  const [leads, setLeads] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [signups, setSignups] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // Admin access control
  useEffect(() => {
    const checkAdminAccess = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      const adminEmails = ['admin@parcelreach.ai', 'jordan@havenground.com', 'jordan@landreach.co'];
      if (!user) {
        router.push('/admin/login');
        return;
      }

      if (!adminEmails.includes(user.email)) {
        router.push('/dashboard');
        return;
      }
    };

    checkAdminAccess();
  }, [router]);

  useEffect(() => {
    fetchAllData();

    // Auto-refresh every 10 seconds for live feed
    const interval = setInterval(fetchAllData, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchAllData = async () => {
    setLoading(true);

    // Fetch leads from today
    const today = new Date().toISOString().split('T')[0];

    const [leadsRes, contractorsRes, signupsRes, transactionsRes, bookingsRes] = await Promise.all([
      supabase.from('leads').select('*').gte('submitted_at', today + 'T00:00:00').order('submitted_at', { ascending: false }),
      supabase.from('contractors').select('*').eq('status', 'active'),
      supabase.from('contractor_signups').select('*').order('submitted_at', { ascending: false }).limit(20),
      supabase.from('transactions').select('*').gte('created_at', today + 'T00:00:00').eq('type', 'lead_charge'),
      supabase.from('calendar_bookings').select('*').order('scheduled_date', { ascending: true }).limit(50),
    ]);

    setLeads(leadsRes.data || []);
    setContractors(contractorsRes.data || []);
    setSignups(signupsRes.data || []);
    setTransactions(transactionsRes.data || []);
    setBookings(bookingsRes.data || []);
    setLoading(false);
  };

  // Calculate metrics
  const todayLeads = leads.length;
  const assignedLeads = leads.filter(l => l.status === 'assigned').length;

  // Calculate demand
  const totalDailyCap = contractors.reduce((sum, c) => sum + (c.daily_lead_cap || 0), 0);
  const demandFulfillment = totalDailyCap > 0 ? (todayLeads / totalDailyCap * 100) : 0;

  const handleDeleteSignup = async (signupId) => {
    if (confirm('Are you sure you want to delete this signup?')) {
      await supabase
        .from('contractor_signups')
        .delete()
        .eq('id', signupId);
      fetchAllData();
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold">GarageLeadly Operations</h1>
            <p className="text-gray-400 text-xs sm:text-sm hidden sm:block">Live Business Dashboard</p>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="text-right hidden md:block">
              <div className="text-xs sm:text-sm text-gray-400">Last Updated</div>
              <div className="text-xs sm:text-sm font-mono">{new Date().toLocaleTimeString()}</div>
            </div>
            <Link href="/" className="bg-gray-700 px-3 py-2 sm:px-4 rounded hover:bg-gray-600 text-xs sm:text-sm">
              Exit
            </Link>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 sm:px-6 overflow-x-auto">
        <div className="flex gap-2 sm:gap-4 min-w-max sm:min-w-0">
          {['overview', 'live-feed', 'signups', 'calendar'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 sm:px-4 py-3 font-medium capitalize border-b-2 transition text-xs sm:text-sm whitespace-nowrap ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              {tab.replace('-', ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Top Metrics */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg p-6">
                <div className="text-3xl font-bold">{todayLeads}</div>
                <div className="text-blue-200 text-sm">Leads Today</div>
                <div className="text-xs text-blue-300 mt-2">{assignedLeads} assigned</div>
              </div>

              <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-lg p-6">
                <div className="text-3xl font-bold">$0.00</div>
                <div className="text-green-200 text-sm">Revenue Today</div>
                <div className="text-xs text-green-300 mt-2">$0.00 per lead</div>
              </div>

              <div className="bg-gradient-to-br from-red-600 to-red-700 rounded-lg p-6">
                <div className="text-3xl font-bold">$0.00</div>
                <div className="text-red-200 text-sm">Google Ads Spend</div>
                <div className="text-xs text-red-300 mt-2">$0.00 per click</div>
              </div>

              <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-lg p-6">
                <div className="text-3xl font-bold">$0.00</div>
                <div className="text-purple-200 text-sm">Cost Per Lead</div>
                <div className="text-xs text-purple-300 mt-2">0 clicks</div>
              </div>
            </div>

            {/* Lead Demand */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-xl font-bold mb-4">Lead Production Status</h3>
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <div className="text-sm text-gray-400 mb-2">Contractor Demand (Daily Caps)</div>
                  <div className="text-3xl font-bold text-blue-400">{totalDailyCap}</div>
                  <div className="text-xs text-gray-500">{contractors.length} active contractors</div>
                </div>
                <div>
                  <div className="text-sm text-gray-400 mb-2">Leads Delivered Today</div>
                  <div className="text-3xl font-bold text-green-400">{todayLeads}</div>
                  <div className="text-xs text-gray-500">{assignedLeads} assigned, {todayLeads - assignedLeads} pending</div>
                </div>
                <div>
                  <div className="text-sm text-gray-400 mb-2">Demand Fulfillment</div>
                  <div className="text-3xl font-bold text-purple-400">{demandFulfillment.toFixed(1)}%</div>
                  <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
                    <div
                      className="bg-purple-500 h-2 rounded-full transition-all"
                      style={{ width: `${Math.min(demandFulfillment, 100)}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Contractor Queue */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-xl font-bold mb-4">Lead Rotation Queue (Active Contractors)</h3>
              <div className="space-y-2">
                {contractors.length === 0 ? (
                  <div className="text-gray-400 text-center py-4">No active contractors</div>
                ) : (
                  contractors.map((contractor, index) => {
                    const todayLeadsCount = leads.filter(l => l.contractor_id === contractor.id).length;
                    const remaining = contractor.daily_lead_cap - todayLeadsCount;

                    return (
                      <div key={contractor.id} className="bg-gray-700 rounded p-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="bg-blue-600 rounded-full w-10 h-10 flex items-center justify-center font-bold">
                            {index + 1}
                          </div>
                          <div>
                            <div className="font-semibold">{contractor.company_name || contractor.name}</div>
                            <div className="text-sm text-gray-400">{contractor.counties?.join(', ')}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <div className="text-sm text-gray-400">Today</div>
                            <div className="font-bold">{todayLeadsCount} / {contractor.daily_lead_cap}</div>
                          </div>
                          <div className={`px-3 py-1 rounded-full text-sm font-semibold ${
                            remaining > 0 ? 'bg-green-600' : 'bg-red-600'
                          }`}>
                            {remaining > 0 ? `${remaining} slots open` : 'Cap reached'}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* LIVE FEED TAB */}
        {activeTab === 'live-feed' && (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg p-4 flex items-center justify-between">
              <h3 className="text-xl font-bold">Live Lead Feed</h3>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-gray-400">Auto-refreshing every 10s</span>
              </div>
            </div>

            <div className="space-y-3">
              {leads.length === 0 ? (
                <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400">
                  No leads today yet. Waiting for first lead...
                </div>
              ) : (
                leads.map((lead) => {
                  const contractor = contractors.find(c => c.id === lead.contractor_id);
                  const transaction = transactions.find(t => t.lead_id === lead.id);

                  return (
                    <div key={lead.id} className="bg-gray-800 rounded-lg p-6 border-l-4 border-blue-500">
                      <div className="grid grid-cols-4 gap-6">
                        <div>
                          <div className="text-xs text-gray-400 mb-1">TIME</div>
                          <div className="font-mono text-sm">
                            {new Date(lead.submitted_at).toLocaleTimeString()}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-400 mb-1">CUSTOMER</div>
                          <div className="font-semibold">{lead.name}</div>
                          <div className="text-xs text-gray-400">{lead.county} • {lead.job_type}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-400 mb-1">ASSIGNED TO</div>
                          {contractor ? (
                            <>
                              <div className="font-semibold">{contractor.company_name || contractor.name}</div>
                              <div className="text-xs text-gray-400">{contractor.phone}</div>
                            </>
                          ) : (
                            <div className="text-yellow-400">Pending assignment</div>
                          )}
                        </div>
                        <div>
                          <div className="text-xs text-gray-400 mb-1">CHARGE</div>
                          {transaction ? (
                            <>
                              <div className="font-semibold text-green-400">${transaction.amount}</div>
                              <div className="text-xs text-gray-400 capitalize">{transaction.status}</div>
                            </>
                          ) : (
                            <div className="text-xs text-gray-400">Processing...</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* SIGNUPS TAB */}
        {activeTab === 'signups' && (
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-xl font-bold">Contractor Signups (Sales Pipeline)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Company</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Contact</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">County</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {signups.map((signup) => (
                    <tr key={signup.id} className="hover:bg-gray-700">
                      <td className="px-6 py-4 text-sm">{new Date(signup.submitted_at).toLocaleDateString()}</td>
                      <td className="px-6 py-4">
                        <div className="font-medium">{signup.company_name}</div>
                        <div className="text-sm text-gray-400">{signup.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div>{signup.contact_name}</div>
                        <div className="text-sm text-blue-400">{signup.phone}</div>
                      </td>
                      <td className="px-6 py-4 text-sm">{signup.county}</td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleDeleteSignup(signup.id)}
                          className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm font-medium transition"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CALENDAR TAB */}
        {activeTab === 'calendar' && (
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-xl font-bold">Scheduled Sales Calls</h3>
              <p className="text-sm text-gray-400 mt-1">{bookings.length} upcoming calls</p>
            </div>
            <div className="overflow-x-auto">
              {bookings.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  No scheduled calls yet
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Date & Time</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Company</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Contact</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">County</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {bookings.map((booking) => {
                      const bookingDate = new Date(booking.scheduled_date);
                      const isToday = bookingDate.toDateString() === new Date().toDateString();
                      const isPast = bookingDate < new Date();

                      return (
                        <tr key={booking.id} className={`hover:bg-gray-700 ${isToday ? 'bg-blue-900/30' : ''}`}>
                          <td className="px-6 py-4">
                            <div className="font-medium">{bookingDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                            <div className="text-sm text-blue-400">{booking.scheduled_time}</div>
                            {isToday && <div className="text-xs text-green-400 font-semibold mt-1">TODAY</div>}
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-medium">{booking.company_name}</div>
                            <div className="text-sm text-gray-400">{booking.email}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div>{booking.contact_name}</div>
                            <div className="text-sm text-blue-400">{booking.phone}</div>
                          </td>
                          <td className="px-6 py-4 text-sm">{booking.county}</td>
                          <td className="px-6 py-4">
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize ${
                              booking.status === 'scheduled' ? 'bg-blue-600' :
                              booking.status === 'completed' ? 'bg-green-600' :
                              booking.status === 'cancelled' ? 'bg-red-600' :
                              'bg-gray-600'
                            }`}>
                              {booking.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
