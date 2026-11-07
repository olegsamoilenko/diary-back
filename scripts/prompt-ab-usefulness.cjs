// Prepare a one-sentence comparison from an actual captured request. No API calls.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const [id, sourceId, ruleKind = 'usefulness'] = process.argv.slice(2);
if (!['usefulness', 'state'].includes(ruleKind)) throw Error('Unknown rule');
const stateRule = ruleKind === 'state';
if (![id, sourceId].every(x => /^t\d{2}(?:-[a-z0-9]+)?$/.test(x))) throw Error('Invalid id');
const base = path.resolve(__dirname, '../.tmp/prompt-ab');
const sourceDir = path.join(base, sourceId), target = path.join(base, id);
if (fs.existsSync(target)) throw Error('Case exists; never overwrite');
const original = JSON.parse(fs.readFileSync(path.join(sourceDir, 'B-request.json'), 'utf8'));
const before = stateRule
  ? 'Mood/metrics=source moments, not whole days/new dialog measurements.'
  : 'Give a meaningful reflection that helps the user understand the experience and, when relevant, identify next actions.';
const after = stateRule
  ? 'Mood/metrics: snapshots; later reports update state without inferred scores.'
  : 'Every part must help the user understand or act; explain rather than recap. Meaningful reflections must include feasible next steps grounded in the analysis.';
const indexes = original.messages.flatMap((m,i) => (stateRule ? m.role === 'system' : m.content.startsWith('[RESPONSE_TASK]\n')) && (m.content.includes(before) || m.content.includes(after)) ? [i] : []);
if (indexes.length !== 1) throw Error('Expected one recognized reflection task');
const taskIndex = indexes[0];
const found = original.messages[taskIndex].content.includes(after) ? after : before;
if (original.messages[taskIndex].content.split(found).length !== 2) throw Error('Ambiguous rule');
const variant = rule => {
  const r = JSON.parse(JSON.stringify(original));
  r.messages[taskIndex].content = r.messages[taskIndex].content.replace(found, rule);
  return r;
};
const a = variant(before), b = variant(after);
assert.deepEqual({...a,messages:[]}, {...b,messages:[]});
assert.equal(a.messages[taskIndex].content.replace(before,after), b.messages[taskIndex].content);
const unchanged = original.messages.map((_,i)=>i).filter(i=>i!==taskIndex);
for (const i of unchanged) { assert.deepEqual(a.messages[i],original.messages[i]); assert.deepEqual(b.messages[i],original.messages[i]); }
const manifest = {sourceId, comparisonKind:stateRule ? 'state-rule-only' : 'usefulness-rule-only',
  comparisonTitle:stateRule ? 'до та після правила оновлення стану' : 'до та після вимоги користі',
  comparisonDescription:'Обидва промпти ущільнені. Змінюється лише одна інструкція; це не порівняння історичного ущільнення. Б відповідає поточній редакції застосунку.',
  variantLabels:{A:'До правки',B:'Після правки'},
  replacements:[{name:stateRule ? 'Оновлення стану за пізнішими повідомленнями без вигаданих вимірювань' : 'Вимога користі та практичних кроків у змістовній рефлексії',before,after}],
  heldConstant:['Усі інші інструкції, захищена психологія, модель, параметри, час, джерела й історія'],
  unchangedMessageIndexes:unchanged,
  unchangedSourceHash:crypto.createHash('sha256').update(JSON.stringify(unchanged.map(i=>original.messages[i]))).digest('hex'),
  reusedNativeB:false};
fs.mkdirSync(target);
if (found === after && fs.existsSync(path.join(sourceDir,'B-response.json'))) {
  assert.deepEqual(b,original);
  fs.copyFileSync(path.join(sourceDir,'B-response.json'),path.join(target,'B-response.json'));
  manifest.reusedNativeB=true;
}
for (const [name,value] of [['A-request',a],['B-request',b],['manifest',manifest],['state',{status:'usefulness-prepared',sourceId}]])
  fs.writeFileSync(path.join(target,name+'.json'),JSON.stringify(value,null,2));
console.log(JSON.stringify({prepared:id,taskIndex,unchangedMessages:unchanged,reusedNativeB:manifest.reusedNativeB,paidCalls:0}));
