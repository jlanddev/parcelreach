// Admin-only Change Log feed for the CRM "Change Log" tab. Replaces the former
// PUBLIC /changelog-tracking.md (which exposed customer names + deal values on the
// open website). The source of truth stays docs/CHANGELOG-tracking.md in the repo;
// this route reads it at runtime and serves it only to a logged-in admin.
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

async function isAdmin(req) {
  const m = (req.headers.get('authorization') || '').match(/^Bearer (.+)$/);
  if (!m) return false;
  try {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const { data } = await anon.auth.getUser(m[1]);
    const uid = data?.user?.id;
    if (!uid) return false;
    const { data: urow } = await supabaseAdmin().from('users').select('role').eq('id', uid).maybeSingle();
    return urow?.role === 'admin';
  } catch { return false; }
}

export async function GET(req) {
  if (!(await isAdmin(req))) {
    return new Response('forbidden', { status: 403 });
  }
  try {
    const p = path.join(process.cwd(), 'docs', 'CHANGELOG-tracking.md');
    const text = fs.readFileSync(p, 'utf8');
    return new Response(text, {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store, private', 'x-robots-tag': 'noindex' },
    });
  } catch (e) {
    return new Response('Change log is maintained in the repo at docs/CHANGELOG-tracking.md (not served here).', {
      status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
}
