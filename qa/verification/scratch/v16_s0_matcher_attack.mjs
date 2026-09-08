// VERIFIER #16 / SCENARIO 0 — attack the D116 NEGATED_MENTION guard in BOTH directions.
// (a) MIS-BIND hunting: a reply that EXCLUDES an option yet still binds it -> P1.
// (b) OVER-REFUSAL hunting: a legitimate reply that now dead-ends -> REGRESSION if it
//     bound at d724d8c.
import { extractMatcher, readSrc } from './v16_extract.mjs';

const cand = extractMatcher(readSrc());
const base = extractMatcher(readSrc('qa/verification/scratch/baseline_d724d8c_index.ts'));

const O = (id, label, entityType = 'company') => ({ id, label, entityType, actionType: 'archive' });
const TWO = [O('c1', 'ACME'), O('c2', 'ACME Holdings')];
const TWO_DISTINCT = [O('c1', 'Acme'), O('c2', 'Beta Corp')];
const THREE = [O('c1', 'Acme'), O('c2', 'Beta Corp'), O('c3', 'Gamma LLC')];

// -------------------- (a) MIS-BIND: reply EXCLUDES the option it names --------------------
// Expected for every one of these: NULL (dead-end). A non-null result is a wrong-entity
// DESTRUCTIVE bind with no LLM in the loop = P1.
const EXCLUSIONS = [
  ['listed negator: dont', 'dont archive acme', TWO_DISTINCT, 'c1'],
  ['listed negator: not X, the other', 'not acme, the other one', TWO_DISTINCT, 'c1'],
  ['listed negator: except', 'anything except acme', TWO_DISTINCT, 'c1'],
  ['listed negator: never', 'never acme', TWO_DISTINCT, 'c1'],
  ['listed negator: leave alone', 'leave acme alone', TWO_DISTINCT, 'c1'],
  ['listed negator: keep', 'keep acme', TWO_DISTINCT, 'c1'],
  ['listed negator: skip', 'skip acme', TWO_DISTINCT, 'c1'],
  ['listed negator: spare', 'spare acme', TWO_DISTINCT, 'c1'],
  ['listed negator: without', 'proceed without acme', TWO_DISTINCT, 'c1'],
  ['listed negator: rather than', 'rather than acme', TWO_DISTINCT, 'c1'],
  ['listed negator: instead of', 'instead of acme', TWO_DISTINCT, 'c1'],
  ['listed negator: other than', 'other than acme', TWO_DISTINCT, 'c1'],
  ['listed negator: all but', 'all but acme', TWO_DISTINCT, 'c1'],
  ['listed negator: cannot', 'cannot touch acme', TWO_DISTINCT, 'c1'],
  ['listed negator: neither', 'neither acme', TWO_DISTINCT, 'c1'],
  ['listed negator: none', 'none of acme', TWO_DISTINCT, 'c1'],
  // ---- UNLISTED negators / exclusion phrasings ----
  ['UNLISTED: exclude', 'exclude acme', TWO_DISTINCT, 'c1'],
  ['UNLISTED: excludes', 'excludes acme', TWO_DISTINCT, 'c1'],
  ['UNLISTED: besides', 'everything besides acme', TWO_DISTINCT, 'c1'],
  ['UNLISTED: aside from', 'aside from acme', TWO_DISTINCT, 'c1'],
  ['UNLISTED: apart from', 'apart from acme', TWO_DISTINCT, 'c1'],
  ['UNLISTED: avoid', 'avoid acme', TWO_DISTINCT, 'c1'],
  ['UNLISTED: omit', 'omit acme', TWO_DISTINCT, 'c1'],
  ['UNLISTED: ignore', 'ignore acme', TWO_DISTINCT, 'c1'],
  ['UNLISTED: save', 'save acme', TWO_DISTINCT, 'c1'],
  ['UNLISTED: anything else', 'anything else, acme is fine', TWO_DISTINCT, 'c1'],
  ['UNLISTED: minus', 'all of them minus acme', TWO_DISTINCT, 'c1'],
  ['UNLISTED: stop', 'stop, acme', TWO_DISTINCT, 'c1'],
  ['UNLISTED: cancel', 'cancel acme', TWO_DISTINCT, 'c1'],
  ['UNLISTED: forget', 'forget acme', TWO_DISTINCT, 'c1'],
  ['UNLISTED: hold off on', 'hold off on acme', TWO_DISTINCT, 'c1'],
  ['UNLISTED: wrong one', 'wrong one, acme', TWO_DISTINCT, 'c1'],
  ['UNLISTED: nope', 'nope acme', TWO_DISTINCT, 'c1'],
  ['UNLISTED: nah', 'nah acme', TWO_DISTINCT, 'c1'],
  ['UNLISTED: unless', 'unless acme', TWO_DISTINCT, 'c1'],
  // ---- negation split ACROSS a clause boundary ----
  ['SPLIT: no. acme', 'no. acme', TWO_DISTINCT, 'c1'],
  ['SPLIT: not that one, acme', 'not that one, acme', TWO_DISTINCT, 'c1'],
  ['SPLIT: acme? no', 'acme? no', TWO_DISTINCT, 'c1'],
  ['SPLIT: acme, no', 'acme, no', TWO_DISTINCT, 'c1'],
  ['SPLIT: acme - no', 'acme - no', TWO_DISTINCT, 'c1'],
  ['FOUNDER SHAPE: acme? no, the holdings one', 'acme? no, the holdings one', TWO, 'c1'],
  // ---- negators inside quotes (forMatching strips quotes) ----
  ['QUOTED negator', 'the one that is "not" acme', TWO_DISTINCT, 'c1'],
  // ---- unicode dashes / punctuation the splitter does not know ----
  ['EM DASH clause', 'acme — not that one', TWO_DISTINCT, 'c1'],
  ['COLON clause', 'not this: acme', TWO_DISTINCT, 'c1'],
  ['NEWLINE clause', 'not that one\nacme', TWO_DISTINCT, 'c1'],
  // ---- double negatives (correctly ambiguous either way; must not bind) ----
  ['DOUBLE NEG', 'not not acme', TWO_DISTINCT, 'c1'],
  ['DOUBLE NEG 2', "dont not archive acme", TWO_DISTINCT, 'c1'],
];

// -------------------- (b) OVER-REFUSAL: legitimate replies that must still bind ----------
const LEGIT = [
  ['plain name', 'acme', TWO_DISTINCT, 'c1'],
  ['name in a sentence', 'archive acme please', TWO_DISTINCT, 'c1'],
  ['longest wins', 'acme holdings', TWO, 'c2'],
  ['real name containing "No"', 'no limits inc', [O('c1', 'No Limits Inc'), O('c2', 'Beta Corp')], 'c1'],
  ['real name containing "Not"', 'not just bagels', [O('c1', 'Not Just Bagels'), O('c2', 'Beta Corp')], 'c1'],
  ['real name containing "Except"', 'except studios', [O('c1', 'Except Studios'), O('c2', 'Beta Corp')], 'c1'],
  ['real name containing "Nothing"', 'nothing bundt cakes', [O('c1', 'Nothing Bundt Cakes'), O('c2', 'Beta Corp')], 'c1'],
  ['real name containing "Never"', 'never say never llc', [O('c1', 'Never Say Never LLC'), O('c2', 'Beta Corp')], 'c1'],
  ['real name containing "But"', 'nothing but net', [O('c1', 'Nothing But Net'), O('c2', 'Beta Corp')], 'c1'],
  ['real name containing "Keep"', 'keep it simple co', [O('c1', 'Keep It Simple Co'), O('c2', 'Beta Corp')], 'c1'],
  ['real name containing "None"', 'none the wiser ltd', [O('c1', 'None The Wiser Ltd'), O('c2', 'Beta Corp')], 'c1'],
  ['real name containing "Without"', 'without a trace inc', [O('c1', 'Without A Trace Inc'), O('c2', 'Beta Corp')], 'c1'],
  ['negator in ANOTHER clause, name clean', 'yes do it. acme', TWO_DISTINCT, 'c1'],
  ['affirmative with "no problem" in other clause', 'acme. no problem', TWO_DISTINCT, 'c1'],
  ['negation of a DIFFERENT option', 'not beta corp, acme', TWO_DISTINCT, 'c1'],
  ['negation of a DIFFERENT option (3 opts)', 'not beta corp, gamma llc', THREE, 'c3'],
  ['polite request with "but"', 'acme, but hurry', TWO_DISTINCT, 'c1'],
  ['"keep going" alongside a name', 'acme, keep going', TWO_DISTINCT, 'c1'],
  ['"no rush" alongside a name', 'acme, no rush', TWO_DISTINCT, 'c1'],
  ['"nothing else" alongside a name', 'acme, nothing else', TWO_DISTINCT, 'c1'],
  ["\"can't wait\" alongside a name", "acme, cant wait", TWO_DISTINCT, 'c1'],
  ['apostrophe name D102 pair', "bob's co", [O('c1', "Bob's Co"), O('c2', 'Bobs Co')], 'c1'],
];

const idOf = (r) => (r ? r.id : null);
let misbinds = 0, deadends = 0, regressions = 0;
const rows = [];

console.log('=== (a) MIS-BIND HUNT: reply EXCLUDES the named option; expected NULL ===');
for (const [name, cmd, opts, excluded] of EXCLUSIONS) {
  const c = idOf(cand(cmd, opts));
  const b = idOf(base(cmd, opts));
  const bound = c === excluded;
  if (bound) misbinds++;
  rows.push({ dir: 'misbind', name, cmd, cand: c, base: b, verdict: bound ? 'MIS-BIND (P1)' : 'ok' });
  console.log(`${bound ? 'P1-MISBIND' : 'ok        '}  cand=${String(c).padEnd(6)} base=${String(b).padEnd(6)}  ${name}  << ${cmd.replace(/\n/g, '\\n')}`);
}

console.log('\n=== (b) OVER-REFUSAL HUNT: legitimate reply; expected the named option ===');
for (const [name, cmd, opts, want] of LEGIT) {
  const c = idOf(cand(cmd, opts));
  const b = idOf(base(cmd, opts));
  const de = c !== want;
  const reg = de && b === want;
  if (de) deadends++;
  if (reg) regressions++;
  rows.push({ dir: 'overrefusal', name, cmd, cand: c, base: b, want, verdict: reg ? 'REGRESSION vs d724d8c' : de ? 'dead-end (also at base)' : 'ok' });
  console.log(`${reg ? 'REGRESSION' : de ? 'dead-end  ' : 'ok        '}  cand=${String(c).padEnd(6)} base=${String(b).padEnd(6)} want=${String(want).padEnd(4)} ${name}  << ${cmd}`);
}

console.log(`\nSCENARIO 0 TOTALS: mis-binds=${misbinds}  dead-ends=${deadends}  regressions-vs-d724d8c=${regressions}`);
import('node:fs').then((fs) => fs.writeFileSync('qa/verification/scratch/v16_s0_result.json',
  JSON.stringify({ misbinds, deadends, regressions, rows }, null, 2)));
