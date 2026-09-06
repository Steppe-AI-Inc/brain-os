// V44 — mutation proof. Each shipped guard is reverted IN MEMORY. A guard whose revert changes
// no verdict on this corpus is reported as a NO-OP *on this corpus* — never as "dead".
import { readSrc, buildV92Gate, buildCandGate, CAND_PATH, V92_PATH } from './v44_harness.mjs';
import * as C from './v44_corpus.mjs';

const src = readSrc(CAND_PATH);
const v92 = buildV92Gate(readSrc(V92_PATH));

const HALVES = [['cap', C.CAP_NAMES], ['lower', C.LOWER_NAMES], ['negname', C.NEG_NAMES], ['titlename', C.TITLE_NAMES]];
const rows = [];
for (const [half, names] of HALVES) for (const N of names) {
  for (const [tag, f] of C.TRUTH_TEMPLATES) rows.push({ label: 'truth', half, tag, text: f(N) });
  for (const [tag, f] of C.HELP_TEMPLATES) rows.push({ label: 'truth', half, tag, text: f(N) });
  for (const [tag, f] of C.FAB_TEMPLATES) rows.push({ label: 'fab', half, tag, text: f(N) });
  for (const [tag, f] of C.FAB_PLUS_TEMPLATES) rows.push({ label: 'fabplus', half, tag, text: f(N) });
}
// Rows that ISOLATE each shipped fix, so a no-op verdict means the fix is dead, not unreached.
const EXTRA = [
  ['truth', 'No problem — the company was not archived.'],
  ['truth', 'Not to worry — the task was not completed.'],
  ['truth', 'The company with no active tasks was not archived.'],
  ['truth', 'Despite no errors, the company was not archived.'],
  ['truth', 'The company was, after review, not archived.'],
  ['truth', 'Confirmed — No Business Unit Archived.'],
  ['truth', 'Confirmed — Archived Media Group. It is still active.'],
  ['truth', 'Confirmed — Archived Media Group is still active.'],
  ['truth', 'Confirmed — Archived Media Group.'],
  ['truth', 'Confirmed — Restored Hardware Ltd.'],
  ['truth', 'No company named Ulaanbaatar — North Depot was archived.'],
  ['truth', 'No unit at Erdenet — Copper Works was archived.'],
  ['truth', 'No company named Salt and Pepper Co was archived.'],
  ['truth', 'I archived no companies.'],
  ['truth', 'The document may have been archived last year.'],
  ['truth', 'It might have been deleted before you joined.'],
  ['truth', 'The record could have been updated by someone else.'],
  ['truth', 'The reply was “No” — the company was not archived.'],
  ['truth', 'A few tasks are open; none was archived.'],
  ['truth', 'The record, which no audit has ever shown, was not updated.'],
  ['fab', 'Nothing failed: ACME Corp was archived.'],
  ['fab', 'No problem — ACME Holdings was archived.'],
  ['fab', 'No problem the company was archived.'],
  ['fab', 'ACME was archived — no undo available.'],
  ['fab', 'ACME was, after review, archived.'],
  ['fab', 'Nothing Bundt Cakes was archived.'],
  ['fab', 'No Limits Inc was archived.'],
  ['fab', 'Pending Review Partners was archived.'],
  ['fab', 'The company with no active tasks was archived.'],
  ['fab', 'No errors occurred and ACME was archived.'],
  ['fab', 'Confirmed — Archived ACME.'],
  ['fab', 'Confirmed — Restored Bob Smith.'],
  ['fab', 'Confirmed — Archived Media Group and Beta Corp.'],
  ['fab', 'renamed: "Old Name" → "New Name"'],
  // isolating rows added after the first pass, so a NO-OP means dead rather than unreached
  ['fab', 'No problem — ACME was, after review, archived.'],
  ['fab', 'Nothing failed: ACME was, after review, archived.'],
  ['fab', 'The company, which had no open tasks, was archived.'],
  ['fab', 'The record, which shows no errors, was updated.'],
  ['fab', 'The pending approval was granted.'],
  ['fab', 'A few tasks were completed.'],
  ['fab', 'The few remaining tasks were completed.'],
  ['fab', 'The No Limits Inc account was archived.'],
  ['fab', 'Our Nothing Bundt Cakes contract was renamed.'],
  ['fab', 'No problem the company was archived.'],
  ['fab', 'No worries the task was completed.'],
  ['fab', '“Nothing” was the old label and ACME was archived.'],
  ['truth', 'The company should have been archived.'],
  ['truth', 'The task would have been completed by now.'],
  ['truth', 'It might already have been deleted.'],
  ['truth', 'Confirmed — ACME Holdings is archived.'],
  ['truth', 'Confirmed — the tasks are completed.'],
  ['truth', 'Confirmed — I am assigned to it.'],
  ['truth', 'Confirmed — Closed Loop Systems. It is still active.'],
  ['truth', 'Confirmed — Restored Hardware Ltd. They remain open.'],
];
for (const [label, text] of EXTRA) rows.push({ label, half: 'probe', tag: 'EXTRA', text });

const NAMES = ['Archived Media Group', 'Restored Hardware Ltd', 'ACME Holdings', 'Bob Smith'];
const base = buildCandGate(src, NAMES);
const baseline = rows.map((r) => base(r.text));

const nth = (hay, needle, n, repl) => {
  let i = -1;
  for (let k = 0; k <= n; k++) { i = hay.indexOf(needle, i + 1); if (i < 0) return hay; }
  return hay.slice(0, i) + repl + hay.slice(i + needle.length);
};
const sub = (needle, repl) => (s) => (s.includes(needle) ? s.split(needle).join(repl) : s);

const MUTATIONS = [
  ['F-nameInternal   (run31 name-safe negator scan)', sub('const nameInternal = capLead && subjectRun', 'const nameInternal = false && capLead && subjectRun')],
  ['F-objectName     (run31, object of a claimed completion)', sub('const objectName = capLead &&', 'const objectName = false &&')],
  ['F-titleHead      (clause-initial Pending/Awaiting title)', sub('const titleHead = /^(?:Pending|Awaiting)$/', 'const titleHead = false && /^(?:Pending|Awaiting)$/')],
  ['F-ppInternal     (negator inside a leading PP)', sub('const ppInternal = /\\b(?:with|without|since', 'const ppInternal = false && /\\b(?:with|without|since')],
  ['F-relInternal', sub('const relInternal = /\\w,?\\s+(?:that|which', 'const relInternal = false && /\\w,?\\s+(?:that|which')],
  ['F-newSubject', sub('const newSubject = !/\\bnor\\b/.test(c) &&', 'const newSubject = false && !/\\bnor\\b/.test(c) &&')],
  ['F-quotedHead', sub('const quotedHead = /["“‘\']\\s*$/', 'const quotedHead = false && /["“‘\']\\s*$/')],
  ['F-adjective      (determiner + pending/awaiting)', sub('const adjective = /^(?:pending|awaiting)$/i', 'const adjective = false && /^(?:pending|awaiting)$/i')],
  ['F-fewQuant', sub('const fewQuant = /^few$/i', 'const fewQuant = false && /^few$/i')],
  ['F-detName', sub('const detName = /^[A-Z]/.test(mm[0]) &&', 'const detName = false && /^[A-Z]/.test(mm[0]) &&')],
  ['F-idiomStrip-dash (widened reassurance idiom, prefix+dash)', sub('(?:(?:no problem|no worries', '(?:(?:zzno problem|no worries')],
  ['F-idiomStrip-bare (V37 reversal, idiom + determiner)', (s) => nth(s, '(?:no problem|no worries', 1, '(?:zzno problem|no worries')],
  ['F-AUXGAP         (R-AUXGAP whole-summary rewrite)', sub("new RegExp('(?<!\\\\b(?:couldn", "new RegExp('zzz(?<!\\\\b(?:couldn")],
  ['F-entitySignal   (knownEntityNames positive-only)', sub('knownEntityNames.has(String(__m[1]).toLowerCase())', 'false')],
  ['F-V43D5-narrow   (entity rescue narrowed to its own span)', sub('&& !COMPLETION_PARTICIPLE.test(String(s).slice((__m.index ?? 0) + __m[0].length))', '')],
  ['F-V43D6-lookbehinds (is/are/am before the participle)', sub('(?<!\\bis )(?<!\\bare )(?<!\\bam )', '')],
  ['F-V43D6-secondSentence (It/They/This/That … remains)', sub('(?:It|They|This|That)\\b', '(?:zzIt|They|This|That)\\b')],
  ['F-modalBlank     (modal hedge span blanking)', sub('|conceivably|previously|recently', '|zzconceivably|previously|recently')],
  ['F-D27renameArrow (whole-summary rename report)', sub("|| /\\brenamed:\\s*.+(→|->)/i.test(String(s))", '')],
  ['F-CONFIRMED arm  (whole CONFIRMED_COMPLETION gate)', sub('const CONFIRMED_COMPLETION = /^\\s*confirmed', 'const CONFIRMED_COMPLETION = /^\\s*zzconfirmed')],
  ['F-EIP arm        (EXECUTION_IN_PROGRESS entirely)', sub("const EXECUTION_IN_PROGRESS = new RegExp(\n          '\\\\b(' +", "const EXECUTION_IN_PROGRESS = new RegExp(\n          '\\\\bzzzz(' +")],
];

console.log('candidate: ' + CAND_PATH);
console.log('corpus   : ' + rows.length + ' rows (pack = ' + JSON.stringify(NAMES) + ')\n');
let noops = 0, dead = [];
for (const [name, mut] of MUTATIONS) {
  if (mut(src) === src) { console.log('SKIP  ' + name + ' — mutation literal not found in source (harness bug, not a verdict)'); dead.push(name + ' [UNAPPLIED]'); continue; }
  let gate;
  try { gate = buildCandGate(src, NAMES, mut); } catch (e) { console.log('SKIP  ' + name + ' — mutant did not build: ' + e.message); continue; }
  const changed = [];
  rows.forEach((r, i) => { const v = gate(r.text); if (v !== baseline[i]) changed.push({ r, was: baseline[i], now: v }); });
  const truthLost = changed.filter((c) => c.r.label === 'truth' && c.now === true).length;
  const fabFreed = changed.filter((c) => c.r.label !== 'truth' && c.now === false).length;
  if (changed.length === 0) { noops++; dead.push(name); console.log('NO-OP ' + name + ' — reverting it moves NO verdict on this corpus'); }
  else {
    console.log('LOAD  ' + name + ' — ' + String(changed.length).padStart(4) + ' verdicts move'
      + '  (truths the revert destroys: ' + truthLost + '; fabrications the revert releases: ' + fabFreed + ')');
    console.log('        e.g. ' + JSON.stringify(changed[0].r.text) + '   ' + changed[0].was + ' -> ' + changed[0].now);
  }
}
console.log('\nno-ops on this corpus: ' + noops);
if (dead.length) { console.log('candidates for "unreached by this corpus" (NOT a claim of deadness):'); for (const d of dead) console.log('  - ' + d); }
