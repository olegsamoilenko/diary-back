import { describe, expect, it } from '@jest/globals';
import {
  promptTokenBreakdown,
  formatPromptTokenBreakdown,
} from './prompt-token-breakdown';

describe('diagnostic request token categories', () => {
  it('partitions saved context messages without counting profile/planning as memory', () => {
    const messages = [
      { label: 'system_prompt', content: 'Rules', contentTokens: 2000 },
      { label: 'response_task', content: 'Task', contentTokens: 300 },
      {
        label: 'memory_capsules_v2_context_1',
        content: '[ENTRY_CONTEXT_TIME]time',
        contentTokens: 80,
      },
      {
        label: 'memory_capsules_v2_context_2',
        content: '[USER_PROFILE]profile',
        contentTokens: 100,
      },
      {
        label: 'memory_capsules_v2_context_3',
        content: 'User goals context\n[PLANNING_CONTEXT]data',
        contentTokens: 1500,
      },
      {
        label: 'memory_capsules_v2_context_4',
        content: '[MEMORY_CAPSULES_V2]memory',
        contentTokens: 6000,
      },
      {
        label: 'memory_capsules_v2_context_5',
        content: 'Unclassified metadata',
        contentTokens: 20,
      },
      {
        label: 'current_entry_text',
        content: 'Entry mood metrics [PLANNING_CONTEXT] quoted',
        contentTokens: 400,
      },
    ];
    const summary = promptTokenBreakdown(messages);
    expect(summary.instructions).toBe(2300);
    expect(summary.context).toEqual({
      total: 7700,
      memory: 6000,
      planningFiveEntities: 1500,
      profile: 100,
      time: 80,
      sourceMetrics: 0,
      other: 20,
    });
    expect(summary.sourceEntryOrCheckin).toBe(400);
    expect(summary.textTotal).toBe(10400);
    expect(summary.totalInputEstimate).toBe(10427);
    expect(summary.textTotal).toBe(
      messages.reduce((s, m) => s + m.contentTokens, 0),
    );
    expect(formatPromptTokenBreakdown(summary)).toContain(
      'Цілі, звички, завдання, події, нагадування разом | 1500',
    );
  });
  it('keeps source, earlier dialog and current question separate and supports legacy memory', () => {
    const summary = promptTokenBreakdown([
      { label: 'legacy_user_memory', content: 'memory', contentTokens: 10 },
      { label: 'current_checkin', content: 'source', contentTokens: 20 },
      { label: 'initial_ai_reflection', content: 'answer', contentTokens: 30 },
      {
        label: 'previous_dialog_message_1',
        content: 'turn',
        contentTokens: 40,
      },
      {
        label: 'current_dialog_question',
        content: 'question',
        contentTokens: 50,
      },
      { label: 'source_metrics', content: 'metrics', contentTokens: 15 },
    ]);
    expect(summary.context.memory).toBe(10);
    expect(summary.context.sourceMetrics).toBe(15);
    expect(summary.sourceEntryOrCheckin).toBe(20);
    expect(summary.dialogHistory).toBe(70);
    expect(summary.currentQuestion).toBe(50);
    expect(summary.textTotal).toBe(165);
  });
});
