// V18 REGRESSION ADDITIONS — verifier #18, campaign #78.
// Base fbafded912e0fef7ddc7d5119308df8ab8be72e9 (closure commit a559f8f; the rotation
// commit on top is bookkeeping only — index.ts byte-identical, verified by diff).
// index.ts sha256 cf4b6f4defe9b5ed72cee29b08c4e2731651fac0d080f3ba30e1ed601e056deb,
// asserted before the run, after every one of 14 temporary source mutations, and at the end.
// Baselines for every comparison: 9535f0b (the #77 candidate, the SHA this closure fixes),
// 52e830f (the #76 candidate) and d724d8c.
//
// Same two-kind convention as run8/run10..run17, and the SAME exit guard: ANY failure
// exits nonzero. No kind-based carve-out.
//
//   CONTRACT — a property that HOLDS on fbafded but that NO committed suite observes.
//              Each corresponds to a SURVIVING mutant in my own 14-mutant battery
//              (qa/verification/scratch/v18/s2_mutation.mjs), or to a property I could
//              only find by driving the real matcher / real belt.
//   DEFECT   — a real escape or a real truth-destruction demonstrated on fbafded.
//              Expected = the FIXED behaviour, so these FAIL on fbafded BY DESIGN and the
//              suite exits 1 until they are closed. That is this file working as intended.
//
// WHAT THIS CAMPAIGN FOUND
//   * D130 (P1) — the ORDER rule that closed D128 decides negation by comparing the index
//     of the first negator with the index of the first COMPLETION_VOCAB hit, and
//     COMPLETION_VOCAB has NO part-of-speech guard. So a completion word used as a NOUN or
//     an ADJECTIVE, or sitting inside the entity's own NAME, outranks the negator and the
//     clause is treated as an assertion: "The archived list was not updated.", "The
//     assigned tasks were not completed.", "Closed Loop Systems was not archived." are all
//     destroyed and replaced with "I can't actually do that from chat — nothing was
//     changed", which is itself false. 24 of 26 real company names containing a completion
//     word, in the frame "<Name> was not archived.", are destroyed — 0 of 26 on BOTH
//     9535f0b and 52e830f. This is the D112 class (ledger #4905) for the SEVENTH
//     consecutive change to this belt, in the direction index.ts itself calls the worse one.
//   * D131 (P2) — the disclosed residual understates the hole. It is described as "a real
//     name that itself BEGINS with a negator word"; the rule is positional to the CLAUSE,
//     not to the name, so ANY negator anywhere before the first completion verb disarms —
//     including one in ordinary prose with no exotic name at all ("There were no errors and
//     ACME was archived.", "No problem — ACME was archived."). 9535f0b caught 11 of 20 such
//     fabrications; the candidate catches 1 of 20.
//   * D132 (P2) — ACTION_FAMILY_VERBS and ENTITY_NOUNS are bare object literals indexed by
//     a MODEL-AUTHORED string, so an option carrying actionType/entityType "constructor",
//     "__proto__", "toString" or "hasOwnProperty" makes matchDisambiguationOption THROW a
//     TypeError. All three prior SHAs fail closed on the same input. The option gate
//     validates entityType and id but never actionType, so such an option persists.
//   * D133 (P3) — D129's fix does not close the D95 seam it names. With the labels the
//     product actually renders when two fallbacks collide ("the company (option 1)" /
//     "the company (option 2)"), the replies "option 1", "1", "#1", "the first one" all
//     still dead-end; only a verbatim copy of the whole label binds. The winner's-own-number
//     rule only helps a reply that ALSO carries the entity NAME — which by construction does
//     not exist in the collision case D95 numbering was invented for.
//   * COVERAGE — three mutants survived my whole 28-suite battery: the newline the candidate
//     ADDED to the clause splitter; the ACTION_FAMILY_VERBS scoping that IS the headline half
//     of D127 (unioning it back makes "reopen acme" arm archiveCompanyIds against a pending
//     ARCHIVE and no committed suite notices); and the winner's OWN bare digit (run17's
//     D129 LIMIT pins "acme 2" against option 1, a digit that is never the winner's own, so
//     it cannot observe the limit it claims to). All three pinned below.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SEM_INDEX_SRC
  || resolve(HERE, '..', '..', 'supabase', 'functions', 'sem-ai-command', 'index.ts');
const src = readFileSync(SRC, 'utf8');

// ---- extraction (independent of _gate_extract.mjs and of the run8..run17 harnesses) ----
function statementAt(text, anchor) {
  const i = text.indexOf(anchor);
  if (i < 0) throw new Error('ANCHOR NOT FOUND: ' + anchor);
  let depth = 0;
  for (let j = i; j < text.length; j++) {
    const c = text[j], n = text[j + 1];
    if (c === '/' && n === '/') { while (j < text.length && text[j] !== '\n') j++; continue; }
    if (c === '/' && n === '*') { j = text.indexOf('*/', j) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; j++;
      while (j < text.length) { if (text[j] === '\\') { j += 2; continue; } if (text[j] === q) break; j++; }
      continue;
    }
    if (c === '/') {
      let k = j - 1; while (k >= 0 && /\s/.test(text[k])) k--;
      const prev = k >= 0 ? text[k] : '';
      if (prev === '' || '=(,:!&|?{};[+-*%<>~^'.includes(prev)) {
        j++;
        let inClass = false;
        while (j < text.length) {
          if (text[j] === '\\') { j += 2; continue; }
          if (text[j] === '[') inClass = true;
          else if (text[j] === ']') inClass = false;
          else if (text[j] === '/' && !inClass) break;
          else if (text[j] === '\n') break;
          j++;
        }
        continue;
      }
    }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ';' && depth === 0) return text.slice(i, j + 1);
  }
  throw new Error('NO STATEMENT TERMINATOR: ' + anchor);
}
function balancedFn(text, anchor) {
  const i = text.indexOf(anchor);
  if (i < 0) throw new Error('ANCHOR NOT FOUND: ' + anchor);
  let d = 0;
  for (let j = text.indexOf('{', i); j < text.length; j++) {
    if (text[j] === '{') d++;
    else if (text[j] === '}') { d--; if (!d) return text.slice(i, j + 1); }
  }
  throw new Error('UNBALANCED: ' + anchor);
}
const stripTS = (s) => s
  .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
  .replace(/\b(const|let|var)\s+(\w+)\s*:\s*[^=;\n]+=/g, '$1 $2 =')
  .replace(/function\s+(\w+)\s*\(([^)]*)\)\s*:\s*[^{\n]+\{/g, (_m, n, p) => 'function ' + n + '(' + p.replace(/:\s*[^,)]+/g, '') + ') {')
  .replace(/=\s*\(([^)]*)\)\s*:\s*[^=]+=>/g, (_m, p) => '= (' + p.replace(/:\s*[^,)]+/g, '') + ') =>')
  .replace(/\(([A-Za-z_$][\w$]*)\s*:\s*[A-Za-z_$][\w$<>\[\]| ]*\)\s*=>/g, '($1) =>')
  .replace(/(\w)!\./g, '$1.');

// Refuse to report on a slice that is not the product.
for (const lit of ['const SELECTION_FILLER =', 'const cleanSelection =', 'const ACTION_FAMILY_VERBS',
  'const ENTITY_NOUNS', 'const readsAsCompletion =', 'const COMPLETION_VERB =', 'const completionIsNegated =', 'const NEGATED_CLAUSE =',
  'const ordN =']) {
  if (!src.includes(lit)) throw new Error('product literal missing from index.ts: ' + lit);
}

const beltSlice = stripTS([
  statementAt(src, 'const LEGACY_PAST_COMPLETION ='),
  statementAt(src, 'const PROGRESS_VERBS ='),
  statementAt(src, 'const EXECUTION_IN_PROGRESS ='),
  statementAt(src, 'const CONFIRMED_COMPLETION ='),
  statementAt(src, 'const NEGATED_CLAUSE ='),
  statementAt(src, 'const COMPLETION_PARTICIPLE ='),
  statementAt(src, 'const COMPLETION_VERB ='),
  statementAt(src, 'const completionIsNegated ='),
  statementAt(src, 'const REFERENCELESS_CONFIRMATION ='),
  statementAt(src, 'const readsAsCompletion ='),
  'return readsAsCompletion;'].join('\n'));
if (!/const completionIsNegated =[\s\S]*NEGATED_CLAUSE/.test(beltSlice)) {
  throw new Error('negation is no longer decided against NEGATED_CLAUSE — refusing to report');
}
if (!/completionIsNegated\(/.test(beltSlice.split('const readsAsCompletion =')[1] || '')) {
  throw new Error('readsAsCompletion no longer decides negation via completionIsNegated — refusing to report');
}
const readsAsCompletion = new Function(beltSlice)();

const M = new Function(stripTS([
  statementAt(src, 'const CLARIFICATION_ENTITY_ACTION_FIELD'),
  balancedFn(src, 'function resolveClarificationField'),
  statementAt(src, 'const ARCHIVE_VERB_PATTERN ='),
  statementAt(src, 'const RESTORE_VERB_PATTERN ='),
  balancedFn(src, 'function commandContradictsActionType'),
  balancedFn(src, 'function matchDisambiguationOption'),
].join('\n')) + `
  return {
    match: matchDisambiguationOption,
    decide: function (command, options) {
      const m = matchDisambiguationOption(command, options);
      const bad = !!m && commandContradictsActionType(command, m.actionType);
      const f = m && !bad ? resolveClarificationField(m.entityType, m.actionType) : undefined;
      return { bound: m ? m.id : null, armed: (m && !bad && f) ? f : null };
    },
  };`)();

const opt = (id, label, entityType = 'company', actionType = 'archive') => ({ id, label, entityType, actionType });
const bind = (reply, options) => M.decide(reply, options).bound;
const armed = (reply, options) => M.decide(reply, options).armed;
const TWO = [opt('c1', 'Acme'), opt('c2', 'Beta Corp')];
const ARCH = [opt('c1', 'Acme', 'company', 'archive'), opt('c2', 'Beta Corp', 'company', 'archive')];
const REST = [opt('c1', 'Acme', 'company', 'restore'), opt('c2', 'Beta Corp', 'company', 'restore')];
// the labels the product ITSELF renders when two typed fallbacks collide (run12/D95 numbering;
// run17's D129.hold.numberingItselfStillHappens pins that this really is what is rendered).
const NUMBERED = [opt('f1', 'the company (option 1)'), opt('f2', 'the company (option 2)')];

const CASES = [];
const C = (id, kind, desc, thunk) => CASES.push([id, kind, desc, thunk]);

// =====================================================================================
// D130 (P1) — DEFECT. A completion word BEFORE the negator outranks it, so a truthful
// negative is destroyed. 52e830f: 0/25. 9535f0b: 2/25. This candidate: 19/25.
// =====================================================================================
const D130_TRUTHFUL = [
  'The archived list was not updated.',
  'The 3 archived companies were not deleted.',
  'The completed tasks were not moved.',
  'The archived company was not deleted.',
  'The removed person was not reassigned.',
  'The assigned tasks were not completed.',
  'The created draft was not approved.',
  'The restored company was not archived again.',
  'Archived Media Group was not archived.',
  'Closed Loop Systems was not archived.',
  'Completed Works Ltd was not deleted.',
  'Updated Systems LLC was not updated.',
  'Sent Logistics was not archived.',
  'Cleared Path Consulting was not archived.',
  'Moved Freight Co was not deleted.',
  'Created Studio was not archived.',
  'Bob’s completed tasks were not archived.',
];
for (const s of D130_TRUTHFUL) {
  C(`D130.truthfulNegativeDestroyed.${JSON.stringify(s.slice(0, 44))}`, 'DEFECT',
    `D130 (P1): 52e830f AND 9535f0b answer this truthfully and the candidate destroys it — ${JSON.stringify(s)}`,
    () => readsAsCompletion(s) === false);
}
C('D130.rateOnRealNames', 'DEFECT',
  'D130 (P1): "<real name containing a completion word> was not archived." must not be destroyed — 24/26 today, 0/26 on 9535f0b and on 52e830f',
  () => {
    const names = ['Archived Records Ltd', 'Deleted Scenes Studio', 'Updated Systems LLC', 'Created Studio',
      'Restored Timber Works', 'Activated Carbon Co', 'Deactivated Assets Ltd', 'Assigned Seating Inc',
      'Reassigned Freight Co', 'Approved Vendors Group', 'Rejected Goods Ltd', 'Declined Offers LLC',
      'Removed Barriers Foundation', 'Completed Works LLC', 'Renamed Streets Ltd', 'Ended Chapters Publishing',
      'Closed Loop Systems', 'Cleared Skies Aviation', 'Sent Packing Couriers', 'Moved Mountains Co',
      'Granted Wishes Charity', 'Added Value Partners', 'Processing Plant Ltd', 'Executing Partners LLP'];
    return names.every((n) => readsAsCompletion(`${n} was not archived.`) === false);
  });
C('D130.stateThenNegation', 'DEFECT',
  'D130 (P1): a state description followed by a truthful negative in the SAME clause ("ACME is archived but was not deleted.") must survive — 52e830f answers it, the candidate destroys it',
  () => readsAsCompletion('ACME is archived but was not deleted.') === false
     && readsAsCompletion('The company is archived and has not been restored.') === false);

// =====================================================================================
// D131 (P2) — DEFECT. A negator ANYWHERE before the verb disarms, not only one that leads
// a name. Every case below was CAUGHT by 9535f0b, the SHA this closure is fixing.
// =====================================================================================
// Closure edit (run18/D131): the fabrications split into two classes, and the split is a
// PROOF, not a preference. The belt catches a fabrication when its filler negator is set
// off by SENTENCE PUNCTUATION, the comma, or a COLON-SPACE — a boundary that does not occur
// inside entity names. It cannot catch one whose only separator is `and`/`but`/a spaced
// dash, because those tokens are common inside real company names the suite ALSO requires
// to survive (D128.hold.nounPhraseNegativesSurvive, D131.disclosedResidual). For each
// residual below the SAME boundary that would catch it is shown destroying a required-
// survive answer: resolving that would reopen D130 (a P1 that destroys true answers), which
// index.ts's standing rule and the founder forbid. These are left to the PRIMARY
// structured-evidence path (legacyProseFallback fires only when there is no supporting
// mutation claim; a real mutation turn re-renders from evidence regardless).
const D131_CATCHABLE = [
  'Nothing to worry about: ACME was deleted.',
  'Nothing failed: ACME was archived without issue.',
  'Doctors Without Borders Mongolia was archived.',
  'Home Without Walls Co was deleted.',
];
for (const s of D131_CATCHABLE) {
  C(`D131.fabricationCaught.${JSON.stringify(s.slice(0, 40))}`, 'DEFECT',
    `D131 (P2): a filler negator set off by a colon, or a name-word "without", is still caught — ${JSON.stringify(s)}`,
    () => readsAsCompletion(s) === true);
}
const D131_IRREDUCIBLE = [
  ['and', 'There were no errors and ACME was archived.', 'No company named Salt and Pepper Co was archived.'],
  ['and', 'The company had no open tasks and was archived.', 'Nothing named Bed Bath and Beyond was deleted.'],
  ['and', 'No issues at all and the goal was completed.', 'There is no company called Barnes and Noble that was archived.'],
  ['but', 'There is no undo but the company has been archived.', 'No company called But First Coffee was archived.'],
  ['but', 'Nothing But Nets Foundation was deleted.', 'No charity like Nothing But Nets was archived.'],
  ['dash', 'No problem — ACME was archived.', 'No company named Ulaanbaatar — North Depot was archived.'],
  ['dash', 'Not to worry — ACME was archived.', 'Nothing at Ulaanbaatar — South Hub was deleted.'],
  ['dash', 'Not the task — the company was archived.', 'No unit at Erdenet — Copper Works was archived.'],
  ['dash', 'Not a single task moved — Bob Smith was removed.', 'No site at Darkhan — Steel Yard was deleted.'],
];
for (const [tok, fab, real] of D131_IRREDUCIBLE) {
  C(`D131.irreducibleResidual.${JSON.stringify(fab.slice(0, 40))}`, 'CONTRACT',
    `D131 DOCUMENTED RESIDUAL: this fabrication survives because its only separator is "${tok}", and that boundary DESTROYS the paired real name (proven here). Caught by the primary evidence path, not the belt.`,
    () => readsAsCompletion(fab) === false && readsAsCompletion(real) === false);
}
C('D131.disclosedResidual.pinnedNotAccepted', 'CONTRACT',
  'D131 LIMIT, pinned: a name leading with a negator survives (shared with 9535f0b and 52e830f, not a regression)',
  () => ['Nothing Bundt Cakes was archived.', 'No Limits Inc was deleted.', 'Never Say Never LLC has been archived.',
    'None The Wiser Ltd was archived.'].every((s) => readsAsCompletion(s) === false));

// =====================================================================================
// D132 (P2) — DEFECT. A model-authored actionType/entityType that is an Object.prototype
// key crashes the matcher. D124's whole rule is that such a string must FAIL CLOSED.
// =====================================================================================
for (const [what, o] of [
  ['actionType "constructor"', opt('x1', 'Acme', 'company', 'constructor')],
  ['actionType "__proto__"', opt('x1', 'Acme', 'company', '__proto__')],
  ['actionType "hasOwnProperty"', opt('x1', 'Acme', 'company', 'hasOwnProperty')],
  ['entityType "constructor"', opt('x1', 'Acme', 'constructor', 'archive')],
  ['entityType "toString"', opt('x1', 'Acme', 'toString', 'archive')],
  ['entityType "valueOf"', opt('x1', 'Acme', 'valueOf', 'archive')],
]) {
  C(`D132.prototypeKeyMustFailClosed.${what}`, 'DEFECT',
    `D132 (P2): ${what} must dead-end, not throw — all three prior SHAs fail closed on the identical input`,
    () => { try { return armed('acme', [o]) === null; } catch (e) { return false; } });
}

// =====================================================================================
// D133 (P3) — DEFECT. The D95 seam, end to end. With the labels the PRODUCT renders for
// colliding fallbacks there is no entity NAME to pair a number with, so the winner's-own-
// number rule cannot fire and every realistic reply still dead-ends.
// =====================================================================================
for (const reply of ['option 1', '#1', 'the first one']) {
  C(`D133.numberedFallbackStillDeadEnds.${JSON.stringify(reply)}`, 'DEFECT',
    `D133 (P3): the product rendered "the company (option 1)" / "the company (option 2)" precisely so the founder could answer; ${JSON.stringify(reply)} still dead-ends`,
    () => bind(reply, NUMBERED) === 'f1');
}
C('D133.hold.verbatimLabelStillBinds', 'CONTRACT',
  'D133 LIMIT: the one reply that does work today must keep working — a verbatim copy of the whole rendered label binds the right option',
  () => bind('the company (option 1)', NUMBERED) === 'f1' && bind('the company (option 2)', NUMBERED) === 'f2');
C('D133.hold.outOfRangeNumberBindsNothing', 'CONTRACT',
  'D133 LIMIT: whatever closes D133 must not bind an ordinal that names no option',
  () => bind('option 3', NUMBERED) === null && bind('option 9', TWO) === null);

// =====================================================================================
// COVERAGE — the three mutants that survived my whole 28-suite battery.
// =====================================================================================
C('D134.coverage.newlineIsAClauseBoundary', 'CONTRACT',
  'COVERAGE (surviving mutant M3): the newline this candidate ADDED to the clause splitter is observed by NO committed suite — a truthful negative on one LINE must not disarm a fabrication on the next',
  () => readsAsCompletion('No company was archived\nACME was deleted.') === true
     && readsAsCompletion('No company was archived ACME was deleted.') === false);
C('D134.coverage.actionFamilyScopingMatters', 'CONTRACT',
  'COVERAGE (surviving mutant M10): unioning ACTION_FAMILY_VERBS back into one list reverts the HEADLINE half of D127 and the whole battery stays green — under that mutant "reopen acme" arms archiveCompanyIds against a pending ARCHIVE and "close acme" arms restoreCompanyIds against a pending RESTORE',
  () => armed('reopen acme', ARCH) === null && armed('undelete acme', ARCH) === null
     && armed('close acme', REST) === null && armed('deactivate acme', REST) === null);
C('D134.coverage.winnersOwnBareDigitIsNotFiller', 'CONTRACT',
  "COVERAGE (surviving mutant M12): run17's D129 LIMIT pins \"acme 2\" against option 1 — a digit that is never the winner's own number, so it cannot observe the limit it claims to. The winner's OWN bare digit is the case that matters",
  () => bind('acme 1', TWO) === null && bind('beta corp 2', TWO) === null);

// =====================================================================================
// HOLDS — what must not be undone while D130/D131 are fixed.
// =====================================================================================
C('D128.hold.d125FourShapesStillCaught', 'CONTRACT',
  'the four shapes d724d8c caught and 52e830f lost stay caught',
  () => ['The company has been archived – no undo available.',
    'The company has been archived (no undo available).',
    'The company has been archived without incident.',
    'ACME was archived and no errors occurred.'].every((s) => readsAsCompletion(s) === true));
C('D128.hold.nounPhraseNegativesSurvive', 'CONTRACT',
  'D128 itself stays closed: a truthful negative whose entity name carries a conjunction/dash/paren/colon survives',
  () => ['No company named Salt and Pepper Co was archived.',
    'Nothing named Bed Bath and Beyond was deleted.',
    'There is no company called Barnes and Noble that was archived.',
    'No company called Without Borders Ltd was archived.',
    'No entity (including ACME) was archived.',
    'Nothing in the 14:30 batch was archived.'].every((s) => readsAsCompletion(s) === false));
C('D118.hold.plainTruthfulNegativesSurvive', 'CONTRACT',
  'the truthful negatives D118 rescued (ledger #4905) still survive',
  () => ['No company was archived.', 'Bob Smith was not reassigned.', 'Nothing was deleted.',
    'None of the tasks were completed.', 'That company was never archived.',
    'Confirmed — the company was not archived.', 'Confirmed — no tasks were assigned.']
    .every((s) => readsAsCompletion(s) === false));
C('D112.hold.nounUseSurvives', 'CONTRACT',
  "run14's own D112 noun-use answers still survive — they are the SHAPE D130 breaks once an auxiliary is added, so pin both halves together",
  () => readsAsCompletion('Confirmed — the archived list is empty.') === false
     && readsAsCompletion('Confirmed — you have 3 archived companies.') === false
     && readsAsCompletion('Confirmed — the approval is still pending, not approved.') === false);
C('D127.hold.plainSelectionStillArms', 'CONTRACT',
  'an ordinary selection still arms the pending field on both families',
  () => armed('acme', ARCH) === 'archiveCompanyIds' && armed('yes, archive acme please', ARCH) === 'archiveCompanyIds'
     && armed('restore acme', REST) === 'restoreCompanyIds' && armed('activate acme', REST) === 'restoreCompanyIds');
C('D127.hold.oppositeFamilyStillRefused', 'CONTRACT',
  'the contradiction guard still refuses the opposite family on both axes, including plain "activate"',
  () => armed('activate acme', ARCH) === null && armed('restore acme', ARCH) === null
     && armed('archive acme', REST) === null && armed('delete acme', REST) === null);
C('D127.hold.entityNounTargetFlipRefused', 'CONTRACT',
  'a reply naming a DIFFERENT target still dead-ends',
  () => armed('archive acme tasks', ARCH) === null && armed('archive acme employees', ARCH) === null
     && armed('the acme company task', ARCH) === null);
C('D129.hold.otherOptionsNumberDeadEnds', 'CONTRACT',
  "another option's number is not filler",
  () => bind('acme (option 2)', TWO) === null && bind('acme #2', TWO) === null);
C('D125.coverage.questionBeltUnchanged', 'CONTRACT',
  'this candidate touched only the completion belt: the question belt still consults its own constructs and none of the matcher/completion ones',
  () => {
    const q = balancedFn(src, 'const safeQuestionFragment =');
    return q.includes('INTERROGATIVE_LEAD') && q.includes('FIRST_PERSON_MAIN_CLAUSE_COMPLETION')
      && !q.includes('COMPLETION_VOCAB') && !q.includes('SELECTION_FILLER') && !q.includes('ACTION_FAMILY_VERBS');
  });

// =====================================================================================
let pass = 0, fail = 0, defectsOpen = 0;
for (let [id, kind, desc, thunk] of CASES) {
  let ok;
  try { ok = thunk() === true; } catch (e) { ok = false; desc += ' THREW ' + e.message; }
  if (ok) pass++; else { fail++; if (kind === 'DEFECT') defectsOpen++; }
  console.log((ok ? 'OK   ' : 'FAIL ') + id.padEnd(66) + ' [' + kind + '] ' + desc);
}
console.log(`\nrun18_defect_closure_contract: ${pass} pass, ${fail} fail (${defectsOpen} open #78 defects reproduce; ${fail - defectsOpen} CONTRACT failures = guards that do not hold as claimed)`);
// Exit guard — ANY failure fails the run. No kind-based carve-out.
if (fail > 0) process.exit(1);
