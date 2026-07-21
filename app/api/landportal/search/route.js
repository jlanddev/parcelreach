import { NextResponse } from 'next/server';
import { searchProperties, LandPortalError } from '@/lib/landportal';

// POST /api/landportal/search
// Accepts our clean parameter schema (see lib/landportal-filters.mjs) and returns
// a normalized, cached, guarded envelope. The Land Portal token never leaves the
// server. Every successful non-empty filter burns 1 daily quota unit; identical
// same-day searches return from cache (cached:true) and burn zero.
export async function POST(request) {
  try {
    const params = await request.json();
    const noCache = params && params.__noCache === true;
    if (params) delete params.__noCache;
    const result = await searchProperties(params || {}, { noCache });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof LandPortalError) {
      // Map to clean, user-facing messages. rejected-MLS is fatal by design.
      const userMessage =
        err.code === 'mls_access_denied' ? 'This account does not have MLS data access.'
        : err.code === 'unauthorized' ? 'Land Portal token is invalid or expired.'
        : err.code === 'forbidden' ? 'Your Land Portal plan does not allow this request.'
        : err.code === 'rate_limited' ? 'Land Portal rate/quota limit reached. Try again shortly.'
        : err.code === 'network' ? 'Could not reach Land Portal. Try again.'
        : err.message || 'Land Portal request failed.';
      return NextResponse.json(
        { ok: false, code: err.code, error: userMessage, request_id: err.requestId, fields: err.fields },
        { status: err.status || 500 }
      );
    }
    console.error('[landportal search]', err);
    return NextResponse.json({ ok: false, code: 'internal', error: err.message || 'Search failed' }, { status: 500 });
  }
}
