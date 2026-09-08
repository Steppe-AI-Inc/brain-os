// verifier #11 attempt 2 — attack round 2. Precise measurement of the question-channel
// cut: did the ASSERTION clause in front of the trailing question survive into the
// founder-facing summary? (Round 1's heuristic tripped on the correction line's own
// wording "…that the company was archived.")
import { readFileSync } from 'node:fs';
import { stripTS } from '../../scenarios-runner/_gate_extract.mjs';

const src = readFileSync('supabase/functions/sem-ai-command/index.ts', 'utf8');
const start = src.indexOf('// STRUCTURED-CLAIM VERIFICATION');
const anchor = src.indexOf('executionEvidence: claimExecutionEvidence,', start);
const slice = stripTS(src.slice(start, src.indexOf('};', anchor) + 2));
const fn = new Function('result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
  'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
  slice + '\n; return { summary: result.summary, envelope: result.verifiedResponse };');
const DENO = { env: { get: () => undefined } };
const mk = (o) => new Map(Object.entries(o || {}));
const ACME = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const run = (o) => fn({ claims: o.claims ?? null, summary: o.summary ?? '', pendingAction: o.pendingAction ?? null, questions: o.questions, proposedActions: undefined },
  o.evidence ?? [], o.context ?? {}, o.model ?? 'gpt', o.grounded ?? false, false, DENO,
  mk(), mk(), mk(), mk(), false, o.deterministicPrefix ?? '', mk(o.runtime));
const Q = (q) => run({ claims: [{ type: 'mutation_result', resourceType: 'company', resourceId: ACME, action: 'archive' }], summary: 'x', questions: [q] }).summary;

// The correction preamble is fixed; anything AFTER it is the surviving question.
const PREAMBLE = 'I can’t confirm from this turn’s execution record that the company was archived.';
const survivingQuestion = (out) => out.startsWith(PREAMBLE) ? out.slice(PREAMBLE.length).trim() : out;

let escapes = 0;
function probe(input, assertionClause) {
  const out = Q(input);
  const sq = survivingQuestion(out);
  // ESCAPE = the fabricated ASSERTION clause survived into founder-facing text.
  const leaked = assertionClause !== null && sq.toLowerCase().includes(assertionClause.toLowerCase());
  if (leaked) escapes++;
  console.log((leaked ? 'ESCAPE ' : 'held   ') + JSON.stringify(input).padEnd(46) + ' -> surviving question: ' + JSON.stringify(sq));
}

console.log('=== A2. assertion in front of a trailing question — WHICH shapes survive the cut? ===');
console.log('-- (a) abbreviation-shielded: the only "." in the head belongs to a KNOWN_ABBREVIATION');
probe('ACME Inc. deleted everything, ok?', 'deleted everything');
probe('I archived ACME Co. right, ok?', 'I archived ACME');
probe('Deleted ACME Corp. and its tasks, ok?', 'Deleted ACME');
probe('I archived ACME B. ok?', 'I archived ACME');
probe('The dept. removed 3 people, ok?', 'removed 3 people');
console.log('-- (b) control: NO period at all in the head (is the abbreviation really the cause?)');
probe('ACME deleted everything, ok?', 'deleted everything');
probe('I archived ACME, ok?', 'I archived ACME');
probe('Deleted ACME and its tasks, ok?', 'Deleted ACME');
probe('I removed 3 people from ACME, ok?', 'removed 3 people');
console.log('-- (c) aux-verb shapes (the PAST_COMPLETION belt should catch these with no cut)');
probe('ACME has been archived, ok?', 'has been archived');
probe('ACME was deleted, ok?', 'was deleted');
probe('3 tasks were completed, ok?', 'were completed');
console.log('-- (d) legitimate questions that MUST survive whole (over-correction control)');
probe('Is Acme Inc. still interested?', null);
probe('Should the 1.5 allocation stay?', null);
probe('Which company did you mean?', null);
console.log('-- (e) the M04 survivor: is the "…" terminator load-bearing for any shape?');
probe('ACME deleted everything… ok?', 'deleted everything');
probe('ACME was deleted… ok?', 'was deleted');
probe('I archived ACME… ok?', 'I archived ACME');

console.log('\n=== B2. replay path: does a persisted option label re-enter founder prose as a statement? ===');
{
  const r = run({ summary: 'ok', pendingAction: { kind: 'disambiguation', question: 'Which one?', options: [
    { label: 'ACME Deleted', id: ACME, entityType: 'company' },
    { label: 'ACME Holdings', id: '11111111-1111-1111-1111-111111111111', entityType: 'company' }] } });
  console.log('persisted options: ' + JSON.stringify(r.envelope.pendingAction.options.map((o) => o.label)));
  console.log('rendered summary : ' + JSON.stringify(r.summary));
}
{
  // deterministic-confirmation is the REPLAY model id — the next turn after a yes.
  const r = run({ model: 'deterministic-confirmation', summary: 'Confirmed — ACME Deleted.', grounded: false });
  console.log('replay(deterministic-confirmation) summary: ' + JSON.stringify(r.summary));
}

console.log('\n=== C2. EXECUTION_IN_PROGRESS arm-3 verb-list asymmetry ===');
const ARM2 = ['assigning', 'reassigning', 'updating', 'creating', 'moving', 'archiving', 'restoring', 'deleting', 'removing', 'ending', 'renaming', 'closing', 'clearing', 'granting', 'declining'];
for (const v of ARM2) {
  const a = run({ summary: 'Confirmed. I’m now ' + v + ' ACME.' }).summary;
  const b = run({ summary: 'Confirmed. Now ' + v + ' ACME.' }).summary;
  const aCaught = !/Confirmed\./.test(a);
  const bCaught = !/Confirmed\./.test(b);
  console.log((aCaught === bCaught ? 'consistent ' : 'ASYMMETRIC ') + v.padEnd(12) + ' "i’m now X"=' + (aCaught ? 'caught' : 'ESCAPES') + '  "now X"=' + (bCaught ? 'caught' : 'ESCAPES'));
}

console.log('\nTOTAL A2 ESCAPES: ' + escapes);
