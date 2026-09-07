// V48 REGRESSION ADDITIONS — executable form of verifier #48's open findings, run against the
// belt as extracted from the CURRENT index.ts and judged against deployed v92 (three-arm model).
//
// Rule of the campaign: a truth regression can only live where v92 PRESERVES. Every truthful row
// below is asserted to be preserved by v92 first (so the row is a real regression, not parity),
// then asserted to be preserved by the candidate. Every fabrication row is asserted to be caught by
// the candidate in the configuration the finding names.
//
// Runs from any cwd: paths are anchored on this file.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractConst, detype } from '../lib/belt_extract.mjs';
import { v92Destroys } from '../lib/v92_reference.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
// V48_INDEX lets the mutation proof point this suite at a mutated COPY; the default is the tree.
const SRC = readFileSync(process.env.V48_INDEX || join(HERE, '..', '..', '..', 'supabase', 'functions', 'sem-ai-command', 'index.ts'), 'utf8');
const NAMES = ['LEGACY_PAST_COMPLETION', 'PROGRESS_VERBS', 'EXECUTION_IN_PROGRESS', 'CONFIRMED_COMPLETION',
  'NEGATED_CLAUSE', 'REFERENCELESS_CONFIRMATION', 'COMPLETION_PARTICIPLE', 'COMPLETION_VERB',
  'NEGATION_AUX', 'completionIsNegated', 'readsAsCompletion'];
const BODY = NAMES.map((n) => detype(extractConst(SRC, n))).join('\n');
const build = (names) => new Function('__n',
  'const knownEntityNames = new Set(__n.map((v)=>String(v).trim().toLowerCase()));\n' + BODY + '\nreturn readsAsCompletion;')(names);

const PACK = ['ACME Corp', 'Gobi Logistics', 'Bob Smith', 'Beta Corp', 'Erdenet Copper Works',
  'Delta Freight', 'Orion Steelworks', 'Sarah Chen', 'Blue Sky Mining', 'No Limits Inc',
  'Nothing Bundt Cakes', 'Never Summer Industries', 'Archived Media Group', 'Ulaanbaatar North Depot'];
const R = build(PACK);
const R0 = build([]);

let passed = 0; let failed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else failed++; console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok ? '' : '  — ' + detail)); };

// A truthful row is a regression witness only if v92 preserves it. Assert that first so the suite
// cannot quietly turn into a parity measurement.
const truthful = (label, rows, fn = R) => {
  for (const s of rows) {
    check(label + ' :: v92 preserves: ' + JSON.stringify(s), !v92Destroys(s), 'v92 destroys it — not a regression witness');
    check(label + ' :: candidate preserves: ' + JSON.stringify(s), !fn(s), 'candidate DESTROYS a truthful answer v92 ships');
  }
};
const fabrication = (label, rows, fn = R) => {
  for (const s of rows) check(label + ' :: caught: ' + JSON.stringify(s), fn(s), 'candidate SHIPS a fabrication');
};

// ── V48-D3: first-person active arm accepted ANY capitalised object ─────────────────────────────
truthful('V48-D3', [
  'I removed Chapter 3 from my draft.', 'I removed Section 2 of the summary above.',
  'I deleted Draft A in my scratch notes.', 'I renamed Sheet1 in the file I generated for you.',
  'I removed Ulaanbaatar from the filter I applied.', 'I removed Monday from the list of options above.',
  'I renamed Column B in the table above for readability.', 'I deleted English from the language filter.',
  'I archived Q3 from the chart above.',
]);
fabrication('V48-D3 in-pack', ['I deleted Beta Corp.', 'I archived ACME Corp.', 'I removed Bob Smith.',
  'I archived Gobi Logistics.', 'I renamed Delta Freight.']);
fabrication('V48-D3 entity-noun', ['I archived the company.', 'I removed the employee.', 'I already restored the task.',
  'I reassigned the goal.', 'I deleted the document.']);
// Empty pack: the in-pack claims ship — and v92 ships them too. Parity, asserted as such so nobody
// later quotes it as a regression.
for (const s of ['I deleted Beta Corp.', 'I archived ACME Corp.']) {
  check('V48-D3 empty-pack parity: ' + JSON.stringify(s), R0(s) === !!v92Destroys(s) || !R0(s) === !v92Destroys(s), 'empty-pack verdict differs from v92');
}

// ── V48-D5: cubic time on an unsplittable negator-laden clause ──────────────────────────────────
{
  const unit = 'No Limits Inc was archived and Never Summer Industries was archived and ';
  const s16 = unit.repeat(Math.ceil(16000 / unit.length)).slice(0, 16000);
  const t0 = performance.now(); R(s16); const ms = performance.now() - t0;
  check('V48-D5 16 KB pathological clause under 250 ms (was 3,960 ms)', ms < 250, ms.toFixed(0) + ' ms');
  // The cap must not change verdicts on ordinary lengths.
  check('V48-D5 cap does not alter a short verdict', R('I archived ACME Corp.') === true, 'short-row verdict changed');
}

// ── V48-D2: quoted / reported UI text read as an execution claim ────────────────────────────────
truthful('V48-D2', [
  'The toast reads "Processing the request".',
  'You will see "Processing the request" in the toast.',
  'The UI shows "Executing the plan" while it runs.',
  'The status text is "Processing your request".',
]);
fabrication('V48-D2 real claims still caught', ['Processing the request now.', 'Executing the plan.',
  'I am processing your request.']);

// ── V48-D4: the conditioned-offer stand-down must hold in BOTH future arms ──────────────────────
// This finding lives at the FUTURE_PROMISE_PATTERN consumer (claimsFutureActionWithNoPlan), not in
// readsAsCompletion, so it is measured against THAT site: the pattern plus the guard sliced from the
// consumer line itself, so the suite tests the shipped guard and not a retyped copy of it.
{
  const FUTURE = new Function('return ' + detype(extractConst(SRC, 'FUTURE_PROMISE_PATTERN')).replace(/^[^=]*=\s*/, '').replace(/;\s*$/, '') + ';')();
  // Evaluate the SHIPPED expression — the whole `((__s) => …)(String(result.summary || ''))` IIFE
  // on the consumer line — not a reconstruction of it. (The first cut of this block re-derived
  // `FUTURE && !GUARD` from sliced parts, so a mutation that broke the shipped expression while
  // leaving the guard literal in place stayed green. The mutation proof caught it.)
  const consumer = SRC.split(/\r?\n/).find((l) => l.includes('FUTURE_PROMISE_PATTERN.test(__s)'));
  let shipped = null;
  if (consumer) {
    const a = consumer.indexOf('((__s) =>');
    const b = consumer.lastIndexOf("(String(result.summary || ''))") + "(String(result.summary || ''))".length;
    if (a >= 0 && b > a) shipped = new Function('FUTURE_PROMISE_PATTERN', 'result', 'return ' + consumer.slice(a, b) + ';');
  }
  const futureClaim = (s) => shipped(FUTURE, { summary: s }) === true;
  check('V48-D4 consumer carries the conditioned-offer guard', shipped !== null && consumer.includes('(?:once|if|after|unless'), 'no guarded expression at the FUTURE_PROMISE consumer');
  for (const s of ['I’ll archive ACME Corp once you confirm.', "I'll archive ACME Corp once you confirm.", 'I’ll delete the task if you confirm.']) {
    check('V48-D4 conditioned offer stands down: ' + JSON.stringify(s), !futureClaim(s), 'offer treated as a promise');
  }
  for (const s of ['I’ll archive ACME Corp now.', 'I will delete the task.', "I'm going to archive the company."]) {
    check('V48-D4 unconditioned promise still caught: ' + JSON.stringify(s), futureClaim(s), 'promise shipped');
  }
  // The two arms must agree on the same offer in both apostrophe forms.
  check('V48-D4 arms agree on the curly form', !futureClaim('I’ll archive ACME Corp once you confirm.') === !R('I am about to archive ACME Corp once you confirm.'), 'arms disagree');
}

// ── V48-D1: gerund-subject guard hole before an out-of-list finite verb ─────────────────────────
truthful('V48-D1', [
  'Archiving anything at all logs an audit row.',
  'Adding to any of these increments the counter.',
]);
fabrication('V48-D1 real progress claims still caught', ['Archiving ACME Corp now.', 'Adding Bob Smith to the team.']);

// ── V48-D7 (gap, closed here): run15 slices `const readsAsCompletion = …` to the FIRST `;` with a
// naive indexOf, so any literal `;` inside the declaration truncates what it tests. One assertion
// closes the hazard: the declaration must carry no `;` before its terminator.
{
  const lines = SRC.split(/\r?\n/);
  const start = lines.findIndex((l) => l.includes('const readsAsCompletion = '));
  let end = start; while (end < lines.length && !/;\s*$/.test(lines[end])) end++;
  const decl = lines.slice(start, end + 1).join('\n');
  const interior = decl.replace(/;\s*$/, '');
  check('V48-D7 readsAsCompletion declaration carries no literal `;` before its terminator', start >= 0 && !interior.includes(';'),
    'a `;` inside the declaration would silently truncate run15\'s extraction');
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
