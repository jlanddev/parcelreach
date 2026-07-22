import { redirect } from 'next/navigation';

// Public marketing landing retired. ParcelReach is an in-house tool now, so the
// root path goes straight to the login. The original landing page lives in git
// history if it is ever needed again.
export default function Home() {
  redirect('/login');
}
