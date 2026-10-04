import { ConversationService } from './conversation.service';
import { describe, expect, it, jest } from '@jest/globals';
import { BasePlanIds } from 'src/plans/types';
import { AiModel } from 'src/users/types';
import type { ConversationDto } from './conversation.dto';
import type { AiResponseRequest } from '../ai.service';
import { buildAnthropicPromptCachePayload } from '../utils/anthropic-prompt-cache';
import { addExplicitPromptCacheBreakpoint } from '../utils/openai-prompt-cache';

describe('standalone conversation provider lifecycle', () => {
  const dto = {
    expectedUserId: 7,
    requestId: 'request',
    conversationId: 'chat',
    question: 'Explain this',
    timezone: 'Europe/Kyiv',
    createdAt: '2026-10-01T10:00:00Z',
    omittedTurns: 0,
    history: [],
  };
  function setup() {
    const ai = {
      getStylesBlock: jest.fn(async () => 'Style'),
      buildLanguageBlock: jest.fn(() => 'Ukrainian'),
      countStringTokens: jest.fn(() => 100),
      executeResponse: jest.fn(async (_params: unknown) => ({
        fullText: 'Answer',
        finishReason: 'stop',
      })),
    };
    const users = {
      findById: jest.fn(async () => ({
        settings: {
          aiModel: Object.values(AiModel)[0],
          conversationLanguage: 'uk',
        },
      })),
    };
    const cycles = { claimExecution: jest.fn(async () => true) };
    const subscriptions = {
      getEffectiveAiBasePlanId: jest.fn(async () => BasePlanIds.BASE_M1),
    };
    const service = new ConversationService(
      ai as never,
      users as never,
      cycles as never,
      subscriptions as never,
    );
    const stream = { signal: new AbortController().signal, onText: jest.fn() };
    return { service, ai, cycles, stream, users, subscriptions };
  }
  it('advertises image creation only for capable clients when enabled', async () => {
    const previous = process.env.AI_IMAGE_GENERATION_ENABLED;
    process.env.AI_IMAGE_GENERATION_ENABLED = 'true';
    try {
      const f = setup();
      await f.service.reply(7, { ...dto, imageGenerationSupported: true }, f.stream);
      const call = f.ai.executeResponse.mock.calls[0][0] as AiResponseRequest;
      expect(JSON.stringify(call)).toContain('IMAGE CREATION IN THIS CONVERSATION');
      const legacy = setup();
      await legacy.service.reply(7, dto, legacy.stream);
      expect(JSON.stringify(legacy.ai.executeResponse.mock.calls[0][0])).not.toContain('IMAGE CREATION IN THIS CONVERSATION');
    } finally {
      if (previous === undefined) delete process.env.AI_IMAGE_GENERATION_ENABLED;
      else process.env.AI_IMAGE_GENERATION_ENABLED = previous;
    }
  });
  it.each([
    [BasePlanIds.LITE_M1, 600],
    [BasePlanIds.BASE_M1, 800],
    [BasePlanIds.PRO_M1, 1200],
  ] as Array<[BasePlanIds, number]>)(
    'uses server plan %s for prompt and runtime allowance',
    async (plan, tokens) => {
      const f = setup();
      f.subscriptions.getEffectiveAiBasePlanId.mockResolvedValue(plan);
      await f.service.reply(7, dto, f.stream);
      const call = f.ai.executeResponse.mock.calls[0][0] as any;
      expect(call.messages[0].content).toContain(
        `approximately ${tokens} tokens`,
      );
      expect(call.runtime).toMatchObject({
        outputLimit: tokens,
        outputPurpose: 'tier_response',
      });
    },
  );
  it('uses the shared billing/provider once with only this chat and no memory extraction', async () => {
    const f = setup();
    expect(await f.service.reply(7, dto, f.stream)).toMatchObject({
      text: 'Answer',
      requestId: 'request',
      conversationId: 'chat',
      omittedTurns: 0,
    });
    expect(f.ai.executeResponse).toHaveBeenCalledTimes(1);
    const call = f.ai.executeResponse.mock.calls[0][0] as any;
    expect(call.accounting).toMatchObject({
      operation: 'generate_conversation_response',
      tokenType: 'conversation',
      cycleComplete: true,
    });
    expect(call.runtime.signal).toBe(f.stream.signal);
    expect(call.messages.at(-1).content).toContain('Explain this');
    expect(call.messages[0].content).toContain('cannot access journal entries');
    expect(call.messages[0].content).toContain(
      'Respond in the role of a professional psychologist',
    );
    expect(call.messages[0].content).toContain('NEMORY SHARED CAPABILITIES');
    expect(call.messages[0].content).not.toContain('There are no app actions');
  });
  it('rejects account mismatch before user lookup or billing', async () => {
    const f = setup();
    await expect(f.service.reply(8, dto, f.stream)).rejects.toThrow(
      'account changed',
    );
    expect(f.users.findById).not.toHaveBeenCalled();
    expect(f.ai.executeResponse).not.toHaveBeenCalled();
  });
  it('grows cache boundaries across seven replies despite changing actions and dates', async () => {
    const f = setup();
    const history: ConversationDto['history'] = [];
    let previous: AiResponseRequest | undefined;
    for (let turn = 0; turn < 7; turn++) {
      const createdAt = `2026-10-0${turn + 1}T10:00:00Z`;
      const question = `Question ${turn}`;
      await f.service.reply(
        7,
        {
          ...dto,
          requestId: `request-${turn}`,
          question,
          createdAt,
          history: [...history],
          activeCommitments:
            turn % 2
              ? []
              : [
                  {
                    key: 'rest',
                    text: 'Ask about rest',
                    status: 'open',
                    triggerTags: [],
                  },
                ],
          activeScheduledReminders: [],
        },
        f.stream,
      );
      const current = f.ai.executeResponse.mock.calls.at(
        -1,
      )![0] as AiResponseRequest;
      const indexes = current.cache!.messageIndexes!;
      expect(indexes.length + 1).toBeLessThanOrEqual(4);
      expect(
        indexes.every((i) => current.messages[i].role === 'assistant'),
      ).toBe(true);
      const claude = buildAnthropicPromptCachePayload(
        current.messages,
        current.cache!.anthropicPrefix,
        indexes,
      );
      const openai = addExplicitPromptCacheBreakpoint(
        current.messages,
        current.cache!.openAiPrefix!,
        indexes,
      );
      expect(current.messages.at(-1)!.content).toContain(createdAt);
      expect(indexes).not.toContain(current.messages.length - 1);
      if (previous) {
        expect(current.cache!.key).toBe(previous.cache!.key);
        const boundary = Math.max(0, ...previous.cache!.messageIndexes!);
        expect(current.messages.slice(0, boundary + 1)).toEqual(
          previous.messages.slice(0, boundary + 1),
        );
        const previousClaude = buildAnthropicPromptCachePayload(
          previous.messages,
          previous.cache!.anthropicPrefix,
          previous.cache!.messageIndexes,
        );
        expect(claude.system).toEqual(previousClaude.system);
        if (boundary > 0) {
          expect(indexes).toContain(boundary);
          expect(openai[boundary]).toEqual(
            addExplicitPromptCacheBreakpoint(
              previous.messages,
              previous.cache!.openAiPrefix!,
              previous.cache!.messageIndexes,
            )[boundary],
          );
          const withoutMarkers = (items: typeof claude.messages) =>
            items.map((item) => ({
              role: item.role,
              content:
                typeof item.content === 'string'
                  ? item.content
                  : item.content
                      .map((block) =>
                        block.type === 'text'
                          ? block.text
                          : JSON.stringify(block),
                      )
                      .join(''),
            }));
          expect(withoutMarkers(claude.messages.slice(0, boundary))).toEqual(
            withoutMarkers(previousClaude.messages.slice(0, boundary)),
          );
        }
        expect(Math.max(...indexes)).toBeGreaterThan(boundary);
      } else {
        expect(indexes).toEqual([]);
      }
      history.push({ question, createdAt, answer: 'Answer' });
      previous = current;
    }
  });
  it('rejects duplicate request without a second paid provider call', async () => {
    const f = setup();
    f.cycles.claimExecution.mockResolvedValue(false);
    await expect(f.service.reply(7, dto, f.stream)).rejects.toThrow(
      'ALREADY_SUBMITTED',
    );
    expect(f.ai.executeResponse).not.toHaveBeenCalled();
  });
  it('keeps the system prefix stable when the next question has a later timestamp', async () => {
    const f = setup();
    const contextCreatedAt = '2026-10-01T09:00:00Z';
    await f.service.reply(7, { ...dto, contextCreatedAt, completeHistory: true }, f.stream);
    await f.service.reply(7, { ...dto, contextCreatedAt, completeHistory: true, createdAt: '2026-10-01T10:00:00Z', dialogContext: 'User corrected the previous hypothesis.' }, f.stream);
    const first = (f.ai.executeResponse.mock.calls[0][0] as any).messages;
    const second = (f.ai.executeResponse.mock.calls[1][0] as any).messages;
    expect(second[0]).toEqual(first[0]);
    expect(second[1].content).toContain('User corrected');
  });
  it('does not dispatch after cancellation and exposes incomplete output', async () => {
    const f = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(
      f.service.reply(7, dto, { ...f.stream, signal: controller.signal }),
    ).rejects.toThrow();
    expect(f.cycles.claimExecution).not.toHaveBeenCalled();
    f.ai.executeResponse.mockResolvedValue({
      fullText: 'Partial',
      finishReason: 'length',
    });
    expect(await f.service.reply(7, dto, f.stream)).toMatchObject({
      text: 'Partial',
      incomplete: true,
    });
  });
});
