type CountedMessage = { label: string; content: string; contentTokens: number };

/** Counts the final provider-bound text in all modes, after web/media preparation.
 * Includes system request data; excludes image/audio payloads and provider framing.
 * A fixed tokenizer makes budgets comparable; this never controls billing.
 */
export function providerPromptTokenCounts(
  messages: { role: string; content: string }[],
  countText: (text: string) => number,
) {
  let instructionsAndSystemData = 0;
  let contextAndMessages = 0;
  for (const message of messages) {
    const tokens = countText(message.content);
    if (
      message.role === 'system' ||
      message.content.startsWith('[RESPONSE_TASK]\n')
    ) {
      instructionsAndSystemData += tokens;
    } else {
      // Qwen adds a current-language instruction to the final user message.
      const marker = '\n\n[RESPONSE LANGUAGE]\n';
      const index = message.content.lastIndexOf(marker);
      const suffix =
        index >= 0 && message.content.endsWith('[/RESPONSE LANGUAGE]')
          ? countText(message.content.slice(index))
          : 0;
      instructionsAndSystemData += suffix;
      contextAndMessages += tokens - suffix;
    }
  }
  return {
    tokenizer: 'o200k_base',
    instructionsAndSystemData,
    contextAndMessages,
    totalText: instructionsAndSystemData + contextAndMessages,
    messageCount: messages.length,
    excludesMediaAndProviderFraming: true,
  };
}

/** Diagnostic categories partition the actual message text; never change billing. */
export function promptTokenBreakdown(messages: CountedMessage[]) {
  const context = {
    memory: 0,
    planningFiveEntities: 0,
    profile: 0,
    time: 0,
    sourceMetrics: 0,
    other: 0,
  };
  let instructions = 0,
    sourceEntryOrCheckin = 0,
    dialogHistory = 0,
    currentQuestion = 0;
  for (const { label, content, contentTokens: tokens } of messages) {
    if (label === 'system_prompt' || label === 'response_task')
      instructions += tokens;
    else if (
      [
        'current_entry',
        'current_checkin',
        'current_entry_text',
        'current_checkin_text',
      ].includes(label)
    )
      sourceEntryOrCheckin += tokens;
    else if (label === 'current_dialog_question') currentQuestion += tokens;
    else if (
      label === 'initial_ai_reflection' ||
      label.startsWith('previous_dialog_message_')
    )
      dialogHistory += tokens;
    else if (
      content.includes('[PLANNING_CONTEXT]') ||
      content.startsWith('User goals context')
    )
      context.planningFiveEntities += tokens;
    else if (content.startsWith('[USER_PROFILE]')) context.profile += tokens;
    else if (/^\[(ENTRY|CHECKIN)_CONTEXT_TIME\]/.test(content))
      context.time += tokens;
    else if (
      label === 'source_metrics' ||
      content.startsWith('[SOURCE_ENTRY_METRICS')
    )
      context.sourceMetrics += tokens;
    else if (
      label.startsWith('legacy_') ||
      label.startsWith('retrieved_context_') ||
      /\[(MEMORY_CAPSULES_V2|RELEVANT_PREVIOUS_ENTRIES|LONG_TERM_USER_MEMORY|ACTIVE_NEMORY_COMMITMENTS)\]/.test(
        content,
      )
    )
      context.memory += tokens;
    else context.other += tokens;
  }
  const contextTotal = Object.values(context).reduce((sum, n) => sum + n, 0);
  const textTotal =
    instructions +
    contextTotal +
    sourceEntryOrCheckin +
    dialogHistory +
    currentQuestion;
  const messageEnvelopeEstimate = messages.length * 3 + 3;
  return {
    estimated: true,
    instructions,
    context: { total: contextTotal, ...context },
    sourceEntryOrCheckin,
    dialogHistory,
    currentQuestion,
    textTotal,
    messageEnvelopeEstimate,
    totalInputEstimate: textTotal + messageEnvelopeEstimate,
  };
}

export function formatPromptTokenBreakdown(
  summary: ReturnType<typeof promptTokenBreakdown>,
) {
  return [
    '## Токени запиту — локальна оцінка',
    'Категорії тексту не перетинаються. Фактичний usage провайдера може відрізнятися; медіа та службові витрати провайдера сюди не входять.',
    '| Частина | Токени |',
    '| --- | ---: |',
    `| Інструкції промпту: спільні + завдання | ${summary.instructions} |`,
    `| Контекст загалом | ${summary.context.total} |`,
    `| ↳ Пам’ять разом | ${summary.context.memory} |`,
    `| ↳ Цілі, звички, завдання, події, нагадування разом | ${summary.context.planningFiveEntities} |`,
    `| ↳ Профіль | ${summary.context.profile} |`,
    `| ↳ Часовий контекст | ${summary.context.time} |`,
    `| ↳ Окремий блок метрик (старий формат / чекін) | ${summary.context.sourceMetrics} |`,
    `| ↳ Інший контекст | ${summary.context.other} |`,
    `| Сам запис / чекін, включно з його настроєм і метриками | ${summary.sourceEntryOrCheckin} |`,
    `| Попередня відповідь та історія діалогу | ${summary.dialogHistory} |`,
    `| Поточне питання | ${summary.currentQuestion} |`,
    `| Увесь текст | ${summary.textTotal} |`,
    `| Службові оболонки повідомлень, оцінка | ${summary.messageEnvelopeEstimate} |`,
    `| Разом на вході, оцінка | ${summary.totalInputEstimate} |`,
  ].join('\n');
}
