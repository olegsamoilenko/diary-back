process.env.TS_NODE_COMPILER_OPTIONS = '{"module":"CommonJS"}';
require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const fs = require('node:fs');
const path = require('node:path');
const { get_encoding } = require('tiktoken');
const { providerPromptTokenCounts } = require('../src/ai/utils/prompt-token-breakdown');
const { WEB_SEARCH_INSTRUCTIONS } = require('../src/ai/web-search/web-search');
const id = process.argv[2];
if (!/^t\d{2}(?:-[a-z0-9]+)?$/.test(id)) throw Error('Invalid id');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, '.tmp/prompt-ab', id);
const read = file => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
const manifest = read('manifest.json');
const labels = manifest.variantLabels ?? { A: 'А — довгі фрагменти', B: 'Б — ущільнені' };
const enc = get_encoding('o200k_base');
const variants = ['A', 'B'].map(key => {
  const request = read(key + '-request.json');
  const response = read(key + '-response.json');
  let body;
  try { body = JSON.parse(response.fullText); } catch { body = { fullText: response.fullText }; }
  return { key, request, response, body, counts: providerPromptTokenCounts(
    [...request.messages, { role: 'system', content: WEB_SEARCH_INSTRUCTIONS }], text => enc.encode(text).length) };
});
enc.free();
const target = path.join(root, 'docs/prompt-history/20261106-ab');
fs.mkdirSync(target, { recursive: true });
const lines = [
  '# ' + id.toUpperCase() + ' — ' + (manifest.comparisonTitle ?? (manifest.variantLabels ? 'перевірка тестового уточнення' : 'відповіді до та після ущільнення')), '',
  (manifest.comparisonDescription ?? (manifest.variantLabels ? 'Окремий експеримент: обидва варіанти ущільнені; лише Б має тестове уточнення. Робочий промпт не змінений.' : 'Це контроль точних змінених фрагментів, а не запуск усієї старої версії застосунку. Нові можливості однакові.')) + ' Психологічні абзаци незмінні.', '',
  'Модель: ' + variants[0].request.model + '. Користувач тестового циклу: ' + variants[0].request.userId + '.', '',
  'Незмінені повідомлення джерел: ' + manifest.unchangedMessageIndexes.join(', ') + '. SHA-256: ' + manifest.unchangedSourceHash + '.', '',
  '| Версія | Інструкції | Контекст | Увесь текст запиту |', '|---|---:|---:|---:|',
  ...variants.map(v => `| ${labels[v.key]} | ${v.counts.instructionsAndSystemData} | ${v.counts.contextAndMessages} | ${v.counts.totalText} |`), '',
  'Локальний підрахунок o200k_base: без медіа та службового обрамлення провайдера. Кеш і фактична оплата рахуються окремо.', '',
  '## Перевірювані заміни', '', ...manifest.replacements.map(r => '- ' + r.name), '',
  '## Джерельний запис або останнє запитання', '',
  variants[0].request.messages.filter(m => m.role === 'user' && !m.content.startsWith('[RESPONSE_TASK]')).at(-1).content, '',
];
for (const v of variants) {
  lines.push('## ' + labels[v.key], '');
  if (v.body.shortText != null) lines.push('### Коротка відповідь', '', v.body.shortText, '');
  lines.push('### Повна відповідь', '', v.body.fullText ?? v.body.text ?? '', '');
}
const assessmentPath = path.join(dir, 'blind-assessment.uk.md');
if (fs.existsSync(assessmentPath)) {
  const key = read('blind-key.json');
  lines.push('## Оцінка до відкриття відповідності', '', fs.readFileSync(assessmentPath, 'utf8'), '',
    `Після фіксації оцінки відкрито: відповідь1 = ${key[0]}, відповідь2 = ${key[1]}.`, '');
}
lines.push('## Межі висновку', '',
  'Одна пара відповідей ще не доводить загальну надійність. ' +
  (fs.existsSync(assessmentPath)
    ? 'Тексти прочитані й оцінені без позначок А/Б; відповідність відкрита після запису оцінки. Це не незалежна експертна оцінка. '
    : 'Порівняння оцінюється відкрито; початкова відповідь Б була видима в застосунку. ') +
  'Спірні відмінності перевіряються повторною парою на тому самому знімку, без нового запису та зміни історії.', '');
const file = path.join(target, id + '-comparison.uk.md');
fs.writeFileSync(file, lines.join('\n'));
console.log(JSON.stringify({ file, counts: variants.map(v => ({ variant: v.key, ...v.counts })) }));
