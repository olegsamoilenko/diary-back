export type MetricColorDirection = 'higher-better' | 'lower-better' | 'neutral';
import { BadRequestException } from '@nestjs/common';
export type CustomMetric = {
  id: string;
  name: string;
  icon: string;
  colorDirection?: MetricColorDirection;
  kind: 'scale5';
  lowLabel: string;
  highLabel: string;
};
export type MetricTracking = {
  version: 1;
  activeIds: string[];
  customMetrics: CustomMetric[];
};
const BUILTIN_IDS = [
  'energy',
  'focus',
  'stress',
  'motivation',
  'sleepQuality',
  'physicalWellbeing',
  'activity',
  'appetite',
  'mentalClarity',
  'willpower',
  'mood',
  'anxiety',
  'loneliness',
  'selfConfidence',
  'optimism',
  'selfSatisfaction',
  'lifeSatisfaction',
];
const ICONS = [
  'flash-outline',
  'scan-outline',
  'pulse-outline',
  'flame-outline',
  'moon-outline',
  'body-outline',
  'walk-outline',
  'restaurant-outline',
  'bulb-outline',
  'fitness-outline',
  'happy-outline',
  'thunderstorm-outline',
  'person-outline',
  'shield-checkmark-outline',
  'sunny-outline',
  'ribbon-outline',
  'heart-outline',
  'leaf-outline',
  'book-outline',
  'musical-notes-outline',
  'cafe-outline',
  'barbell-outline',
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
];

function invalid(): never {
  throw new BadRequestException('Invalid metric tracking settings');
}
function text(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= max &&
    value === value.trim()
  );
}
export function validateMetricTracking(
  input: unknown,
  previous?: MetricTracking | null,
): MetricTracking {
  if (!input || typeof input !== 'object') return invalid();
  const v = input as MetricTracking;
  if (
    v.version !== 1 ||
    !Array.isArray(v.activeIds) ||
    !Array.isArray(v.customMetrics) ||
    v.customMetrics.length > 100 ||
    v.activeIds.length > 117
  )
    return invalid();
  const seen = new Set<string>(BUILTIN_IDS);
  const names = new Set<string>();
  const customMetrics = v.customMetrics.map((m) => {
    if (
      !m ||
      typeof m !== 'object' ||
      typeof m.id !== 'string' ||
      !/^custom:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        m.id,
      ) ||
      seen.has(m.id) ||
      m.kind !== 'scale5' ||
      !(
        typeof m.icon === 'string' &&
        (ICONS.includes(m.icon) || /^mono:[\p{L}]{1,2}$/u.test(m.icon))
      ) ||
      (m.colorDirection !== undefined &&
        !['higher-better', 'lower-better', 'neutral'].includes(
          m.colorDirection,
        )) ||
      !text(m.name, 60) ||
      !text(m.lowLabel, 60) ||
      !text(m.highLabel, 60) ||
      m.lowLabel.toLocaleLowerCase() === m.highLabel.toLocaleLowerCase()
    )
      return invalid();
    const key = m.name.toLocaleLowerCase();
    if (names.has(key)) return invalid();
    names.add(key);
    seen.add(m.id);
    return {
      id: m.id,
      name: m.name,
      icon: m.icon,
      ...(m.colorDirection === undefined
        ? {}
        : { colorDirection: m.colorDirection }),
      kind: 'scale5' as const,
      lowLabel: m.lowLabel,
      highLabel: m.highLabel,
    };
  });
  if (
    v.activeIds.some((id) => typeof id !== 'string' || !seen.has(id)) ||
    new Set(v.activeIds).size !== v.activeIds.length
  )
    return invalid();
  // Disabling never deletes a definition or changes the meaning of historical values.
  for (const old of previous?.customMetrics ?? []) {
    const next = customMetrics.find((m) => m.id === old.id);
    if (
      !next ||
      next.kind !== old.kind ||
      next.lowLabel !== old.lowLabel ||
      next.highLabel !== old.highLabel
    )
      return invalid();
  }
  return {
    version: 1,
    activeIds: v.activeIds.filter((id) => id !== 'mood'),
    customMetrics,
  };
}
