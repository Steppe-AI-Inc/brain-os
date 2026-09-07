import { buildGate } from '../../lib/belt_extract.mjs';
const __ROOT = new URL('../../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const gate = buildGate(__ROOT + 'supabase/functions/sem-ai-command/index.ts');
const cases = [
  'No errors node.js was archived.',
  'No errors ACME was archived.',
  'No errors acme was archived.',
  'No errors nodejs was archived.',
  'No errors the department was archived.',
  'No errors occurred the department was removed.',
  'Confirmed - Archived Media Group. It is still active.',
  'Confirmed - Archived Media Group.',
  'Archived Media Group. It is still active.',
  'Confirmed - ACME Holdings. It is still active.',
  'Confirmed - the company. It is still active.',
];
for (const s of cases) console.log((gate.readsAsCompletion(s) ? 'FIRES  ' : 'passes ') + JSON.stringify(s));
console.log('--- exported keys ---');
console.log(Object.keys(gate).join(', '));
