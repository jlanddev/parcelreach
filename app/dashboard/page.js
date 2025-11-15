'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth, getLeads } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import dynamicImport from 'next/dynamic';

// Dynamically import map to avoid SSR issues
const LeadsMap = dynamicImport(() => import('@/components/LeadsMap'), {
  ssr: false,
  loading: () => <div className="w-full h-96 bg-gray-100 rounded-lg animate-pulse" />
});

export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [leads, setLeads] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        router.push('/login');
        return;
      }

      // Fetch contractor by email
      const { data: contractor } = await supabase
        .from('contractors')
        .select('*')
        .eq('email', session.user.email)
        .single();

      if (!contractor) {
        router.push('/login');
        return;
      }

      setUser(contractor);

      // Fetch real leads from database
      const userLeads = await getLeads(contractor.id);
      setLeads(userLeads || []);
    };

    checkAuth();
  }, []);

  const handleLogout = () => {
    auth.logout();
    router.push('/');
  };

  const updateLeadStatus = (leadId, newStatus, jobValue = null) => {
    setLeads(leads.map(lead => {
      if (lead.id === leadId) {
        return {
          ...lead,
          status: newStatus,
          job_value: jobValue ? jobValue * 100 : lead.job_value,
        };
      }
      return lead;
    }));
  };

  // Calculate stats
  const totalLeads = leads.length;
  const totalSpent = leads.reduce((sum, lead) => sum + (lead.price_charged || 0), 0) / 100;
  const completedLeads = leads.filter(lead => lead.status === 'completed');
  const totalRevenue = completedLeads.reduce((sum, lead) => sum + (lead.job_value || 0), 0) / 100;
  const closeRate = totalLeads > 0 ? ((completedLeads.length / totalLeads) * 100).toFixed(1) : 0;
  const avgLeadValue = completedLeads.length > 0 ? (totalRevenue / completedLeads.length).toFixed(0) : 0;
  const roi = totalSpent > 0 ? (((totalRevenue / totalSpent - 1) * 100).toFixed(0)) : 0;

  const filteredLeads = filterStatus === 'all'
    ? leads
    : leads.filter(lead => lead.status === filterStatus);

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-2xl font-bold text-gray-900">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top Header */}
      <header className="bg-white shadow-sm z-20 flex-shrink-0">
        <div className="px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 hover:bg-gray-100 rounded"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <img src="/logo.png" alt="GarageLeadly" className="h-10 sm:h-12" />
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium text-gray-900">{user.companyName}</div>
              <div className="text-xs text-gray-500">{user.county}</div>
            </div>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-600 hover:text-gray-900 bg-gray-100 px-3 py-2 rounded"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout: Sidebar + Map */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Premium Dark Sidebar */}
        <aside className={`
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 transition-transform duration-300
          w-80 lg:w-96 bg-gradient-to-b from-slate-900 to-slate-800 border-r border-slate-700/50 shadow-2xl
          absolute lg:relative h-full z-10
          flex flex-col
        `}>
          {/* Premium Sidebar Header */}
          <div className="p-5 border-b border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
              </div>
              <div>
                <h2 className="text-white font-bold text-lg">Lead Map</h2>
                <p className="text-slate-400 text-sm">{leads.length} Active Leads</p>
              </div>
            </div>
          </div>

          {/* Premium Stats */}
          <div className="p-4 border-b border-slate-700/50">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-800/60 backdrop-blur-sm p-3 rounded-lg border border-slate-700/50">
                <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">New</div>
                <div className="text-2xl font-bold text-blue-400">
                  {leads.filter(l => l.status === 'new').length}
                </div>
              </div>
              <div className="bg-slate-800/60 backdrop-blur-sm p-3 rounded-lg border border-slate-700/50">
                <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Scheduled</div>
                <div className="text-2xl font-bold text-green-400">
                  {leads.filter(l => l.status === 'scheduled').length}
                </div>
              </div>
              <div className="bg-slate-800/60 backdrop-blur-sm p-3 rounded-lg border border-slate-700/50">
                <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Revenue</div>
                <div className="text-lg font-bold text-emerald-400">
                  ${totalRevenue.toLocaleString()}
                </div>
              </div>
              <div className="bg-slate-800/60 backdrop-blur-sm p-3 rounded-lg border border-slate-700/50">
                <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Close %</div>
                <div className="text-lg font-bold text-cyan-400">{closeRate}%</div>
              </div>
            </div>
          </div>

          {/* Premium Filter Tabs */}
          <div className="flex border-b border-slate-700/50 bg-slate-900/50 overflow-x-auto">
            {['all', 'new', 'called', 'scheduled', 'completed'].map(status => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap border-b-2 transition-all ${
                  filterStatus === status
                    ? 'border-blue-500 text-blue-400 bg-slate-800/50'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          {/* Premium Lead List */}
          <div className="flex-1 overflow-y-auto bg-slate-900/30">
            <div className="p-4 space-y-2">
              {filteredLeads.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <svg className="w-12 h-12 mx-auto mb-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                  <p className="text-sm font-medium">No {filterStatus !== 'all' ? filterStatus : ''} leads</p>
                </div>
              ) : (
                filteredLeads.map((lead) => (
                  <div
                    key={lead.id}
                    className="bg-slate-800/40 backdrop-blur-sm border border-slate-700/50 rounded-lg p-3 hover:bg-slate-800/60 hover:border-slate-600/50 transition-all cursor-pointer group"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 shadow-lg"
                        style={{
                          backgroundColor:
                            lead.status === 'new' ? '#60A5FA' :
                            lead.status === 'called' ? '#FBBF24' :
                            lead.status === 'scheduled' ? '#34D399' :
                            lead.status === 'completed' ? '#94A3B8' :
                            '#F87171',
                          boxShadow: `0 0 8px ${
                            lead.status === 'new' ? '#60A5FA' :
                            lead.status === 'called' ? '#FBBF24' :
                            lead.status === 'scheduled' ? '#34D399' :
                            lead.status === 'completed' ? '#94A3B8' :
                            '#F87171'
                          }40`
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-white text-sm truncate group-hover:text-blue-300 transition-colors">
                          {lead.name}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          {lead.phone}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          </svg>
                          <span className="truncate">{lead.address}</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                          {lead.issue_description}
                        </div>
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-700/50">
                          <span className={`px-2 py-0.5 text-xs font-semibold rounded ${
                            lead.status === 'new' ? 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/30' :
                            lead.status === 'scheduled' ? 'bg-green-500/20 text-green-300 ring-1 ring-green-500/30' :
                            lead.status === 'called' ? 'bg-yellow-500/20 text-yellow-300 ring-1 ring-yellow-500/30' :
                            lead.status === 'completed' ? 'bg-slate-500/20 text-slate-300 ring-1 ring-slate-500/30' :
                            'bg-red-500/20 text-red-300 ring-1 ring-red-500/30'
                          }`}>
                            {lead.status.toUpperCase()}
                          </span>
                          <div className="text-xs text-slate-500">
                            {new Date(lead.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Premium Quick Actions */}
          <div className="p-4 border-t border-slate-700/50 bg-slate-900/50">
            <button
              onClick={() => setActiveTab('settings')}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white py-2.5 rounded-lg font-semibold hover:from-blue-500 hover:to-blue-400 transition-all shadow-lg hover:shadow-blue-500/30 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings & Account
            </button>
          </div>
        </aside>

        {/* Map - Full Screen */}
        <div className="flex-1 relative">
          <LeadsMap leads={leads} />
        </div>

        {/* Mobile overlay when sidebar is open */}
        {sidebarOpen && (
          <div
            className="lg:hidden absolute inset-0 bg-black bg-opacity-50 z-5"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </div>

      {/* Settings Modal */}
      {activeTab === 'settings' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-900">Settings</h3>
              <button
                onClick={() => setActiveTab('overview')}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Territory & Budget */}
              <div>
                <h4 className="font-bold text-gray-900 mb-4">Territory & Budget</h4>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">County</label>
                    <div className="text-gray-900">{user.county}</div>
                    <p className="text-sm text-gray-500 mt-1">Contact support to change your territory</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Daily Budget: ${user.dailyBudget || 200}
                    </label>
                    <input
                      type="range"
                      min="50"
                      max="500"
                      step="50"
                      value={user.dailyBudget || 200}
                      onChange={(e) => {
                        const updatedUser = { ...user, dailyBudget: parseInt(e.target.value) };
                        setUser(updatedUser);
                        localStorage.setItem('garageleadly_current_user', JSON.stringify(updatedUser));
                      }}
                      className="w-full"
                    />
                    <div className="flex justify-between text-sm text-gray-500 mt-1">
                      <span>$50</span>
                      <span>$500</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Account Information */}
              <div>
                <h4 className="font-bold text-gray-900 mb-4">Account Information</h4>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                    <div className="text-gray-900">{user.companyName}</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <div className="text-gray-900">{user.email}</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <div className="text-gray-900">{user.phone}</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Membership Status</label>
                    <span className="px-2 py-1 text-xs font-medium rounded bg-green-100 text-green-700">
                      ACTIVE
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
