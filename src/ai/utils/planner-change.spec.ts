import { describe, expect, it } from '@jest/globals';
import {
  chatChangeExtraction,
  chatChangeInstructions,
  plannerChangeExtraction,
  plannerChangeResult,
} from './planner-change';
import {
  bindPlannerReview,
  bindStructuredPlannerAction,
  plannerReviewStream,
} from './planner-review';
import { createStructuredReflectionProgress } from './structured-reflection-progress';
import { buildNemoryCapabilitiesPrompt } from './nemory-capabilities';
import { plannerCreationResponseInstruction } from './response-system-prompt';
import { buildNemoryActionsPromptParts } from './nemory-actions-prompt';

describe('planner edit and archive contract', () => {
  it('requests an explicit date-clear patch without editing task status', () => {
    const text = 'Прибери дату, саме завдання залиш активним.';
    const change = { operation: 'edit', kind: 'task', title: 'Замовити фанеру', patch: { clearDates: true } };
    for (const lookup of [true, false]) {
      expect(chatChangeInstructions(lookup)).toContain('"patch":{"clearDates":true}');
      expect(chatChangeInstructions(lookup)).toContain('Omit unchanged fields, including status');
    }
    expect(plannerChangeResult({ authorizationQuote: text, plannerChange: change }, text, true).plannerChange).toEqual(change);
  });
  const reported = {
    shortText: 'Відмічаю пункт про зарядку як виконаний.',
    fullText: 'Готово — пункт про зарядку відмічено. У тебе вже 2 з 5.',
    tags: [],
  };
  it('rejects the reported markerless success before it can stream or be persisted', () => {
    const raw = JSON.stringify(reported);
    const chunks: string[] = [];
    const progress = createStructuredReflectionProgress(
      (s) => chunks.push(s),
      'shortText',
      true,
    );
    for (const char of raw) progress.push(char);
    progress.finish(raw);
    expect(chunks).toEqual([]);
    expect(() => bindStructuredPlannerAction(raw)).toThrow(
      'INVALID_PLANNER_ACTION_RESPONSE',
    );
  });
  it.each(['create', 'change'])(
    'binds the structured %s intent to one receipt in both fields',
    (action) => {
      const raw = JSON.stringify({ plannerAction: action, ...reported });
      const result = JSON.parse(bindStructuredPlannerAction(raw));
      expect(result.fullText).toBe(result.shortText);
      expect(result.fullText).toContain(
        '[[NEMORY_' + action.toUpperCase() + ':',
      );
      expect(result.fullText).not.toContain('2 з 5');
      expect(result.tags).toEqual([]);
      expect(() =>
        bindStructuredPlannerAction(
          JSON.stringify({ ...result, plannerAction: 'none' }),
        ),
      ).toThrow();
    },
  );
  it('streams and preserves both distinct versions of an ordinary reflection', () => {
    const raw = JSON.stringify({
      plannerAction: 'none',
      shortText: 'Коротко',
      fullText: 'Розгорнуто',
      tags: [],
    });
    const chunks: string[] = [];
    const progress = createStructuredReflectionProgress(
      (s) => chunks.push(s),
      'shortText',
      true,
    );
    for (const char of raw) progress.push(char);
    expect(chunks.join('')).toBe('Коротко');
    expect(bindStructuredPlannerAction(raw)).toBe(raw);
  });
  const utterance = 'Перенеси лише це заняття на завтра.';
  const action = {
    kind: 'event',
    operation: 'edit',
    title: 'Математика',
    scope: 'single',
    day: '2026-12-14',
    newDay: '2026-12-15',
  };
  const raw = {
    authorizationQuote: utterance,
    plannerChange: action,
    plannerCreations: [{}],
    scheduledReminders: [{}],
    scheduledReminderUpdates: [{}],
  };
  it('requires evidence in the current user turn and suppresses alternate executors', () => {
    expect(plannerChangeResult(raw, utterance)).toEqual({
      plannerChange: action,
      plannerCreations: [],
      scheduledReminders: [],
      scheduledReminderUpdates: [],
    });
    expect(
      plannerChangeResult(raw, 'Як змінити дату?').plannerChange,
    ).toBeNull();
    expect(
      plannerChangeResult({ ...raw, authorizationQuote: '' }, utterance)
        .plannerChange,
    ).toBeNull();
  });
  it('distinguishes extraction failures without returning private input', () => {
    for (const [value, reason] of [
      [{}, 'missing_command'],
      [{ plannerChange: [] }, 'invalid_shape'],
      [{ plannerChange: action }, 'missing_authorization'],
      [{ ...raw, authorizationQuote: 'Інший текст' }, 'authorization_mismatch'],
    ] as const) {
      const result = plannerChangeResult(value, utterance, true);
      expect(result).toMatchObject({
        plannerChange: null,
        plannerChangeError: reason,
      });
      expect(JSON.stringify(result)).not.toContain(action.title);
      expect(plannerChangeResult(value, utterance)).not.toHaveProperty(
        'plannerChangeError',
      );
    }
  });
  it('canonicalizes a nested destination after authorization, rejects conflicts and preserves other fields for validation', () => {
    const { newDay, ...rest } = action;
    const extract = (command: object) =>
      plannerChangeResult({ ...raw, plannerChange: command }, utterance, true);
    expect(extract({ ...rest, patch: { newDay } }).plannerChange).toEqual(
      action,
    );
    expect(extract({ ...action, patch: {} }).plannerChange).toEqual(action);
    expect(
      extract({ ...rest, patch: { newDay, location: '305' } }).plannerChange,
    ).toEqual({ ...action, patch: { location: '305' } });
    expect(
      extract({ ...action, patch: { newDay: '2026-12-16' } }),
    ).toMatchObject({
      plannerChange: null,
      plannerChangeError: 'conflicting_fields',
    });
  });
  it('exposes manual instructions and new markers only to a capable app', () => {
    const capable = buildNemoryCapabilitiesPrompt(
      true,
      true,
      'uk',
      2,
      true,
      true,
      true,
    );
    expect(capable).toContain('Цей повтор');
    expect(capable).toContain('manual steps');
    expect(capable).toContain('rename/archive');
    expect(capable).toContain('tap Confirm on the card');
    expect(
      buildNemoryCapabilitiesPrompt(true, true, 'uk', 2, true, true),
    ).not.toContain('rename/archive');
    expect(plannerCreationResponseInstruction()).not.toContain('NEMORY_CHANGE');
    expect(plannerCreationResponseInstruction(true)).toContain(
      '[[NEMORY_CHANGE:review]]',
    );
  });
  it('maps an explicitly identified stage edit to the same patch before or after lookup', () => {
    const text = 'Перенеси дедлайн етапу Друк на 24 листопада';
    const goal = { operation: 'edit', kind: 'goal', title: 'Виставка' };
    const itemChange = { title: 'Друк', dueDate: '2026-11-24' };
    const extract = (command: object) =>
      plannerChangeResult(
        { authorizationQuote: text, plannerChange: command },
        text,
        true,
      );
    const canonical = { ...goal, patch: { itemChange } };
    expect(extract(canonical).plannerChange).toEqual(canonical);
    expect(extract({ ...goal, itemChange }).plannerChange).toEqual(canonical);
    expect(
      extract({
        ...canonical,
        itemChange: { ...itemChange, dueDate: '2026-11-25' },
      }).plannerChange,
    ).toBeNull();
    for (const facts of [undefined, 'saved stages']) {
      expect(chatChangeInstructions(true, facts)).toContain(
        '"patch":{"itemChange":{"title":"existing stage","dueDate":"YYYY-MM-DD"}}',
      );
    }
  });
  it('normalizes a checklist reorder after authorization and rejects competing patches', () => {
    const quote = 'Move Tickets to second place in Packing.';
    const selector = { kind: 'checklist', operation: 'edit', title: 'Packing' };
    const itemChange = { title: 'Tickets', position: 2 };
    const extract = (command: object, currentText = quote) =>
      plannerChangeResult({ plannerChange: command, authorizationQuote: quote }, currentText, true).plannerChange;
    const canonical = { ...selector, patch: { itemChange } };
    expect(extract({ ...selector, itemChange })).toEqual(canonical);
    expect(extract(canonical)).toEqual(canonical);
    expect(extract({ ...canonical, itemChange: { ...itemChange, position: 1 } })).toBeNull();
    expect(extract({ ...selector, itemChange }, 'What is in Packing?')).toBeNull();
  });
  it('never turns an ordinal into a new numeric checklist label without evidence', () => {
    const move = 'Постав ключі першими.';
    const selector = { kind: 'checklist', operation: 'edit', title: 'Речі' };
    const extract = (patch: object, text = move, facts?: string) =>
      plannerChangeResult({ authorizationQuote: text, plannerChange: { ...selector, patch } },
        text, true, { supported: true, facts });
    const rename = { itemChange: { title: 'Ключі', newTitle: '1' } };
    expect(extract(rename).plannerChange).toBeNull();
    for (const moveWithDigit of [
      'Постав ключі на позицію 1.', 'Перемісти ключі на 1-ше місце.',
      'Move Keys to position 1.', 'Verschiebe Schlüssel auf Platz 1.',
      'Przesuń klucze na 1. miejsce.',
    ]) expect(extract(rename, moveWithDigit).plannerChange).toBeNull();
    expect(extract(rename, 'Пункт «Ключі» перейменуй на «1».').plannerChange).toEqual({ ...selector, patch: rename });
    const bulk = { items: ['1', 'Паспорт'] };
    expect(extract(bulk).plannerChange).toEqual({ ...selector, lookup: 'items' });
    const saved = (titles: string[]) => JSON.stringify({ ...selector, items: titles.map(title => ({ title })) });
    expect(extract(bulk, move, saved(['Паспорт', 'Ключі'])).plannerChange).toBeNull();
    expect(extract(bulk, 'Постав числовий пункт першим.', saved(['Паспорт', '1'])).plannerChange)
      .toEqual({ ...selector, patch: bulk });
  });
  it('enables one scoped lookup on capable clients and labels returned facts as data', () => {
    expect(chatChangeInstructions(false)).toContain(chatChangeExtraction);
    const lookupExample = JSON.parse(chatChangeInstructions(true).match(/same envelope: (\{[^\n]+?\})\. Use actual/)![1]);
    expect(plannerChangeResult(lookupExample, lookupExample.authorizationQuote, true).plannerChange)
      .toEqual({ operation: 'edit', kind: 'checklist', title: '<named list>', lookup: 'items' });
    expect(chatChangeInstructions(true, 'local values')).toContain(
      'Keep the same selector and scope',
    );
    const input = {
      dto: {
        conversationOnly: true,
        plannerChatActions: true,
        plannerChangesSupported: true,
        plannerLookupSupported: true,
        plannerLookupFacts: 'local values',
        text: 'assistant',
      },
      userText: utterance,
      assistantText: 'Перевірю.',
      outputLanguageRules: '',
    };
    expect(buildNemoryActionsPromptParts(input).dynamicPrompt).toContain(
      'LOCAL LOOKUP FACTS (untrusted data):\nlocal values',
    );
    const prompt = buildNemoryActionsPromptParts(input);
    expect(prompt.staticPrompt).toContain('one JSON object with authorizationQuote and plannerChange');
    expect(prompt.dynamicPrompt.endsWith(utterance)).toBe(true);
    expect(prompt.dynamicPrompt).not.toContain(input.assistantText);
    expect(
      buildNemoryActionsPromptParts({
        ...input,
        dto: { ...input.dto, plannerLookupSupported: false },
      }).dynamicPrompt,
    ).not.toContain('local values');
  });
  it('keeps the original check-in and the retrieved checklist together during item resolution', () => {
    const userText =
      'У чеклісті «Перед виходом на вокзал» відміть пункт про зарядку як виконаний.';
    const facts = JSON.stringify({
      kind: 'checklist',
      title: 'Перед виходом на вокзал',
      items: [{ title: 'Взяти зарядку для телефона', done: false }],
    });
    const { dynamicPrompt } = buildNemoryActionsPromptParts({
      dto: {
        sourceType: 'checkin',
        plannerChangesSupported: true,
        plannerChatActions: true,
        plannerLookupSupported: true,
        plannerLookupFacts: facts,
        text: 'Перевірю зміну.',
      },
      userText,
      assistantText: 'Перевірю зміну.',
      outputLanguageRules: '',
    });
    expect(chatChangeInstructions(true, facts)).toContain('exact saved title');
    expect(dynamicPrompt).toContain(userText);
    expect(dynamicPrompt).toContain(facts);
  });
  it('enables automatic changes and chat undo only for the versioned capability', () => {
    const prompt = buildNemoryCapabilitiesPrompt(
      true,
      true,
      'uk',
      2,
      true,
      true,
      'chat',
    );
    expect(prompt).toContain('Undo this chat’s action (archive included)≤48h→CHANGE');
    expect(prompt).toContain('marks(done/achieved)/archives incl. reminders→CHANGE; app confirms');
    expect(prompt).toContain('Direct archive return: explain new planner needed');
    expect(prompt).toContain('Named edits(pin/unpin notes)');
    expect(prompt).toContain('reminder archive:Скасувати нагадування');
    expect(prompt).toContain('If asked how:');
    expect(prompt).toContain('describe ongoing action');
    expect(prompt).toContain(
      'Delete planner/occurrence:manual only, never archive',
    );
    expect(prompt).toContain('whole series→Вся серія→confirm');
    expect(prompt).not.toContain('tap Confirm');
    expect(chatChangeExtraction).toContain('authorizationQuote');
    expect(chatChangeExtraction).toContain('uniquely matching successful receipt');
    expect(chatChangeExtraction).toContain('never use message time');
    expect(chatChangeInstructions(true)).toContain('omit requestedDisposition, return plannerChange with operation="undo"');
    const request = 'Скасуй архівування «Репетиції».';
    const undo = { operation: 'undo', kind: 'event', title: 'Репетиція' };
    expect(plannerChangeResult({ authorizationQuote: request, plannerChange: undo }, request, true).plannerChange).toEqual(undo);
    expect(plannerCreationResponseInstruction('chat')).toContain('change/undo');
    expect(plannerCreationResponseInstruction('chat')).toContain(
      'Even when absent from context, route the named type and title for local lookup',
    );
  });
  it.each([false, true])(
    'blocks removal and archive substitution, preserves explicit archival (chat=%s)',
    (chat) => {
      const deleteRequest = 'Видали з календаря всю серію занять «Фізика».';
      const archiveRequest = 'Перемісти всю серію «Фізика» до архіву.';
      const archive = {
        operation: 'archive',
        kind: 'event',
        title: 'Фізика',
        scope: 'series',
      };
      for (const [command, disposition] of [
        [{ ...archive, operation: 'delete' }, undefined],
        [archive, 'delete'],
        [archive, undefined],
        [{ ...archive, operation: 'edit' }, 'delete'],
      ]) {
        expect(
          plannerChangeResult(
            {
              authorizationQuote: deleteRequest,
              plannerChange: command,
              requestedDisposition: disposition,
            },
            deleteRequest,
            chat,
          ),
        ).toMatchObject({
          plannerChange: null,
          plannerCreations: [],
          scheduledReminders: [],
          scheduledReminderUpdates: [],
        });
      }
      expect(
        plannerChangeResult(
          {
            authorizationQuote: archiveRequest,
            plannerChange: archive,
            requestedDisposition: 'archive',
          },
          archiveRequest,
          chat,
        ).plannerChange,
      ).toEqual(archive);
      const instructions = chat
        ? chatChangeInstructions(true)
        : plannerChangeExtraction;
      expect(instructions).toContain(
        '"requestedDisposition":"archive","plannerChange":{"operation":"archive"',
      );
      expect(instructions).toContain('Deletion (including a series): requestedDisposition="delete", plannerChange=null');
    },
  );
  it.each([true, false])('rejects archive restore and its substitution with undo (chat=%s)', chat => {
    const request = 'Поверни подію з архіву';
    for (const operation of ['restore', 'undo', 'edit']) {
      expect(plannerChangeResult({ authorizationQuote: request, requestedDisposition: 'restore',
        plannerChange: { operation, kind: 'event', title: 'Подія' } }, request, chat).plannerChange).toBeNull();
    }
  });
  it('accepts verbatim evidence inside the proposed edit and never forwards evidence as a planner field', () => {
    const nested = {
      plannerChange: { ...action, authorizationQuote: utterance },
    };
    expect(plannerChangeResult(nested, utterance).plannerChange).toEqual(
      action,
    );
    expect(plannerChangeResult(nested, 'Інший запит').plannerChange).toBeNull();
    expect(
      plannerChangeResult(
        { ...nested, authorizationQuote: 'з історії' },
        utterance,
      ).plannerChange,
    ).toBeNull();
    expect(
      plannerChangeResult({ plannerChange: action }, utterance).plannerChange,
    ).toBeNull();
  });
  it('issues a fresh receipt key for both observed phone replies and discards model-supplied parameters', () => {
    const prose = 'Перенесу заняття «Математика» з 14 на 15 грудня.';
    const first =
      '[[NEMORY_CHANGE:{"type":"event","dateTo":"2026-12-15"}]]\n\n' + prose;
    const second =
      prose +
      '\n\n[[NEMORY_CHANGE:перенести подію "Математика" з 14 грудня на 15 грудня, час без змін]]';
    const text = { format: 'text' } as const;
    const bound = bindPlannerReview(second, text);
    expect(bound).toMatch(/\[\[NEMORY_CHANGE:[a-f0-9-]{36}\]\]$/);
    expect(bound.split('\n\n')[0]).toBe(prose);
    expect(bindPlannerReview(first, text)).not.toBe(bound);
    const report = JSON.parse(
      bindPlannerReview(
        JSON.stringify({ shortText: first, fullText: second, tags: ['a'] }),
        { format: 'json', textField: 'shortText' },
      ),
    );
    expect(report.shortText).toBe(report.fullText);
    expect(report.shortText).toMatch(/\[\[NEMORY_CHANGE:[a-f0-9-]{36}\]\]$/);
    expect(report.tags).toEqual(['a']);
    for (const input of [
      prose,
      second + ' пояснення',
      first + second,
      second + ' [[NEMORY_CREATE:12345678]]',
      prose + ' [[NEMORY_CHANGE:опис',
    ]) {
      expect(bindPlannerReview(input, text)).toBe(input);
    }
  });
  it.each(['Переставляю пункт про зарядку.', 'Moving the gloves to the top.', 'Gotowe.', 'Erledigt!'])(
    'keeps the provider wording during playback and after binding: %s', (prose) => {
      const marker = '[[NEMORY_CHANGE:review]]';
      for (const text of [prose + '\n\n' + marker, marker + '\n' + prose]) {
        const chunks: string[] = [];
        const stream = plannerReviewStream(chunk => chunks.push(chunk));
        for (const char of text) stream.push(char);
        const saved = bindPlannerReview(text, { format: 'text' });
        stream.finish(saved !== text);
        expect(chunks.join('').replace(marker, '').trim()).toBe(prose);
        expect(saved.split('\n\n')[0]).toBe(prose);
        expect(saved).toMatch(/\[\[NEMORY_CHANGE:[\da-f-]{36}\]\]$/);
      }
    },
  );
  it('preserves ordinary replies with the same opening and streams a regular intent immediately', () => {
    const chunks: string[] = [];
    const ordinary = plannerReviewStream((chunk) => chunks.push(chunk));
    ordinary.push('Готово — це слово, яке ти обрав.');
    ordinary.finish(false);
    expect(chunks).toEqual(['Готово — це слово, яке ти обрав.']);
    const intent = plannerReviewStream((chunk) => chunks.push(chunk));
    intent.push('Перевірю пункт.');
    expect(chunks[1]).toBe('Перевірю пункт.');
  });
  it('keeps conversation extraction isolated and accepts only a proposed change', () => {
    const input = {
      dto: {
        conversationOnly: true,
        plannerChangesSupported: true,
        text: 'assistant',
      },
      userText: utterance,
      assistantText: 'Підготую зміну.',
      outputLanguageRules: '',
    };
    const { staticPrompt, dynamicPrompt } =
      buildNemoryActionsPromptParts(input);
    expect(staticPrompt).toContain('planner changes');
    expect(staticPrompt).toContain('never export memories or commitments');
    expect(dynamicPrompt).toContain(utterance);
    expect(plannerChangeExtraction).toContain('mixed or partial requests');
  });
});
