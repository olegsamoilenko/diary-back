import { expect, it, jest } from '@jest/globals';
import { AddOnboardingVariant1791763200000 } from './1791763200000-AddOnboardingVariant';

it('adds a nullable attribution without inventing a cohort for existing users', async () => {
  const query = jest.fn();
  await new AddOnboardingVariant1791763200000().up({ query } as any);
  expect(query).toHaveBeenCalledTimes(1);
  expect(query).toHaveBeenCalledWith(expect.stringContaining('ADD COLUMN IF NOT EXISTS "onboardingVariant" varchar(32) DEFAULT NULL'));
});
