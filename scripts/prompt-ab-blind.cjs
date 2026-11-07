// Hide variant labels until a quality assessment has been recorded.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const [id, action = 'show'] = process.argv.slice(2);
if (!/^t\d{2}(?:-[a-z0-9]+)?$/.test(id)) throw Error('Invalid case id');
const dir = path.resolve(__dirname, '../.tmp/prompt-ab', id);
const keyPath = path.join(dir, 'blind-key.json');
if (!fs.existsSync(keyPath)) {
  for (const variant of ['A', 'B']) {
    if (!fs.existsSync(path.join(dir, variant + '-response.json'))) throw Error('Pair incomplete');
  }
  fs.writeFileSync(keyPath, JSON.stringify(crypto.randomInt(2) ? ['B', 'A'] : ['A', 'B']), { flag: 'wx' });
}
const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
if (action === 'reveal') {
  if (!fs.existsSync(path.join(dir, 'blind-assessment.uk.md'))) throw Error('Record assessment first');
  console.log(JSON.stringify({ response1: key[0], response2: key[1] }));
} else if (action === 'show') {
  key.forEach((variant, i) => {
    const result = JSON.parse(fs.readFileSync(path.join(dir, variant + '-response.json'), 'utf8'));
    console.log('Відповідь ' + (i + 1) + '\n' + result.fullText);
  });
} else throw Error('Unknown action');
