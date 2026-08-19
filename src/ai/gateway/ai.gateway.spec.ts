import { describe, expect, it, jest } from '@jest/globals';
import { AiGateway } from './ai.gateway';
import { AiModel } from '../../users/types';

jest.mock('../entry-flow-debug', () => ({
  logServerEntryTiming: jest.fn(),
  logServerMemoryReview: jest.fn(),
  scheduleServerDebugTask: jest.fn(),
}));

describe('AiGateway check-in structured progress', () => {
  it('forwards the client capability and emits the first structured chunk', async () => {
    const generateComment = jest.fn(async (...args: unknown[]) => {
      const onToken = args[11] as (chunk: string) => void;
      onToken('Перший фрагмент');
      return {
        content: 'Коротка відповідь',
        fullText: 'Повна відповідь',
        shortText: 'Коротка відповідь',
        tags: [],
      };
    });
    const gateway = new AiGateway(
      { generateComment } as never,
      {} as never,
      {} as never,
      { captureSafely: jest.fn() } as never,
      { report: jest.fn() } as never,
    );
    const client = {
      user: { id: 42 },
      data: {},
      disconnected: false,
      emit: jest.fn(),
    };

    await gateway.handleStreamAiCheckin(
      {
        content: 'Текст чекіну',
        aiModel: AiModel.GPT_5_6_TERRA,
        mood: 'calm',
        userMemory: { role: 'system', content: '' },
        assistantMemory: { role: 'system', content: '' },
        assistantCommitment: { role: 'system', content: '' },
        prompt: [],
        goalsPrompt: null,
        timeContext: {} as never,
        metrics: null,
        supportsStructuredProgress: true,
        timingTraceId: 'checkin-structured-progress-test',
      },
      client as never,
    );

    expect(generateComment).toHaveBeenCalledTimes(1);
    expect(generateComment.mock.calls[0][20]).toBe(true);
    expect(client.emit).toHaveBeenCalledWith('ai_stream_checkin_chunk', {
      text: 'Перший фрагмент',
    });
  });
});
