process.env.TS_NODE_COMPILER_OPTIONS = '{"module":"CommonJS"}';
require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { baseline, hash } = require('./prompt-ab-baseline.cjs');
const { buildResponseSystemPromptParts, buildResponseLanguageBlock } = require('../src/ai/utils/response-system-prompt');
function fixture(first = true) {
  const language = buildResponseLanguageBlock('Ukrainian');
  const parts = buildResponseSystemPromptParts({ mode: 'entry', userName: 'Олег',
    timeContext: { timeZone: 'Europe/Kiev', locale: 'uk', nowLocalText: '2026-11-06 15:00' },
    aboutMe: '', metricsBlock: '', goalsPrompt: '', stylesBlock: '', languageBlock: language,
    generateShortReflection: true, isFirstEntry: first, plannerCreation: true, visibleResponseTokens: 700 });
  return { userId: 141, model: 'gpt-5.6-terra', mode: 'entry', responseLanguageBlock: language,
    messages: [{ role: 'system', content: parts.stablePrefix },
      { role: 'user', content: 'Джерело: чернетка готова, але заявку не надіслав.' },
      { role: 'user', content: '[RESPONSE_TASK]\n' + parts.dynamicSuffix + '\n[/RESPONSE_TASK]' }],
    cache: { key: 'same-source-key', openAiPrefix: parts.stablePrefix },
    response: { format: 'json', stream: true, textField: 'shortText' },
    runtime: { outputLimit: 1300, outputPurpose: 'tier_response' } };
}
test('uses exact historical blocks, keeps sources/new capability/model/limits and does not mutate native request', () => {
  const request = fixture();
  const before = hash(request);
  const result = baseline(request);
  assert.equal(hash(request), before);
  assert.deepEqual(result.request.messages[1], request.messages[1]);
  assert.deepEqual(result.request.runtime, request.runtime);
  assert.deepEqual(result.request.response, request.response);
  assert.equal(result.request.model, request.model);
  assert.equal(result.manifest.task.isFirstEntry, true);
  assert.deepEqual(result.manifest.unchangedMessageIndexes, [1]);
  const all = result.request.messages.map(m => m.content).join('\n');
  assert.ok(all.includes('CONTEXT AND CONTINUITY'));
  assert.ok(all.includes('The app confirms this is the user'));
  assert.ok(all.includes('fullText: self-contained reflection with fitting planner/linked-entry offers; respect length.'));
  assert.ok(all.includes('Meaningful reflections must include feasible next steps grounded in the analysis.'));
  assert.ok(!all.includes('when relevant, identify next actions'));
  assert.ok(all.includes('Request/accepted proposal→create planners'));
  assert.ok(!all.includes('not connected yet'));
  assert.ok(result.request.cache.openAiPrefix.includes('CONTEXT AND CONTINUITY'));
});
test('does not manufacture first-source state in an ordinary later entry', () => {
  const result = baseline(fixture(false));
  assert.equal(result.manifest.task.isFirstEntry, false);
  assert.ok(!result.request.messages.map(m => m.content).join('').includes('FIRST JOURNAL RESPONSE'));
});
test('refuses an incomplete or duplicated instruction snapshot rather than doing a partial comparison', () => {
  const incomplete = fixture();
  incomplete.messages.shift();
  assert.throws(() => baseline(incomplete), /must occur once/);
  const duplicate = fixture();
  duplicate.messages.push(duplicate.messages[0]);
  assert.throws(() => baseline(duplicate), /must occur once/);
});

test('standalone comparison preserves access boundaries and conversation history', () => {
  const { buildConversationTask } = require('../src/ai/conversation/conversation.context');
  const { buildResponseSystemPrompt } = require('../src/ai/utils/response-system-prompt');
  const language = buildResponseLanguageBlock('Ukrainian');
  const system = buildResponseSystemPrompt({ mode:'dialog', identity:'conversation',
    timeContext:{timeZone:'Europe/Kiev',nowLocalText:'2026-11-06 17:30',locale:'uk'},
    aboutMe:'',metricsBlock:'',goalsPrompt:'',stylesBlock:'',languageBlock:language,
    isFirstEntry:false,generateShortReflection:false,task:buildConversationTask(600) });
  const request = {...fixture(false),mode:'dialog',messages:[{role:'system',content:system},{role:'user',content:'Synthetic conversation source'}],cache:{openAiPrefix:system}};
  const result=baseline(request);
  assert.equal(result.manifest.task.standalone,true);
  assert.deepEqual(result.request.messages[1],request.messages[1]);
  assert.ok(result.request.messages[0].content.includes('You cannot access journal entries'));
  assert.ok(result.request.messages[0].content.includes('Return a useful plain-text answer'));
  assert.ok(result.request.cache.openAiPrefix.includes('CONTEXT AND CONTINUITY'));
});
