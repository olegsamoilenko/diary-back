import type OpenAI from 'openai';

/** Preserve prompt text/order; map cache boundaries to supported Responses input blocks. */
export function toResponsesRequest(
  request: OpenAI.Chat.ChatCompletionCreateParams,
) {
  const cache = request as typeof request & {
    prompt_cache_key?: string;
    prompt_cache_options?: { mode: 'explicit' };
  };
  let pendingAssistantBoundary = false;
  const input = request.messages.map((message) => {
    if (
      message.role !== 'system' &&
      message.role !== 'user' &&
      message.role !== 'assistant'
    ) {
      throw new Error(`Unsupported journal message role: ${message.role}`);
    }
    let content:
      | string
      | Array<
          | {
              type: 'input_text' | 'output_text';
              text: string;
              annotations?: [];
              prompt_cache_breakpoint?: { mode: 'explicit' };
            }
          | {
              type: 'input_image';
              image_url: string;
              detail: 'auto' | 'low' | 'high';
              prompt_cache_breakpoint?: { mode: 'explicit' };
            }
        > =
      typeof message.content === 'string'
        ? message.content
        : (message.content ?? []).map(
            (
              part:
                | OpenAI.Chat.ChatCompletionContentPart
                | OpenAI.Chat.ChatCompletionContentPartRefusal,
            ) => {
              if (part.type === 'image_url')
                return {
                  type: 'input_image' as const,
                  image_url: part.image_url.url,
                  detail: part.image_url.detail ?? 'auto',
                };
              if (part.type === 'text') {
                const { prompt_cache_breakpoint, ...text } =
                  part as typeof part & {
                    prompt_cache_breakpoint?: { mode: 'explicit' };
                  };
                if (message.role === 'assistant') {
                  pendingAssistantBoundary ||= Boolean(prompt_cache_breakpoint);
                  return {
                    ...text,
                    type: 'output_text' as const,
                    annotations: [] as [],
                  };
                }
                return { ...part, type: 'input_text' as const };
              }
              throw new Error(
                `Unsupported journal content block: ${part.type}`,
              );
            },
          );
    // Responses ignores markers on output_text. Advance to the next existing
    // input message, retaining all earlier text/roles rather than inventing a
    // separator or changing assistant history into user instructions.
    if (message.role !== 'assistant' && pendingAssistantBoundary) {
      const blocks =
        typeof content === 'string'
          ? [{ type: 'input_text' as const, text: content }]
          : content;
      const last = blocks.at(-1);
      if (last && (last.type === 'input_image' || last.text.length > 0)) {
        content = blocks.map((block, index) =>
          index === blocks.length - 1
            ? {
                ...block,
                prompt_cache_breakpoint: { mode: 'explicit' as const },
              }
            : block,
        );
        pendingAssistantBoundary = false;
      }
    }
    return { role: message.role, content };
  });
  return {
    model: request.model,
    // SDK v5 types omit this accepted replay shape and explicit input markers;
    // keep the wire format validated by live probes.
    input: input as OpenAI.Responses.ResponseInput,
    stream: request.stream === true,
    store: false,
    service_tier: 'default' as const,
    ...(request.max_completion_tokens != null
      ? { max_output_tokens: request.max_completion_tokens }
      : {}),
    ...(request.reasoning_effort
      ? { reasoning: { effort: request.reasoning_effort } }
      : {}),
    ...(request.response_format?.type === 'json_object'
      ? { text: { format: { type: 'json_object' as const } } }
      : {}),
    ...(cache.prompt_cache_key
      ? { prompt_cache_key: cache.prompt_cache_key }
      : {}),
    ...(cache.prompt_cache_options
      ? { prompt_cache_options: cache.prompt_cache_options }
      : {}),
  };
}

/** Reuse the common cache accounting helpers; retain raw Responses usage in diagnostics. */
export function responsesUsage(usage: OpenAI.Responses.ResponseUsage) {
  return {
    prompt_tokens: usage.input_tokens,
    completion_tokens: usage.output_tokens,
    total_tokens: usage.total_tokens,
    prompt_tokens_details: usage.input_tokens_details,
  };
}

export function responsesText(response: OpenAI.Responses.Response): string {
  return response.output
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content)
    .map((part) => (part.type === 'output_text' ? part.text : part.refusal))
    .join('');
}

export function responsesFinishReason(
  response: OpenAI.Responses.Response,
): string {
  if (response.status === 'incomplete') {
    return response.incomplete_details?.reason === 'max_output_tokens'
      ? 'length'
      : 'content_filter';
  }
  return response.status === 'completed'
    ? 'stop'
    : (response.status ?? 'unknown');
}
