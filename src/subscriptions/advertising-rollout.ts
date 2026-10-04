/** Runtime switches only; subscription entitlement and UMP remain independent gates. */
export function buildAdvertisingRollout(env = process.env) {
  const enabled = env.ADVERTISING_ENABLED === 'true';
  return {
    enabled,
    placements: {
      todayNative: enabled && env.ADVERTISING_NATIVE_TODAY_ENABLED === 'true',
      banner: enabled && env.ADVERTISING_BANNER_ENABLED === 'true',
      interstitial: enabled && env.ADVERTISING_INTERSTITIAL_ENABLED === 'true',
      rewarded: enabled && env.ADVERTISING_REWARDED_ENABLED === 'true',
      rewardedInterstitial:
        enabled && env.ADVERTISING_REWARDED_INTERSTITIAL_ENABLED === 'true',
      appOpen: enabled && env.ADVERTISING_APP_OPEN_ENABLED === 'true',
    },
  };
}
