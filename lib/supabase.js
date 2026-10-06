import { createClient } from '@supabase/supabase-js';

// Fall back to harmless placeholders so the module never throws "supabaseUrl is
// required" during a build/prerender where the env isn't present. At runtime in
// the browser the real NEXT_PUBLIC_* values are inlined, so the real client is
// used; the placeholder only ever applies in an env-less build step.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
