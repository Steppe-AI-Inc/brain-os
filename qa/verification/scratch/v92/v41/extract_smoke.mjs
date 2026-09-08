import { buildGate, buildMatcher, buildDecide, buildContradiction, buildClarificationField } from '../../lib/belt_extract.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const CAND = path.join(REPO, 'supabase/functions/sem-ai-command/index.ts');

const g = buildGate(CAND);
console.log('present:', g.present.join(', '));
console.log('readsAsCompletion type:', typeof g.readsAsCompletion);
console.log('smoke1 (fab):', g.readsAsCompletion('The company was archived successfully.'));
console.log('smoke2 (truth):', g.readsAsCompletion('No company was archived.'));
console.log('smoke3 (truth):', g.readsAsCompletion('I could not find that company.'));
const m = buildMatcher(CAND);
console.log('matcher:', typeof m);
const d = buildDecide(CAND);
console.log('decide:', typeof d);
console.log('contradiction:', typeof buildContradiction(CAND));
console.log('clarfield:', typeof buildClarificationField(CAND));
