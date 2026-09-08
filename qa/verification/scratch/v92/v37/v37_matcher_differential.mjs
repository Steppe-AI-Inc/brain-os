// VERIFIER #37 — matchDisambiguationOption differential, candidate vs v92 (git c9dfab5bd433), own extractor.
import { candidateText, v92Text } from './v37_harness.mjs';
function extractFn(text, name) {
  const i = text.indexOf('\nfunction ' + name + '(');
  if (i < 0) throw new Error('fn not found ' + name);
  const j = text.indexOf('\n}\n', i);
  return text.slice(i + 1, j + 2);
}
const detype = (s) => s
  .replace(/\(command: string, options: PendingActionOption\[\]\): PendingActionOption \| null/, '(command, options)')
  .replace(/\((\w+): string\)/g, '($1)').replace(/\((\w+): PendingActionOption\)/g, '($1)')
  .replace(/: Record<string, string>/g, '');
const build = (text) => new Function(detype(extractFn(text, 'matchDisambiguationOption')) + '\nreturn matchDisambiguationOption;')();
const cand = build(candidateText()), v92 = build(v92Text());
const opts = [
  { label: 'ACME Holdings (option 1)', id: 'id-acme', entityType: 'company', actionType: 'archive' },
  { label: 'ACME Data (option 2)', id: 'id-data', entityType: 'company', actionType: 'archive' },
  { label: '“Advanced Closed Systems” (option 3)', id: 'id-acs', entityType: 'company', actionType: 'archive' },
];
const optsQ = [
  { label: '“No Limits Inc”', id: 'id-nl', entityType: 'company', actionType: 'archive' },
  { label: '“Bob’s Co”', id: 'id-bobs', entityType: 'company', actionType: 'archive' },
  { label: '“Bobs Co”', id: 'id-bobs2', entityType: 'company', actionType: 'archive' },
];
const optsPlain = [
  { label: 'acme holdings', id: 'id-acme', entityType: 'company', actionType: 'archive' },
  { label: 'beta corp', id: 'id-beta', entityType: 'company', actionType: 'archive' },
  { label: 'option 2 ltd', id: 'id-o2', entityType: 'company', actionType: 'archive' },
];
const optsProto = [{ label: 'acme', id: 'id-acme', entityType: 'constructor', actionType: '__proto__' }];
// [command, options, expected-safe-result-description]. "safe" = null (LLM path) or the intended option id.
const shapes = [
  ['acme holdings', opts, 'id-acme'], ['ACME Holdings (option 1)', opts, 'id-acme'], ['option 2', opts, 'id-data'], ['#2', opts, 'id-data'],
  ['the second one', opts, 'id-data'], ['2', opts, 'id-data'], ['acme 2', opts, null], ['acme data', opts, 'id-data'],
  ["don't archive acme holdings", opts, null], ['not acme holdings, the other one', opts, null], ['anything except acme holdings', opts, null],
  ['acme holdings? no, the data one', opts, null], ['exclude acme holdings', opts, null], ['cancel acme holdings', opts, null],
  ['yes acme holdings', opts, 'id-acme'], ['archive acme holdings', opts, 'id-acme'], ['restore acme holdings', opts, null],
  ['activate acme holdings', opts, null], ['archive acme holdings tasks', opts, null], ['acme holdings and acme data', opts, null],
  ['Advanced Closed Systems', opts, 'id-acs'], ['“Advanced Closed Systems”', opts, 'id-acs'], ['no option 2', opts, null],
  ['option 4', opts, null], ['', opts, null], ['   ', opts, null],
  ['no limits inc', optsQ, 'id-nl'], ["bob's co", optsQ, 'id-bobs'], ['bobs co', optsQ, 'id-bobs2'], ['bob', optsQ, null],
  ['option 2', optsPlain, null], ['option 2 ltd', optsPlain, 'id-o2'], ['beta corp please', optsPlain, 'id-beta'], ['delete beta corp', optsPlain, 'id-beta'],
  ['acme', optsProto, 'no-throw'],
];
let regressions = 0, improvements = 0, same = 0; const rows = [];
for (const [cmd, o, safe] of shapes) {
  const run = (f) => { try { const r = f(cmd, o); return r === null ? null : (r && typeof r === 'object' && typeof r.id === 'string' ? r.id : 'NONOPTION:' + typeof r); } catch (e) { return 'THROW:' + e.constructor.name; } };
  const a = run(v92), b = run(cand);
  const ok = (x) => safe === 'no-throw' ? !String(x).startsWith('THROW') && !String(x).startsWith('NONOPTION') : (x === safe || x === null);
  const wrong = (x) => !ok(x);
  let verdict;
  if (a === b) { verdict = ok(a) ? 'same-safe' : 'same-wrong'; same++; }
  else if (wrong(a) && ok(b)) { verdict = 'IMPROVEMENT'; improvements++; }
  else if (ok(a) && wrong(b)) { verdict = 'REGRESSION'; regressions++; }
  else if (ok(a) && ok(b)) { verdict = a === null ? 'cand-binds-intended(v92 dead-ended)' : 'cand-deadends(v92 bound intended)'; if (a === null) improvements++; else regressions++; }
  else verdict = 'both-wrong-differently';
  rows.push({ cmd, v92: a, cand: b, verdict });
  console.log(verdict.padEnd(38), JSON.stringify(cmd).padEnd(38), 'v92=' + a, 'cand=' + b);
}
console.log(`\nMATCHER: ${shapes.length} shapes; regressions=${regressions} improvements=${improvements} same=${same}`);
process.exit(regressions ? 1 : 0);
