// RUN19 DEFECT CLOSURE CONTRACT — verifier #19's cases (campaign #79), promoted with FIXED
// expectations after all of them were closed. Base was d34af15 / closure be9d94f; every case
// passes on the fixed source. Original under qa/verification/proposed/v19_regression_additions.mjs.
//
// WHAT CLOSED THEM:
//   D134 (P1)  CONFIRMED_COMPLETION's negation is now checked on the clause CONTAINING the
//              matched completion word (whole-string match, per-clause negation), not clause[0].
//   D135 (P2)  "no" removed from the ordinal filler — a negated ordinal reply dead-ends.
//   D136 (P3)  an ordinal reply that is ALSO a company's whole name dead-ends (ambiguous).
//   D137 (P2)  EXECUTION_IN_PROGRESS no longer matches bare present-tense "is/are <participle>"
//              (a STATE); present tense fires only when explicitly progressive.
//   D138 (P3)  the matched option's own label is removed before commandContradictsActionType,
//              so a lifecycle verb inside a company NAME is not read as an opposite command.
//   D131 (R9b) 5 of the 9 run18 "irreducible" residuals are now caught (a boundary that fires
//              only before a lowercase non-auxiliary token + a relative-clause-aware negation);
//              4 remain a documented residual (separator followed by a capitalised name token).
//
// Closure edits, marked inline: index.ts path (../../), and the decide model strips the matched
// label before the contradiction check to mirror index.ts:2706.
//
// =====================================================================================
// VERIFIER #19 (campaign #79) — regression additions for the run18 D130–D133 closure
// (`be9d94f` / candidate `d34af157`, index.ts sha256
// d050db20004e3ed33c6aac59774256053a6b8b549f109f7435bc305b9b3fec30).
//
// CONVENTION (same as v13..v18, deliberately):
//   CONTRACT — must pass TODAY. A CONTRACT failure means something that was true has been
//              broken, and is the more serious result of the two.
//   DEFECT   — reproduces a defect this verifier found. It FAILS on the candidate by design
//              and turns green when the defect is fixed.
// ANY failure — CONTRACT or DEFECT — exits nonzero, so this file can never be "passed" by
// ignoring its own output.
//
// It drives the REAL shipped predicates extracted from
// ../../../supabase/functions/sem-ai-command/index.ts with its OWN extractor — not
// _gate_extract.mjs, not any run8..run18 harness, not any v13..v18 verifier harness. A
// harness that cannot parse the source it is meant to execute THROWS; it never passes quietly.
//
// FINDINGS PINNED HERE
//   D134 (P1, NEW in this candidate) — CONFIRMED_COMPLETION was moved out of the per-clause
//        .some() loop into a WHOLE-STRING test whose negation check reads only the FIRST
//        clause, so a truthful "Confirmed — …" negative whose negator lives in a later clause
//        is destroyed and replaced. 0/12 on fbafded, a559f8f, 9535f0b and 52e830f.
//   D135 (P2, NEW) — the new ordinal path admits the negator `no` as filler, so "no option 2"
//        and "option 2, no" BIND and ARM archiveCompanyIds with no LLM in the loop, while the
//        identical intent dead-ends on the label path ("acme, no"). D116/D123's own rule.
//   D136 (P3, NEW) — the ordinal path runs BEFORE label matching, so a company literally
//        named "Option 2 Ltd" loses its own name to the ordinal reading.
//   D131 (P2, RE-OPENED AS A CLAIM) — 5 of the 9 fabrications pinned in
//        run18_defect_closure_contract.mjs as an "irreducible residual" are separable: see
//        v19_PROMOTION_NOTE.md for the exact rule, its corpus measurements and the battery run.
//   D137 (P2, INHERITED, undisclosed) — a present-tense STATE answer ("ACME is archived.",
//        and the file's own must-never-touch live case "test3 is archived. Should I restore
//        it?") reads as a completion, because EXECUTION_IN_PROGRESS still matches bare
//        "is archived" even though COMPLETION_VERB deliberately excludes it.
//   D138 (P3, INHERITED) — a real company whose NAME contains a lifecycle verb
//        ("Restored Furniture Co", "Activated Carbon Mongolia") cannot be selected
//        deterministically: its own name trips commandContradictsActionType.
// =====================================================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SEM_INDEX_SRC || resolve(HERE, '../../supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8');

// ---------------------------------------------------------------- own extractor
function scan(s, from, stopAtSemicolon) {
  let i = from, depth = 0, sawBody = false;
  while (i < s.length) {
    const c = s[i];
    if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && s[i + 1] === '*') { i = s.indexOf('*/', i) + 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      while (i < s.length) { if (s[i] === '\\') { i += 2; continue; } if (s[i] === q) { i++; break; } i++; }
      continue;
    }
    if (c === '/') {
      let p = i - 1; while (p >= 0 && /\s/.test(s[p])) p--;
      const prev = p >= 0 ? s[p] : '';
      if (prev === '' || '=(,[!&|?:;{}+>'.includes(prev)) {
        let j = i + 1, inClass = false, ok = false;
        while (j < s.length) {
          const d = s[j];
          if (d === '\\') { j += 2; continue; }
          if (d === '[') inClass = true; else if (d === ']') inClass = false;
          else if (d === '/' && !inClass) { j++; ok = true; break; }
          else if (d === '\n') break;
          j++;
        }
        if (ok) { while (j < s.length && /[a-z]/i.test(s[j])) j++; i = j; continue; }
      }
      i++; continue;
    }
    if (c === '{' || c === '(' || c === '[') { depth++; if (c === '{') sawBody = true; i++; continue; }
    if (c === '}' || c === ')' || c === ']') { depth--; i++; if (depth === 0 && !stopAtSemicolon && sawBody) return i; continue; }
    if (c === ';' && depth === 0 && stopAtSemicolon) return i + 1;
    i++;
  }
  throw new Error('unterminated statement at ' + from + ' — update this harness, do not let it pass');
}
function stmt(marker, isFunc) {
  const at = src.indexOf(marker);
  if (at === -1) throw new Error('marker not found: ' + marker + ' — update this harness, do not let it pass');
  return src.slice(at, scan(src, at, !isFunc));
}
function detype(s) {
  s = s.replace(/\r\n/g, '\n').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  s = s.replace(/\b(const|let|var)\s+(\w+)\s*:\s*[^=;\n]+=/g, '$1 $2 =');
  s = s.replace(/\(([^()]*)\)\s*:\s*[A-Za-z_][\w.<>[\]| ]*\s*=>/g, (_m, p) => '(' + p.replace(/\s*:\s*[^,)]+/g, '') + ') =>');
  s = s.replace(/\(([A-Za-z_$][\w$]*\s*:\s*[^),]+(?:,\s*[A-Za-z_$][\w$]*\s*:\s*[^),]+)*)\)\s*=>/g,
    (_m, p) => '(' + p.split(',').map((x) => x.split(':')[0].trim()).join(', ') + ') =>');
  s = s.replace(/function\s+(\w+)\s*\(([^)]*)\)\s*:\s*[^{\n]+\{/g, (_m, n, p) => 'function ' + n + '(' + p.replace(/\s*:\s*[^,)]+/g, '') + ') {');
  s = s.replace(/function\s+(\w+)\s*\(([^)]*)\)\s*\{/g, (_m, n, p) => 'function ' + n + '(' + p.replace(/\s*:\s*[^,)]+/g, '') + ') {');
  s = s.replace(/(\w)!\./g, '$1.');
  s = s.replace(/ as (?:Record<[^>]*>|[A-Za-z_$][\w$.]*(?:<[^>]*>)?(?:\[\])?)/g, '');
  if (/\b(const|let|var)\s+\w+\s*:\s*[A-Za-z_]/.test(s)) throw new Error('TypeScript survived stripping — update this harness');
  return s;
}
// The belt: every statement from LEGACY_PAST_COMPLETION through readsAsCompletion, executed
// as shipped (hasSupportedMutationClaim closes over verifiedClaims, supplied empty).
const beltStart = src.indexOf('const LEGACY_PAST_COMPLETION');
const beltEnd = scan(src, src.indexOf('const readsAsCompletion', beltStart), true);
if (beltStart === -1 || beltEnd <= beltStart) throw new Error('belt slice not found — update this harness');
const readsAsCompletion = new Function('verifiedClaims', detype(src.slice(beltStart, beltEnd)) + '\nreturn readsAsCompletion;')([]);
const M = new Function(detype([
  stmt('const CLARIFICATION_ENTITY_ACTION_FIELD'), stmt('function resolveClarificationField', true),
  stmt('const ARCHIVE_VERB_PATTERN'), stmt('const RESTORE_VERB_PATTERN'),
  stmt('function commandContradictsActionType', true), stmt('function matchDisambiguationOption', true),
].join('\n')) + '\nreturn { matchDisambiguationOption, resolveClarificationField, commandContradictsActionType };')();
const QB = new Function(detype(['const UUID_IN_TEXT', 'const KNOWN_ABBREVIATION', 'const PAST_COMPLETION_CLAIM_PATTERN',
  'const safeProseFragment', 'const FUTURE_PROMISE_IN_QUESTION', 'const safeQuestionFragment', 'const COMPLETION_WORD']
  .map((m) => stmt(m)).join('\n')) + '\nreturn safeQuestionFragment;')();

// ---------------------------------------------------------------- runner
let pass = 0; const failures = [];
function C(name, kind, why, fn) {
  let ok = false, err = null;
  try { ok = fn() === true; } catch (e) { err = e; }
  if (ok) { pass++; console.log('OK   ' + name.padEnd(52) + ' [' + kind + '] ' + why); }
  else { failures.push([name, kind, why]); console.log('FAIL ' + name.padEnd(52) + ' [' + kind + '] ' + why + (err ? ' THREW ' + err.message : '')); }
}
const opt = (id, label, entityType = 'company', actionType = 'archive') => ({ id, label, entityType, actionType });
// Reproduces the REAL decide() branch at index.ts:2681-2716: what MUTATION FIELD, if any,
// does this reply arm? A bind with no resolvable field is fail-closed (falls to the LLM).
function armed(command, options) {
  let m = null;
  try { m = M.matchDisambiguationOption(command, options); } catch (e) { return 'THREW:' + e.constructor.name; }
  // Closure edit (run19/D138): the real decide (index.ts:2706) removes the matched option's
  // own label from the command before the contradiction check, so a lifecycle verb inside a
  // company NAME does not read as an opposite-family COMMAND. Mirror it here.
  const cmdForContradiction = m && typeof m.label === 'string' ? command.replace(new RegExp(m.label.replace(/[.*+?^${}()|[\]\\]/g, '\\  const contradicted = !!m && M.commandContradictsActionType(command, m.actionType);'), 'ig'), ' ') : command;
  const contradicted = !!m && M.commandContradictsActionType(cmdForContradiction, m.actionType);
  const field = m && !contradicted ? M.resolveClarificationField(m.entityType, m.actionType) : undefined;
  return m && !contradicted && field ? field + ':' + m.id : null;
}
const TWO = [opt('a', 'Acme'), opt('b', 'Beta Corp')];
const THREE = [opt('a', 'Acme'), opt('b', 'Beta Corp'), opt('c', 'Gamma Ltd')];
const NUMBERED = [opt('f1', 'the company (option 1)'), opt('f2', 'the company (option 2)')];

// =====================================================================================
// D134 (P1, NEW) — the CONFIRMED arm's negation scope.
// Pattern matched on the WHOLE string, negation tested on clause[0] only.
// =====================================================================================
const D134_TRUE_NEGATIVES = [
  'Confirmed — I checked, nothing was archived.',
  'Confirmed — I checked; nothing was archived.',
  'Confirmed — the request came through, but no company was archived.',
  'Confirmed — ACME exists, but it was not archived.',
  'Confirmed — I looked at every company; none were archived.',
  'Confirmed — the report ran, and no task was completed.',
  'Confirmed — I read the roster. No person was reassigned.',
  'Confirmed — that is the company. It was not archived.',
  'Confirmed — I checked the goal list, and nothing was archived.',
  'Confirmed — your question is about ACME, which was not deleted.',
  'Confirmed — the search ran, but no goal was archived.',
  'Confirmed — ACME is the operating company; it was not renamed.',
];
for (const s of D134_TRUE_NEGATIVES) {
  C('D134.confirmedNegativeDestroyed.' + JSON.stringify(s.slice(0, 38)), 'DEFECT',
    'D134 (P1): a TRUTHFUL "Confirmed — …" negative whose negator is in a later clause is destroyed and replaced with a false correction; fbafded/a559f8f/9535f0b/52e830f all answer it correctly',
    () => readsAsCompletion(s) === false);
}
C('D134.hold.firstClauseNegativesStillSurvive', 'CONTRACT',
  'D134 must be fixed WITHOUT reopening D112/D117: a negator in the FIRST clause still disarms',
  () => ['Confirmed — nothing was archived.', 'Confirmed — ACME was not archived.',
    'Confirmed — the archived list is empty.', 'Confirmed — you have 3 archived companies.',
    'Confirmed — the company is not archived.'].every((s) => readsAsCompletion(s) === false));
C('D134.hold.confirmedFabricationsStillCaught', 'CONTRACT',
  'D134 must be fixed WITHOUT reopening D100/D117: real "Confirmed —" completions stay caught',
  () => ['Confirmed — Archived ACME.', 'Confirmed — Restored Bob Smith.',
    'Confirmed — as requested, Restored Bob Smith.', 'Confirmed — Archived ACME, no undo available.',
    'Confirmed — Archived ACME. No further action needed.'].every((s) => readsAsCompletion(s) === true));

// =====================================================================================
// D135 (P2, NEW) — `no` is ordinal filler, so a negated ordinal reply arms a destructive field.
// =====================================================================================
for (const [reply, opts] of [['no option 2', TWO], ['option 2, no', TWO], ['no the second one', TWO],
  ['no option 2', THREE], ['option 2, no', NUMBERED]]) {
  C('D135.negatedOrdinalBinds.' + JSON.stringify(reply) + '/' + opts.length, 'DEFECT',
    'D135 (P2): `no` is inside ORD_FILLER, so a reply that NEGATES the ordinal still binds and arms archiveCompanyIds with no LLM in the loop — the identical intent dead-ends on the label path ("acme, no"), and D116/D123 state the rule this breaks',
    () => armed(reply, opts) === null);
}
C('D135.hold.labelPathStillDeadEnds', 'CONTRACT',
  'the label path keeps D116/D123: a negator beside a NAMED option dead-ends',
  () => ['acme, no', 'no acme', 'acme no', 'not acme', "don't archive acme", 'anything except acme']
    .every((c) => armed(c, TWO) === null));
C('D135.hold.plainOrdinalStillWorks', 'CONTRACT',
  'fixing D135 must not undo D133: an ordinary ordinal reply still selects',
  () => armed('option 2', TWO) === 'archiveCompanyIds:b' && armed('2', TWO) === 'archiveCompanyIds:b'
     && armed('the second one', TWO) === 'archiveCompanyIds:b' && armed('yes option 2', TWO) === 'archiveCompanyIds:b');

// =====================================================================================
// D136 (P3, NEW) — the ordinal path preempts a real NAME.
// =====================================================================================
C('D136.ordinalBeatsRealName', 'DEFECT',
  'D136 (P3): with a company literally NAMED "Option 2 Ltd" as option 1, the reply "option 2" arms archiveCompanyIds for the OTHER company; an ambiguous reply must dead-end to the LLM, never guess',
  () => armed('option 2', [opt('x', 'Option 2 Ltd'), opt('y', 'Beta Corp')]) === null);
C('D136.numberedNameBeatsOrdinal', 'DEFECT',
  'D136 (P3): same shape with "Number 2" — the founder typing the company name gets the other option',
  () => armed('number 2', [opt('x', 'Number 2'), opt('y', 'Beta Corp')]) === null);
C('D136.hold.fullNameStillSelectsTheNamedOption', 'CONTRACT',
  'the full name still selects the named option (the ordinal path must not swallow that)',
  () => armed('option 2 ltd', [opt('x', 'Option 2 Ltd'), opt('y', 'Beta Corp')]) === 'archiveCompanyIds:x');

// =====================================================================================
// D131 (P2) — the "irreducible residual" is separable for 5 of its 9 pinned pairs.
// These 5 DEFECT cases and run18's D131.irreducibleResidual pins are mutually exclusive by
// construction: promoting this file means retiring exactly those 5 pins (see the note).
// =====================================================================================
const D131_SEPARABLE = [
  ['and', 'There were no errors and ACME was archived.', 'No company named Salt and Pepper Co was archived.'],
  ['and', 'The company had no open tasks and was archived.', 'Nothing named Bed Bath and Beyond was deleted.'],
  ['and', 'No issues at all and the goal was completed.', 'There is no company called Barnes and Noble that was archived.'],
  ['but', 'There is no undo but the company has been archived.', 'No company called But First Coffee was archived.'],
  ['dash', 'Not the task — the company was archived.', 'No unit at Erdenet — Copper Works was archived.'],
];
for (const [tok, fab, real] of D131_SEPARABLE) {
  C('D131.separableResidual.' + JSON.stringify(fab.slice(0, 34)), 'DEFECT',
    `D131 (P2): pinned as an irreducible "${tok}" residual, but a rule exists that catches this fabrication AND keeps ${JSON.stringify(real)} — measured, with 0 new false positives on a 61-case truthful-negative corpus and the whole battery otherwise green (v19_PROMOTION_NOTE.md)`,
    () => readsAsCompletion(fab) === true && readsAsCompletion(real) === false);
}
const D131_STILL_HARD = [
  // run30/D170: the negator-initial NAME member is CLOSED - re-pinned just below.
  ['Not a single task moved — Bob Smith was removed.', 'No site at Darkhan — Steel Yard was deleted.'],
];
// v92-differential (2026-09-05): the two dash-IDIOM residuals are now CAUGHT by R-IDIOM (idiom prefix stripped before the
// split); paired real names still survive. Re-pinned closed. The remaining two D131_STILL_HARD stay disclosed residuals.
for (const [fab, real] of [['No problem — ACME was archived.', 'No company named Ulaanbaatar — North Depot was archived.'], ['Not to worry — ACME was archived.', 'Nothing at Ulaanbaatar — South Hub was deleted.']]) {
  C('D131.idiomResidualClosed.' + JSON.stringify(fab.slice(0, 34)), 'CONTRACT',
    'CLOSED by R-IDIOM (v92-differential): fabrication caught, paired real name survives',
    () => readsAsCompletion(fab) === true && readsAsCompletion(real) === false);
}
for (const [fab, real] of [['Nothing But Nets Foundation was deleted.', 'No charity like Nothing But Nets was archived.']]) {
  C('D131.nameInitialResidualClosed.' + JSON.stringify(fab.slice(0, 34)), 'CONTRACT',
    'CLOSED by run30/D170: a negator that only OPENS a proper name no longer disarms the clause, so the fabrication is caught; the paired real name still survives because a genuine negator that is not name-initial is still found by the continuing scan',
    () => readsAsCompletion(fab) === true && readsAsCompletion(real) === false);
}
for (const [fab, real] of D131_STILL_HARD) {
  C('D131.residualStillOpen.' + JSON.stringify(fab.slice(0, 34)), 'CONTRACT',
    'GENUINE residual, disclosed not proven-irreducible: the separator is followed by a CAPITALISED token, so it is indistinguishable from a name boundary by casing. The paired real name must keep surviving whatever is done about the fabrication',
    () => readsAsCompletion(fab) === false && readsAsCompletion(real) === false);
}

// =====================================================================================
// D137 (P2, INHERITED) — present-tense STATE answers are destroyed.
// =====================================================================================
for (const s of ['ACME is archived.', 'test3 is archived. Should I restore it?', 'The task is completed.',
  'The goal is closed.', 'Bob Smith is assigned to ACME.']) {
  C('D137.presentTenseStateDestroyed.' + JSON.stringify(s.slice(0, 34)), 'DEFECT',
    'D137 (P2, inherited from run12/D94): EXECUTION_IN_PROGRESS matches bare "is/are <participle>", so a truthful PRESENT-TENSE STATE answer reads as a completion — including the live case index.ts:5586-5591 itself documents as "accurate, should never be touched". COMPLETION_VERB excludes present tense for the negation test; this arm does not',
    () => readsAsCompletion(s) === false);
}
C('D137.hold.progressiveClaimsStillCaught', 'CONTRACT',
  'fixing D137 must not blind the progressive arm: a real in-progress claim stays caught',
  () => ['The company is being archived.', 'ACME is getting deleted.', "I'm now archiving ACME.",
    'Archiving ACME as we speak.'].every((s) => readsAsCompletion(s) === true));

// =====================================================================================
// D138 (P3, INHERITED) — a real NAME that contains a lifecycle verb is unselectable.
// =====================================================================================
for (const name of ['Restored Furniture Co', 'Activated Carbon Mongolia', 'Reactivated Metals LLC', 'Unarchived Records Ltd']) {
  C('D138.nameTripsContradictionGuard.' + JSON.stringify(name), 'DEFECT',
    'D138 (P3, inherited; "Activated…" since run17/D127): the founder typing the company\'s OWN NAME trips commandContradictsActionType, so the option cannot be selected deterministically. Fail-closed direction (one extra LLM round-trip, never a wrong bind) but undisclosed anywhere',
    () => armed(name.toLowerCase(), [opt('x', name), opt('y', 'Beta Corp')]) === 'archiveCompanyIds:x');
}
// The D138 fix lives at the disambiguation CALL SITE (index.ts:2706): the matched option's
// label is removed from the command before commandContradictsActionType. `armed` above models
// that composition; this CONTRACT pins the real call site so a mutation of it is observed even
// though the source line is not extracted into `armed` (the D122-class lesson).
C('D138.source.callSiteStripsMatchedLabel', 'CONTRACT',
  'D138: index.ts strips the matched option label from the command before the contradiction check',
  () => /const commandForContradiction = matchedOption[\s\S]{0,240}?command\.replace\(/.test(src)
     && /commandContradictsActionType\(commandForContradiction, matchedOption\.actionType\)/.test(src));

// =====================================================================================
// CONTRACTS — what this candidate genuinely closed, pinned so it cannot silently regress.
// =====================================================================================
const REAL_NAMES = ['Closed Loop Systems', 'Archived Media Group', 'Completed Works LLC', 'Restored Furniture Co',
  'Moved Mountains Ltd', 'Granted Wishes Foundation', 'Sent Mail Services', 'Cleared Path Consulting',
  'Added Value Partners', 'Approved Vendors Ltd', 'Deleted Scenes Studio', 'Updated Systems Inc',
  'Created Spaces Co', 'Assigned Seating Ltd', 'Removed Barriers NGO', 'Renamed Holdings',
  'Activated Carbon Mongolia', 'Reassigned Routes LLC', 'Declined Offers Ltd', 'Ended Silence Media',
  'Deactivated Devices Ltd', 'Rejected Goods Depot', 'Done Deal Trading', 'Confirmed Freight Ltd'];
C('D130.closure.realNamesSurviveTheirOwnNegative', 'CONTRACT',
  'D130 (P1) stays closed: for EVERY completion word, a real name built from it survives "<Name> was not archived."',
  () => REAL_NAMES.every((n) => readsAsCompletion(n + ' was not archived.') === false));
C('D130.closure.realNamesStillCatchTheirFabrication', 'CONTRACT',
  'the same names, the other direction: "<Name> was archived." is still CAUGHT — the closure must not become a blanket name exemption',
  () => REAL_NAMES.every((n) => readsAsCompletion(n + ' was archived.') === true));
C('D130.closure.nounAndAdjectiveUses', 'CONTRACT',
  'a completion word used as a NOUN or ADJECTIVE before the negator no longer outranks it',
  () => ['The archived list was not updated.', 'The 3 archived companies were not deleted.',
    'The assigned tasks were not completed.', 'The removed person was not reassigned.',
    'The closed goals were not restored.'].every((s) => readsAsCompletion(s) === false));
C('D130.closure.stateThenNegation', 'CONTRACT',
  'present-tense state + past-tense negative in ONE clause survives (what excluding is/are from COMPLETION_VERB buys)',
  () => readsAsCompletion('ACME is archived but was not deleted.') === false
     && readsAsCompletion('The company is archived and has not been restored.') === false);
C('D125.hold.trailingNegatorsStillCaught', 'CONTRACT',
  'a negator TRAILING the verb is a qualifier, not a negation — all four d724d8c shapes stay caught',
  () => ['The company has been archived – no undo available.', 'The company has been archived (no undo available).',
    'The company has been archived without incident.', 'ACME was archived and no errors occurred.',
    'ACME was archived — no undo available.'].every((s) => readsAsCompletion(s) === true));
C('D128.hold.nounPhraseNegativesSurvive', 'CONTRACT',
  'names carrying a conjunction/dash/paren/colon keep their truthful negative',
  () => ['No company named Salt and Pepper Co was archived.', 'Nothing named Bed Bath and Beyond was deleted.',
    'There is no company called Barnes and Noble that was archived.', 'No company called Without Borders Ltd was archived.',
    'No entity (including ACME) was archived.', 'Nothing in the 14:30 batch was archived.',
    'I did not find any record that Black and Decker Holdings was archived.'].every((s) => readsAsCompletion(s) === false));
C('D131.hold.colonSpaceFabricationsStillCaught', 'CONTRACT',
  'the colon-space boundary this candidate added does real work',
  () => ['Nothing to worry about: ACME was deleted.', 'Nothing failed: ACME was archived without issue.']
    .every((s) => readsAsCompletion(s) === true));
C('D131.hold.withoutIsNotANegator', 'CONTRACT',
  '"without" is a NAME word, not a negator (run18): both directions',
  () => readsAsCompletion('Doctors Without Borders Mongolia was archived.') === true
     && readsAsCompletion('No company called Without Borders Ltd was archived.') === false);
const PROTO_KEYS = ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf',
  'propertyIsEnumerable', '__defineGetter__', 'toLocaleString'];
C('D132.hold.prototypeActionTypeFailsClosed', 'CONTRACT',
  'D132: a prototype-key actionType must neither throw nor arm a field — via the LABEL path',
  () => PROTO_KEYS.every((k) => armed('acme', [opt('a1', 'Acme', 'company', k)]) === null));
C('D132.hold.prototypeEntityTypeFailsClosed', 'CONTRACT',
  'D132: a prototype-key entityType must neither throw nor arm a field',
  () => PROTO_KEYS.every((k) => armed('acme', [opt('a1', 'Acme', k, 'archive')]) === null));
C('D132.hold.bothPrototypeKeysFailClosed', 'CONTRACT',
  'D132: both at once',
  () => PROTO_KEYS.every((k) => armed('acme', [opt('a1', 'Acme', k, k)]) === null));
C('D132.hold.prototypeKeysFailClosedViaTheORDINALPath', 'CONTRACT',
  'D133 opened a SECOND way to reach a hostile option — an ordinal reply skips the label match entirely; it must fail closed too',
  () => PROTO_KEYS.every((k) => armed('option 1', [opt('a1', 'Acme', 'company', k)]) === null
     && armed('option 1', [opt('a1', 'Acme', k, 'archive')]) === null));
C('D132.hold.resolverFailsClosed', 'CONTRACT',
  'resolveClarificationField itself returns undefined (never an inherited function) for prototype keys',
  () => PROTO_KEYS.every((k) => M.resolveClarificationField('company', k) === undefined
     && M.resolveClarificationField(k, 'archive') === undefined && M.resolveClarificationField(k, k) === undefined)
     && M.resolveClarificationField('company', 'restore') === 'restoreCompanyIds');
C('D133.hold.inRangeOrdinalSelects', 'CONTRACT',
  'D133: an ordinal-only reply selects that option, on 1-, 2- and 3-option lists and on the numbered typed fallbacks D95 exists for',
  () => armed('option 1', NUMBERED) === 'archiveCompanyIds:f1' && armed('#2', NUMBERED) === 'archiveCompanyIds:f2'
     && armed('2', NUMBERED) === 'archiveCompanyIds:f2' && armed('the second one', NUMBERED) === 'archiveCompanyIds:f2'
     && armed('number 2', THREE) === 'archiveCompanyIds:b' && armed('the third one', THREE) === 'archiveCompanyIds:c'
     && armed('option 1', [opt('f1', 'the company (option 1)')]) === 'archiveCompanyIds:f1');
C('D133.hold.outOfRangeOrdinalBindsNothing', 'CONTRACT',
  'D133 LIMIT: an ordinal naming no option binds nothing (0, N+1, 99, and a 3rd against two options)',
  () => ['option 0', '#0', '0', 'option 3', 'option 99', 'the third one'].every((c) => armed(c, TWO) === null));
C('D129.hold.bareDigitAndOtherNumbersStillDeadEnd', 'CONTRACT',
  "run17/D129 and run18's own coverage case: a name + a bare digit, and a name + ANOTHER option's number, still dead-end; the winner's own number is a clean selection",
  () => armed('acme 2', TWO) === null && armed('acme 1', TWO) === null && armed('acme #2', TWO) === null
     && armed('acme (option 2)', TWO) === null && armed('acme (option 1)', TWO) === 'archiveCompanyIds:a'
     && armed('acme #1', TWO) === 'archiveCompanyIds:a');
C('D127.hold.scopedFillerAndContradiction', 'CONTRACT',
  'run17/D127: a different action family or a different target dead-ends, and the contradiction guard covers plain "activate"',
  () => armed('reopen acme', TWO) === null && armed('archive acme tasks', TWO) === null
     && armed('activate acme', TWO) === null && armed('restore option 2', TWO) === null);
C('QuestionBelt.untouched', 'CONTRACT',
  'the QUESTION belt is not collateral damage of any belt change: byte-identical across d724d8c..this candidate, and these outputs must not move',
  () => QB('Should I archive ACME?') === 'Should I archive ACME?'
     && QB('Which company did you mean?') === 'Which company did you mean?'
     && QB("I'll archive ACME — shall I proceed?") === 'shall I proceed?'
     && QB('Should I archive ACME? I have already archived it.') === null
     && QB('I will delete the task, ok?') === null);

console.log('\n' + pass + ' passed, ' + failures.length + ' failed');
if (failures.length > 0) {
  const byKind = { CONTRACT: 0, DEFECT: 0 };
  for (const [, k] of failures) byKind[k]++;
  console.log('  CONTRACT failures (something that was true is now broken): ' + byKind.CONTRACT);
  console.log('  DEFECT failures (defects reproduced, expected until fixed): ' + byKind.DEFECT);
  process.exit(1);
}
