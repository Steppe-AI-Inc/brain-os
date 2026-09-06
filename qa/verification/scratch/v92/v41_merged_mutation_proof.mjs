// Mutation proof for the THREE fixes applied this round, run against the merged build.
//
// #41's own mutation harness reports M7 as "BUILD FAILED: MUTATION ANCHOR MISSING (harness is lying
// about the product)" on this build. That is correct behaviour, not a gap: its anchor is the literal
// `(?:no longer|not|never)\b`, and #41's own V41-F2 fix is what rewrote that literal. A harness whose
// anchor has moved must fail loudly rather than report a pass it did not measure. This file re-proves
// that arm against the NEW literal, and proves the other two new fixes the same way.
//
// Each mutation REVERTS one fix and asserts the defect it closed comes back. A revert that changes
// nothing is a no-op, and a no-op means the fix is not load-bearing on the rows claimed for it.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildGate } from '../../lib/belt_extract.mjs';

const ROOT = 'C:/Users/Dell/dev/brain-os/';
const MERGED = ROOT + 'qa/verification/scratch/v92/merged41.ts';
const TMP = ROOT + 'qa/verification/scratch/v92/mut_tmp.ts';
const base = readFileSync(MERGED, 'utf8');

const PCCP = new Function('return ' + readFileSync(ROOT + 'qa/verification/scratch/v92/index.v92.ts', 'utf8').match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/)[1])();
const v92 = (s) => PCCP.test(s);

// ── the rows each fix exists for ──────────────────────────────────────────────────────────────
const GERUNDS = ['Archiving', 'Removing', 'Deleting', 'Deactivating', 'Restoring', 'Renaming'];
const NAMES = ['ACME Holdings', 'Bob Smith', 'CLIX GPS', 'Copper Works', 'Beta Corp', 'No Limits Inc'];
const PREDS = ['throws a permission error.', 'revokes access immediately.', 'triggers an offboarding checklist.',
  'generates an audit entry.', 'queues a background job.', 'resets the sort order.'];
const D1 = [];
for (const g of GERUNDS) for (const n of NAMES) for (const p of PREDS) D1.push(`${g} ${n} ${p}`);

const D2 = ['Confirmed — Archived no records.', 'Confirmed — Archived nothing.',
  'Confirmed — Deleted none of them.', 'Confirmed — Removed no one.'];

const LC = [];
for (const neg of ['No errors', 'No problems', 'No issues']) for (const nm of ['node.js', 'acme', 'nginx', 'trade-book.ai'])
  for (const p of ['archived', 'deleted', 'removed']) LC.push(`${neg} ${nm} was ${p}.`);

// ── measurement helpers. Truth rows: destroyed = v92 keeps and the build fires. ───────────────
function measure(src) {
  const g = buildGate(src);
  const f = (s) => g.readsAsCompletion(s) === true;
  return {
    d1Destroyed: D1.filter((s) => !v92(s) && f(s)).length,
    d2Destroyed: D2.filter((s) => !v92(s) && f(s)).length,
    lcShipped: LC.filter((s) => v92(s) && !f(s)).length,
  };
}

function mutate(label, from, to, expect) {
  if (!base.includes(from)) {
    console.log(`ANCHOR MISSING  ${label}  — this harness is describing code that is not there`);
    return false;
  }
  writeFileSync(TMP, base.split(from).join(to));
  const m = measure(TMP);
  const moved = expect(m);
  console.log(`${moved ? 'LOAD-BEARING' : '*** NO-OP ***'}  ${label}`);
  console.log(`     reverted build: D1 truths destroyed ${m.d1Destroyed}/${D1.length}` +
    `   D2 truths destroyed ${m.d2Destroyed}/${D2.length}   lowercase fabrications shipped ${m.lcShipped}/${LC.length}`);
  return moved;
}

const b = measure(MERGED);
console.log('=== merged build (the applied bytes) ===');
console.log(`D1 truths destroyed ${b.d1Destroyed}/${D1.length}   D2 truths destroyed ${b.d2Destroyed}/${D2.length}   lowercase fabrications shipped ${b.lcShipped}/${LC.length}`);
if (b.d1Destroyed || b.d2Destroyed || b.lcShipped) { console.log('FAIL: the applied build does not close all three.'); process.exit(1); }
console.log('');

let ok = 0, total = 0;

// M-A: revert V41-F1 by putting a verb WHITELIST back in place of the structural finite-verb test.
// Reverting to #40's exact guard is what re-opens the proper-name half of the class.
// The anchor is the OPENING of the finite-verb alternative #41 appended to guard B. Reverting it
// to a branch that can never match restores #40's object-shaped test exactly.
total++; if (mutate('V41-F1 gerund structural finite-verb test (revert to #40 object-shaped guard)',
  '|(?:\\S+\\s+){1,8}?(?<!', '|(?:ZZZNEVER\\s+){1,8}?(?<!', (m) => m.d1Destroyed > b.d1Destroyed)) ok++;

// M-B: revert V41-F2 by narrowing the X-guard's negator disjunct back to its pre-fix literal.
total++; if (mutate('V41-F2 CONFIRMED object-negator disjunct',
  'no longer|not|never|no|nothing|none|nobody|no one|neither|nor',
  'no longer|not|never', (m) => m.d2Destroyed > b.d2Destroyed)) ok++;

// M-C: revert the bare-lowercase subject alternative added this round.
total++; if (mutate('bare-lowercase new-subject alternative (blocker A)',
  "|\\b(?!" , "|\\bZZZNEVER(?!", (m) => m.lcShipped > b.lcShipped)) ok++;

console.log('');
console.log(`MUTATIONS: ${ok}/${total} load-bearing, ${total - ok} no-op`);
process.exit(ok === total ? 0 : 1);
