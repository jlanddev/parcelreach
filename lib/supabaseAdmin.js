/**
 * Service-role Supabase client for server routes that run without a user
 * session (webhooks) or that must bypass RLS. NEVER import this into client
 * components — it carries the service-role key.
 */
import { createClient } from '@supabase/supabase-js';

export function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Find a lead by phone, matching on the last 10 digits across phone/owner_phone
 * regardless of stored formatting. Returns the lead row or null. */
export async function findLeadByPhone(supabase, phone) {
  const d = (phone || '').replace(/\D/g, '').slice(-10);
  if (d.length < 10) return null;
  const last4 = d.slice(-4);
  // Prefilter on the last 4 digits (cheap), then confirm an exact 10-digit match.
  // NOTE: leads has `phone` only (no owner_phone column).
  const { data } = await supabase
    .from('leads')
    .select('id, phone, status, pipeline_status, full_name, name, current_owner_id')
    .ilike('phone', `%${last4}%`)
    .limit(50);
  if (!data) return null;
  const norm = (p) => (p || '').replace(/\D/g, '').slice(-10);
  return data.find((l) => norm(l.phone) === d) || null;
}
