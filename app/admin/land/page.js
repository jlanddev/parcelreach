'use client';

// The CRM is a large client-only app (maps, realtime, browser-only state).
// Load it with ssr:false so it NEVER renders on the server — this prevents
// build-time prerender crashes and request-time SSR 500s. The real UI lives in
// ./LandApp.js.
import dynamic from 'next/dynamic';

const LandApp = dynamic(() => import('./LandApp'), {
  ssr: false,
  loading: () => <div className="min-h-screen bg-slate-900" />,
});

export default function Page() {
  return <LandApp />;
}
