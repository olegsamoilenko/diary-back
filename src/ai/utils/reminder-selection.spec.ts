import { describe, expect, it } from '@jest/globals';
import { selectedReminderKey } from './reminder-selection';

const active = [
  { reminderKey: 'a', text: 'Зустріч із Марією', localDate: '2026-11-07', localTime: '10:00' },
  { reminderKey: 'b', text: 'Зустріч із Марією', localDate: '2026-11-07', localTime: '15:00' },
  { reminderKey: 'c', text: 'Зателефонувати лікарю', localDate: '2026-11-08', localTime: '15:00' },
];
const prior = 'Яке нагадування скасувати?\n1. Зустріч із Марією — 2026-11-07 10:00\n2. Зустріч із Марією — 2026-11-07 15:00';
const select = (userText: string, rows = active, previousAssistantText = prior) => selectedReminderKey({ userText, active: rows, previousActiveReminders: active, previousAssistantText, currentLocalDate: '2026-11-06' });
describe('reminder selection before mutations', () => {
  it.each(['Скасуй нагадування про подію на завтра', 'Скасуй нагадування Зустріч із Марією', 'Скасуй нагадування о 15:00'])('refuses ambiguity: %s', text => expect(select(text)).toBeNull());
  it('resolves an exact title and local day/time', () => expect(select('Скасуй нагадування Зустріч із Марією завтра о 15:00')).toBe('b'));
  it('accepts an unambiguous clock and day without requiring title', () => expect(select('Скасуй нагадування завтра о 15:00')).toBe('b'));
  it('binds the ordinal to the displayed list, never active-list order', () => expect(select('Друге', [...active].reverse())).toBe('b'));
  it('rejects a deleted selection even when another reminder shares its clock', () => expect(select('Друге', active.filter(x => x.reminderKey !== 'b'))).toBeNull());
  it('rejects a renamed selection', () => expect(select('Друге', active.map(x => x.reminderKey === 'b' ? { ...x, text: 'Інша подія' } : x))).toBeNull());
  it('rejects a replacement with identical title/time but different ID', () => expect(select('Друге', active.map(x => x.reminderKey === 'b' ? { ...x, reminderKey: 'new' } : x))).toBeNull());
  it('fails closed after losing the prior identity context', () => expect(selectedReminderKey({ userText: 'Друге', active, previousAssistantText: prior })).toBeNull());
  it('rejects a moved selection', () => expect(select('Друге', active.map(x => x.reminderKey === 'b' ? { ...x, localTime: '16:00' } : x))).toBeNull());
  it.each(['Не скасовуй нагадування Зателефонувати лікарю', 'Якщо я скажу скасуй нагадування Зателефонувати лікарю', 'Скасуй нагадування Зателефонувати лікарю, якщо я не відповім', 'Вчора я просив: скасуй нагадування Зателефонувати лікарю', '«Скасуй нагадування Зателефонувати лікарю»', 'Скасуй видалення нагадування Зателефонувати лікарю'])('ignores unauthorized language: %s', text => expect(select(text)).toBeNull());
  it('rejects a bare yes without a specific cancellation question', () => expect(select('Так')).toBeNull());
  it('accepts yes for one explicit confirmation', () => expect(select('Так', active, 'Скасувати нагадування «Зателефонувати лікарю» 2026-11-08 о 15:00?')).toBe('c'));
  it('does not use a clock from a differently named target', () => expect(select('Скасуй нагадування Інша подія 2026-11-07 о 10:00')).toBeNull());
});
