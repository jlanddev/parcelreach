// Force the CRM to render dynamically on every request so the CDN never serves a
// stale prerendered HTML shell that points at old JS chunks. This was the cause of
// deploys "not going live" (the page was cached ~25h and loaded old code).
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default function LandAdminLayout({ children }) {
  return children;
}
