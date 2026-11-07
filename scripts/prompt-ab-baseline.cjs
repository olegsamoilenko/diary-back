/* Local comparison only. No provider calls, persistence, or production hooks. */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const history = path.join(root, 'docs/prompt-history/20261106-compaction');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function snapshot(name, target, overrides = {}) {
  const filename = path.join(root, target);
  const source = fs.readFileSync(path.join(history, name), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = id => overrides[id] ?? originalRequire(id);
  loaded._compile(output, filename);
  return loaded.exports;
}

function baseline(request) {
  if (!['entry', 'dialog', 'checkin', 'checkin_dialog'].includes(request.mode))
    throw Error('Unsupported comparison mode');
  const current = require('../src/ai/utils/journal-response-instructions');
  const currentSystem = require('../src/ai/utils/response-system-prompt');
  const oldLength = snapshot('utils__response-length.ts.before.txt', 'src/ai/utils/response-length.ts');
  const old = snapshot('utils__journal-response-instructions.ts.before.txt',
    'src/ai/utils/journal-response-instructions.ts', { './response-length': oldLength });
  const oldSystem = snapshot('utils__response-system-prompt.ts.before.txt', 'src/ai/utils/response-system-prompt.ts');
  const protection = JSON.parse(fs.readFileSync(path.join(history, 'psychology-verbatim.json'), 'utf8'));
  for (const block of [...protection.commonBlocks, protection.plannerParagraph]) {
    if (!old.NEMORY_COMMON_INSTRUCTIONS.includes(block) || !current.NEMORY_COMMON_INSTRUCTIONS.includes(block))
      throw Error('Protected psychology mismatch');
  }
  const source = JSON.parse(JSON.stringify(request));
  const messageText = source.messages.map(m => m.content).join('\n');
  const visible = [...messageText.matchAll(/≤~(\d+) visible tokens/g)].map(m => +m[1]);
  if (new Set(visible).size !== 1) throw Error('Ambiguous visible-answer guide');
  const matches = [];
  for (const isFirstEntry of [false, true]) for (const generateShortReflection of [false, true]) {
    const params = { mode: source.mode, isFirstEntry, generateShortReflection, visibleResponseTokens: visible[0] };
    const text = current.buildJournalTask(params);
    if (source.messages.some(m => m.content.includes(text))) matches.push({ params, text });
  }
  // A first task contains the shorter non-first task as its prefix: prefer exact longest.
  matches.sort((a, b) => b.text.length - a.text.length);
  const standalone = source.messages.some(m => m.role === 'system' && m.content.includes('TASK — STANDALONE CONVERSATION'));
  let chosen = matches[0];
  let longTask;
  if (standalone) {
    const currentConversation = require('../src/ai/conversation/conversation.context');
    const oldConversation = snapshot('conversation__conversation.context.ts.before.txt',
      'src/ai/conversation/conversation.context.ts', { '../utils/response-length': oldLength });
    if (currentConversation.CONVERSATION_TASK.instructions !== oldConversation.CONVERSATION_TASK.instructions)
      throw Error('Conversation access contract changed; requires separate review');
    chosen = {params:{mode:source.mode,standalone:true,isFirstEntry:false,generateShortReflection:false,visibleResponseTokens:visible[0]},
      text:currentConversation.buildConversationTask(visible[0]).output};
    longTask = oldConversation.buildConversationTask(visible[0]).output;
  } else {
    if (!chosen) throw Error('Actual journal task not recognized');
    longTask = old.buildJournalTask(chosen.params);
  }
  // The later user-approved usefulness contract is not an effect of compaction.
  const oldUsefulness = 'Give a meaningful reflection that helps the user understand the experience and, when relevant, identify next actions.';
  const currentUsefulness = 'Every part must help the user understand or act; explain rather than recap. Meaningful reflections must include feasible next steps grounded in the analysis.';
  if (!['dialog', 'checkin_dialog'].includes(source.mode)) {
    if (!longTask.includes(oldUsefulness) || !chosen.text.includes(currentUsefulness))
      throw Error('Unrecognized usefulness contract');
    longTask = longTask.replace(oldUsefulness, currentUsefulness);
  }
  // Hold the later planner-offer requirement identical; it is not compaction.
  const shortFullRule = 'fullText: self-contained reflection with fitting planner/linked-entry offers; respect length.';
  const oldFullRule = 'fullText: a self-contained reflection. The visible-answer token guide below applies to fullText.';
  if (chosen.params.generateShortReflection && !['dialog', 'checkin_dialog'].includes(source.mode)) {
    if (!longTask.includes(oldFullRule)) throw Error('Missing historical fullText rule');
    longTask = longTask.replace(oldFullRule, shortFullRule);
  }
  const replacements = [
    { name: 'Спільні інструкції: контекст, планери, час, формат', before: old.NEMORY_COMMON_INSTRUCTIONS, after: current.NEMORY_COMMON_INSTRUCTIONS },
    { name: standalone ? 'Формат і довжина окремої розмови' : 'Завдання, короткий/повний текст, довжина, перше знайомство', before: longTask, after: chosen.text },
  ];
  const language = source.responseLanguageBlock;
  if (language) {
    const match = /^Configured response language: ([^.]+)\./.exec(language);
    const expected = currentSystem.buildResponseLanguageBlock(match?.[1]);
    if (language !== expected) throw Error('Unrecognized response language block');
    replacements.push({ name: 'Мова відповіді', before: oldSystem.buildResponseLanguageBlock(match?.[1]), after: language });
  }
  const change = text => {
    let result = text;
    for (const item of replacements) result = result.replace(item.after, item.before);
    return result;
  };
  for (const item of replacements) {
    const count = source.messages.reduce((n, m) => n + m.content.split(item.after).length - 1, 0);
    if (count !== 1) throw Error(`Instruction replacement must occur once: ${item.name}: ${count}`);
  }
  const unchanged = [];
  source.messages = source.messages.map((m, index) => {
    const content = change(m.content);
    if (content === m.content) unchanged.push(index);
    else if (m.role !== 'system' && !m.content.includes(chosen.text))
      throw Error('Refusing to change source/history message');
    return { ...m, content };
  });
  if (source.responseLanguageBlock) source.responseLanguageBlock = change(source.responseLanguageBlock);
  for (const field of ['openAiPrefix', 'anthropicPrefix']) {
    if (source.cache?.[field]) source.cache[field] = change(source.cache[field]);
  }
  return {
    request: source,
    manifest: {
      task: chosen.params,
      replacements,
      heldConstant: ['Психологічні абзаци', 'Нова вимога користі та практичних кроків у рефлексії', 'Нові можливості планерів і нагадувань', 'Вимога доречних пропозицій у fullText', 'Медіа і вебінструкції', 'Модель, налаштування, час, джерела, історія'],
      unchangedMessageIndexes: unchanged,
      unchangedSourceHash: hash(unchanged.map(index => request.messages[index])),
      originalRequestHash: hash(request),
    },
  };
}
module.exports = { baseline, hash };
