import { redirect } from 'next/navigation';

// Public free-onboarding retired (in-house tool). Original flow is in git history.
export default function OnboardingFree() {
  redirect('/login');
}
