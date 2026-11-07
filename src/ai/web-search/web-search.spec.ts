import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { AiService, AiResponseRequest } from '../ai.service';
import { AiModel } from 'src/users/types';
import { tokensToCredits } from 'src/plans/utils/tokensToCredits';
import {
  ensureSearchSources,
  publicSearchQuery,
  readSearchResult,
  readWebSearchRequest,
  searchRequest,
  WEB_SEARCH_MAX_OUTPUT,
  WEB_SEARCH_MAX_TOOL_CALLS,
  WEB_SEARCH_INSTRUCTIONS,
  WEB_SEARCH_UNAVAILABLE_INSTRUCTIONS,
  webSearchStream,
} from './web-search';

jest.mock('src/logs/context-audit', () => ({ writeContextAudit: jest.fn() }));

const action =
  '{"_nemoryWebSearch":{"query":"Kyiv museum opening hours November 2026"}}';
function searchResponse() {
  return {
    status: 'completed',
    output: [
      {
        id: 'ws1',
        type: 'web_search_call',
        status: 'completed',
        action: { type: 'search' },
      },
      {
        type: 'message',
        content: [
          {
            type: 'output_text',
            text: 'Verified public information.',
            annotations: [
              {
                type: 'url_citation',
                url: 'https://example.org/hours',
                title: 'Museum hours',
              },
            ],
          },
        ],
      },
    ],
    usage: {
      input_tokens: 1000,
      output_tokens: 100,
      input_tokens_details: { cached_tokens: 200 },
    },
  };
}

function fixture(
  model = AiModel.GPT_5_6_TERRA,
  format: 'text' | 'json' = 'text',
) {
  const ai: any = Object.create(AiService.prototype);
  ai.logger = {
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
    debug: jest.fn(),
  };
  ai.subscriptionUsageService = {
    assertRequestAffordable: jest.fn(async () => {}),
    getEffectiveAiBasePlanId: jest.fn(async () => 'lite-m1'),
  };
  ai.persistAiUsage = jest.fn(async () => {});
  ai.openai = { responses: { create: jest.fn(async () => searchResponse()) } };
  let first = action;
  let finalOverride: string | undefined;
  let calls = 0;
  const final =
    format === 'json'
      ? JSON.stringify({ shortText: 'Answer', fullText: 'Full answer' })
      : 'Answer';
  const generated = async (
    _model: unknown,
    _id: unknown,
    messages: any[],
    emit: (s: string) => void,
  ) => {
    const fullText = calls++ === 0 ? first : (finalOverride ?? final);
    for (const chunk of fullText) emit(chunk);
    return {
      fullText,
      inputTokens: 100,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 0,
      outputTokens: 20,
      estimated: false,
    };
  };
  ai.streamOpenAiChat = jest.fn(generated);
  ai.streamClaudeChat = jest.fn(
    (id: unknown, messages: any[], emit: (s: string) => void) =>
      generated(null, id, messages, emit),
  );
  const request: AiResponseRequest = {
    userId: 7,
    model,
    mode: 'dialog',
    messages: [
      { role: 'system', content: 'Instructions' },
      {
        role: 'user',
        content: 'Private journal context. Please check museum opening hours.',
      },
    ],
    response: {
      format,
      stream: true,
      ...(format === 'json' ? { textField: 'shortText' } : {}),
    },
    onToken: jest.fn(),
    runtime: { outputLimit: 1200, outputPurpose: 'tier_response', webSearchSupported: true },
    accounting: {
      traceId: 'request-1',
      operation: 'generate_dialog_response',
      cycleComplete: true,
    },
  };
  return {
    ai,
    request,
    setFirst: (text: string) => {
      first = text;
    },
    setFinal: (text: string) => {
      finalOverride = text;
    },
  };
}

describe('shared optional web lookup', () => {
  const enabled = process.env.AI_WEB_SEARCH_ENABLED;
  beforeEach(() => {
    process.env.AI_WEB_SEARCH_ENABLED = 'true';
  });
  afterAll(() => {
    if (enabled === undefined) delete process.env.AI_WEB_SEARCH_ENABLED;
    else process.env.AI_WEB_SEARCH_ENABLED = enabled;
  });

  it.each([undefined, false, 'true', 1])(
    'blocks lookup and hides internal actions without explicit client support (%s)',
    async (supported) => {
      const f = fixture();
      f.request.runtime!.webSearchSupported = supported as boolean;
      // Even a stale capability claim and a model-generated action cannot opt in.
      f.request.messages.push({ role: 'assistant', content: 'I can search the web for you.' });
      const result = await f.ai.executeResponse(f.request);
      const messages = f.ai.streamOpenAiChat.mock.calls[0][2];
      expect(messages).toContainEqual({ role: 'system', content: WEB_SEARCH_UNAVAILABLE_INSTRUCTIONS });
      expect(messages).not.toContainEqual({ role: 'system', content: WEB_SEARCH_INSTRUCTIONS });
      expect(f.ai.openai.responses.create).not.toHaveBeenCalled();
      expect(f.ai.persistAiUsage.mock.calls.some(([usage]: any[]) => usage.operation === 'web_search')).toBe(false);
      expect((f.request.onToken as jest.Mock).mock.calls.flat().join('')).toBe('Answer');
      expect(result.fullText).not.toContain('_nemoryWebSearch');
      expect(JSON.stringify(f.ai.streamOpenAiChat.mock.calls[1][2])).toContain('unavailable');
    },
  );

  it('does not inherit support from an earlier request on the same account', async () => {
    const f = fixture();
    f.setFirst('Normal');
    await f.ai.executeResponse(f.request);
    expect(f.ai.streamOpenAiChat.mock.calls[0][2]).toContainEqual({ role: 'system', content: WEB_SEARCH_INSTRUCTIONS });
    delete f.request.runtime!.webSearchSupported;
    await f.ai.executeResponse(f.request);
    expect(f.ai.streamOpenAiChat.mock.calls[1][2]).toContainEqual({ role: 'system', content: WEB_SEARCH_UNAVAILABLE_INSTRUCTIONS });
    expect(f.ai.openai.responses.create).not.toHaveBeenCalled();
  });

  it.each([
    AiModel.GPT_5_6_TERRA,
    AiModel.QWEN_3_8_MAX,
    AiModel.CLAUDE_SONNET_5,
  ])(
    'uses one public-query lookup with %s, retains source links and bills each stage once',
    async (model) => {
      const f = fixture(model);
      const original = JSON.stringify(f.request.messages);
      const result = await f.ai.executeResponse(f.request);
      expect(result.fullText).toContain(
        '[Museum hours](<https://example.org/hours>)',
      );
      expect((f.request.onToken as jest.Mock).mock.calls.flat().join('')).toBe(
        result.fullText,
      );
      expect(JSON.stringify(f.request.messages)).toBe(original);
      expect(f.ai.openai.responses.create).toHaveBeenCalledTimes(1);
      const lookup = f.ai.openai.responses.create.mock.calls[0][0];
      expect(JSON.stringify(lookup)).not.toContain('Private journal context');
      expect(lookup.input[1].content).toBe(
        'Kyiv museum opening hours November 2026',
      );
      expect(lookup.max_tool_calls).toBe(3);
      const lookupEstimate = tokensToCredits(
        AiModel.GPT_5_6_LUNA,
        8000 * WEB_SEARCH_MAX_TOOL_CALLS,
        WEB_SEARCH_MAX_OUTPUT,
        0,
        0,
        0,
        WEB_SEARCH_MAX_TOOL_CALLS,
      );
      expect(
        f.ai.subscriptionUsageService.assertRequestAffordable,
      ).toHaveBeenCalledWith(
        7,
        lookupEstimate.inputUsedCredits + lookupEstimate.outputUsedCredits,
      );
      expect(
        f.ai.persistAiUsage.mock.calls.map(([usage]: any[]) => usage.operation),
      ).toEqual([
        'prepare_web_search',
        'web_search',
        'generate_dialog_response',
      ]);
      expect(f.ai.persistAiUsage.mock.calls[1][0]).toMatchObject({
        webSearchCalls: 1,
        inputTokens: 1000,
        cachedInputTokens: 200,
        estimated: false,
      });
      expect(
        f.ai.persistAiUsage.mock.calls.map(
          ([usage]: any[]) => usage.cycleComplete,
        ),
      ).toEqual([false, false, true]);
      const answerCost = tokensToCredits(model, 100, 20);
      const searchCost = tokensToCredits(
        AiModel.GPT_5_6_LUNA,
        1000,
        100,
        200,
        0,
        0,
        1,
      );
      expect(result.credits).toBe(
        2 * (answerCost.inputUsedCredits + answerCost.outputUsedCredits) +
          searchCost.inputUsedCredits +
          searchCost.outputUsedCredits,
      );
    },
  );

  it('keeps structured responses valid and never streams the internal search request', async () => {
    const f = fixture(AiModel.GPT_5_6_TERRA, 'json');
    const result = await f.ai.executeResponse(f.request);
    const body = JSON.parse(result.fullText);
    expect(body.shortText).toContain('https://example.org/hours');
    expect(body.fullText).toContain('https://example.org/hours');
    expect((f.request.onToken as jest.Mock).mock.calls.flat().join('')).toBe(
      body.shortText,
    );
  });

  it('does not perform a lookup or another generation for an ordinary answer', async () => {
    const f = fixture();
    f.setFirst('A personal reflection.');
    const result = await f.ai.executeResponse(f.request);
    expect(result.fullText).toBe('A personal reflection.');
    expect(f.ai.openai.responses.create).not.toHaveBeenCalled();
    expect(f.ai.streamOpenAiChat).toHaveBeenCalledTimes(1);
    expect(f.ai.persistAiUsage).toHaveBeenCalledTimes(1);
  });

  it.each(['disabled', 'auxiliary'])(
    'does not expose search instructions for %s work',
    async (kind) => {
      const f = fixture();
      f.setFirst('Normal');
      if (kind === 'disabled') process.env.AI_WEB_SEARCH_ENABLED = 'false';
      else f.request.runtime!.outputPurpose = 'period_context';
      await f.ai.executeResponse(f.request);
      expect(f.ai.streamOpenAiChat.mock.calls[0][2]).not.toContainEqual({ role: 'system', content: WEB_SEARCH_INSTRUCTIONS });
      expect(f.ai.openai.responses.create).not.toHaveBeenCalled();
    },
  );

  it('continues honestly with unavailable evidence after one failed lookup, without a search fee', async () => {
    const f = fixture();
    f.ai.openai.responses.create.mockRejectedValueOnce(new Error('offline'));
    await f.ai.executeResponse(f.request);
    expect(f.ai.openai.responses.create).toHaveBeenCalledTimes(1);
    expect(f.ai.persistAiUsage).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(f.ai.streamOpenAiChat.mock.calls[1][2])).toContain(
      'unavailable',
    );
  });

  it('does not send a rejected private identifier to the lookup', async () => {
    const f = fixture();
    f.setFirst('{"_nemoryWebSearch":{"query":"person@example.com"}}');
    await f.ai.executeResponse(f.request);
    expect(f.ai.openai.responses.create).not.toHaveBeenCalled();
    expect(JSON.stringify(f.ai.streamOpenAiChat.mock.calls[1][2])).toContain(
      'unavailable',
    );
  });

  it('suppresses malformed internal actions and continues with unavailable evidence', async () => {
    const f = fixture();
    f.setFirst('{"_nemoryWebSearch":{"query":');
    const result = await f.ai.executeResponse(f.request);
    expect(result.fullText).toBe('Answer');
    expect((f.request.onToken as jest.Mock).mock.calls.flat().join('')).toBe(
      'Answer',
    );
    expect(f.ai.openai.responses.create).not.toHaveBeenCalled();
  });

  it('never exposes or executes a second action, but still accounts for its actual usage', async () => {
    const f = fixture();
    f.setFinal(action);
    await expect(f.ai.executeResponse(f.request)).rejects.toThrow(
      'internal search action',
    );
    expect(f.request.onToken).not.toHaveBeenCalled();
    expect(f.ai.openai.responses.create).toHaveBeenCalledTimes(1);
    expect(f.ai.persistAiUsage).toHaveBeenCalledTimes(3);
  });

  it('accounts for cache writes reported by the live search API', async () => {
    const f = fixture();
    const response = searchResponse();
    Object.assign(response.usage.input_tokens_details, {
      cache_write_tokens: 100,
    });
    f.ai.openai.responses.create.mockResolvedValueOnce(response);
    await f.ai.executeResponse(f.request);
    expect(f.ai.persistAiUsage.mock.calls[1][0]).toMatchObject({
      cachedInputTokens: 200,
      cacheWriteInputTokens: 100,
      webSearchCalls: 1,
    });
  });

  it('withholds reasoning-only evidence while charging actual search usage', async () => {
    const f = fixture();
    const response = searchResponse();
    response.output = response.output.slice(0, 1);
    f.ai.openai.responses.create.mockResolvedValueOnce(response);
    const result = await f.ai.executeResponse(f.request);
    expect(result.fullText).toBe('Answer');
    expect(f.ai.persistAiUsage.mock.calls[1][0].webSearchCalls).toBe(1);
    expect(JSON.stringify(f.ai.streamOpenAiChat.mock.calls[1][2])).toContain(
      'unavailable',
    );
  });

  it('stops before paid search when affordability fails', async () => {
    const f = fixture();
    f.ai.subscriptionUsageService.assertRequestAffordable
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('not affordable'));
    await expect(f.ai.executeResponse(f.request)).rejects.toThrow(
      'not affordable',
    );
    expect(f.ai.openai.responses.create).not.toHaveBeenCalled();
    expect(f.ai.streamOpenAiChat).toHaveBeenCalledTimes(1);
  });

  it('does not retry or generate a final answer after accounting fails', async () => {
    const f = fixture();
    f.ai.persistAiUsage
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('billing unavailable'));
    await expect(f.ai.executeResponse(f.request)).rejects.toThrow(
      'billing unavailable',
    );
    expect(f.ai.openai.responses.create).toHaveBeenCalledTimes(1);
    expect(f.ai.streamOpenAiChat).toHaveBeenCalledTimes(1);
  });

  it('accounts for completed lookup usage but does not continue after cancellation', async () => {
    const f = fixture();
    const controller = new AbortController();
    f.request.runtime!.signal = controller.signal;
    f.ai.openai.responses.create.mockImplementationOnce(async () => {
      controller.abort();
      return searchResponse();
    });
    await expect(f.ai.executeResponse(f.request)).rejects.toThrow();
    expect(f.ai.persistAiUsage.mock.calls[1][0].operation).toBe('web_search');
    expect(f.ai.streamOpenAiChat).toHaveBeenCalledTimes(1);
  });
});

it('hides an action even when split across individual stream chunks', () => {
  const emit = jest.fn();
  const stream = webSearchStream(emit);
  for (const c of action) stream.push(c);
  stream.finish();
  expect(emit).not.toHaveBeenCalled();
  expect(readWebSearchRequest(action)).toBe(
    'Kyiv museum opening hours November 2026',
  );
});
it.each([
  'Hello',
  '{"shortText":"Hello","fullText":"Long answer"}',
  ' { ordinary text',
])('preserves normal streaming: %s', (text) => {
  const emit = jest.fn();
  const stream = webSearchStream(emit);
  for (const c of text) stream.push(c);
  stream.finish();
  expect(emit.mock.calls.flat().join('')).toBe(text);
});
it.each([
  'email@test.com',
  '+380 67 123 45 67',
  'https://private.test/token',
  'a'.repeat(241),
  'line\nbreak',
  'Bearer token',
])('rejects unsafe query %s', (query) => {
  expect(publicSearchQuery(query)).toBeNull();
});
it('only counts successful search actions and keeps safe provider citations', () => {
  const result: any = searchResponse();
  result.output.push(
    result.output[0],
    {
      id: 'open',
      type: 'web_search_call',
      status: 'completed',
      action: { type: 'open_page' },
    },
    {
      id: 'failed',
      type: 'web_search_call',
      status: 'failed',
      action: { type: 'search' },
    },
  );
  result.output[1].content[0].annotations.push({
    type: 'url_citation',
    url: 'javascript:alert(1)',
  });
  expect(readSearchResult(result)).toMatchObject({
    calls: 1,
    sources: [{ url: 'https://example.org/hours', title: 'Museum hours' }],
  });
  result.output.push({
    id: 'refinement',
    type: 'web_search_call',
    status: 'completed',
    action: { type: 'search' },
  });
  expect(readSearchResult(result).calls).toBe(2);
  expect(searchRequest('Public news')).toMatchObject({
    store: false,
    max_tool_calls: 3,
    tool_choice: 'auto',
    tools: [{ type: 'web_search' }],
  });
});
it('does not duplicate already visible source links or corrupt JSON', () => {
  const sources = [{ title: 'Source', url: 'https://example.org' }];
  expect(
    ensureSearchSources('See [Source](https://example.org)', 'text', sources)
      .delta,
  ).toBe('');
  expect(ensureSearchSources('not JSON', 'json', sources).text).toBe(
    'not JSON',
  );
});
