// VERIFIER #54 — the differential. Models BOTH binaries' prose-overwrite behaviour on an
// ungrounded turn, including the FOURTH path (findEntityStateClaimContradiction's
// confirmed-true SUPPRESSION of claimsLifecycleClaim) which qa/verification/lib/v92_reference.mjs
// does NOT model. That path is byte-identical in v92 and the candidate, so it cancels in the
// differential — but it changes whether a row is PARITY or a real regression, which is exactly
// the dangerous direction, so it is modelled explicitly here rather than assumed away.
import { gate, CAND, V92, sha } from './harness.mjs';
import { ROWS, PACK, O1_PACK_EXTRA, COUNTS } from './corpus.mjs';
import { LIFECYCLE_CLAIM, FUTURE_PROMISE_PATTERN, PAST_COMPLETION_CLAIM_PATTERN } from '../../lib/v92_reference.mjs';
import { readFileSync } from 'node:fs';

const CANDSRC = readFileSync(CAND, 'utf8').replace(/\r\n/g, '\n');
const V92SRC = readFileSync(V92, 'utf8').replace(/\r\n/g, '\n');

// candidate's FUTURE arm, lifted from the candidate bytes (it is NOT identical to v92's: the
// candidate widens the apostrophe class and adds the founder-ruled conditioned-offer stand-down).
function liftFutureArm(src) {
  const m = src.match(/const FUTURE_PROMISE_PATTERN = (\/[^\n]*\/i);/);
  if (!m) throw new Error('FUTURE_PROMISE_PATTERN not found');
  const pat = new Function('return ' + m[1])();
  const cm = src.match(/&& \(\(__s\) => FUTURE_PROMISE_PATTERN\.test\(__s\) && !(\/[\s\S]*?\/i)\.test\(__s\)\)\(String\(result\.summary \|\| ''\)\);/);
  if (!cm) return (s) => pat.test(String(s)); // v92 has no stand-down
  const cond = new Function('return ' + cm[1])();
  return (s) => pat.test(String(s)) && !cond.test(String(s));
}
const CAND_FUTURE = liftFutureArm(CANDSRC);
const V92_FUTURE = liftFutureArm(V92SRC);
if (CAND_FUTURE === V92_FUTURE) throw new Error('arms not independently lifted');
// non-vacuity: the stand-down must actually be lifted (it must change at least one verdict)
if (!(V92_FUTURE('Archiving ACME now — once you confirm.') === false)) { /* v92 pattern needs i'll/going to */ }
if (CAND_FUTURE('I’ll archive ACME once you confirm.') !== false) throw new Error('stand-down not lifted');
if (CAND_FUTURE('I’ll archive ACME.') !== true) throw new Error('candidate FUTURE arm not lifted');
if (V92_FUTURE('I’ll archive ACME.') !== false) throw new Error('v92 curly-apostrophe gap not reproduced');

// FOURTH PATH — transcribed from the shared bytes (identical in both files, asserted below).
function fnText(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('missing ' + name);
  return src.slice(i, src.indexOf('\n}', i) + 2);
}
for (const n of ['claimsLifecycleClaim', 'findEntityStateClaimContradiction']) {
  if (fnText(CANDSRC, n) !== fnText(V92SRC, n)) throw new Error(n + ' differs — the differential model is wrong');
}
const COMPANY_VOCAB = { archived: (s) => s === 'archived', active: (s) => s !== 'archived' };
const PERSON_VOCAB = { employed: (a) => a === true, active: (a) => a === true };
function findStateClaim(summary, entities, vocab) {
  for (const e of entities) {
    if (!e || typeof e.name !== 'string' || !e.name.trim()) continue;
    const escaped = e.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const word of Object.keys(vocab)) {
      const p = new RegExp(`\\b${escaped}\\b(?:'s status)?\\s+(?:is|are)\\s+(?:currently\\s+|already\\s+)?${word}\\b`, 'i');
      if (!p.test(summary)) continue;
      return { name: e.name.trim(), contradicted: !vocab[word](e.state) };
    }
  }
  return null;
}
// The pack, with real states, for the fourth path. Every company active except ACME Corp.
const COMPANY_ENTITIES = PACK.map((n) => ({ name: n, state: n === 'ACME Corp' ? 'archived' : 'active' }));
const PERSON_ENTITIES = [{ name: 'Bob Smith', state: true }, { name: 'Jane Doe', state: true }, { name: 'Dr. Sarah Chen', state: true }];

/** The LIFECYCLE arm AS PRODUCTION ACTUALLY RUNS IT — including the confirmed-true suppression. */
function lifecycleEffective(s) {
  if (!LIFECYCLE_CLAIM(s)) return false;
  const c = findStateClaim(s, COMPANY_ENTITIES, COMPANY_VOCAB);
  const p = findStateClaim(s, PERSON_ENTITIES, PERSON_VOCAB);
  // v92:2975 / cand:3401 — `!(result && !result.contradicted)` suppresses the arm.
  if (c && !c.contradicted) return false;
  if (p && !p.contradicted) return false;
  return true;
}
// Non-vacuity of the fourth-path model: it must actually suppress at least one row.
if (lifecycleEffective('ACME Company is active. I restored ACME Company yesterday.') !== false) {
  throw new Error('fourth-path suppression is vacuous — model is wrong');
}
if (LIFECYCLE_CLAIM('ACME Company is active. I restored ACME Company yesterday.') !== true) {
  throw new Error('fourth-path row does not exercise the LIFECYCLE arm — witness is vacuous');
}

const PACKED = [...PACK, ...O1_PACK_EXTRA];
const G_POP = gate(PACKED);
const G_EMPTY = gate([]);

function run(G, label, cancelLifecycle = false) {
  const rows = ROWS.map((r) => {
    const s = r.text;
    // CONSERVATIVE MODE: the LIFECYCLE arm is byte-identical in both binaries, so cancelling it
    // on both sides can only EXPOSE belt-only differences a shared-arm model would mask as parity.
    const lif = cancelLifecycle ? false : lifecycleEffective(s);
    const v92 = lif || V92_FUTURE(s) || PAST_COMPLETION_CLAIM_PATTERN.test(s);
    const reads = G.readsAsCompletion(s);
    const cand = lif || CAND_FUTURE(s) || reads;
    let q;
    if (r.truthful) q = (!v92 && cand) ? 'TRUTH_REGRESSION' : (v92 && !cand) ? 'TRUTH_RESCUE' : 'PARITY';
    else q = (v92 && !cand) ? 'FAB_REGRESSION' : (!v92 && cand) ? 'FAB_RESCUE' : 'PARITY';
    return { ...r, lif, v92, cand, reads, q };
  });
  const by = {};
  for (const r of rows) by[r.q] = (by[r.q] || 0) + 1;
  const shipped = rows.filter((r) => !r.truthful && !r.cand);
  console.log(`\n===== ${label} =====`);
  console.log('corpus:', JSON.stringify(COUNTS));
  console.log('quadrants:', JSON.stringify(by));
  console.log('FABRICATIONS STILL SHIPPING (cand does not correct):', shipped.length);
  for (const r of rows.filter((x) => x.q === 'TRUTH_REGRESSION')) {
    console.log(`  TR  [${r.section}] ${JSON.stringify(r.text)}  (lif=${r.lif} v92=${r.v92} reads=${r.reads})`);
  }
  for (const r of rows.filter((x) => x.q === 'FAB_REGRESSION')) {
    console.log(`  FR  [${r.section}] ${JSON.stringify(r.text)}`);
  }
  for (const r of shipped) console.log(`  SHIP[${r.section}] ${JSON.stringify(r.text)}`);
  return { rows, by, shipped };
}

console.log('candidate sha256:', sha(CAND));
console.log('v92 sha256      :', sha(V92));
const pop = run(G_POP, 'POPULATED PACK (' + PACKED.length + ' names)');
const emp = run(G_EMPTY, 'EMPTY PACK');
const popX = run(G_POP, 'POPULATED PACK — LIFECYCLE CANCELLED (conservative)', true);
const empX = run(G_EMPTY, 'EMPTY PACK — LIFECYCLE CANCELLED (conservative)', true);
import { writeFileSync } from 'node:fs';
writeFileSync(new URL('./differential.json', import.meta.url),
  JSON.stringify({ populated: pop.rows, empty: emp.rows }, null, 1));
const bad = pop.by.TRUTH_REGRESSION || 0;
console.log('\nPOPULATED truth regressions:', bad, '| fabrication regressions:', pop.by.FAB_REGRESSION || 0);
