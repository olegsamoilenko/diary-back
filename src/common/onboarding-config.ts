/** Server-selected onboarding; older clients fall back for unknown variants. */
export function buildOnboardingConfig(env: NodeJS.ProcessEnv = process.env) {
  const variant = ['pastel-refined', 'quick-start', 'direct-entry'].includes(
    env.ONBOARDING_WELCOME_VARIANT ?? '',
  )
    ? env.ONBOARDING_WELCOME_VARIANT!
    : 'journal-collage';
  const raw = env.ONBOARDING_WELCOME_CAMPAIGN?.trim();
  const campaign =
    raw && /^[a-zA-Z0-9_-]{1,64}$/.test(raw) ? raw : 'welcome-v1';
  return { schemaVersion: 1, variant, campaign };
}
