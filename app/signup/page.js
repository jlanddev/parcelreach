import { redirect } from 'next/navigation';

// Public signup retired (in-house tool). Original flow is in git history.
export default function Signup() {
  redirect('/login');
}
