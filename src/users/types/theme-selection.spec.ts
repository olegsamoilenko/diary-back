import { validateThemeSelection } from './theme-selection';
import { describe, it, expect } from '@jest/globals';
describe('account theme selection', () => {
  it('accepts presets and strips device file paths', () => {
    expect(
      validateThemeSelection({
        family: 'trail',
        mode: 'system',
        imageUri: 'file:///private',
      }),
    ).toEqual({ family: 'trail', mode: 'system' });
    expect(
      validateThemeSelection({
        family: 'neutral',
        mode: 'dark',
        customEnabled: true,
        custom: { family: 'coast', mode: 'light', imageUri: 'file:///private' },
      }),
    ).toEqual({
      family: 'neutral',
      mode: 'dark',
      customEnabled: true,
      custom: { family: 'coast', mode: 'light' },
    });
  });
  it.each([
    null,
    {},
    { family: 'unknown', mode: 'dark' },
    { family: 'trail', mode: 'unknown' },
    { family: 'trail', mode: 'dark', customEnabled: true },
    { family: 'trail', mode: 'dark', customEnabled: 'yes' },
  ])('rejects malformed selections %j', (value) => {
    expect(() => validateThemeSelection(value)).toThrow(
      'Invalid theme selection',
    );
  });
});
