import { describe, expect, it } from '@jest/globals';
import { buildAdvertisingRollout } from './advertising-rollout';

const flags = {
  todayNative: 'ADVERTISING_NATIVE_TODAY_ENABLED',
  banner: 'ADVERTISING_BANNER_ENABLED',
  interstitial: 'ADVERTISING_INTERSTITIAL_ENABLED',
  rewarded: 'ADVERTISING_REWARDED_ENABLED',
  rewardedInterstitial: 'ADVERTISING_REWARDED_INTERSTITIAL_ENABLED',
  appOpen: 'ADVERTISING_APP_OPEN_ENABLED',
};

describe('advertising rollout switches', () => {
  it('defaults every placement off, even with the master enabled', () => {
    expect(buildAdvertisingRollout({}).enabled).toBe(false);
    const rollout = buildAdvertisingRollout({ ADVERTISING_ENABLED: 'true' });
    expect(rollout.enabled).toBe(true);
    expect(Object.values(rollout.placements).every((value) => !value)).toBe(
      true,
    );
  });

  it.each(Object.entries(flags))(
    'enables only %s, then master disables it',
    (placement, flag) => {
      const env = { ADVERTISING_ENABLED: 'true', [flag]: 'true' };
      expect(
        Object.entries(buildAdvertisingRollout(env).placements)
          .filter(([, enabled]) => enabled)
          .map(([key]) => key),
      ).toEqual([placement]);
      env.ADVERTISING_ENABLED = 'false';
      expect(
        Object.values(buildAdvertisingRollout(env).placements).every(
          (value) => !value,
        ),
      ).toBe(true);
    },
  );

  it.each(['false', 'TRUE', '1', '', undefined])(
    'does not interpret %s as enabled',
    (value) => {
      const env = Object.fromEntries(
        Object.values(flags).map((flag) => [flag, value]),
      );
      const rollout = buildAdvertisingRollout({
        ...env,
        ADVERTISING_ENABLED: 'true',
      });
      expect(
        Object.values(rollout.placements).every((enabled) => !enabled),
      ).toBe(true);
    },
  );
});
