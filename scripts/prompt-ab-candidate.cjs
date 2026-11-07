// Offline preparation only. Compare unchanged compact instructions with one candidate rule.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const [id, sourceId] = process.argv.slice(2);
if (![id, sourceId].every(x => /^t\d{2}(?:-[a-z0-9]+)?$/.test(x))) throw Error('Invalid id');
const base = path.resolve(__dirname, '../.tmp/prompt-ab');
const source = path.join(base, sourceId), target = path.join(base, id);
if (fs.existsSync(target)) throw Error('Candidate exists; do not overwrite');
const a = JSON.parse(fs.readFileSync(path.join(source, 'B-request.json'), 'utf8'));
const b = JSON.parse(JSON.stringify(a));
const before = 'CONTEXT\nOnly supplied history exists.';
const rule = 'If prerequisites are unknown, qualify advice rather than assume them met. Readiness is not completion.';
const after = 'CONTEXT\n' + rule + '\nOnly supplied history exists.';
if (a.messages.filter(m => m.role === 'system' && m.content.includes(before)).length !== 1) throw Error('Unrecognized common block');
const unchanged = [];
b.messages = b.messages.map((m,i) => {
  if (m.role === 'system' && m.content.includes(before)) return {...m, content: m.content.replace(before, after)};
  unchanged.push(i); return m;
});
for (const field of ['openAiPrefix','anthropicPrefix'])
  if (b.cache?.[field]) b.cache[field] = b.cache[field].replace(before, after);
const protection = JSON.parse(fs.readFileSync(path.resolve(__dirname,'../docs/prompt-history/20261106-compaction/psychology-verbatim.json'),'utf8'));
for (const text of [...protection.commonBlocks,protection.plannerParagraph])
  if (!a.messages[0].content.includes(text) || !b.messages[0].content.includes(text)) throw Error('Protected paragraph changed');
const manifest = {
  sourceId, comparisonKind:'candidate-not-historical-compaction',
  variantLabels:{A:'Ущільнений промпт без уточнення',B:'Ущільнений промпт із тестовим уточненням'},
  replacements:[{name:'Передумови поради та готовність до дії: лише контрольний запит',before,after}],
  heldConstant:['Усі інші інструкції, захищена психологія, джерела, час, модель та параметри'],
  unchangedMessageIndexes:unchanged,
  unchangedSourceHash:crypto.createHash('sha256').update(JSON.stringify(unchanged.map(i=>a.messages[i]))).digest('hex'),
};
fs.mkdirSync(target);
for (const [name,value] of [['A-request',a],['B-request',b],['manifest',manifest],['state',{status:'candidate-prepared',sourceId,native:false}]])
  fs.writeFileSync(path.join(target,name+'.json'),JSON.stringify(value,null,2));
console.log(JSON.stringify({prepared:id,sourceId,rule,unchangedMessages:unchanged,paidCalls:0}));
