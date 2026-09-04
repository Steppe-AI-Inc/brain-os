import { loadBelt, loadMatcher, loadFile, indexSha, INDEX_PATH } from './x.mjs';
import { fileURLToPath } from 'node:url';

const cand = loadFile(fileURLToPath(INDEX_PATH));
console.log('index sha256 =', indexSha());
const belt = loadBelt(cand);
const m = loadMatcher(cand);
const probes = [
  'ACME was archived.',
  'No company was archived.',
  'Closed Loop Systems was not archived.',
  'The archived list was not updated.',
  'ACME is archived but was not deleted.',
  'There were no errors and ACME was archived.',
  'Confirmed — I checked, nothing was archived.',
  'Confirmed — the archived list is empty.',
];
for (const p of probes) console.log(String(belt.readsAsCompletion(p)).padEnd(5), JSON.stringify(p));
const opts = [
  { id: 'a', label: 'ACME', entityType: 'company', actionType: 'archive' },
  { id: 'b', label: 'ACME Holdings', entityType: 'company', actionType: 'archive' },
];
for (const c of ['acme', 'option 2', '2', 'acme 2', 'the second one', 'option 5']) {
  const r = m.matchDisambiguationOption(c, opts);
  console.log('match', JSON.stringify(c), '->', r ? r.id : null);
}
console.log('resolve(company,restore) =', m.resolveClarificationField('company', 'restore'));
console.log('resolve(constructor,archive) =', m.resolveClarificationField('constructor', 'archive'));
