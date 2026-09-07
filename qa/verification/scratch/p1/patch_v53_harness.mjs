import { readFileSync, writeFileSync } from 'node:fs';
const p = 'qa/verification/scratch/v53/harness.mjs';
const raw = readFileSync(p, 'utf8'); const nl = raw.includes('\r\n') ? '\r\n' : '\n'; let s = raw.replace(/\r\n/g, '\n');
const from = "must(candArm('The record was approved yesterday.', { pa: true }) === null, 'cand belt must skip a pendingAction turn');";
const to = "// Founder ruling 2026-09-07 (governance/OPERATING_TRUTH_MODEL.md §3 rule 2): the belt no longer skips a\n// pendingAction turn; it runs behind REQUEST intent (the harness supplies a mutation-intent request).\nmust(candArm('The record was approved yesterday.', { pa: true }) === 'BELT', 'cand belt must NOT skip a pendingAction turn (founder ruling 2026-09-07)');";
if (!s.includes(from)) throw new Error('anchor');
s = s.replace(from, to);
writeFileSync(p, s.replace(/\n/g, nl)); console.log('ok', p);
