import { expect, it } from '@jest/globals';
import { withBuild284ReminderKeys } from './build-284-reminder-keys';

const draft = {
  reminderKey: 'reminder.tea',
  text: 'Чай',
  localDate: '2026-11-25',
  localTime: '12:00',
};
const result = {
  scheduledReminders: [draft, { ...draft }],
  scheduledReminderUpdates: [{ reminderKey: 'nemory:old%3Akey' }],
};

it('keeps keys stable across retries and distinct between actions, turns and owners', () => {
  const keys = (turn: string, user = 1) =>
    withBuild284ReminderKeys(
      result,
      '284',
      user,
      'dialog',
      turn,
    ).scheduledReminders.map((r) => r.reminderKey);
  const [first, second] = keys('source%3Aturn');
  expect(first).toMatch(/^nemory:[a-f0-9]+-0$/);
  expect(decodeURIComponent(first)).toBe(first);
  expect(second).not.toBe(first);
  expect(keys('source%3Aturn')).toEqual([first, second]);
  expect(keys('another')[0]).not.toBe(first);
  expect(keys('source%3Aturn', 2)[0]).not.toBe(first);
  expect(
    withBuild284ReminderKeys(result, '284', 1, 'dialog', 'turn')
      .scheduledReminderUpdates,
  ).toBe(result.scheduledReminderUpdates);
});

it.each(['283', '285', '289', undefined])(
  'preserves the contract for build %s',
  (build) => {
    expect(withBuild284ReminderKeys(result, build, 1, 'dialog', 'turn')).toBe(
      result,
    );
  },
);
