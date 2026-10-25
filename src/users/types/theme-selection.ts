import { BadRequestException } from '@nestjs/common';

export const themeFamilies = [
  'neutral',
  'trail',
  'orbit',
  'coast',
  'dunes',
  'sakura',
  'rainyCity',
  'lemonCourtyard',
  'graphite',
  'pistachio',
  'ruby',
  'cocoa',
] as const;
export type ThemeSelection = {
  family: (typeof themeFamilies)[number];
  mode: 'light' | 'dark' | 'system';
  customEnabled?: boolean;
  custom?: { family: (typeof themeFamilies)[number]; mode: 'light' | 'dark' };
};

/** Device file paths never belong in account settings. Old theme remains compatible. */
export function validateThemeSelection(raw: unknown): ThemeSelection {
  const value = raw as ThemeSelection | null;
  if (
    !value ||
    !themeFamilies.includes(value.family) ||
    !['light', 'dark', 'system'].includes(value.mode) ||
    (value.customEnabled !== undefined &&
      typeof value.customEnabled !== 'boolean') ||
    (value.customEnabled &&
      (!value.custom ||
        !themeFamilies.includes(value.custom.family) ||
        !['light', 'dark'].includes(value.custom.mode)))
  ) {
    throw new BadRequestException('Invalid theme selection');
  }
  return {
    family: value.family,
    mode: value.mode,
    ...(value.customEnabled
      ? {
          customEnabled: true,
          custom: { family: value.custom!.family, mode: value.custom!.mode },
        }
      : {}),
  };
}
