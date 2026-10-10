import { describe, expect, it } from '@jest/globals';
import { buildOnboardingConfig } from './onboarding-config';
import { AppController } from '../app.controller';
import { AppService } from '../app.service';

describe('public onboarding config', () => {
  it('preserves collage for absent or unsupported server values', () => {
    expect(buildOnboardingConfig({})).toEqual({
      schemaVersion: 1,
      variant: 'journal-collage',
      campaign: 'welcome-v1',
    });
    expect(
      buildOnboardingConfig({
        ONBOARDING_WELCOME_VARIANT: 'central-diary',
        ONBOARDING_WELCOME_CAMPAIGN: '<html>',
      }),
    ).toEqual(buildOnboardingConfig({}));
  });
  it('allows the retained book and bounded campaign label', () => {
    expect(
      buildOnboardingConfig({
        ONBOARDING_WELCOME_VARIANT: 'pastel-refined',
        ONBOARDING_WELCOME_CAMPAIGN: 'book-20261008',
      }),
    ).toEqual({
      schemaVersion: 1,
      variant: 'pastel-refined',
      campaign: 'book-20261008',
    });
  });
  it('serves current environment without changing the old tooltip contract', () => {
    const controller = new AppController(new AppService());
    expect(controller.onboardingConfig()).toEqual(buildOnboardingConfig());
    expect(controller.isShowWelcomeTooltip()).toBe(false);
  });
});
