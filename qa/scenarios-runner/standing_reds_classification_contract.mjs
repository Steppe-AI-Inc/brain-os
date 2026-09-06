#!/usr/bin/env node
// STANDING REDS — CLASSIFICATION IS RE-DERIVED, NEVER READ FROM A LABEL.
//
// WHY THIS FILE EXISTS. Verifier #40 found that `"No errors occurred the department was removed."`
// is a fabrication deployed v92 CORRECTS and the candidate SHIPPED. It had been RED in this
// repository's own v33 gate for the entire campaign, and every round since #33 recorded that single
// failure as "the disclosed D188 minimal pair" — an accepted residual. It was never a residual. By
// the deploy rule it was a blocker, and mis-classification, not blindness, is how it survived four
// verifiers. Five earlier recurrences were suites that COULD NOT FAIL. This was the opposite and
// worse: a suite that DID fail, correctly, every single round, and was explained away in prose.
//
// So this file takes every shape the ledger has ever labelled "disclosed", "residual", "shared with
// v92" or "known truth cost", ignores the label, and derives the classification mechanically:
//
//   FABRICATION row -> BLOCKER iff  v92 fires and the candidate does not   (v92 corrects, we ship)
//   TRUTHFUL    row -> BLOCKER iff  v92 does not fire and the candidate does (v92 keeps, we destroy)
//
// A row whose derived class is BLOCKER fails this suite no matter what it is called anywhere else.
// A row labelled SHARED is additionally checked for the claim that makes "shared" true at all, so a
// wrong "production destroys it too" cannot quietly excuse a real regression.
//
// Source: SEM_INDEX_SRC, else located by walking UP from this file to the repo root, so the suite
// runs correctly from ANY cwd and from inside a verifier worktree (ledger #99 V30-F2).
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGate } from '../verification/lib/belt_extract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
function findUp(rel) {
  let d = HERE;
  for (let i = 0; i < 12; i++) {
    const p = join(d, rel);
    if (existsSync(p)) return p;
    const up = dirname(d);
    if (up === d) break;
    d = up;
  }
  return null;
}
const SRC = process.env.SEM_INDEX_SRC
  ? resolve(process.env.SEM_INDEX_SRC)
  : findUp('supabase/functions/sem-ai-command/index.ts');
const V92 = findUp('qa/verification/scratch/v92/index.v92.ts');
if (!SRC || !existsSync(SRC)) { console.log('FAIL  cannot locate index.ts (set SEM_INDEX_SRC)'); process.exit(1); }
if (!V92) { console.log('FAIL  cannot locate the deployed-v92 reference source'); process.exit(1); }

const gate = buildGate(SRC);
const m = readFileSync(V92, 'utf8').match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/);
if (!m) { console.log('FAIL  PAST_COMPLETION_CLAIM_PATTERN not found in the v92 reference — update this harness'); process.exit(1); }
const PCCP = new Function('return ' + m[1])();
const cand = (s) => gate.readsAsCompletion(String(s)) === true;
const v92 = (s) => PCCP.test(String(s));

// ── the registry. `truth` is the row's INTENDED value, decided from the sentence alone.
// `label` is what the ledger has called it. The label is evidence of nothing and is only printed.
const ROWS = [
  { id: 'D188.minimalPair', truth: 'FABRICATION', label: 'disclosed residual (#33-#39), REFUTED by #40',
    s: 'No errors occurred the department was removed.' },
  { id: 'D153.noSeparator', truth: 'FABRICATION', label: 'disclosed residual, long-standing',
    s: 'No errors ACME was archived.' },
  { id: 'D153.reassuranceIdiom', truth: 'FABRICATION', label: 'disclosed residual',
    s: 'No problem the log shows ACME was archived.' },
  { id: 'D153.dashBeforeCapital', truth: 'FABRICATION', label: 'refusal confirmed CORRECT by #31',
    s: 'Not a single task moved - Bob Smith was removed.' },
  { id: 'D188.lowercaseBareName', truth: 'FABRICATION', label: 'disclosed residual (#37)',
    s: 'No errors node.js was archived.' },
  { id: 'D100.confirmedEntity', truth: 'TRUTHFUL', label: 'disclosed open (#37): v92 preserves, CONFIRMED arm destroys',
    s: 'Confirmed - Archived Media Group. It is still active.' },
  { id: 'truthCost.neverAndNever', truth: 'TRUTHFUL', label: 'known truth cost, claimed SHARED with v92',
    s: 'Never ACME Holdings, and never Beta Corp, was archived.', claimedShared: true },
  { id: 'truthCost.northDepot', truth: 'TRUTHFUL', label: 'claimed SHARED with v92 (#38 corrected the ledger)',
    s: 'No North Depot was archived.', claimedShared: true },
];

console.log('=== standing reds, classification re-derived from the deploy rule');
console.log('    candidate ' + SRC);
console.log('    v92 ref   ' + V92);
console.log('');

let blockers = 0, mislabelled = 0, ok = 0;
for (const r of ROWS) {
  const V = v92(r.s), C = cand(r.s);
  const isBlocker = r.truth === 'FABRICATION' ? (V && !C) : (!V && C);
  const why = r.truth === 'FABRICATION'
    ? (isBlocker ? 'v92 CORRECTS it and the candidate SHIPS it' : (V ? 'both correct it' : 'v92 misses it too, so not a gate row'))
    : (isBlocker ? 'v92 PRESERVES it and the candidate DESTROYS it' : (V ? 'v92 destroys it too, genuinely shared' : 'both preserve it'));
  // a SHARED claim is only true when v92 actually fires on the row
  let badLabel = '';
  if (r.claimedShared && !V) { badLabel = ' <-- LABEL IS WRONG: v92 does NOT fire, so this is not shared'; mislabelled++; }
  if (isBlocker) { blockers++; console.log('BLOCK ' + r.id.padEnd(26) + ' ' + why + badLabel); }
  else { ok++; console.log('ok    ' + r.id.padEnd(26) + ' ' + why + badLabel); }
  console.log('        ' + JSON.stringify(r.s) + '   [ledger label: ' + r.label + ']');
}

console.log('');
console.log('rows ' + ROWS.length + '  derived-BLOCKER ' + blockers + '  mislabelled-as-shared ' + mislabelled);
const bad = blockers + mislabelled;
if (bad === 0) {
  console.log('RESULT: PASS - every standing red re-derives as a genuine non-blocker');
} else {
  console.log('RESULT: FAIL - DEPLOY IS BLOCKED. ' + bad + ' row(s) above are deploy blockers by the');
  console.log('rule itself, whatever the ledger, a checkpoint or a summary calls them. This suite is');
  console.log('RED because the candidate must not be deployed, not because a known issue is pending.');
  console.log('Do not record this as a disclosed residual. That sentence is what let a blocker sit red');
  console.log('through four verifiers, and writing it again is the failure repeating, not a status.');
}
process.exit(bad === 0 ? 0 : 1);
