// RUN13 DEFECT CLOSURE CONTRACT — verifier #13's cases (campaign #73), promoted with
// FIXED expectations after all twelve were closed. Base was ace9b6a (index.ts sha256
// 021c8989…8a4b786); every case below passes on the fixed source. Original file under
// qa/verification/proposed/v13_regression_additions.mjs.
//
// Same two-kind convention as run10/run11/run12:
//   CONTRACT — a property that ALREADY HELD on ace9b6a but that NO committed suite
//              observed (a SURVIVING mutant in this campaign's mutation battery).
//   DEFECT   — a real escape or regression demonstrated on ace9b6a. Expected = the FIXED
//              behaviour, so each pins a closure that must not silently reopen.
//
// What this campaign closed, and the lessons worth keeping:
//   * D98+D99 shared ONE fix (FIX-3b): the discriminating axis for a completion-word
//     question fragment is INTERROGATIVE LEAD, not subject. Assertion leaks 18/20 -> 0/20
//     AND dropped clarifications 7/27 -> 0/27. Do not close D99 by reopening D98 — that
//     is exactly what run11 -> run12 did, in both directions.
//   * D100 ended a four-narrowing sequence (D78 -> D86 -> D91 -> D100) that tried to
//     separate real names from assertion labels by GRAMMAR. It cannot be done that way.
//     A completion-shaped label is now CORROBORATED against the canonical read and
//     replaced by the canonical display name when it does not match.
//   * D100.replay + D103.falseConfirmation are drift-gate cases, not label cases. Their
//     fix lives in readsAsCompletion(): the two drift arms each carried a private copy
//     of the pattern list, so extending one silently left the other behind.
//
// KEEP THE EXIT GUARD at the bottom. run10, run11 and run12 each had to have one
// restored or defended; do not reintroduce a kind-based carve-out.
// Runnable with plain `node` from the repo root. SEM_INDEX_SRC overrides the source path.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';


// Verifier #42's ruling: every extractor injects the entity-name set as an EMPTY Set by default,
// so a name being ABSENT proves nothing and the belt's positive-only signal is inert here. This is
// what makes "an empty set produces byte-identical verdicts" the structural default of the whole
// battery rather than a control someone has to remember to run. `new Function` bodies execute in
// global scope, so this one assignment reaches every belt-build site in this file.
globalThis.knownEntityNames = globalThis.knownEntityNames || new Set();

function findRepoFile(rel) {
  let d = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const p = resolve(d, rel);
    try { readFileSync(p); return p; } catch { d = resolve(d, '..'); }
  }
  throw new Error('could not locate ' + rel);
}
const { stripTS, withPatternsAboveWindow } = await import(new URL('file://' + findRepoFile('qa/scenarios-runner/_gate_extract.mjs')).href);
const SRC = process.env.SEM_INDEX_SRC || findRepoFile('supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8');

const gStart = src.indexOf('// STRUCTURED-CLAIM VERIFICATION');
const gAnchor = src.indexOf('executionEvidence: claimExecutionEvidence,', gStart);
if (gStart === -1 || gAnchor === -1) throw new Error('gate slice anchors not found — update this harness, do not let it pass');
const gateSlice = withPatternsAboveWindow(src, stripTS(src.slice(gStart, src.indexOf('};', gAnchor) + 2)));
const gateFn = new Function(
  'result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
  'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
  gateSlice + '\n; return { summary: result.summary, envelope: result.verifiedResponse, corrected: claimsPastCompletionWithNoGrounding, questions: result.questions };');

const mStart = src.indexOf('function matchDisambiguationOption');
const mEnd = src.indexOf('\n}', mStart);
if (mStart === -1 || mEnd === -1) throw new Error('matchDisambiguationOption not found — update this harness');
const matchFn = new Function('command', 'options',
  stripTS(src.slice(mStart, mEnd + 2)) + '\n; return matchDisambiguationOption(command, options);');

const DENO = { env: { get: () => undefined } };
const mk = (o) => new Map(Object.entries(o || {}));
const ACME = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const ID2 = '11111111-1111-1111-1111-111111111111';
const ID3 = '22222222-2222-2222-2222-222222222222';
const M = (rt, id, action) => ({ type: 'mutation_result', resourceType: rt, resourceId: id, action });
// P1 (governance/OPERATING_TRUTH_MODEL.md §3): the executor reads the REQUEST. Harness calls
// default to a mutation-intent command; read-only cases pass command: ''.
const run = (opts = {}) => { globalThis.command = typeof opts.command === 'string' ? opts.command : 'archive ACME Holdings'; return run0(opts); };
const run0 = ({ claims = null, summary = '', pendingAction = null, questions, evidence = [], context = {}, grounded = false } = {}) =>
  gateFn({ claims, summary, pendingAction, questions }, evidence, context, 'gpt', grounded, false, DENO,
    mk(), mk(), mk(), mk(), false, '', mk());

// A question fragment as it survives the gate on a correction turn (null = dropped).
const Q = (q) => run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', questions: [q] }).questions[0] ?? null;
const label = (l, ctxName) => run({ summary: 'ok',
  pendingAction: { kind: 'disambiguation', question: 'Which?', options: [{ label: l, id: ACME, entityType: 'company' }] },
  context: ctxName ? { companies: [{ id: ACME, name: ctxName }] } : {} }).envelope?.pendingAction?.options?.[0]?.label;
const labels = (opts, context = {}) => run({ summary: 'ok',
  pendingAction: { kind: 'disambiguation', question: 'Which?', options: opts }, context })
  .envelope?.pendingAction?.options?.map((o) => o.label);
const paQ = (q) => run({ summary: 'ok', pendingAction: { kind: 'bulk_confirmation', question: q,
  summary: 'Archive ACME', action: { archiveCompanyIds: [ACME] } } }).envelope?.pendingAction?.question;
const corrected = (s) => run({ summary: s }).corrected === true;

const CASES = [];
const C = (id, kind, desc, thunk) => CASES.push([id, kind, desc, thunk]);

// =====================================================================================
// D98 — DEFECT (P2, REGRESSION vs fdb4564). run12/D92 replaced a blanket completion belt
// with a FIRST-PERSON past-tense belt. It still destroys any legitimate clarification
// carrying a first-person completion in a SUBORDINATE clause — questions about work the
// assistant genuinely did, which is exactly what a clarification is for. Each one also
// nulls pendingAction.question while the destructive action stays armed (run10/D84).
// A/B: 7/27 dropped on ace9b6a, 21/27 on f4763ef, 1/27 on fdb4564.
// =====================================================================================
const D98_QUESTIONS = [
  'Which of the tasks we completed should be reopened?',
  'Do you want the ones I removed restored?',
  'Did you mean the company I archived last week?',
  'Should I reopen the goal we closed in July?',
  'Is the invoice I sent the one you meant?',
  'Which of the people I assigned should be moved?',
  'Do you want the report we created yesterday?',
];
for (const q of D98_QUESTIONS) {
  C('D98.q' + (CASES.length + 1), 'DEFECT',
    'D98: legitimate clarification ' + JSON.stringify(q) + ' must survive the first-person belt',
    () => Q(q) === q);
  C('D98.armed.' + (CASES.length + 1), 'DEFECT',
    'D98: ' + JSON.stringify(q) + ' must not be nulled while the pendingAction stays armed',
    () => paQ(q) !== null);
}

// =====================================================================================
// D99 — DEFECT (P2, REGRESSION vs f4763ef). The same replacement gave up 18 of 20
// assertion shapes the f4763ef belt caught. The belt now matches exactly the two shapes
// its own committed cases pin. The source comment claims it "was load-bearing for exactly
// ONE shape ... and only that shape is what this now matches" — measurably false.
// =====================================================================================
const D99_ASSERTIONS = [
  ['thirdperson.runon', 'ACME archived everything ok?', 'archived everything'],
  ['thirdperson.abbrev', 'ACME deleted everything B. ok?', 'deleted everything'],
  ['thirdperson.named', 'ACME Holdings deleted all the tasks ok?', 'deleted all the tasks'],
  ['thirdperson.def', 'The company deleted the tasks ok?', 'deleted the tasks'],
  ['thirdperson.person', 'Bob removed 3 people from ACME ok?', 'removed 3 people'],
  ['thirdperson.event', 'The migration completed ok?', 'migration completed'],
  ['pronoun.subject', 'Everything archived ok?', 'everything archived'],
  ['participle.led.abbrev', 'Archived everything B. ok?', 'archived everything'],
  ['participle.led', 'Deleted all the tasks ok?', 'deleted all the tasks'],
  ['participle.led2', 'Removed the whole team ok?', 'removed the whole team'],
  ['adverbial.passive', 'ACME now archived ok?', 'now archived'],
  ['adverbial.passive2', 'All tasks now deleted ok?', 'now deleted'],
  ['collective.subject', 'The team archived ACME ok?', 'archived acme'],
  ['possessive.subject', 'My assistant deleted the project ok?', 'deleted the project'],
  // the belt does not even cover its OWN stated first-person shape robustly:
  ['firstperson.adverb', 'I successfully archived ACME ok?', 'archived acme'],
  ['firstperson.perfect', 'I have archived ACME ok?', 'archived acme'],
  ['firstperson.adverb2', 'We finally deleted the project ok?', 'deleted the project'],
  ['firstperson.adverb3', 'I quietly removed the person ok?', 'removed the person'],
];
for (const [tag, q, leak] of D99_ASSERTIONS) {
  C('D99.' + tag, 'DEFECT', 'D99: assertion ' + JSON.stringify(q) + ' must not reach the founder as a question',
    () => { const s = Q(q); return s === null || !s.toLowerCase().includes(leak.toLowerCase()); });
}
// Controls that MUST keep passing when D98/D99 are fixed together.
for (const [tag, q] of [['single-letter-shield', 'I archived ACME B. ok?'], ['runon', 'I archived ACME ok?'],
  ['comma-ok', 'I archived ACME, ok?'], ['aux-question', 'Did you know ACME has been archived?']]) {
  C('D99.hold.' + tag, 'CONTRACT', 'no assertion leaks via ' + JSON.stringify(q),
    () => { const s = Q(q); return s === null || !/archived/i.test(s) || s === 'ok?'; });
}
for (const q of ['Which archived company did you mean?', 'Who should the task be assigned to?',
  'Do you want the closed leads included?', 'Should I include archived records in the report?']) {
  C('D99.hold.legit' + CASES.filter((c) => c[0].startsWith('D99.hold.legit')).length, 'CONTRACT',
    'run12/D92 coverage holds: ' + JSON.stringify(q) + ' survives', () => Q(q) === q);
}

// =====================================================================================
// D100 — DEFECT (P2). run12/D91 replaced the object-shape axis with a five-word
// ADJECTIVAL_COMPLETION allowlist for the leading position, plus a determiner/ALL-CAPS
// test on the SECOND word. The second-word test does not cover cardinals spelled out,
// ordinary adjectives, or proper nouns, so an assertion led by closed|completed|restored
// still renders verbatim under "Options:" (index.ts:5241) and replays next turn as
// "Confirmed — <assertion>." (index.ts:2549), which the gate ships uncorrected.
// Third narrowing of the same class (run10/D78 -> run11/D86 -> run12/D91).
// =====================================================================================
for (const l of ['Restored Three Companies', 'Closed Five Deals', 'Restored Full Access',
  'Completed Final Migration', 'Restored Backup Yesterday', 'Completed Migration',
  'Closed Deals Today', 'Restored Bob Smith', 'Completed Bob Smith Onboarding']) {
  C('D100.' + l.split(' ')[0].toLowerCase() + '.' + CASES.filter((c) => c[0].startsWith('D100.')).length, 'DEFECT',
    'D100: adjectival-led assertion label ' + JSON.stringify(l) + ' must not be accepted verbatim',
    () => label(l, 'ACME Holdings') !== l);
}
C('D100.replay', 'DEFECT', 'D100: "Confirmed — Restored Bob Smith." must not ship as a founder-facing completion',
  () => corrected('Confirmed — Restored Bob Smith.'));
// Controls: the three genuinely adjectival leads must still carry real names.
for (const n of ['Closed Loop Systems', 'Completed Works Ltd', 'Restored Timber Co']) {
  C('D100.hold.' + n.split(' ')[0].toLowerCase(), 'CONTRACT', JSON.stringify(n) + ' must still survive as a real name',
    () => label(n, n) === n);
}

// =====================================================================================
// D101 — CONTRACT (vacuous guard, TENTH recurrence of the class run12/D90 closed as the
// ninth). `advanced` and `integrated` are in ADJECTIVAL_COMPLETION but in NEITHER
// COMPLETION_WORD nor any path that can reach them: the enclosing block only runs when
// COMPLETION_WORD matched, and the allowlist is only consulted when completionIdx === 0,
// i.e. when words[0] IS a completion word. Removing both leaves the whole battery green
// (561/561) — a surviving mutant, proven in this campaign.
// =====================================================================================
C('D101.deadAlternative', 'DEFECT',
  'D101: every alternative in ADJECTIVAL_COMPLETION must be reachable (i.e. must also be in COMPLETION_WORD)',
  () => { const adj = src.match(/const ADJECTIVAL_COMPLETION = \/\^\(([^)]+)\)\$\/i;/);
    const comp = src.match(/const COMPLETION_WORD = \/\\b\(([^)]+)\)\\b\/i;/);
    if (!adj || !comp) throw new Error('ADJECTIVAL_COMPLETION / COMPLETION_WORD not found — update this harness');
    const words = new Set(comp[1].split('|'));
    return adj[1].split('|').every((w) => words.has(w)); });

// =====================================================================================
// D102 — DEFECT (P2, REGRESSION vs both prior SHAs). run12/D93 made the MATCHER compare
// with presentation characters removed, but run12/D95's collision detection still keys on
// the RAW label. Two options that are identical after stripping are therefore neither
// numbered nor selectable: the matcher sees two matches and returns null. This is the
// run9/D72 dead-ended-disambiguation class arriving through the seam between the two
// run12 fixes. On fdb4564 and f4763ef the plain-named option was selectable.
// =====================================================================================
C('D102.quotedTwin', 'DEFECT',
  'D102: two options identical only after presentation-stripping must be rendered distinguishably',
  () => { const r = labels([{ label: 'Closed Loop Systems', id: ACME, entityType: 'company' },
                            { label: 'Deleted The Project', id: ID2, entityType: 'company' }],
                           { companies: [{ id: ACME, name: 'Closed Loop Systems' }, { id: ID2, name: 'Closed Loop Systems' }] });
    const strip = (s) => s.replace(/[“”‘’"']/g, '').trim().toLowerCase();
    return strip(r[0]) !== strip(r[1]); });
// This one probes matchDisambiguationOption IN ISOLATION (raw labels, no gating pass).
// FIX-1 MITIGATES it — the gate would number the pair so the founder gets a visible
// choice — but it does not close it: the matcher itself still returns null for a pair
// that differs only by presentation characters, and any caller that does not run the
// numbering first inherits the dead end.
C('D102.apostrophePair', 'DEFECT',
  'D102: matchDisambiguationOption alone must not make two names differing only by an apostrophe mutually unselectable',
  () => matchFn('founders fund', [{ label: 'Founders Fund', id: ACME, entityType: 'company' },
                                  { label: "Founders' Fund", id: ID2, entityType: 'company' }]) !== null);

// =====================================================================================
// D103 — DEFECT (P2). run12/D95's numbering does not guarantee what it claims.
//  (a) it is not idempotent against an already-numbered label (the replay path), so a
//      third option can collide with a number it just minted;
//  (b) the number is the position in the model-emitted array, not a stable property of
//      the entity, so it carries no identifying information at all;
//  (c) the typed fallback fires exactly when the id is absent from contextPack.companies
//      (canonicalById 4550-4552 and companyNameById 2996 are built from that same array),
//      and archiveCompanyIds/restoreCompanyIds filter on contextCompanyIds built from the
//      SAME array (2896, 2993-2995) — so a numbered fallback option is by construction an
//      id that cannot execute, yet selecting it yields "Confirmed — the company (option
//      1)." (2549), which the gate ships uncorrected. Numbering converted a safe dead end
//      into a founder-facing confirmation of a mutation that cannot happen.
// =====================================================================================
C('D103.uniqueness', 'DEFECT',
  'D103a: numbering must produce a unique label set even when an already-numbered label is present',
  () => { const r = labels([{ label: 'the company', id: ACME, entityType: 'company' },
                            { label: 'the company', id: ID2, entityType: 'company' },
                            { label: 'the company (option 1)', id: ID3, entityType: 'company' }]);
    return new Set(r).size === r.length; });
C('D103.falseConfirmation', 'DEFECT',
  'D103c: "Confirmed — the company (option 1)." must not ship as an unqualified completion',
  () => corrected('Confirmed — the company (option 1).'));
// Added by v13_mutation_proof: removing REFERENCELESS_CONFIRMATION's end-anchor broke
// NO case, so the belt's narrowness was itself an unobserved guard — the exact vacuous-
// guard class this project has shipped ten times. A confirmation that goes on to say
// something the founder can actually check must survive the belt.
C('D103.hold.substantive', 'CONTRACT',
  'a confirmation that says something substantive must survive the referenceless belt',
  () => !corrected('Confirmed — the company you asked about is in Ulaanbaatar.'));
// run15/D119 RE-PIN: out-of-context options are now DROPPED (see run12 D95), so the
// numbering guard is observed on the reachable shape — two in-context entities whose
// canonical names collide.
C('D103.hold.numbered', 'CONTRACT', 'the D95 property still holds (re-pinned run15/D119): two in-context options with colliding canonical names render distinguishably, and out-of-context ones are dropped',
  () => { const gone = labels([{ label: 'Advanced Closed Systems', id: ACME, entityType: 'company' },
                               { label: 'Global Closed Loop', id: ID2, entityType: 'company' }]);
    const r = labels([{ label: 'Closed Loop', id: ACME, entityType: 'company' },
                      { label: 'Closed Loop', id: ID2, entityType: 'company' }],
                     { companies: [{ id: ACME, name: 'Closed Loop' }, { id: ID2, name: 'Closed Loop' }] });
    return gone.length === 0 && r.length === 2 && r[0] !== r[1]; });

let pass = 0, fail = 0, defectsOpen = 0;
for (let [id, kind, desc, thunk] of CASES) {
  let ok; try { ok = thunk() === true; } catch (e) { ok = false; desc += ' THREW ' + e.message; }
  if (ok) pass++; else { fail++; if (kind === 'DEFECT') defectsOpen++; }
  console.log((ok ? 'OK   ' : 'FAIL ') + id.padEnd(32) + ' [' + kind + '] ' + desc);
}
console.log(`\nrun13_defect_closure_contract: ${pass} pass, ${fail} fail (${defectsOpen} open #73 defects reproduce; ${fail - defectsOpen} CONTRACT failures = guards that do not hold as claimed)`);
// Exit guard — ANY failure fails the run. No kind-based carve-out.
if (fail > 0) process.exit(1);
