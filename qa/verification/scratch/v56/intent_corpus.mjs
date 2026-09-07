// VERIFIER #56 — sizing the request-intent derivation (Step 2B/2H) on a generated corpus, through the
// REAL structured-claim window (contract_harness.run). Two questions, each sized:
//   FN: a real mutation request derives NO intent  -> with claims:null and no model field a fabrication ships
//   FP: a read request derives intent              -> the truthful read answer is replaced by the receipt
import { writeFileSync } from 'node:fs';
import { run, ACME } from './contract_harness.mjs';

const CTX = { companies: [{ id: ACME, name: 'ACME', status: 'active' }] };
const FAB = 'Done — ACME has been archived.';
const TRUE_READ = 'ACME was archived in 2025 and restored this year; nothing else changed.';

// ---- FN corpus: verb × object × phrasing wrapper
const VERBS = ['archive', 'restore', 'delete', 'rename', 'assign', 'reassign', 'approve', 'reject', 'remove', 'move', 'create', 'update', 'add', 'end', 'set', 'invite', 'deactivate', 'close', 'complete', 'cancel', 'finish', 'reopen', 'edit', 'mark', 'merge', 'fire', 'terminate'];
const OBJECTS = ['ACME', 'company ACME', 'the company ACME', 'task QA-1', 'the task QA-1', 'project Alpha', 'goal G1', 'Bob', 'Bob’s employment', 'the approval 123', 'department Sales'];
const WRAPPERS = [
  (v, o) => `${v} ${o}`, (v, o) => `${cap(v)} ${o}`, (v, o) => `please ${v} ${o}`, (v, o) => `Please ${v} ${o}.`, (v, o) => `can you ${v} ${o}`,
  (v, o) => `Could you please ${v} ${o}`, (v, o) => `could you please ${v} ${o}?`, (v, o) => `Would you mind ${ing(v)} ${o}?`, (v, o) => `I want you to ${v} ${o}`, (v, o) => `I need you to ${v} ${o}`,
  (v, o) => `Let’s ${v} ${o}`, (v, o) => `let's ${v} ${o}`, (v, o) => `Go ahead and ${v} ${o}`, (v, o) => `go ahead, ${v} ${o}`, (v, o) => `Kindly ${v} ${o}`,
  (v, o) => `Just ${v} ${o}`, (v, o) => `Also ${v} ${o}`, (v, o) => `Then ${v} ${o}`, (v, o) => `And ${v} ${o}`, (v, o) => `Hey, ${v} ${o}`,
  (v, o) => `ok, ${v} ${o}`, (v, o) => `yes, ${v} ${o}`, (v, o) => `Alright — ${v} ${o}`, (v, o) => `${v.toUpperCase()} ${o.toUpperCase()}`, (v, o) => `${o} — ${v} it`,
  (v, o) => `${o}: ${v}`, (v, o) => `${o} should be ${pp(v)}`, (v, o) => `I need ${o} ${pp(v)}`, (v, o) => `Make sure ${o} is ${pp(v)}`, (v, o) => `Can we ${v} ${o} today?`,
  (v, o) => `${v} ${o} now`, (v, o) => `now ${v} ${o}`, (v, o) => `right now: ${v} ${o}`, (v, o) => `${v} ${o} pls`, (v, o) => `pls ${v} ${o}`,
  (v, o) => `${o}-г ${mn(v)}`, (v, o) => `${o} ${mn(v)}`, (v, o) => `${v} ${o} (and tell me when done)`, (v, o) => `1. ${v} ${o}`, (v, o) => `- ${v} ${o}`,
];
function cap(s) { return s[0].toUpperCase() + s.slice(1); }
function ing(v) { return v.endsWith('e') ? v.slice(0, -1) + 'ing' : v + 'ing'; }
function pp(v) { return v.endsWith('e') ? v + 'd' : v + 'ed'; }
function mn(v) { return ({ archive: 'архивла', restore: 'сэргээ', delete: 'устга', rename: 'нэрийг нь соль', assign: 'оноо', remove: 'хас', create: 'үүсгэ', update: 'шинэчил', end: 'дуусга', close: 'хаа', complete: 'дуусга', cancel: 'цуцла' })[v] || v; }
const fnRows = []; let fnTotal = 0, fnMiss = 0, fnShip = 0; const byWrapper = new Map();
WRAPPERS.forEach((w, wi) => { byWrapper.set(wi, { miss: 0, total: 0, sample: w('archive', 'ACME') }); });
for (const v of VERBS) for (const o of OBJECTS) WRAPPERS.forEach((w, wi) => {
  const command = w(v, o);
  const r = run({ command, summary: FAB, context: CTX });
  fnTotal++; byWrapper.get(wi).total++;
  if (r.intent === null) { fnMiss++; byWrapper.get(wi).miss++; if (r.summary === FAB) fnShip++; if (fnRows.length < 400) fnRows.push(command); }
});
console.log(`FN corpus: ${fnTotal} mutation requests; NO intent on ${fnMiss} (${(100 * fnMiss / fnTotal).toFixed(1)}%); fabrication ships verbatim on ${fnShip}`);
console.log('per wrapper (miss/total):');
for (const [wi, s] of byWrapper) console.log(`  ${String(s.miss).padStart(4)}/${String(s.total).padEnd(4)} ${JSON.stringify(s.sample)}`);
// bare-verb head only (the shape the regex is built for)
let headTotal = 0, headMiss = 0; const headMissRows = [];
for (const v of VERBS) for (const o of OBJECTS) { const command = `${v} ${o}`; const r = run({ command, summary: FAB, context: CTX }); headTotal++; if (r.intent === null) { headMiss++; headMissRows.push(command); } }
console.log(`bare head-verb form: ${headMiss}/${headTotal} miss; e.g. ${JSON.stringify(headMissRows.slice(0, 12))}`);

// ---- FP corpus: read requests that begin with (or contain) a listed verb
const READ_HEADS = ['make a list of', 'make a summary of', 'make sense of', 'add up', 'add the numbers for', 'set out the plan for', 'set the scene for', 'update me on', 'end of month report for', 'end date of',
  'change of plans — what is the status of', 'create a report of', 'create an overview of', 'assign a number to each', 'move on — what’s next for', 'remove any doubt: is', 'delete key — which', 'restore my memory: who is', 'archive question: which', 'rename suggestions for',
  'approve of', 'transfer pricing summary for', 'promote which', 'hire question — who is', 'onboard question: who is', 'invite list for', 'reject reasons for', 'decline rate for', 'enable which', 'disable reasons for', 'activate list for'];
const READ_TAILS = ['the company ACME', 'the project Alpha', 'the task QA-1', 'the goal G1', 'the people in Sales', 'our companies', 'the department Sales', 'the approval 123', 'the manager of Alice', 'the employee Bob'];
let fpTotal = 0, fpHit = 0, fpRewrite = 0; const fpRows = [];
for (const h of READ_HEADS) for (const t of READ_TAILS) {
  const command = `${h} ${t}?`;
  const r = run({ command, summary: TRUE_READ, context: CTX });
  fpTotal++;
  if (r.intent !== null) { fpHit++; if (r.summary !== TRUE_READ) fpRewrite++; if (fpRows.length < 60) fpRows.push(command + ' -> ' + JSON.stringify(r.intent)); }
}
console.log(`\nFP corpus: ${fpTotal} read requests; intent derived on ${fpHit} (${(100 * fpHit / fpTotal).toFixed(1)}%); truthful answer REPLACED by the receipt on ${fpRewrite}`);
// plain read requests with NO listed verb at the head: control
const CONTROL = ['what is the status of', 'who manages', 'list', 'show me', 'tell me about', 'how many', 'when was', 'is', 'describe', 'summarize'];
let cTotal = 0, cHit = 0;
for (const h of CONTROL) for (const t of READ_TAILS) { const r = run({ command: `${h} ${t}?`, summary: TRUE_READ, context: CTX }); cTotal++; if (r.intent !== null) cHit++; }
console.log(`control (plain read heads): ${cHit}/${cTotal} derive intent`);
writeFileSync(new URL('./intent_corpus.json', import.meta.url), JSON.stringify({ fnTotal, fnMiss, fnShip, headMiss, headTotal, fpTotal, fpHit, fpRewrite, cTotal, cHit, fnSample: fnRows.slice(0, 120), fpSample: fpRows }, null, 1));
