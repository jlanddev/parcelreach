import { NextResponse } from 'next/server';

// Lightweight: does the app currently send for real? Lets the UI show accurate
// copy ("LIVE" vs "safe mode") instead of a hardcoded guess.
export async function GET() {
  return NextResponse.json({
    ok: true,
    live: process.env.CAMPAIGNS_LIVE === 'true',
    maxPerRun: Math.max(1, Number(process.env.CAMPAIGN_MAX_PER_RUN) || 8),
  });
}
