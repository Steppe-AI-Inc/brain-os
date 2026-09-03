// RUN12 DEFECT CLOSURE CONTRACT — verifier #12's cases (campaign #72), promoted with
// FIXED expectations after all eight were closed. Two were REGRESSIONS the implementing
// session introduced in f4763ef (D92: a blanket completion belt that dropped 60% of
// legitimate clarifications; D93: quoted labels breaking disambiguation matching) — both
// are pinned here so neither can return. Original file under qa/verification/proposed/.
// index.ts sha256 1db38579…b369ec).
//
// Same two-kind convention as v10_/v11_regression_additions.mjs:
//   CONTRACT — a property that ALREADY HOLDS on f4763ef but that NO committed suite
//              observes. Verifier #12's mutation battery broke it in the real source and
//              the whole committed battery still exited 0 (a SURVIVING mutant).
//   DEFECT   — a real escape or regression demonstrated on f4763ef. Expected = the FIXED
//              behaviour, so these FAIL on f4763ef BY DESIGN until the fix lands.
//
// Promotion notes for whoever lands this in qa/scenarios-runner/:
//   * keep the exit guard at the bottom — ANY failure must exit nonzero (run10 and run11
//     each had to have one restored; do not reintroduce a kind-based carve-out).
//   * D92 is the one that blocks the deploy gate. Its fix is prepared and validated in
//     qa/verification/proposed/v12_d92_fix.patch.md.
// Runnable with plain `node` from the repo root. SEM_INDEX_SRC overrides the source path.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

function findRepoFile(rel) {
  let d = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const p = resolve(d, rel);
    try { readFileSync(p); return p; } catch { d = resolve(d, '..'); }
  }
  throw new Error('could not locate ' + rel + ' from ' + dirname(fileURLToPath(import.meta.url)));
}
const { stripTS } = await import(new URL('file://' + findRepoFile('qa/scenarios-runner/_gate_extract.mjs')).href);
const SRC = process.env.SEM_INDEX_SRC || findRepoFile('supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8');

// ---- the truthfulness-gate slice (same extraction the committed suites use) ----
const gStart = src.indexOf('// STRUCTURED-CLAIM VERIFICATION');
const gAnchor = src.indexOf('executionEvidence: claimExecutionEvidence,', gStart);
if (gStart === -1 || gAnchor === -1) throw new Error('gate slice anchors not found — update this harness, do not let it pass');
const gateSlice = stripTS(src.slice(gStart, src.indexOf('};', gAnchor) + 2));
const gateFn = new Function(
  'result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
  'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
  gateSlice + '\n; return { summary: result.summary, envelope: result.verifiedResponse, corrected: claimsPastCompletionWithNoGrounding };');

// ---- the REAL disambiguation matcher, EXECUTED (not reimplemented) ----
const mStart = src.indexOf('function matchDisambiguationOption');
if (mStart === -1) throw new Error('matchDisambiguationOption not found — update this harness');
const mEnd = src.indexOf('\n}', mStart);
if (mEnd === -1) throw new Error('matchDisambiguationOption end not found — update this harness');
const matchFn = new Function('command', 'options',
  stripTS(src.slice(mStart, mEnd + 2)) + '\n; return matchDisambiguationOption(command, options);');

const DENO = { env: { get: () => undefined } };
const mk = (o) => new Map(Object.entries(o || {}));
const ACME = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const ID = '11111111-1111-1111-1111-111111111111';
const M = (rt, id, action) => ({ type: 'mutation_result', resourceType: rt, resourceId: id, action });
const run = ({ claims = null, summary = '', pendingAction = null, questions, evidence = [], context = {}, grounded = false, deterministicPrefix = '' }) =>
  gateFn({ claims, summary, pendingAction, questions }, evidence, context, 'gpt', grounded, false, DENO,
    mk(), mk(), mk(), mk(), false, deterministicPrefix, mk());

const PREAMBLE = 'I can’t confirm from this turn’s execution record that the company was archived.';
const surviving = (out) => (out.startsWith(PREAMBLE) ? out.slice(PREAMBLE.length).trim() : out);
const Q = (q) => surviving(run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', questions: [q] }).summary);
const label = (l, ctxName) => run({ claims: null, summary: 'ok',
  pendingAction: { kind: 'disambiguation', question: 'Which?', options: [{ label: l, id: ACME, entityType: 'company' }] },
  context: ctxName ? { companies: [{ id: ACME, name: ctxName }] } : {} }).envelope?.pendingAction?.options?.[0]?.label;
const corrected = (s) => run({ claims: null, evidence: [], grounded: false, summary: s }).corrected === true;

const CASES = [];
const C = (id, kind, desc, thunk) => CASES.push([id, kind, desc, thunk]);

// =====================================================================================
// D90 — CONTRACT. The Title-Case name-shape gate survived verifier #12's mutation M11
// with the entire battery green, yet it is the ONLY thing refusing an all-lowercase
// assertion label: those have completionIdx===0 and no ALL-CAPS token after them, so the
// run11/D86 POSITION rule passes them. Ninth recurrence of the vacuous-guard class.
// =====================================================================================
for (const l of ['deleted acme', 'deleted everything', 'removed all people', 'archived the project', 'done: acme deleted', 'sent it']) {
  C('V12.titlecase.' + l.split(' ')[0] + '.' + l.split(' ').length, 'CONTRACT',
    'lowercase assertion label ' + JSON.stringify(l) + ' is refused (only the Title-Case gate does this)',
    () => label(l, 'ACME Holdings') !== l);
}

// =====================================================================================
// D91 — DEFECT. run11/D86 closed the Title-Cased-SUBJECT shapes ("ACME Deleted") and the
// participle+ALL-CAPS shape ("Deleted ACME"), but a Title-Cased leading participle with a
// Title-Case (not ALL-CAPS) object is still accepted VERBATIM and rendered to the founder
// under "Options: …", replaying next turn as "Confirmed — <assertion>".
// The derived-canonical fallback does NOT rescue these: it only fires on REFUSAL.
// =====================================================================================
for (const l of ['Deleted The Project', 'Archived Everything', 'Removed All People', 'Completed The Migration',
  'Closed All Accounts', 'Restored The Company', 'Approved The Request', 'Sent The Invoice',
  'Cleared All Data', 'Moved The Team', 'Ended The Contract', 'Granted Full Access',
  'Added Three People', 'Renamed The Unit', 'Confirmed The Order', 'Assigned The Tasks', 'Deleted Everything']) {
  C('D91.' + l.split(' ')[0].toLowerCase() + '.' + l.split(' ').length, 'DEFECT',
    'D91: leading-participle assertion label ' + JSON.stringify(l) + ' must not be accepted verbatim',
    () => label(l, 'ACME Holdings') !== l);
}
// D90 (NINTH vacuous-guard recurrence) — the Title-Case name-shape gate had NO observing
// case: neutralising it left all 22 suites green. It is not redundant with the D91
// adjectival-lead rule: an ADJECTIVAL-leading, lowercase assertion whose second word is
// not a determiner passes every other check, and only the Title-Case gate refuses it.
// Verified by re-running this suite with `if (!titleCasedName) return null;` neutralised:
// these two are the cases that then fail.
C('D90.titlecase.observed', 'DEFECT', 'D90: a lowercase adjectival-leading assertion label is refused (the Title-Case gate is observed)',
  () => label('completed migration') !== 'completed migration');
C('D90.titlecase.observed2', 'DEFECT', 'D90: a lowercase name-shaped label with a completion word is refused rather than shown as a claim',
  () => label('restored backup archive') !== 'restored backup archive');
C('D91.hold.d72', 'CONTRACT', 'D72 control: "Closed Loop Systems" must still survive as a real name',
  () => label('Closed Loop Systems') === 'Closed Loop Systems');

// =====================================================================================
// D92 — DEFECT (P1 REGRESSION vs fdb4564). The run11/D88 belt drops any question that
// MENTIONS completion vocabulary rather than one that ASSERTS a completion. 12 of these
// 20 realistic clarifications are destroyed on f4763ef; all 20 survive on fdb4564.
// Applies on ORDINARY turns too, and nulls pendingAction.question while the action stays
// armed — the exact run10/D84 shape.
// =====================================================================================
for (const q of [
  'Which archived company did you mean?', 'Do you want me to restore the archived one?',
  'Which of the completed tasks should I reopen?', 'Do you mean the person whose employment ended?',
  'Should the removed member be re-invited?', 'Which goal should this task be assigned to?',
  'Is this the approved budget?', 'Do you want the closed leads included?',
  'Should I include archived records in the report?', 'Who should the task be assigned to?',
  'Do you want the deleted document recovered?', 'Shall I confirm the rejected approval?',
]) {
  C('D92.q' + (CASES.filter((c) => c[0].startsWith('D92.')).length + 1), 'DEFECT',
    'D92: legitimate clarification ' + JSON.stringify(q) + ' must survive, not be dropped wholesale',
    () => Q(q) === q);
}
C('D92.pa.armedPromptKept', 'DEFECT',
  'D92: a pendingAction question mentioning completion vocabulary must not be nulled while the action stays armed',
  () => { const r = run({ claims: null, summary: 'ok', pendingAction: { kind: 'bulk_confirmation',
      question: 'Should I archive the closed account?', summary: 'Archive ACME', action: { archiveCompanyIds: [ACME] } } });
    const p = r.envelope?.pendingAction; return !(p && p.action && p.question === null); });
// Controls that MUST keep passing when D92 is fixed — do not close it by reopening D88.
for (const [tag, q, leak] of [
  ['single-letter-shield', 'I archived ACME B. ok?', 'archived'],
  ['comma-ok', 'I archived ACME, ok?', 'i archived'],
  ['comma-obj', 'ACME deleted everything, ok?', 'deleted everything'],
  ['participle-led', 'Deleted ACME and its tasks, ok?', 'deleted acme'],
  ['dash-join', 'I archived ACME - ok?', 'i archived'],
  ['and-join', 'I archived ACME and ok?', 'i archived'],
  ['runon', 'I archived ACME ok?', 'i archived'],
  ['aux-question', 'Did you know ACME has been archived?', 'has been archived'],
  ['count-object', 'I removed 3 people from ACME, ok?', 'removed 3 people'],
]) {
  C('D92.hold.' + tag, 'CONTRACT', 'no assertion leaks via ' + JSON.stringify(q),
    () => !Q(q).toLowerCase().includes(leak.toLowerCase()));
}
C('D92.hold.preservesQuestion', 'CONTRACT', 'the comma-joined case still PRESERVES the real question ("ok?")',
  () => Q('I archived ACME, ok?') === 'ok?');

// =====================================================================================
// D93 — DEFECT (REGRESSION vs fdb4564). A real company name carrying a completion word
// in a non-leading position is now refused and replaced by the QUOTED canonical label.
// matchDisambiguationOption matches by substring, so the founder typing the plain name
// cannot select it — the run9/D72 dead-ended-disambiguation class, new route.
// =====================================================================================
for (const name of ['Advanced Closed Systems', 'Closed Loop AG', 'Global Closed Loop', 'Blue Closed Systems']) {
  C('D93.' + name.split(' ')[0].toLowerCase(), 'DEFECT',
    'D93: ' + JSON.stringify(name) + ' must stay selectable by typing its plain name',
    () => { const rendered = label(name, name);
      return matchFn(name.toLowerCase(), [{ label: rendered, id: ACME, entityType: 'company' }]) !== null; });
}

// =====================================================================================
// D95 — DEFECT. Two options whose entities are absent from contextPack both collapse to
// the identical typed fallback ("the company"), so matchDisambiguationOption sees two
// matches and returns null: the option set is dead-ended. The committed D79 control only
// covers the in-contextPack case.
// =====================================================================================
C('D95.distinctOutOfContext', 'DEFECT',
  'D95: two refused options with NO contextPack row must still render distinguishable labels',
  () => { const r = run({ claims: null, summary: 'ok', pendingAction: { kind: 'disambiguation', question: 'Which?', options: [
      { label: 'Advanced Closed Systems', id: ACME, entityType: 'company' },
      { label: 'Global Closed Loop', id: ID, entityType: 'company' }] } });
    const [a, b] = r.envelope.pendingAction.options.map((o) => o.label); return a !== b; });

// =====================================================================================
// D94 — DEFECT (PRE-EXISTING, also present on fdb4564; recorded because the run11 closure
// text presents D87 as closed without disclosing the residual). Passive voice is the
// notable structural gap: no arm handles "<subject> is being <verb>ed".
// =====================================================================================
for (const s of ['ACME is being archived.', 'The company is being deleted right now.', 'ACME is getting archived.',
  'I am about to archive ACME.', 'I am in the process of archiving ACME.', 'Kicking off the archive of ACME.',
  'Going ahead and archiving ACME.', 'Proceeding to archive ACME.', 'Starting the archive of ACME now.',
  'Let me archive ACME for you.', 'Archiving ACME as we speak.']) {
  C('D94.p' + (CASES.filter((c) => c[0].startsWith('D94.')).length + 1), 'DEFECT',
    'D94: progressive fabrication ' + JSON.stringify(s) + ' must be corrected', () => corrected(s));
}
for (const s of ['Confirmed. Now removing ACME.', 'I am archiving ACME.', 'Working on archiving ACME.', 'Processing the request.']) {
  C('D94.hold.' + s.split(' ')[0].toLowerCase() + CASES.filter((c) => c[0].startsWith('D94.hold')).length, 'CONTRACT',
    'run11/D87 coverage holds: ' + JSON.stringify(s) + ' is corrected', () => corrected(s));
}
C('D94.hold.legit', 'CONTRACT', 'ordinary prose containing a gerund in a non-claim shape is untouched',
  () => run({ claims: null, evidence: [], grounded: false, summary: 'The runbook describes executing suites locally.' })
    .summary === 'The runbook describes executing suites locally.');

let pass = 0, fail = 0, defectsOpen = 0;
for (let [id, kind, desc, thunk] of CASES) {
  let ok; try { ok = thunk() === true; } catch (e) { ok = false; desc += ' THREW ' + e.message; }
  if (ok) pass++; else { fail++; if (kind === 'DEFECT') defectsOpen++; }
  console.log((ok ? 'OK   ' : 'FAIL ') + id.padEnd(30) + ' [' + kind + '] ' + desc);
}
console.log(`\nv12_regression_additions: ${pass} pass, ${fail} fail (${defectsOpen} open #72 defects reproduce; ${fail - defectsOpen} CONTRACT failures = guards that do not hold as claimed)`);
// Exit guard — ANY failure fails the run. No kind-based carve-out: run10 and run11 each
// had to have one restored after a carve-out let a reopened defect exit 0.
if (fail > 0) process.exit(1);
