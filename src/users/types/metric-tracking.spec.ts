import { describe, it, expect } from '@jest/globals';
import { validateMetricTracking } from './metric-tracking';
const custom = {
  id: 'custom:12345678-1234-4123-8123-123456789abc',
  name: 'Endurance',
  kind: 'scale5' as const,
  icon: 'leaf-outline',
  lowLabel: 'Low',
  highLabel: 'High',
};
const config = {
  version: 1 as const,
  activeIds: ['energy', custom.id],
  customMetrics: [custom],
};
describe('metric tracking contract', () => {
  it('preserves custom definitions, order and explicit empty selection', () => {
    expect(validateMetricTracking(config)).toEqual(config);
    expect(
      validateMetricTracking({ ...config, activeIds: [] }, config).activeIds,
    ).toEqual([]);
  });
  it.each([
    'flag-outline',
    'cloud-outline',
    'compass-outline',
    'thumbs-up-outline',
    'trail-sign-outline',
    'extension-puzzle-outline',
    'pencil-outline',
    'headset-outline',
    'boat-outline',
    'flower-outline',
    'water-outline',
    'bicycle-outline',
    'paw-outline',
    'planet-outline',
    'telescope-outline',
    'key-outline',
    'hourglass-outline',
    'diamond-outline',
    'bonfire-outline',
    'state:neutral',
    'state:sad',
    'state:joy',
    'state:tense',
    'state:brain',
    'state:loop',
    'state:maze',
    'state:clarity',
    'state:balance',
    'state:anchor',
    'state:safety',
    'state:roots',
    'state:reserve',
    'state:lightness',
    'state:relax',
    'state:recovery',
    'state:hand',
    'state:breath',
    'state:endurance',
    'state:movement',
    'state:support',
    'state:closeness',
    'state:dialogue',
    'state:connection',
    'state:aim',
    'state:progress',
    'state:decision',
    'state:perspective',
    'mono:Н',
    'mono:ЯС',
    'mono:Ł',
    'mono:Ä',
  ])('accepts the new selectable icon %s', (icon) => {
    const next = { ...config, customMetrics: [{ ...custom, icon }] };
    expect(validateMetricTracking(next, config)).toEqual(next);
  });
  it.each([
    null,
    {},
    { ...config, version: 2 },
    { ...config, activeIds: ['unknown'] },
    { ...config, activeIds: ['energy', 'energy'] },
    { ...config, customMetrics: [{ ...custom, icon: 'unknown' }] },
    { ...config, customMetrics: [{ ...custom, highLabel: 'Low' }] },
    { ...config, customMetrics: [custom, custom] },
  ])('rejects invalid payload %p', (value) => {
    expect(() => validateMetricTracking(value)).toThrow();
  });
  it('rejects deleting definitions or changing the meaning of a saved scale', () => {
    expect(() =>
      validateMetricTracking(
        { version: 1, activeIds: [], customMetrics: [] },
        config,
      ),
    ).toThrow();
    expect(() =>
      validateMetricTracking(
        { ...config, customMetrics: [{ ...custom, lowLabel: 'Changed' }] },
        config,
      ),
    ).toThrow();
  });
});

it('accepts legacy mood tracking but removes its numeric duplicate', () => {
  expect(
    validateMetricTracking({
      ...config,
      activeIds: ['mood', ...config.activeIds],
    }),
  ).toEqual(config);
});

it.each([
  'mono:',
  'mono:ABC',
  'mono:1',
  'mono:🙂',
  'mono:A B',
  'state:unknown',
])('rejects invalid icon %s', (icon) => {
  expect(() =>
    validateMetricTracking({ ...config, customMetrics: [{ ...custom, icon }] }),
  ).toThrow();
});

it.each(['higher-better', 'lower-better', 'neutral'] as const)(
  'persists direction %s without changing the meaning of a saved scale',
  (colorDirection) => {
    const next = { ...config, customMetrics: [{ ...custom, colorDirection }] };
    expect(validateMetricTracking(next, config)).toEqual(next);
    expect(validateMetricTracking(config, config)).toEqual(config);
  },
);
it.each(['reverse', '', null, 1, {}, []])(
  'rejects invalid color direction %p',
  (colorDirection) => {
    expect(() =>
      validateMetricTracking({
        ...config,
        customMetrics: [{ ...custom, colorDirection }],
      }),
    ).toThrow();
  },
);
