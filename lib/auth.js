import { supabase } from './supabase';

export const auth = {
  // Login
  login: async (email, password) => {
    try {
      console.log('Attempting login for:', email);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Auth error:', error);
        return { success: false, error: error.message };
      }

      console.log('Auth successful');
      return { success: true, session: data.session };
    } catch (err) {
      console.error('Login exception:', err);
      return { success: false, error: 'Login failed' };
    }
  },

  // Signup
  signup: async (userData) => {
    try {
      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: userData.email,
        password: userData.password,
      });

      if (authError) {
        return { success: false, error: authError.message };
      }

      // Create contractor profile
      const { data: contractor, error: contractorError } = await supabase
        .from('contractors')
        .insert([{
          id: authData.user.id,
          email: userData.email,
          phone: userData.phone,
          name: userData.name,
          company_name: userData.companyName,
          counties: userData.counties || [],
          job_types: userData.job_types || ['residential', 'commercial'],
          daily_lead_cap: userData.daily_lead_cap || 5,
          price_per_lead: userData.price_per_lead || 25.00,
          status: 'active',
        }])
        .select()
        .single();

      if (contractorError) {
        return { success: false, error: 'Failed to create contractor profile' };
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem('parcelreach_current_user', JSON.stringify(contractor));
      }

      return { success: true, user: contractor };
    } catch (err) {
      return { success: false, error: 'Signup failed' };
    }
  },

  // Get current user (synchronous, safe for SSR)
  getCurrentUser: () => {
    if (typeof window === 'undefined') return null;
    const user = localStorage.getItem('parcelreach_current_user');
    return user ? JSON.parse(user) : null;
  },

  // Logout
  logout: async () => {
    await supabase.auth.signOut();
    if (typeof window !== 'undefined') {
      localStorage.removeItem('parcelreach_current_user');
    }
  },

  // Check if logged in
  isAuthenticated: () => {
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem('parcelreach_current_user');
  },
};

// Get leads from database
export const getLeads = async (contractorId) => {
  try {
    const { data: leads, error } = await supabase
      .from('leads')
      .select('*')
      .eq('contractor_id', contractorId)
      .order('submitted_at', { ascending: false });

    if (error) {
      console.error('Error fetching leads:', error);
      return [];
    }

    return leads || [];
  } catch (err) {
    console.error('Error:', err);
    return [];
  }
};
