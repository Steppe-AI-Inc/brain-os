#!/usr/bin/env node
// MUTATION PROOF for the run32 fixes (verifier #32's D175-D178). Each mutation reverts ONE edit;
// the shapes that edit closes must reappear, and the truthful answers it protects must be destroyed.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { buildGate } from '../../lib/belt_extract.mjs';

const SRC = 'C:/Users/Dell/dev/brain-os/supabase/functions/sem-ai-command/index.ts';
const DIR = 'C:/Users/Dell/dev/brain-os/qa/verification/scratch/v92/mut33';
mkdirSync(DIR, { recursive: true });
const BASE = readFileSync(SRC, 'utf8');
const WIDE = "|couldn['’]?t|wouldn['’]?t|shouldn['’]?t|won['’]?t|unable|unchanged)";

const MUTATIONS = [
  // D175 is NOT mutated as a revert, because measurement showed the revert buys nothing once the
  // new-subject rule exists: all 108 shapes of verifier #32's family, and 6 lowercase-subject
  // variants it did not cover, are caught with the wide lexicon and without it. What IS load-bearing
  // is the R-AUXGAP guard's left-context window, which is what lets the kept lexicon actually
  // preserve the truthful hedged report.
  { id: 'D175.auxGapLeftContextWindow',
    fabs: [],
    truths: ["The task couldn't have been, as requested, archived."],
    apply: (s) => s.replace(/String\(s\)\.slice\(Math\.max\(0, mg\.index - 28\), mg\.index \+ mg\[0\]\.length\)/, 'mg[0]') },
  // D177: restoring the whole-summary guard must re-open the later-sentence disarm.
  { id: 'D177.auxGapGuardIsLocal',
    fabs: ['ACME Holdings was, after review, archived. No further action needed.', 'Beta Corp has been, as requested, deleted. No other records were touched.'],
    truths: [],
    apply: (s) => s.replace(/\(\(mg\) => mg !== null && !\/[^\r\n]*?\)\(new RegExp\(/, '(new RegExp(')
                   .replace(/\.exec\(String\(s\)\)\)/, ".test(String(s)) && !NEGATED_CLAUSE.test(String(s)))") },
  // D176: narrowing the CONFIRMED guard back to a bare capitalised run must re-destroy the reports.
  { id: 'D176.confirmedGuardSpansAnything',
    fabs: [],
    truths: ['Confirmed — Archived Media Group, our client, remains active.', 'Confirmed — Archived Salt and Pepper Co remains active.', 'Confirmed — Archived Media Group and Closed Loop Systems remain active.'],
    apply: (s) => s.replace(/\(\?:\(\?!\\b\(\?:not\|never\|no\|nobody\|nothing\|none\|neither\|nor\)\\b\)\[\^\.\]\)\{0,80\}\?/, '(?:[A-Z][\\w&’\'-]*\\s+){0,4}?') },
  // D178 part one: the new-subject rule.
  { id: 'D180.newSubject',
    fabs: ['No errors ACME was archived.', 'Not a single task moved — Bob Smith was removed.'],
    truths: [],
    apply: (s) => s.replace(/const newSubject = [^\r\n]*;/, 'const newSubject = false;') },
  // D178 part two: the determiner-led idiom strip.
  { id: 'D181.idiomBeforeDeterminerNP',
    fabs: ['No problem the log shows ACME was archived.'],
    truths: [],
    apply: (s) => s.replace(/\.replace\(\/\^\\s\*\(\?:no problem\|[^\r\n]*?\(\?=\(\?:the\|a\|an\|our\|their\|my\|its\|his\|her\)[^\r\n]*?\/i, ''\)/, '') },
];

const live = buildGate(SRC);
const fires = (g, s) => g.readsAsCompletion(String(s)) === true;
let proven = 0;
const notProven = [];
console.log('shipped index.ts: ' + SRC + '\n');
for (const m of MUTATIONS) {
  const mutated = m.apply(BASE);
  if (mutated === BASE) { notProven.push(m.id + ' (no-op)'); console.log(`NOT PROVEN  ${m.id}: mutation did not change the source`); continue; }
  const p = DIR + '/' + m.id.replace(/[^\w.]/g, '_') + '.ts';
  writeFileSync(p, mutated);
  let g;
  try { g = buildGate(p); } catch (e) { notProven.push(m.id + ' (build failed: ' + e.message + ')'); console.log(`NOT PROVEN  ${m.id}: ${e.message}`); continue; }
  const liveOk = m.fabs.every((s) => fires(live, s)) && m.truths.every((s) => !fires(live, s));
  const reopened = m.fabs.filter((s) => !fires(g, s)).length;
  const lost = m.truths.filter((s) => fires(g, s)).length;
  const ok = liveOk && reopened === m.fabs.length && lost === m.truths.length;
  if (ok) proven++; else notProven.push(`${m.id} (live ${liveOk ? 'ok' : 'WRONG'}; re-opened ${reopened}/${m.fabs.length}, cost ${lost}/${m.truths.length})`);
  console.log(`${ok ? 'PROVEN     ' : 'NOT PROVEN '} ${m.id}: reverting re-opens ${reopened}/${m.fabs.length} fabrications, destroys ${lost}/${m.truths.length} truthful answers`);
}
console.log(`\nMUTATION PROOF: ${proven}/${MUTATIONS.length} fixes proven load-bearing`);
if (notProven.length) { console.log('NOT PROVEN:\n  ' + notProven.join('\n  ')); process.exit(1); }
