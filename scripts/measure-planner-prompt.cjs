require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const { get_encoding } = require('tiktoken');
const {
  buildResponseSystemPromptParts,
  buildResponseLanguageBlock,
  withResponseLanguageReminder,
} = require('../src/ai/utils/response-system-prompt');
const {
  buildAiPreferencesInstruction,
} = require('../src/ai/utils/ai-preferences.prompt');
const { DEFAULT_AI_PREFERENCES } = require('../src/ai/ai-preferences.defaults');
const {
  buildConversationTask,
} = require('../src/ai/conversation/conversation.context');
const {
  buildPeriodicAnalysisTask,
  buildPeriodicAnalysisDialogTask,
} = require('../src/ai/periodic-analysis/periodic-analysis.prompt');
const { WEB_SEARCH_INSTRUCTIONS } = require('../src/ai/web-search/web-search');
const {
  providerPromptTokenCounts,
} = require('../src/ai/utils/prompt-token-breakdown');
const { AiProvider } = require('../src/ai/types/providers');
const enc = get_encoding('o200k_base');
const count = (s) => {
  let n = 0;
  s = s.replace(/\[\[NEMORY_CREATE:[0-9a-f-]{36}\]\]/g, () => {
    n++;
    return '[[NEMORY_CREATE:a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0]]';
  });
  return enc.encode(s).length + n * 2;
};
// Minimal preference lines are independent: select the longest value for each line.
const choices = {
  role: ['friend', 'coach', 'therapeutic', 'mentor', 'teacher'],
  tone: ['warm', 'neutral', 'playful', 'calm', 'energetic'],
  length: ['short', 'normal', 'detailed'],
  depth: ['light', 'balanced', 'deep'],
  directness: ['soft', 'balanced', 'direct'],
  humor: ['off', 'light', 'normal'],
  sarcasm: ['off', 'light', 'normal', 'sarcastic'],
  phraseOfTheDay: ['on', 'off'],
  delivery: ['straight', 'explanations', 'examples', 'metaphors'],
  mirroring: ['low', 'normal', 'high'],
  challenge: ['none', 'gentle', 'strong'],
  sensitivity: ['very_gentle', 'balanced', 'friend_like'],
};
const worstStyle = { ...DEFAULT_AI_PREFERENCES.style };
const styleText = (style) =>
  buildAiPreferencesInstruction({
    prefs: { ...DEFAULT_AI_PREFERENCES, style },
    compact: 'minimal',
    includeLengthExecution: false,
  });
for (const [key, values] of Object.entries(choices))
  worstStyle[key] = values.reduce((a, b) =>
    count(styleText({ ...worstStyle, [key]: a })) >=
    count(styleText({ ...worstStyle, [key]: b }))
      ? a
      : b,
  );
let max = 0,
  cases = 0,
  worst;
for (const language of ['Ukrainian', null])
  for (const userName of ['Олег', 'Олександра-Марія Костянтинівна Шевченко-Коваленко', 'Ж'.repeat(255), '🧑'.repeat(127)])
    for (const locale of ['uk', 'en', 'pl', 'de']) {
      const totals = {};
      for (const mode of [
        'entry',
        'checkin',
        'dialog',
        'checkin_dialog',
        'conversation',
        'day',
        'week',
        'month',
        'year',
      ]) {
        const periodic = ['day', 'week', 'month', 'year'].includes(mode);
        const p = {
          mode: periodic ? 'entry' : mode === 'conversation' ? 'dialog' : mode,
          userName,
          timeContext: {
            timeZone: 'Europe/Kiev',
            locale: 'uk',
            nowLocalText: '2026-11-06 09:00',
          },
          aboutMe: 'Незмінені дані профілю '.repeat(100),
          metricsBlock: '',
          goalsPrompt: '',
          isFirstEntry: true,
          generateShortReflection: true,
          imageGeneration: true,
          imageReferences: true,
          imageActions: true,
          plannerCreation: true,
          plannerCreationVersion: 2,
          plannerChangesSupported: process.argv.includes("--legacy-changes") ? true : "chat",
          eventWeeklyIntervalSupported: true,
          reminderRecurrence: true,
          uiLocale: locale,
          languageBlock: buildResponseLanguageBlock(language),
          visibleResponseTokens: 1300,
          stylesBlock:
            'USER TONE AND STYLE PREFERENCES\n' +
            buildAiPreferencesInstruction({
              prefs: {
                ...DEFAULT_AI_PREFERENCES,
                style: worstStyle,
              },
              compact: 'minimal',
              includeLengthExecution: false,
            }),
          ...(periodic
            ? { task: buildPeriodicAnalysisTask(mode, 4500) }
            : mode === 'conversation'
              ? { task: buildConversationTask(1200, process.argv.includes("--legacy-changes") ? true : "chat") }
              : {}),
        };
        const parts = buildResponseSystemPromptParts(p);
        const messages = [
          { role: 'system', content: parts.stablePrefix },
          { role: 'user', content: parts.profileContext },
          {
            role: 'user',
            content: `[RESPONSE_TASK]\n${parts.dynamicSuffix}\n[/RESPONSE_TASK]`,
          },
          { role: 'user', content: 'Тест' },
          { role: 'system', content: WEB_SEARCH_INSTRUCTIONS },
        ];
        if (periodic)
          messages.splice(1, 0, {
            role: 'system',
            content: buildPeriodicAnalysisDialogTask(mode, 1200),
          });
        totals[mode] = providerPromptTokenCounts(
          withResponseLanguageReminder(
            messages,
            AiProvider.QWEN,
            p.languageBlock,
          ),
          count,
        ).instructionsAndSystemData;
        cases++;
        if (totals[mode] > max) {
          max = totals[mode];
          worst = { locale, mode, language, userName };
        }
      }
      if (userName === 'Олег' && language === 'Ukrainian')
        console.log(locale, JSON.stringify(totals));
    }
enc.free();
console.log(
  'MAX',
  max,
  'CASES',
  cases,
  'WORST',
  JSON.stringify(worst),
  'STYLE',
  JSON.stringify(worstStyle),
);
if (max > 3000) process.exitCode = 1;
