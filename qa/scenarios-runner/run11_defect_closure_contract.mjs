// PROPOSED regression additions from verifier #11 (campaign #71, base fdb4564,
// index.ts sha256 66fa821d…ddded).
//
// Two kinds of entry, same convention as v10_regression_additions.mjs:
//   CONTRACT — a property that ALREADY HOLDS on fdb4564 but which NO committed suite
//              observes: verifier #11's mutation battery broke it in the real source and
//              the whole committed battery still exited 0 (a SURVIVING mutant). Expected
//              = true; these are the cases that make the guard non-decorative.
//   DEFECT   — a real escape verifier #11 demonstrated on fdb4564. Expected = the FIXED
//              behaviour, so these FAIL on fdb4564 BY DESIGN until the fix lands.
//
// Promotion notes for whoever lands this in qa/scenarios-runner/:
//   * fold the CALLBACK-ARROW strip below into _gate_extract.mjs stripTS() — the shared
//     stripper handles `function f(a: T)`, annotated consts and `= (a: T) =>` arrows but
//     NOT `.map((r: any, idx: number) => …)`, which is exactly the shape the real
//     turn-numbering expression uses. Without it the continuity block cannot be executed
//     at all, which is WHY the committed continuity suite reimplemented the turn math.
//   * keep the exit guard at the bottom (run10's promotion had to restore one).
// Runnable with plain node from the repo root. SEM_INDEX_SRC overrides the source path.
import { readFileSync } from 'node:fs';
import { stripTS, withPatternsAboveWindow } from './_gate_extract.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Walk up to the repo root rather than hard-coding a depth, so this file behaves
// identically here (qa/verification/proposed/) and after promotion (qa/scenarios-runner/).
function findSrc() {
  let d = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const p = resolve(d, 'supabase/functions/sem-ai-command/index.ts');
    try { readFileSync(p); return p; } catch { d = resolve(d, '..'); }
  }
  throw new Error('could not locate supabase/functions/sem-ai-command/index.ts from ' + dirname(fileURLToPath(import.meta.url)));
}
const SRC = process.env.SEM_INDEX_SRC || findSrc();
const src = readFileSync(SRC, 'utf8');
// (the callback-arrow strip this file introduced is now folded into _gate_extract.mjs)

// A harness that cannot find the code it is meant to execute must THROW, never quietly
// pass. (M30 survived precisely because an ordering check compared two indexOf results
// without first asserting that both anchors exist: -1 < n is true.)
function sliceBetween(startAnchor, endAnchor) {
  const a = src.indexOf(startAnchor);
  if (a === -1) throw new Error('anchor not found (update this harness, do not let it pass): ' + startAnchor);
  const b = src.indexOf(endAnchor, a);
  if (b === -1) throw new Error('end anchor not found (update this harness): ' + endAnchor);
  return src.slice(a, b + endAnchor.length);
}

// ---- the truthfulness-gate slice (same extraction the committed suites use) ----
const gStart = src.indexOf('// STRUCTURED-CLAIM VERIFICATION');
const gAnchor = src.indexOf('executionEvidence: claimExecutionEvidence,', gStart);
if (gStart === -1 || gAnchor === -1) throw new Error('gate slice anchors not found');
const gateSlice = withPatternsAboveWindow(src, stripTS(src.slice(gStart, src.indexOf('};', gAnchor) + 2)));
const gateFn = new Function(
  'result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
  'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
  gateSlice + '\n; return { summary: result.summary, envelope: result.verifiedResponse, corrected: claimsPastCompletionWithNoGrounding };');
const DENO = { env: { get: () => undefined } };
const mk = (o) => new Map(Object.entries(o || {}));
// P1 (governance/OPERATING_TRUTH_MODEL.md §3): the executor reads the REQUEST. Harness calls
// default to a mutation-intent command; read-only cases pass command: ''.
const run = (opts = {}) => { globalThis.command = typeof opts.command === 'string' ? opts.command : 'archive ACME Holdings'; return run0(opts); };
const run0 = ({ claims = null, summary = '', pendingAction = null, questions, evidence = [], context = {}, model = 'gpt', grounded = false, deterministicPrefix = '', runtime = {} }) =>
  gateFn({ claims, summary, pendingAction, questions }, evidence, context, model, grounded, false, DENO,
    mk(), mk(), mk(), mk(), false, deterministicPrefix, mk(runtime));
const ID = '11111111-1111-1111-1111-111111111111';
const ACME = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const M = (rt, id, action) => ({ type: 'mutation_result', resourceType: rt, resourceId: id, action });
const EV = (rt, action, id, ok = true) => ({ resourceType: rt, action, id, postconditionPassed: ok });
const Q = (q) => run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', questions: [q] }).summary;
// The correction preamble is fixed; whatever follows it is the SURVIVING question.
const PREAMBLE = 'I can’t confirm from this turn’s execution record that the company was archived.';
const surviving = (out) => (out.startsWith(PREAMBLE) ? out.slice(PREAMBLE.length).trim() : out);

// ---- the continuity/turn-math block, EXECUTED (not reimplemented) ----
const contFn = new Function('conversationCount', 'conversationRowsChronological', 'durableChannelState', 'command',
  stripTS(sliceBetween('const totalPriorTurns = conversationCount.count',
    'channelStateVersion: durableChannelState ? (durableChannelState.version ?? null) : null,')) + '\n};'
  + '\n; return { totalPriorTurns, historyWindowStart, conversationHistory, continuity, currentTurn: { turn: totalPriorTurns + 1, command } };');
const rows = (n) => Array.from({ length: n }, (_, i) => ({ command: 'cmd' + (i + 1), output: { summary: 's' + (i + 1) } }));

// ---- the durable pending-action READER, EXECUTED ----
const readerFn = new Function('durableChannelState', 'lastTurnOutput', 'legacyPendingConfirmation',
  stripTS(sliceBetween('const durablePendingActionValid = !!(durableChannelState', '      : null);'))
  + '\n; return { valid: durablePendingActionValid, bound: pendingAction };');
const future = () => new Date(Date.now() + 10 * 60 * 1000).toISOString();
const PA = { kind: 'bulk_confirmation', summary: 'Archive ACME', action: { archiveCompanyIds: ['x'] } };

const CASES = [];
const C = (id, kind, desc, thunk) => CASES.push([id, kind, desc, thunk]);

// =====================================================================================
// CONTRACTS — each one KILLS a mutant that survived the entire committed battery.
// =====================================================================================

// M04: the committed R10.term.… case uses an AUX-shaped assertion ("was deleted") that
// the PAST_COMPLETION belt refuses anyway, so deleting '…' from the terminator set
// changed nothing observable. A NON-aux assertion makes the cut itself load-bearing.
C('V11.term.ellipsis', 'CONTRACT', "the '…' terminator is load-bearing: a NON-aux assertion before it is cut away",
  () => surviving(Q('ACME deleted everything… ok?')) === 'ok?');
C('V11.term.ellipsis.aux', 'CONTRACT', "the aux-shaped '…' case still holds (belt AND cut)",
  () => !surviving(Q('ACME was deleted… ok?')).includes('was deleted'));

// M19 / M21: the committed continuity suite reimplements the turn math in its own
// compute() helper, so the off-by-one it exists to pin cannot fail. These execute the
// REAL expressions — remove the `+ 1` or invert historyIsComplete and these go red.
C('V11.turn.boundary8', 'CONTRACT', 'exactly 8 prior turns: window 1..8, complete, current 9, entries 1..8',
  () => { const r = contFn({ count: 8 }, rows(8), null, 'now');
    return r.continuity.historyWindowStart === 1 && r.continuity.historyWindowEnd === 8
      && r.continuity.historyIsComplete === true && r.currentTurn.turn === 9
      && JSON.stringify(r.conversationHistory.map((h) => h.turn)) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8]); });
C('V11.turn.boundary9', 'CONTRACT', '9 prior turns / 8-row window: window 2..9, INCOMPLETE, current 10, entries 2..9',
  () => { const r = contFn({ count: 9 }, rows(8), null, 'now');
    return r.continuity.historyWindowStart === 2 && r.continuity.historyWindowEnd === 9
      && r.continuity.historyIsComplete === false && r.currentTurn.turn === 10
      && JSON.stringify(r.conversationHistory.map((h) => h.turn)) === JSON.stringify([2, 3, 4, 5, 6, 7, 8, 9]); });
C('V11.turn.newestIsPrev', 'CONTRACT', 'the newest history entry is ALWAYS exactly one turn before the current turn',
  () => [1, 2, 8, 9, 50].every((total) => { const w = Math.min(total, 8); const r = contFn({ count: total }, rows(w), null, 'now');
    return w === 0 || r.conversationHistory[r.conversationHistory.length - 1].turn === r.currentTurn.turn - 1; }));
C('V11.turn.fresh', 'CONTRACT', 'fresh channel: no window bounds, complete, current turn 1',
  () => { const r = contFn({ count: 0 }, [], null, 'now');
    return r.continuity.historyWindowStart === null && r.continuity.historyWindowEnd === null
      && r.continuity.historyIsComplete === true && r.currentTurn.turn === 1 && r.conversationHistory.length === 0; });
C('V11.turn.countNull', 'CONTRACT', 'a failed head-count query degrades to the window length and stays self-consistent',
  () => { const r = contFn({ count: null }, rows(5), null, 'now');
    return r.continuity.historyWindowStart === 1 && r.continuity.historyWindowEnd === 5
      && r.continuity.historyIsComplete === true && r.currentTurn.turn === 6; });
C('V11.turn.noSelfInclude', 'CONTRACT', 'the current command never appears inside conversationHistory',
  () => !contFn({ count: 3 }, rows(3), null, 'THE-CURRENT-COMMAND').conversationHistory.some((h) => h.command === 'THE-CURRENT-COMMAND'));

// M30: the committed ordering check is FAIL-OPEN — it compares two indexOf results, and
// renaming/inlining either call site makes it -1 < n, i.e. silently green. Assert the
// anchors EXIST first, then assert the order.
C('V11.order.failClosed', 'CONTRACT', 'the buildContext/create_pending_work_order ordering check fails CLOSED when an anchor moves',
  () => { const live = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    const a = live.indexOf('const ctx = await buildContext('); const b = live.indexOf("supabase.rpc('create_pending_work_order'");
    return a !== -1 && b !== -1 && a < b; });

// M26: the committed reader check names actionType + expires_at only, so removing the
// source-work-order requirement (a FOREIGN pending action becoming bindable) survived.
C('V11.durable.foreignSource', 'CONTRACT', 'a durable pending action with NO source work order id can never bind',
  () => { const r = readerFn({ pending_action: PA, pending_action_action_type: 'archive_company', pending_action_expires_at: future() }, undefined, undefined);
    return r.valid === false && r.bound === null; });
C('V11.durable.emptySource', 'CONTRACT', 'an EMPTY-STRING source work order id can never bind either',
  () => readerFn({ pending_action: PA, pending_action_action_type: 'archive_company', pending_action_source_work_order_id: '', pending_action_expires_at: future() }, undefined, undefined).bound === null);
C('V11.durable.expired', 'CONTRACT', 'an EXPIRED durable pending action can never bind',
  () => readerFn({ pending_action: PA, pending_action_action_type: 'archive_company', pending_action_source_work_order_id: 'wo-1', pending_action_expires_at: new Date(Date.now() - 6e4).toISOString() }, undefined, undefined).bound === null);
C('V11.durable.untyped', 'CONTRACT', 'an UNTYPED durable pending action can never bind',
  () => readerFn({ pending_action: PA, pending_action_source_work_order_id: 'wo-1', pending_action_expires_at: future() }, undefined, undefined).bound === null);
C('V11.durable.happy', 'CONTRACT', 'a fully typed, sourced, unexpired durable pending action DOES bind (the guard is not just always-null)',
  () => readerFn({ pending_action: PA, pending_action_action_type: 'archive_company', pending_action_source_work_order_id: 'wo-1', pending_action_expires_at: future() }, undefined, undefined).bound !== null);
// P1 (governance/OPERATING_TRUTH_MODEL.md §2, tier 3 over tier 4): the durable, TTL-guarded, fully
// typed channel-state row outranks the previous turn's stored output text.
C('V11.durable.livePrecedence', 'CONTRACT', 'a valid durable pending action beats the last turn\'s stored pendingAction (durable state outranks stale output)',
  () => readerFn({ pending_action: PA, pending_action_action_type: 'archive_company', pending_action_source_work_order_id: 'wo-1', pending_action_expires_at: future() },
    { pendingAction: { kind: 'open_question', question: 'live one' } }, undefined).bound.question !== 'live one');
C('V11.durable.fallback', 'CONTRACT', 'with NO valid durable row the last turn\'s stored pendingAction still binds',
  () => readerFn(null, { pendingAction: { kind: 'open_question', question: 'live one' } }, undefined).bound.question === 'live one');

// M11 / M15b: structuredProseDrift is load-bearing but every committed case that touches
// it is also satisfied by another arm (evidence present, or ungrounded legacy fallback).
// These two isolate it: grounded ONLY by a deterministic prefix, no evidence, no claims.
C('V11.drift.factLinesOnly', 'CONTRACT', 'the D68 shape — grounded only by a deterministic report + fabricated completion prose — is re-rendered',
  () => { const r = run({ claims: null, evidence: [], grounded: true, deterministicPrefix: 'Deleted 0 of 3 requested companies.', summary: 'ACME has been archived.' });
    return r.corrected === true && !/has been archived/i.test(r.summary); });
C('V11.drift.progressiveStructured', 'CONTRACT', 'the same shape with PROGRESSIVE wording is re-rendered too (structured arm carries the E-multi vocabulary)',
  () => { const r = run({ claims: null, evidence: [], grounded: true, deterministicPrefix: 'Deleted 0 of 3 requested companies.', summary: 'Executing the plan to archive ACME.' });
    return r.corrected === true && !/Executing the plan/i.test(r.summary); });

// =====================================================================================
// DEFECTS — demonstrated escapes on fdb4564. These FAIL until fixed.
// =====================================================================================

// D88 — an assertion with NO sentence terminator before a trailing short question
// survives whole. The cut only fires on terminators; the PAST_COMPLETION belt only
// catches AUX shapes ("has been/was/were + participle"). This is the SAME CLASS as
// run8/D61 and run10/D77+D83, which were each closed for their own punctuation only.
for (const [tag, q, leak] of [
  ['comma-ok', 'I archived ACME, ok?', 'I archived ACME'],
  ['comma-obj', 'ACME deleted everything, ok?', 'deleted everything'],
  ['participle-led', 'Deleted ACME and its tasks, ok?', 'Deleted ACME'],
  ['abbrev-shielded', 'ACME Inc. deleted everything, ok?', 'deleted everything'],
  ['single-letter-shield', 'I archived ACME B. ok?', 'I archived ACME'],
  ['count-object', 'I removed 3 people from ACME, ok?', 'removed 3 people'],
]) {
  C('D88.' + tag, 'DEFECT', 'D88: ' + JSON.stringify(q) + ' — the assertion must not reach founder-facing text',
    () => !surviving(Q(q)).toLowerCase().includes(leak.toLowerCase()));
}
// Controls that MUST keep passing when D88 is fixed (do not close D88 by re-breaking D70).
C('D88.hold.d70', 'CONTRACT', 'D70 control: "Is Acme Inc. still interested?" still survives whole',
  () => surviving(Q('Is Acme Inc. still interested?')) === 'Is Acme Inc. still interested?');
C('D88.hold.d70b', 'CONTRACT', 'D70b control: "Should the 1.5 allocation stay?" still survives whole',
  () => surviving(Q('Should the 1.5 allocation stay?')) === 'Should the 1.5 allocation stay?');
C('D88.hold.plain', 'CONTRACT', 'a plain clarification question still survives whole',
  () => surviving(Q('Which company did you mean?')) === 'Which company did you mean?');

// D86 — the Title-Case name-shape discriminator is defeated by capitalising one letter.
// Every committed D78 case is a lowercase participle; title-casing it makes the identical
// assertion an accepted, persisted option label.
for (const [tag, label] of [
  ['title-past', 'ACME Deleted'],
  ['title-archived', 'ACME Archived'],
  ['title-completed', 'Project Completed'],
  ['title-sentence', 'ACME Deleted Everything'],
  ['participle-led', 'Deleted ACME'],
]) {
  C('D86.' + tag, 'DEFECT', 'D86: Title-Cased assertion label ' + JSON.stringify(label) + ' must not be accepted verbatim',
    () => run({ claims: null, summary: 'ok', pendingAction: { kind: 'disambiguation', question: 'Which?', options: [{ label, id: ACME, entityType: 'company' }] },
      context: { companies: [{ id: ACME, name: 'ACME Holdings' }] } }).envelope.pendingAction.options[0].label !== label);
}
C('D86.hold.d72', 'CONTRACT', 'D72 control: "Closed Loop Systems" survives when the canonical read CONFIRMS it (run13/D100 changed this contract: an uncorroborated label carrying completion vocabulary now falls back to the derived reference)',
  () => run({ claims: null, summary: 'ok', pendingAction: { kind: 'disambiguation', question: 'Which?', options: [{ label: 'Closed Loop Systems', id: ID, entityType: 'company' }] },
    context: { companies: [{ id: ID, name: 'Closed Loop Systems' }] } }).envelope.pendingAction.options[0].label === 'Closed Loop Systems');
C('D86.hold.d79', 'CONTRACT', 'D79 control: twin assertion-shaped REAL names must stay distinct',
  () => { const r = run({ claims: null, summary: 'ok', pendingAction: { kind: 'disambiguation', question: 'Which?', options: [
      { label: 'Was Archived Holdings', id: ACME, entityType: 'company' }, { label: 'Was Created Studio', id: ID, entityType: 'company' }] },
    context: { companies: [{ id: ACME, name: 'Was Archived Holdings' }, { id: ID, name: 'Was Created Studio' }] } });
    const [a, b] = r.envelope.pendingAction.options.map((o) => o.label); return a !== b; });

// D87 — EXECUTION_IN_PROGRESS arm 3 ("now <gerund>") carries a STRICT SUBSET of arm 2's
// verb list ("i'm now <gerund>"). Seven verbs are caught in one phrasing and not the
// other, for no stated reason — an omission, not a disclosed lexical limit.
for (const v of ['removing', 'ending', 'renaming', 'closing', 'clearing', 'granting', 'declining']) {
  C('D87.' + v, 'DEFECT', 'D87: "Now ' + v + ' ACME." must be caught, exactly as "I’m now ' + v + ' ACME." already is',
    () => run({ claims: null, evidence: [], grounded: false, summary: 'Confirmed. Now ' + v + ' ACME.' }).corrected === true);
}
for (const v of ['assigning', 'archiving', 'deleting']) {
  C('D87.hold.' + v, 'CONTRACT', 'the verbs arm 3 already covers stay covered ("Now ' + v + '")',
    () => run({ claims: null, evidence: [], grounded: false, summary: 'Confirmed. Now ' + v + ' ACME.' }).corrected === true);
}
// run40/V39-D1: this hold rested on a single MID-clause string, and EXECUTION_IN_PROGRESS runs PER
// CLAUSE and reads a CLAUSE-INITIAL gerund as an execution claim - so the old string could never
// observe the arm, which is how 28 destroyed answers went unseen through ten verifiers. Written as
// explicit literals because verifier #39's vacuity check reads the summary literals directly.
C('D87.hold.legit.1', 'CONTRACT', 'ordinary prose whose gerund opens the clause is untouched (deployed v92 shows it to the founder)',
  () => run({ command: '', claims: null, evidence: [], grounded: false, summary: 'Archiving a company from chat is handled on the Companies page.' }).summary === 'Archiving a company from chat is handled on the Companies page.');
C('D87.hold.legit.2', 'CONTRACT', 'ordinary prose whose gerund opens the clause is untouched (deployed v92 shows it to the founder)',
  () => run({ command: '', claims: null, evidence: [], grounded: false, summary: 'Restoring a company requires founder approval.' }).summary === 'Restoring a company requires founder approval.');
C('D87.hold.legit.3', 'CONTRACT', 'ordinary prose whose gerund opens the clause is untouched (deployed v92 shows it to the founder)',
  () => run({ command: '', claims: null, evidence: [], grounded: false, summary: 'Deleting a task needs your confirmation first.' }).summary === 'Deleting a task needs your confirmation first.');
C('D87.hold.legit.4', 'CONTRACT', 'ordinary prose whose gerund opens the clause is untouched (deployed v92 shows it to the founder)',
  () => run({ command: '', claims: null, evidence: [], grounded: false, summary: 'The runbook describes executing suites locally.' }).summary === 'The runbook describes executing suites locally.');

// run11 promotion additions (implementing session): cases the verifier's own set did
// not distinguish, found by mutation-testing the FIX rather than the defect.
//
// V1: with only the completion-in-question belt, an assertion+question is dropped
// ENTIRELY (null) — safe, but it strands the founder mid-clarification. The
// comma-clause reduction is what PRESERVES the real question, so it needs a case that
// fails when it is removed.
C('D88.preserves.question', 'CONTRACT', 'a comma-joined assertion is cut but the trailing QUESTION survives (not dropped wholesale)',
  () => surviving(Q('I archived ACME, ok?')) === 'ok?');
C('D88.preserves.longer', 'CONTRACT', 'the same, with a longer trailing question',
  () => surviving(Q('Deleted ACME and its tasks, which company did you mean?')) === 'which company did you mean?');


let pass = 0, fail = 0, defectsOpen = 0;
for (let [id, kind, desc, thunk] of CASES) {
  let ok; try { ok = thunk() === true; } catch (e) { ok = false; desc += ' THREW ' + e.message; }
  if (ok) pass++; else { fail++; if (kind === 'DEFECT') defectsOpen++; }
  console.log((ok ? 'OK   ' : 'FAIL ') + id.padEnd(26) + ' [' + kind + '] ' + desc);
}
console.log(`\nv11_regression_additions: ${pass} pass, ${fail} fail (${defectsOpen} open #71 defects reproduce; ${fail - defectsOpen} CONTRACT failures = guards that do not hold as claimed)`);
// Exit guard. In the verifier's ORIGINAL file the DEFECT rows were expected to FAIL (they
// documented open escapes), so only CONTRACT failures could fail the run. On promotion
// every DEFECT expectation was flipped to the FIXED behaviour, which makes that carve-out
// decorative in exactly the way this project keeps re-learning: a regression re-opening a
// defect would increment BOTH counters and still exit 0. Any failure now fails the suite.
if (fail > 0) process.exit(1);
