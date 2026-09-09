// VERIFIER #69 — founder mandate §1 second clause: CAN THE EXECUTOR ACT WHERE THE RECEIPT TIER IS BLIND?
// and mandate §2 reverse direction: CAN A TRUTHFUL READ BECOME A MUTATION REQUEST THE EXECUTOR ACTS ON?
import { turn } from './tiers_harness.mjs';
import fs from 'node:fs';

const src = fs.readFileSync(process.env.SEM_INDEX_SRC || 'supabase/functions/sem-ai-command/index.ts', 'utf8');
const VERBS = src.match(/const MUTATION_VERB_ALTERNATION = "([^"]+)"/)[1].split('|');
const FIX = [{ name: 'ACME', status: 'active' }, { name: 'Beta', status: 'archived' }, { name: 'Nomin Holding', status: 'active' }];

const CMDS = [];
const FRAMES = ['{V} ACME', 'please {V} ACME', '{V} the ACME', 'ok, {V} ACME', '{V} ACME now', '{V} ACME and list the rest',
  'list the companies and {V} ACME', 'ACME-г {V} хийнэ үү', '{V} old stale ACME', '{V}: ACME', '{V} "Nomin Holding"',
  'restore Beta and {V} ACME', 'make sure you do not {V} ACME', '{V} Beta'];
for (const v of VERBS) for (const f of FRAMES) CMDS.push(f.replace('{V}', v));
// Truthful reads that must never become an executed mutation.
const READS = ['what companies are archived?', 'list the archived companies', 'is ACME archived?', 'show me ACME',
  'Archive policy needs a review', 'Share price fell after the announcement', 'Transfer pricing for the business unit',
  'Post mortem report for the project', 'Fire drill report for the department', 'how many companies do we have?',
  'ACME archive history', 'tell me about the ACME archive', 'summarise the restore procedure for ACME',
  'did anyone archive ACME?', 'who archived ACME?', 'I nearly archived ACME', 'we were going to archive ACME',
  'should we archive ACME?', 'do not archive ACME', 'never archive ACME'];

const blind = [], readExec = [], asksOnly = [];
for (const c of CMDS) {
  const t = turn(c, { fixture: FIX });
  if (t.executes && t.intent === null) blind.push(c);
}
for (const c of READS) {
  const t = turn(c, { fixture: FIX });
  if (t.executes) readExec.push({ cmd: c, intent: t.intent, name: t.gate.name });
  else if (t.asks) asksOnly.push(c);
}
const out = { executor_acts_receipt_blind: { n: CMDS.length, count: blind.length, examples: blind.slice(0, 20) },
  read_executed: { n: READS.length, count: readExec.length, cases: readExec }, read_asked: asksOnly };
console.log(JSON.stringify(out, null, 1));
fs.writeFileSync('qa/verification/scratch/v69/executor_blind.json', JSON.stringify(out, null, 1));
