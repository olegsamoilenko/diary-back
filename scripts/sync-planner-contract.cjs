const fs = require('node:fs');
const path = require('node:path');
const source = path.resolve(
  __dirname,
  '../src/ai/utils/planner-creation-v2.ts',
);
const target = path.resolve(
  __dirname,
  '../../diary-front/utils/nemory-actions/plannerCreationV2.generated.ts',
);
const content =
  '// GENERATED from diary-back/src/ai/utils/planner-creation-v2.ts.\n' +
  fs.readFileSync(source, 'utf8');
if (process.argv.includes('--check')) {
  if (fs.readFileSync(target, 'utf8') !== content)
    throw new Error('Planner contract out of sync');
} else fs.writeFileSync(target, content);
