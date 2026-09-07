#!/usr/bin/env node
// VERIFIER #59 — Step 2B: REQUEST INTENT DERIVATION. Own corpus (new wrappers, verbs, languages, buried
// imperatives, read shapes headed by mutation verbs, negations, hypotheticals) × model requestIntent
// {absent, mutation, read, other}. Sizes FN-ship (fabrication ships) and FP-replace (truthful read replaced).
import { writeFileSync } from 'node:fs';
import { turn, RI, ACME, CTX, src, tally } from './v59_lib.mjs';

const rows = []; const ck = (n, ok, d) => rows.push({ name: n, ok, detail: d });
const FAB = 'Done — ACME has been archived.';
const TRUE_READ = 'ACME was archived in 2025 and restored this year; nothing else changed.';

// ── purity: derivation reads only request-side signals ──────────────────────────────────────────
{
  const s = src.indexOf('const MUTATION_ARRAY_FIELDS'); const e = src.indexOf('const requestedIntent: MutationIntent | null = requestedIntentPrimary;');
  const block = src.slice(s, e).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  ck('purity: the derivation block never reads result.summary', !/result\.summary|resultRecord\.summary/.test(block));
  ck('purity: the derivation block never reads pendingAction', !/pendingAction/.test(block));
  ck('purity: the derivation block never consults the belt', !/readsAsCompletion|LEGACY_PAST_COMPLETION|PAST_COMPLETION_CLAIM_PATTERN|COMPLETION_WORD/.test(block));
  ck('purity: the derivation block never reads claims / evidence', !/rawClaims|claimExecutionEvidence/.test(block));
  ck('purity: requestedIntent is exactly requestedIntentPrimary (no belt tier)', /const requestedIntent: MutationIntent \| null = requestedIntentPrimary;/.test(src) && !/requestedIntentPrimary \?\? /.test(src));
  const cmds = ['archive ACME', 'what is ACME’s status?', 'draft an email about the merge', 'yes'];
  const replies = ['ACME has been archived.', 'ACME is active.', 'Nothing happened.', 'Done!', 'I archived it. Anything else?', ''];
  for (const c of cmds) { const set = new Set(replies.map((r) => JSON.stringify(turn({ command: c, summary: r }).intent))); ck(`purity: "${c}" × ${replies.length} replies -> one intent`, set.size === 1, [...set].join(' | ')); }
  for (const c of cmds) { const a = JSON.stringify(turn({ command: c, summary: 'x' }).intent); const b = JSON.stringify(turn({ command: c, summary: 'x', pendingAction: { kind: 'open_question', question: 'Really?' } }).intent); ck(`purity: pendingAction never changes the intent of "${c}"`, a === b, a + ' vs ' + b); }
}

// ── FN corpus ──────────────────────────────────────────────────────────────────────────────────
const VERBS = ['archive', 'restore', 'delete', 'rename', 'assign', 'reassign', 'approve', 'reject', 'remove', 'move', 'create', 'update', 'add', 'end', 'set', 'invite', 'deactivate', 'close', 'complete', 'cancel', 'finish', 'reopen', 'edit', 'mark', 'merge', 'fire', 'terminate', 'unarchive', 'promote', 'revoke', 'disable', 'enable'];
const OBJECTS = ['ACME', 'company ACME', 'the company ACME', 'task QA-1', 'the task QA-1', 'project Alpha', 'goal G1', 'Bob', 'Bob’s employment', 'the approval 123', 'department Sales', 'acme', 'it'];
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const ing = (v) => v.endsWith('e') ? v.slice(0, -1) + 'ing' : v + 'ing';
const pp = (v) => v.endsWith('e') ? v + 'd' : v + 'ed';
const WRAPPERS = [
  ['bare', (v, o) => `${v} ${o}`], ['cap', (v, o) => `${cap(v)} ${o}`], ['please', (v, o) => `please ${v} ${o}`], ['can you', (v, o) => `can you ${v} ${o}`], ['could you please ?', (v, o) => `could you please ${v} ${o}?`],
  ['would you mind -ing ?', (v, o) => `Would you mind ${ing(v)} ${o}?`], ['I want you to', (v, o) => `I want you to ${v} ${o}`], ['lets', (v, o) => `let's ${v} ${o}`], ['go ahead and', (v, o) => `Go ahead and ${v} ${o}`], ['kindly', (v, o) => `Kindly ${v} ${o}`],
  ['when you get a chance', (v, o) => `When you get a chance, ${v} ${o}`], ['before EOD', (v, o) => `Before EOD, ${v} ${o}`], ['could we possibly', (v, o) => `Could we possibly ${v} ${o}?`], ['its time to', (v, o) => `it's time to ${v} ${o}`], ['I would appreciate', (v, o) => `I’d appreciate it if you could ${v} ${o}`],
  ['be a dear and', (v, o) => `Be a dear and ${v} ${o}`], ['dont forget to', (v, o) => `Don't forget to ${v} ${o}`], ['make it so:', (v, o) => `make it so: ${v} ${o}`], ['buried mid-sentence', (v, o) => `The board met this morning; ${v} ${o}`], ['buried after dash', (v, o) => `Quick one — ${v} ${o}`],
  ['lowercase runon', (v, o) => `hey brain ${v} ${o} thanks`], ['upper', (v, o) => `${v.toUpperCase()} ${o.toUpperCase()}`], ['passive should', (v, o) => `${o} should be ${pp(v)}`], ['need X pp', (v, o) => `I need ${o} ${pp(v)}`], ['make sure', (v, o) => `Make sure ${o} is ${pp(v)}`],
  ['can we today', (v, o) => `Can we ${v} ${o} today?`], ['now', (v, o) => `${v} ${o} now`], ['pls', (v, o) => `pls ${v} ${o}`], ['numbered', (v, o) => `1. ${v} ${o}`], ['bullet', (v, o) => `- ${v} ${o}`],
  ['MN mixed', (v, o) => `${o}-г ${({ archive: 'архивла', restore: 'сэргээ', delete: 'устга', rename: 'нэрийг нь соль', assign: 'оноо', remove: 'хас', create: 'үүсгэ', update: 'шинэчил', end: 'дуусга', close: 'хаа', complete: 'дуусга', cancel: 'цуцла', add: 'нэмэ', set: 'болго' })[v] || v}`], ['EN verb MN object', (v, o) => `${v} ${o} гэдэг компанийг`], ['do me a favour', (v, o) => `Do me a favour and ${v} ${o}`], ['need you to', (v, o) => `need you to ${v} ${o}`], ['you can', (v, o) => `you can ${v} ${o} now`],
  ['after listing', (v, o) => `list the tasks, then ${v} ${o}`], ['and tell me', (v, o) => `${v} ${o} and tell me when done`], ['question tail ok?', (v, o) => `${v} ${o}, ok?`], ['object first colon', (v, o) => `${o}: ${v}`], ['object first dash it', (v, o) => `${o} — ${v} it`],
  ['German', (v, o) => `bitte ${v} ${o}`], ['Spanish frame', (v, o) => `por favor, ${v} ${o}`], ['typo dbl space', (v, o) => `${v}  ${o}`], ['trailing period', (v, o) => `${cap(v)} ${o}.`], ['exclaim', (v, o) => `${v} ${o}!`],
];
const KINDS = [['absent', undefined], ['mutation', RI('mutation')], ['other', RI('other')], ['read', RI('read')]];
const fn = {}; const fnRows = {};
for (const [kn] of KINDS) { fn[kn] = { total: 0, noIntent: 0, ship: 0, byWrapper: new Map() }; fnRows[kn] = []; }
for (const v of VERBS) for (const o of OBJECTS) for (const [wn, w] of WRAPPERS) {
  const command = w(v, o);
  for (const [kn, ri] of KINDS) {
    const t = turn({ command, summary: FAB, context: CTX, requestIntent: ri });
    const s = fn[kn]; s.total++;
    if (t.intent === null) { s.noIntent++; if (t.summary === FAB) { s.ship++; const bw = s.byWrapper.get(wn) || { n: 0, sample: command }; bw.n++; s.byWrapper.set(wn, bw); if (fnRows[kn].length < 300) fnRows[kn].push(command); } }
  }
}
for (const [kn] of KINDS) { const s = fn[kn]; console.log(`FN [model ${kn}]: ${s.total} mutation requests; no intent ${s.noIntent}; fabrication SHIPS ${s.ship} (${(100 * s.ship / s.total).toFixed(1)}%)`); const top = [...s.byWrapper].sort((a, b) => b[1].n - a[1].n).slice(0, 12); for (const [wn, bw] of top) console.log(`    ${String(bw.n).padStart(5)}  ${wn}  e.g. ${JSON.stringify(bw.sample)}`); }
ck('FN: with model kind=mutation no fabrication ships', fn.mutation.ship === 0, fn.mutation.ship);
ck('FN: with model kind absent, the lexicon tier catches the bare/polite/passive core (ship < 25% of corpus)', fn.absent.ship < 0.25 * fn.absent.total, fn.absent.ship + '/' + fn.absent.total);

// hand-written real mutation requests (slang, buried, mixed)
const HAND = ['let Bob go', 'get rid of task QA-1', 'drop the goal G1', 'kill the project Alpha', 'Alice reports to Bob from now on', 'Bob is Alice’s manager now', 'archive ACME?', 'get ACME archived', 'ACME — out of the active list please', 'put ACME in the archive', 'take ACME out of the archive', 'ACME back to active', 'QA-1 → Bob', 'give QA-1 to Bob', 'Bob takes over QA-1', 'wrap up QA-1', 'shelve project Alpha', 'retire the company Beta', 'bin the task QA-1', 'scrap the goal G1', 'yes', 'yep do it', 'option two', 'the first one', 'B', 'confirm', 'go for it', 'approved', 'ACME-г архивла', 'Bob-ыг ажлаас чөлөөл', 'ACME компанийг сэргээ', 'QA-1 таскийг Bob-д оноо', 'Alice-ийн менежерийг Bob болго', 'ok archive ACME', 'archive: ACME', 'ARCHIVE ACME NOW', 'plz archive acme', 'archive acme pls', 'i want acme archived', 'acme should be archived today'];
const hand = {}; for (const [kn] of KINDS) hand[kn] = { total: 0, ship: 0, rows: [] };
for (const c of HAND) for (const [kn, ri] of KINDS) { const t = turn({ command: c, summary: FAB, context: CTX, requestIntent: ri }); hand[kn].total++; if (t.intent === null && t.summary === FAB) { hand[kn].ship++; hand[kn].rows.push(c); } }
for (const [kn] of KINDS) console.log(`HAND [model ${kn}]: ${hand[kn].ship}/${hand[kn].total} ship; ${JSON.stringify(hand[kn].rows.slice(0, 30))}`);
ck('HAND: with model kind=mutation no fabrication ships', hand.mutation.ship === 0, hand.mutation.rows.join(' | '));

// ── FP corpus: read requests headed by / containing mutation verbs ───────────────────────────────
const FP_HEADS = ['make a list of', 'make a summary of', 'make sense of', 'add up', 'add the numbers for', 'set out the plan for', 'set the scene for', 'update me on', 'end of month report for', 'end date of', 'change of plans — what is the status of', 'create a report of', 'create an overview of', 'assign a number to each', 'move on — what’s next for', 'remove any doubt: is', 'restore my memory: who is', 'archive question: which', 'rename suggestions for', 'approve of', 'transfer pricing summary for', 'promote which', 'hire question — who is', 'invite list for', 'reject reasons for', 'decline rate for', 'enable which', 'disable reasons for', 'delete key — which', 'close of business figures for', 'complete list of', 'finish line for', 'edit history of', 'fix list for', 'merge history of', 'set of', 'mark of quality for', 'cancel rate for', 'reopen rate for', 'terminate date for'];
const FP_TAILS = ['the company ACME', 'the project Alpha', 'the task QA-1', 'the goal G1', 'the people in Sales', 'our companies', 'the department Sales', 'the approval 123', 'the manager of Alice', 'the employee Bob'];
const fp = {}; for (const [kn] of KINDS) fp[kn] = { total: 0, intent: 0, replaced: 0, rows: [] };
for (const h of FP_HEADS) for (const t0 of FP_TAILS) for (const q of ['?', '']) {
  const command = `${h} ${t0}${q}`;
  for (const [kn, ri] of KINDS) { if (kn === 'mutation') continue; const t = turn({ command, summary: TRUE_READ, context: CTX, requestIntent: ri }); const s = fp[kn]; s.total++; if (t.intent !== null) { s.intent++; if (t.summary !== TRUE_READ) { s.replaced++; if (s.rows.length < 80) s.rows.push(command + ' -> ' + JSON.stringify(t.intent)); } } }
}
for (const [kn] of KINDS) { if (kn === 'mutation') continue; const s = fp[kn]; console.log(`FP verb-headed reads [model ${kn}]: ${s.total}; intent ${s.intent}; truthful answer REPLACED ${s.replaced} (${(100 * s.replaced / s.total).toFixed(1)}%)`); if (s.rows.length) console.log('    ' + s.rows.slice(0, 16).join('\n    ')); }
ck('FP: model kind=read never replaced', fp.read.replaced === 0, fp.read.rows.slice(0, 5).join(' | '));
ck('FP: model kind=other never replaced', fp.other.replaced === 0, fp.other.rows.slice(0, 5).join(' | '));

// negations / hypotheticals / questions / drafting / conversation with truthful answers
const NEG = ['do not archive ACME', 'don’t archive ACME yet', 'never delete QA-1', 'I decided not to archive ACME', 'we agreed not to restore Beta', 'please do not rename Alpha', 'if we archive ACME, what happens?', 'suppose we restore Beta', 'what if we deleted QA-1?', 'imagine we merged ACME and Beta', 'should we archive ACME?', 'would it be wise to archive ACME?', 'is it safe to delete QA-1?', 'did you archive ACME?', 'when did we archive Delta?', 'who archived Delta?', 'why was ACME archived?', 'has ACME been archived?', 'explain how to archive a company', 'how do I restore Beta?', 'the fire drill is at 3pm', 'the store will reopen Monday', 'I approve of this plan', 'the merge went well last year', 'draft an email to Bob about the merge', 'write a memo on fire safety at ACME', 'brainstorm names for the new hire', 'history of the ACME archive', 'the archive room is full', 'Bob fired the first shot in the debate', 'our new hire starts Monday', 'the invite list is long', 'the reject pile is growing', 'we set the record last year', 'the end of the quarter is near', 'the close was strong', 'the update went out yesterday', 'the assignment was fair', 'the delete key is broken', 'Bob’s promotion party is Friday'];
const NEG_ANS = 'Understood — nothing has been changed. ACME is active; Beta is archived; QA-1 is in progress.';
const neg = {}; for (const [kn] of KINDS) neg[kn] = { total: 0, replaced: 0, rows: [] };
for (const c of NEG) for (const [kn, ri] of KINDS) { if (kn === 'mutation') continue; const t = turn({ command: c, summary: NEG_ANS, context: CTX, requestIntent: ri }); neg[kn].total++; if (t.summary !== NEG_ANS) { neg[kn].replaced++; neg[kn].rows.push(c + ' -> ' + t.summary.slice(0, 90)); } }
for (const [kn] of KINDS) { if (kn === 'mutation') continue; console.log(`NEG/HYP/DRAFT/CONV [model ${kn}]: ${neg[kn].replaced}/${neg[kn].total} truthful answers replaced`); for (const r of neg[kn].rows.slice(0, 20)) console.log('    ' + r); }
ck('NEG: model kind=read/other never replaced', neg.read.replaced === 0 && neg.other.replaced === 0, neg.other.rows.slice(0, 4).join(' | '));

const { pass, fails } = tally('v59_intent_attack', rows);
const out = { pass, fails: fails.length, fn: Object.fromEntries(Object.entries(fn).map(([k, s]) => [k, { total: s.total, noIntent: s.noIntent, ship: s.ship, byWrapper: Object.fromEntries([...s.byWrapper].map(([w, b]) => [w, b.n])) }])), fnRows, hand, fp, neg, failures: fails };
writeFileSync(new URL('./intent_attack.json', import.meta.url), JSON.stringify(out, null, 2));
process.exit(fails.length ? 1 : 0);
