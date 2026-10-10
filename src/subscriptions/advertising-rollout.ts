/** Runtime switches only; subscription entitlement and UMP remain independent gates. */
export function buildAdvertisingRollout(env = process.env) {
  const enabled = env.ADVERTISING_ENABLED === 'true';
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const raw = env[key];
    if (!raw || !/^\d+$/.test(raw)) return fallback;
    const value = Number(raw);
    return Number.isSafeInteger(value) && value >= min && value <= max
      ? value
      : fallback;
  };
  return {
    enabled,
    interstitialPolicy: {
      testOnly: env.ADVERTISING_INTERSTITIAL_TEST_ONLY !== 'false',
      minSessionSeconds: integer(
        'ADVERTISING_INTERSTITIAL_MIN_SESSION_SECONDS',
        0,
        0,
        86400,
      ),
      minIntervalSeconds: integer(
        'ADVERTISING_INTERSTITIAL_MIN_INTERVAL_SECONDS',
        180,
        15,
        86400,
      ),
      completedFlows: integer(
        'ADVERTISING_INTERSTITIAL_COMPLETED_FLOWS',
        1,
        1,
        100,
      ),
      maxPerSession: integer(
        'ADVERTISING_INTERSTITIAL_MAX_PER_SESSION',
        1,
        1,
        20,
      ),
      maxPerDay: integer('ADVERTISING_INTERSTITIAL_MAX_PER_DAY', 2, 1, 20),
    },
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
