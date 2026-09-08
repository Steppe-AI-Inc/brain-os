#!/usr/bin/env node
// V65 REGRESSION ADDITIONS — verifier #65, campaign #125, candidate 3b0bf64
// (index.ts sha256 77d6f0523bcbad0c01a99865c5171025d862665cbc77b9116303b609dfd9e7a0).
//
// Rows are tagged:
//   CONTRACT  a rule that must hold forever. It holds on this candidate; it is pinned so it cannot
//             be reverted silently.
//   DEFECT    a finding of this round. It FAILS on this candidate and must PASS after the fix.
//
// ANY failure exits non-zero. The source under test comes from SEM_INDEX_SRC when set, otherwise it
// is resolved by walking up from this file, so the suite is correct from ANY cwd.
//
// Everything below executes the REAL windows sliced out of index.ts. Nothing is re-implemented: a
// re-implementation is the vacuous-regression class this repository has logged repeatedly, and five
// suites in qa/scenarios-runner still have it (V65-D7).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

// ---------------------------------------------------------------- source resolution (cwd-independent)
function resolveIndex() {
  if (process.env.SEM_INDEX_SRC) return resolve(process.env.SEM_INDEX_SRC);
  let d = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i++) {
    const c = join(d, 'supabase/functions/sem-ai-command/index.ts');
    if (existsSync(c)) return c;
    const up = dirname(d); if (up === d) break; d = up;
  }
  throw new Error('v65: index.ts not found from ' + dirname(fileURLToPath(import.meta.url)));
}
function resolveRepo() {
  let d = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(d, 'qa/scenarios-runner/_gate_extract.mjs'))) return d;
    const up = dirname(d); if (up === d) break; d = up;
  }
  throw new Error('v65: repo root not found');
}
const INDEX = resolveIndex();
const ROOT = resolveRepo();
const RAW = readFileSync(INDEX, 'utf8');
const SRC = RAW.replace(/\r\n/g, '\n');
const { stripTS, withPatternsAboveWindow } = await import(
  'file://' + join(ROOT, 'qa/scenarios-runner/_gate_extract.mjs').replace(/\\/g, '/'));

let pass = 0; const contractFails = [], defectFails = [];
const check = (tag, name, cond, detail) => {
  if (cond) { pass++; console.log('OK       [' + tag + '] ' + name); return; }
  const row = name + (detail ? '\n           ' + detail : '');
  (tag === 'CONTRACT' ? contractFails : defectFails).push(row);
  console.log('FAIL     [' + tag + '] ' + name + (detail ? '\n           ' + detail : ''));
};

// ---------------------------------------------------------------- window: request-intent derivation
function sliceBetween(a, b) {
  const i = SRC.indexOf(a); if (i < 0) throw new Error('v65: start marker missing: ' + a);
  const j = SRC.indexOf(b, i); if (j < 0) throw new Error('v65: end marker missing: ' + b);
  return SRC.slice(i, j + b.length);
}
const INTENT_WINDOW = stripTS(sliceBetween(
  'const MUTATION_ARRAY_FIELDS = [',
  'const requestedIntent: MutationIntent | null = requestedIntentPrimary;'));
const deriveIntentFn = new Function('command', 'result', 'claimExecutionEvidence',
  INTENT_WINDOW + '\n; return { requestedIntent, readShaped, isQuestion, startsWithRequestFrame, lexiconVerb };');
const deriveIntent = (command, result) => deriveIntentFn(command, result || {}, []);

// ---------------------------------------------------------------- window: executor company fallback
const EXEC_WINDOW = stripTS(sliceBetween(
  'const commandMentionsCompany = ',
  "const commandFallbackAllowed = commandImperativePosition && !modelResolvedOtherTarget && !modelEmittedArchive && !modelEmittedRestore && !commandIsQuestion && !commandNegatedLead && !commandReadLeadEffective && (!modelRequestIntent || (modelRequestIntent.kind === 'mutation' && (modelRequestIntentEntity === null || modelRequestIntentEntity === 'company' || modelRequestIntentEntity === 'other')));"));
const verbPatterns = ['ARCHIVE_VERB_PATTERN', 'RESTORE_VERB_PATTERN'].map((n) => {
  const at = SRC.indexOf('const ' + n + ' = ');
  if (at < 0) throw new Error('v65: ' + n + ' not found');
  let depth = 0;
  for (let i = at; i < SRC.length; i++) {
    const ch = SRC[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ';' && depth === 0) return stripTS(SRC.slice(at, i + 1));
  }
  throw new Error('v65: ' + n + ' end not found');
}).join('\n');
const execGateFn = new Function('command', 'result',
  verbPatterns + '\n' + EXEC_WINDOW + '\n; return { commandFallbackAllowed, commandIsQuestion, commandReadLeadEffective, commandImperativePosition };');
const execGate = (command, result) => execGateFn(command, result || {});

// ---------------------------------------------------------------- window: the never-silent receipt
const rcStart = SRC.indexOf('// STRUCTURED-CLAIM VERIFICATION');
const rcAnchor = SRC.indexOf('executionEvidence: claimExecutionEvidence,', rcStart);
if (rcStart < 0 || rcAnchor < 0) throw new Error('v65: structured-claim block not found');
const RECEIPT_WINDOW = withPatternsAboveWindow(SRC, stripTS(SRC.slice(rcStart, SRC.indexOf('};', rcAnchor) + 2)));
const receiptFn = new Function(
  'result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn',
  'claimsFutureActionWithNoPlan', 'Deno', 'companyNameById', 'taskTitleById', 'personNameById',
  'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
  RECEIPT_WINDOW + '\n; return { summary: result.summary, verdict: result.turnVerdict };');
const ACME = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const runTurn = (command, summary, claims) => {
  globalThis.command = command; globalThis.lifecycleReports = []; globalThis.factLines = [];
  globalThis.organizationGraphCheck = null; globalThis.workOrder = { id: 'wo-v65' };
  return receiptFn({ claims: claims === undefined ? null : claims, summary, pendingAction: null },
    [], { companies: [{ id: ACME, name: 'ACME', status: 'active' }] }, 'gpt', false, false,
    { env: { get: () => undefined } }, new Map(), new Map(), new Map(), new Map(), false, '', new Map());
};
const NO_CHANGE = /No change was made — /;

console.log('v65_regression_additions — source: ' + INDEX + '\n');

// ============================================================================================
// 1. DEFECT V65-D1 — every one of these is an ordinary mutation REQUEST. It must derive intent,
//    or the model's fabricated completion is the whole founder-facing answer.
//    The first two are named verbatim in the founder's mandate of 2026-09-08, section 2.
// ============================================================================================
const MUST_DERIVE_INTENT = [
  'should we restore ACME?',        // founder mandate section 2, verbatim
  'I want to archive ACME',         // founder mandate section 2, verbatim
  'should I archive ACME?', 'can I delete QA-1?', 'could I archive ACME?', 'may we archive ACME?',
  'we must archive ACME', 'we have to restore ACME', 'I need to archive ACME', 'we want to delete QA-1',
  "I'd like to archive ACME", 'I would like to restore ACME', 'we ought to archive ACME',
  'we need you to restore ACME', 'I should delete QA-1',
];
for (const cmd of MUST_DERIVE_INTENT) {
  check('DEFECT', 'V65-D1 request intent is derived for ' + JSON.stringify(cmd),
    deriveIntent(cmd).requestedIntent !== null,
    'a mutation request with no derived intent lets a fabricated completion ship verbatim');
}
// ...and end-to-end: the fabrication must not survive.
for (const cmd of MUST_DERIVE_INTENT) {
  const fab = 'ACME has been archived.';
  const r = runTurn(cmd, fab, null);
  check('DEFECT', 'V65-D1 the fabrication does not ship for ' + JSON.stringify(cmd),
    NO_CHANGE.test(r.summary) && r.verdict && r.verdict.receiptRendered === true,
    'measured: ' + JSON.stringify(r.summary));
}

// ============================================================================================
// 2. CONTRACT — the frames that DO work must keep working (no regression while fixing the above).
// ============================================================================================
const ALREADY_WORK = ['we should delete QA-1', 'you should archive ACME', 'shall I archive ACME?',
  'could you archive ACME?', 'please restore ACME', 'let us restore ACME', 'can you delete ACME?',
  'would you restore ACME?', 'we need to restore ACME', 'archive ACME', 'go ahead and archive ACME'];
for (const cmd of ALREADY_WORK) {
  check('CONTRACT', 'request intent is derived for ' + JSON.stringify(cmd), deriveIntent(cmd).requestedIntent !== null);
}

// ============================================================================================
// 3. DEFECT V65-D2 — a DELIBERATIVE frame must NOT authorise execution.
//    "should we archive ACME" is a question about whether to act, not an instruction to act.
//    This is the pair that makes ONE FLAT shared alternation the wrong shape: the intent tier
//    needs the frame (so the receipt fires) and the executor tier must not have it.
// ============================================================================================
const DELIBERATIVE = ['should we archive ACME', 'should I archive ACME', 'can I archive ACME',
  'could I restore ACME', 'may we delete ACME', 'should we archive company ACME'];
for (const cmd of DELIBERATIVE) {
  check('CONTRACT', 'the executor does NOT act on the deliberative ' + JSON.stringify(cmd),
    execGate(cmd).commandFallbackAllowed === false,
    'a deliberative question must never silently archive a company');
  check('DEFECT', 'V65-D2 the receipt tier DOES see the deliberative ' + JSON.stringify(cmd),
    deriveIntent(cmd).requestedIntent !== null,
    'the two tiers need OPPOSITE answers here; one flat shared alternation cannot express that');
}

// ============================================================================================
// 3b. CONTRACT — the two remaining executor VETOES, pinned behaviourally.
//
// The clean vacuity sweep on the frozen candidate showed that `commandNegatedLead` and `commandReadLead`
// could each be made to never (or always) match with the whole battery still green. Both sit in
// `commandFallbackAllowed`, so a dead negation veto means "do not archive ACME" ARCHIVES ACME, and a dead
// read-lead veto means a question about archiving performs one. Neither had a row asserting the gate
// itself — the receipt-side rows nearby assert what the founder is TOLD, not whether a write happens.
// ============================================================================================
// REGISTERED OPEN GAP, found by adding these rows: "stop archiving ACME" is correctly BLOCKED by the
// executor but is NOT seen by the intent tier, so a fabricated "Done — I've stopped archiving ACME" would
// ship with no receipt. The four spellings below are recognised; "stop" is missing from the negation
// lexicon. Closing it is a SOURCE change and index.ts is a frozen release candidate, so it is recorded
// here and in ledger #145 rather than asserted as a passing row — a row that fails is evidence, but a
// battery that is red for a known deferred reason stops being evidence of anything.
for (const cmd of ['do not archive ACME', "don't archive ACME", 'never delete QA-1',
  'please do not restore ACME']) {
  check('CONTRACT', 'a NEGATED request never reaches the executor: ' + JSON.stringify(cmd),
    execGate(cmd).commandFallbackAllowed === false,
    'the negation veto is what stands between "do not archive ACME" and archiving ACME');
  check('CONTRACT', 'a negated request is still SEEN as a request: ' + JSON.stringify(cmd),
    deriveIntent(cmd).requestedIntent !== null,
    'it must reach the receipt so the founder is told "you asked me not to", never silently ignored');
}
for (const cmd of ['what is archived?', 'which companies did we archive last week?',
  'tell me about the archived companies', 'show the archived companies']) {
  check('CONTRACT', 'a READ never reaches the executor: ' + JSON.stringify(cmd),
    execGate(cmd).commandFallbackAllowed === false,
    'a question about archiving must never perform one');
}
// The negative half, so neither veto can be "fixed" by vetoing everything.
for (const cmd of ['archive ACME', 'please restore ACME', 'go ahead and delete QA-1']) {
  check('CONTRACT', 'a plain directive still reaches the executor: ' + JSON.stringify(cmd),
    execGate(cmd).commandFallbackAllowed === true,
    'a veto that blocks every command blocks the product, it does not secure it');
}

// ============================================================================================
// 4. CONTRACT — the founder's section-3 invariant, structurally.
//    A request the EXECUTOR detects is never invisible to the receipt/intent tier.
// ============================================================================================
{
  const frames = ['', 'please ', 'kindly ', 'go ahead and ', 'do me a favour and ', 'could you ', 'can you ',
    'would you ', 'will you ', 'shall we ', 'shall i ', "let's ", 'we should ', 'you should ', 'mind ',
    'we need to ', 'i need you to ', 'i want you to ', 'any chance you could ', 'would you be able to ',
    'quickly ', 'right away ', 'at once ', 'immediately ', 'permanently '];
  const execOnly = [];
  for (const f of frames) for (const v of ['archive', 'restore', 'delete', 'remove', 'end'])
    for (const p of ['', '?', ' now', ' please']) {
      const cmd = f + v + ' company ACME' + p;
      if (execGate(cmd).commandFallbackAllowed && deriveIntent(cmd).requestedIntent === null) execOnly.push(cmd);
    }
  check('CONTRACT', 'EXECUTOR-DETECTED IS A SUBSET OF INTENT-DETECTED (no request executes invisibly to the receipt)',
    execOnly.length === 0, execOnly.slice(0, 6).join(' | '));
}

// ============================================================================================
// 5. CONTRACT — the confirmation convergence: the intent tier is a SUPERSET of the executor gate.
// ============================================================================================
{
  const at = SRC.indexOf('const CONFIRMATION_ALTERNATION = ');
  if (at < 0) throw new Error('v65: CONFIRMATION_ALTERNATION not found');
  let ALT = null, depth = 0;
  for (let i = at; i < SRC.length; i++) {
    const ch = SRC[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ';' && depth === 0) { ALT = SRC.slice(at, i + 1); break; }
  }
  const execConf = new Function(ALT + '\nreturn (c) => new RegExp("^(?:" + CONFIRMATION_ALTERNATION + ")[.!]?$", "i").test(c.trim());')();
  const intentConf = new Function(ALT + "\nreturn (c) => new RegExp('^\\\\s*(?:' + CONFIRMATION_ALTERNATION + ')\\\\b[\\\\s,.!—–-]*(?:(?:go ahead|go|do it|proceed|please|now|thanks|then)[\\\\s,.!—–-]*)*$' + '|^\\\\s*(?:option|choice|number|the)?\\\\s*(?:\\\\d+|one|two|three|four|five|[a-e]|first|second|third|fourth|last)(?:\\\\s+(?:one|option|choice))?\\\\s*[.!]?\\\\s*$', 'i').test(c);")();
  const bad = [];
  for (const wd of ['yes', 'yep', 'yeah', 'yup', 'y', 'ok', 'okay', 'sure', 'confirm', 'confirmed', 'correct',
    'affirmative', 'go ahead', 'go for it', 'do it', 'execute', 'proceed', 'please do', 'approved'])
    for (const sfx of ['', '.', '!', ' ', '  ']) for (const pre of ['', ' ', '  '])
      for (const c of [wd, wd.toUpperCase(), wd[0].toUpperCase() + wd.slice(1)]) {
        const cmd = pre + c + sfx;
        if (execConf(cmd) && !intentConf(cmd)) bad.push(JSON.stringify(cmd));
      }
  check('CONTRACT', 'CONFIRMATION: the executor gate is a subset of the receipt tier (a "yes" that executes is always seen)',
    bad.length === 0, bad.slice(0, 6).join(' '));
}

// ============================================================================================
// 6. DEFECT V65-D3 — ONE CONCEPT -> ONE CANONICAL DEFINITION -> MULTIPLE CONSUMERS.
// ============================================================================================
// The WHOLE declaration, not its first line: REQUEST_FRAME_ALTERNATION and friends are multi-line
// string concatenations, and reading only the first line silently under-measures every comparison
// below — the fail-open shape this suite exists to police, one level up.
const declLine = (n) => {
  const at = SRC.indexOf('const ' + n + ' = ');
  if (at < 0) return null;
  let depth = 0;
  for (let i = at; i < SRC.length; i++) {
    const ch = SRC[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ';' && depth === 0) return SRC.slice(at + ('const ' + n + ' = ').length, i);
  }
  return null;
};
// A self-check that declLine really read the whole multi-line declaration. It probed for "shall we", which
// moved to the DELIBERATIVE group when verifier #66 ruled the modal interrogatives deliberative — so the
// probe now uses a frame whose group membership is not itself under review. A probe that tracks a frame
// likely to move is a guard that fails for the wrong reason.
if (!declLine('REQUEST_FRAME_ALTERNATION') || !declLine('REQUEST_FRAME_ALTERNATION').includes('kindly'))
  throw new Error('v65: declLine cannot read the canonical alternation — this suite would under-measure');
{
  const a = declLine('PAST_COMPLETION_CLAIM_PATTERN'), b = declLine('LEGACY_PAST_COMPLETION');
  check('DEFECT', 'V65-D3a PAST_COMPLETION_CLAIM_PATTERN and LEGACY_PAST_COMPLETION are not two hand-maintained copies',
    !(a && b && a === b),
    'they are BYTE-IDENTICAL (' + (a ? a.length : 0) + ' chars) and separately declared — the twin mechanism that has now driven four rounds');
}
{
  // Written when both constants existed and could only be compared. CONVERGING them — one constant, two
  // consumers — satisfies the finding strictly more strongly than making two copies agree, so a missing
  // COMPLETION_PARTICIPLE is a pass, not a crash. (setOf is null-safe for the same reason.)
  const setOf = (src) => new Set((((src || '').match(/\(\?:([a-z|]+)\)|\(([a-z|]+)\)/) || [null, '', ''])
    .slice(1).filter(Boolean)[0] || '').split('|').filter(Boolean));
  const participle = declLine('COMPLETION_PARTICIPLE');
  const cw = setOf(declLine('COMPLETION_WORD')), cp = setOf(participle);
  const diff = [...cw].filter((x) => !cp.has(x)).concat([...cp].filter((x) => !cw.has(x)));
  // Converged either by deleting the second name, or by making it a REFERENCE to the survivor. Both leave
  // exactly one body to maintain, which is the whole content of the finding; a bare identifier as the
  // declaration is therefore a pass, and only two real regex bodies can differ.
  const isAlias = participle !== null && /^\s*[A-Z][A-Z0-9_]*\s*$/.test(participle);
  check('DEFECT', 'V65-D3b COMPLETION_WORD and COMPLETION_PARTICIPLE do not encode the same vocabulary twice, drifted',
    participle === null || isAlias || diff.length === 0,
    participle === null || isAlias ? '' : 'they differ by: ' + JSON.stringify(diff));
}
{
  // STRUCTURAL, not a literal search for the one spelling that already happened. The original row looked
  // for the exact old text, so a DIFFERENT private question-list at the same site passed every suite in the
  // battery (verifier #66, V66-D4). What actually matters is that the request-frame VOCABULARY appears in
  // exactly one place: any regex literal that lists three or more second-person frames is a re-spelling,
  // wherever it lives and however it is worded.
  const FRAME_MARKERS = ['would you', 'could you', 'can you', 'will you', 'shall we', 'can we', 'could we',
    'any chance you', 'would you mind'];
  const CANONICAL_DECLS = ['const REQUEST_FRAME_ADDRESSED', 'const REQUEST_FRAME_ALTERNATION',
    'const REQUEST_FRAME_DELIBERATIVE', 'const QUESTION_SUPPRESSING_FRAME'];
  // The canonical declarations are multi-line string concatenations, so exclude their whole RANGE — a
  // first-line-only exclusion flags the declaration's own continuation lines and makes the guard useless
  // in the opposite direction.
  const lines = SRC.split('\n');
  const canonical = new Set();
  for (let i = 0; i < lines.length; i++) {
    if (!CANONICAL_DECLS.some((d) => lines[i].includes(d))) continue;
    for (let j = i; j < lines.length; j++) { canonical.add(j); if (lines[j].trimEnd().endsWith(';')) break; }
  }
  const respellings = lines.filter((l, i) => {
    if (canonical.has(i)) return false;                                 // the one definition, in its groups
    if (!/\|/.test(l)) return false;                                    // only lines carrying an alternation
    return FRAME_MARKERS.filter((m) => l.toLowerCase().includes(m)).length >= 3;
  });
  check('DEFECT', 'V65-D3c the request-frame vocabulary is spelled in exactly one place',
    respellings.length === 0,
    'a private re-spelling of the request frames at: '
    + JSON.stringify(respellings.map((l) => l.trim().slice(0, 90))));
  // The guard must be able to SEE a re-spelling, or it is the literal search all over again.
  check('CONTRACT', 'the re-spelling detector is non-vacuous',
    ['const x = /^(would you|could you|can you)/;'].filter((l) =>
      FRAME_MARKERS.filter((m) => l.toLowerCase().includes(m)).length >= 3).length === 1,
    'a synthetic private list must trip the same rule');
}
{
  const rl = SRC.split('\n').find((l) => l.includes('const commandReadLead ='));
  const canonical = declLine('REQUEST_FRAME_ALTERNATION') || '';
  const contradictions = ['shall i', 'shall we', 'could we', 'can we'].filter((p) => rl && rl.includes(p) && canonical.includes(p));
  check('DEFECT', 'V65-D3d no phrase is a REQUEST FRAME in one tier and a READ LEAD in the other',
    contradictions.length === 0, 'classified oppositely in two tiers: ' + JSON.stringify(contradictions));
}

// ============================================================================================
// 7. CONTRACT — the never-silent receipt itself, and no false positive on truthful reads.
// ============================================================================================
for (const [cmd, fab] of [['archive ACME', 'ACME has been archived.'], ['delete QA-1', 'QA-1 was deleted successfully.'],
  ['yes', 'Done — archived.'], ['option 2', 'Confirmed — Archived ACME.'], ['restore ACME', 'I have restored ACME.']]) {
  const r = runTurn(cmd, fab, null);
  check('CONTRACT', 'MUTATION INTENT + ZERO VERIFIED EXECUTION -> receipt: ' + JSON.stringify(cmd),
    NO_CHANGE.test(r.summary) && r.verdict.executedOperationCount === 0 && r.verdict.receiptRendered === true,
    JSON.stringify(r.summary));
}
for (const [cmd, truth] of [['what companies do we have?', 'You have 4 active companies: ACME, Beta, Gamma and Delta.'],
  ['tell me about ACME', 'ACME was created on 2026-03-01 and was archived on 2026-05-02.'],
  ['what happened last week?', 'Three companies were archived and two tasks were deleted last week.'],
  ['make a list of the archived companies', 'ACME and Beta are archived.'],
  ['set out the plan for Q3', 'The plan is to onboard two customers and close three deals.'],
  ['draft an email about the merge', 'Here is a draft: we are pleased to announce the merge.']]) {
  const r = runTurn(cmd, truth, null);
  check('CONTRACT', 'a truthful READ answer survives verbatim: ' + JSON.stringify(cmd),
    r.summary === truth, JSON.stringify(r.summary));
}

// ============================================================================================
// 7b. CONTRACT — Mongolian imperatives derive intent (closes a vacuity gap the #65 closure exposed).
//
// Repairing v56_mutation_proof's stale anchors made it RUN for the first time in several rounds, and it
// immediately reported that `(?<!\p{L})(архивл` could be reverted to `\b(архивл` with every suite still
// green. That mutant is not subtle: `\b` requires an ASCII word character, so before a Cyrillic letter it
// never matches at all — the mutant switches Mongolian archive/restore detection completely off, and
// nothing noticed. The lookbehind is what makes the boundary work, so it is pinned here directly.
// ============================================================================================
for (const cmd of ['архивла ACME', 'ACME-г архивла', 'ACME-г сэргээ', 'устга ACME']) {
  check('CONTRACT', 'a Mongolian imperative derives request intent: ' + JSON.stringify(cmd),
    deriveIntent(cmd).requestedIntent !== null,
    'the Cyrillic verb boundary is a lookbehind precisely because \\b cannot see a Cyrillic letter');
}
// The negative half: a Cyrillic letter immediately before the stem is not a verb in imperative position,
// so the boundary must still refuse it. Without this row the property could be "closed" by deleting the
// boundary altogether, which is the vacuity one level up.
for (const cmd of ['заархивласан баримт', 'нэрархивла']) {
  check('CONTRACT', 'a Cyrillic letter before the stem is not an imperative: ' + JSON.stringify(cmd),
    deriveIntent(cmd).requestedIntent === null,
    'the lookbehind must reject a stem that is glued to a preceding letter');
}

// ============================================================================================
// 8. DEFECT V65-D4 — every sweep the deploy decision rests on must assert its target count and
//    must exit non-zero on a survivor. mutation_sweep_safety_contract's TOOLS list is incomplete.
// ============================================================================================
{
  const contract = readFileSync(join(ROOT, 'qa/scenarios-runner/mutation_sweep_safety_contract.mjs'), 'utf8');
  for (const tool of ['vacuity_sweep_extended.mjs', 'v56_mutation_proof.mjs', 'v57_mutation_proof.mjs', 'v58_mutation_proof.mjs']) {
    check('DEFECT', 'V65-D4 ' + tool + ' is covered by mutation_sweep_safety_contract',
      contract.includes(tool), 'a sweep the deploy decision rests on is not subject to the zero-target rule');
  }
  const ext = join(ROOT, 'qa/verification/scratch/p1/vacuity_sweep_extended.mjs');
  if (existsSync(ext)) {
    const s = readFileSync(ext, 'utf8');
    check('DEFECT', 'V65-D4 vacuity_sweep_extended asserts a positive mutation-target count before scoring',
      /EXPECTED_MUTATION_TARGETS_FOUND|mutants\.length\s*===?\s*0|namedRegex\.length\s*===?\s*0/.test(s),
      'an empty mutant list yields a cheerful "0 killed, 0 survived" and exit 0');
    check('DEFECT', 'V65-D4 vacuity_sweep_extended exits non-zero when a mutant SURVIVES',
      /survived\.length\s*>\s*0|survived\.length\s*\?|process\.exit\(\s*survived/.test(s),
      'measured on this candidate: 33 survivors, exit status 0');
  }
}

// ============================================================================================
// 9. CONTRACT — bytes and structure.
// ============================================================================================
{
  const buf = readFileSync(INDEX);
  let bareLF = 0, bareCR = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 10 && !(i > 0 && buf[i - 1] === 13)) bareLF++;
    if (buf[i] === 13 && !(i + 1 < buf.length && buf[i + 1] === 10)) bareCR++;
  }
  check('CONTRACT', 'index.ts is CRLF-pure (0 bare LF)', bareLF === 0, 'bare LF = ' + bareLF);
  check('CONTRACT', 'index.ts declares MINIMUM_SAFE_CONTEXT and TRIM_ORDER cannot name a protected key',
    /if \(MINIMUM_SAFE_CONTEXT\.includes\(key\)\) throw new Error/.test(SRC));
  check('CONTRACT', 'namedTargets is protected from the trim', /'activeChannelId', 'namedTargets'\]/.test(SRC));
  check('CONTRACT', 'namedTargets carries its own envelope BESIDE the rows, not inside context.collections',
    /\(namedTargets as Record<string, unknown>\)\.collections = namedTargetsEnvelope;/.test(RAW.replace(/\r\n/g, '\n'))
    && !/collections\s*=\s*\{[^}]*namedTargets:/.test(SRC));
  check('CONTRACT', 'the pack-budget estimator and the serve() preflight estimator measure the same shape',
    /const packTokens = \(\) => Math\.ceil\(JSON\.stringify\(\{ command, contextPack: pack \}\)\.length \/ 4\);/.test(SRC)
    && /tokenEstimate = estimateTokens\(\{ command, contextPack \}\);/.test(SRC));
  check('CONTRACT', 'estimateRequestTokens includes the system prompt and the PRETTY-PRINTED body',
    /return SYSTEM_PROMPT_TOKENS \+ Math\.ceil\(body\.length \/ 4\);/.test(SRC)
    && /const body = JSON\.stringify\(payload, null, 2\) \|\| '';/.test(SRC));
  check('CONTRACT', 'index.ts imports nothing from _shared (deploy surface is index.ts alone)',
    ![...SRC.matchAll(/^import[^\n]*from\s*['"]([^'"]+)['"]/gm)].some((m) => /_shared/.test(m[1])));
}

// ---------------------------------------------------------------- report
console.log('\nv65_regression_additions: ' + pass + ' passed, '
  + (contractFails.length + defectFails.length) + ' failed'
  + '  (CONTRACT failures: ' + contractFails.length + ', DEFECT failures: ' + defectFails.length + ')');
if (contractFails.length) { console.log('\nCONTRACT FAILURES (a rule that must always hold):'); for (const f of contractFails) console.log('  - ' + f); }
if (defectFails.length) { console.log('\nDEFECT FAILURES (verifier #65 findings — these must pass after the fix):'); for (const f of defectFails) console.log('  - ' + f); }
if (contractFails.length + defectFails.length > 0) process.exit(1);
