/**
 * Every sign-in path — magic link, Apple, Google — lands a session and then
 * needs the same answer: has this profile finished onboarding yet? Decided
 * once here so no entry point can accidentally skip it.
 */
export function resolvePostSignInPath(
  onboardingCompletedAt: string | null,
): '/profile' | '/onboarding' {
  return onboardingCompletedAt ? '/profile' : '/onboarding';
}
