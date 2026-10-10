/** Same environment-based rollout mechanism as advertising; only bundled art is selectable. */
export function buildOnboardingConfig(env: NodeJS.ProcessEnv = process.env) {
  const variant =
    env.ONBOARDING_WELCOME_VARIANT === 'pastel-refined'
      ? 'pastel-refined'
      : 'journal-collage';
  const raw = env.ONBOARDING_WELCOME_CAMPAIGN?.trim();
  const campaign =
    raw && /^[a-zA-Z0-9_-]{1,64}$/.test(raw) ? raw : 'welcome-v1';
  return { schemaVersion: 1, variant, campaign };
}
