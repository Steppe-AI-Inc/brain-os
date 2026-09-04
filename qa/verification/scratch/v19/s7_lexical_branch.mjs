// SCENARIO 7 — FOUNDER-DIRECTED LEXICAL-BRANCH SCENARIO (mandatory, as in #75-#78).
// For a REAL company name built around EACH completion word, walk every canonical branch a
// name flows through and report what the founder would actually experience:
//   L  safeOptionLabel        — is the name still rendered as an option label?
//   S  safePendingSummary     — is an imperative pending summary naming it still shown?
//   Q  safeQuestionFragment   — is a clarification question naming it still shown?
//   B  matchDisambiguationOption + resolveClarificationField — can the founder SELECT it?
//   N  readsAsCompletion("<Name> was not archived.")  — truthful negative must SURVIVE
//   F  readsAsCompletion("<Name> was archived.")      — fabrication must be CAUGHT
//   R  the replay line (index.ts:2706-2712): a name that reads as an assertion must degrade
//      to the neutral acknowledgement instead of "Confirmed — you selected <name>".
import { statement, detype, loadMatcher, loadBelt, loadFile, INDEX_PATH } from './x.mjs';
import { fileURLToPath } from 'node:url';

const src = loadFile(fileURLToPath(INDEX_PATH));
const belt = loadBelt(src).readsAsCompletion;
const M = loadMatcher(src);
const helpers = new Function(detype(['const UUID_IN_TEXT', 'const KNOWN_ABBREVIATION', 'const PAST_COMPLETION_CLAIM_PATTERN',
  'const safeProseFragment', 'const FUTURE_PROMISE_IN_QUESTION', 'const safeQuestionFragment', 'const COMPLETION_WORD',
  'const safeOptionLabel', 'const safePendingSummary'].map((m) => statement(src, m)).join('\n'))
  + '\nreturn { safeOptionLabel, safePendingSummary, safeQuestionFragment, COMPLETION_WORD, PAST_COMPLETION_CLAIM_PATTERN };')();

const NAMES = [
  ['archived', 'Archived Media Group'], ['deleted', 'Deleted Scenes Studio'], ['updated', 'Updated Systems Inc'],
  ['created', 'Created Spaces Co'], ['restored', 'Restored Furniture Co'], ['activated', 'Activated Carbon Mongolia'],
  ['deactivated', 'Deactivated Devices Ltd'], ['assigned', 'Assigned Seating Ltd'], ['reassigned', 'Reassigned Routes LLC'],
  ['approved', 'Approved Vendors Ltd'], ['rejected', 'Rejected Goods Depot'], ['declined', 'Declined Offers Ltd'],
  ['removed', 'Removed Barriers NGO'], ['completed', 'Completed Works LLC'], ['renamed', 'Renamed Holdings'],
  ['ended', 'Ended Silence Media'], ['closed', 'Closed Loop Systems'], ['cleared', 'Cleared Path Consulting'],
  ['sent', 'Sent Mail Services'], ['moved', 'Moved Mountains Ltd'], ['granted', 'Granted Wishes Foundation'],
  ['added', 'Added Value Partners'], ['done', 'Done Deal Trading'], ['confirmed', 'Confirmed Freight Ltd'],
];
const opt = (id, label) => ({ id, label, entityType: 'company', actionType: 'archive' });
const armed = (cmd, options) => {
  const m = M.matchDisambiguationOption(cmd, options);
  const c = !!m && M.commandContradictsActionType(cmd, m.actionType);
  const f = m && !c ? M.resolveClarificationField(m.entityType, m.actionType) : undefined;
  return { id: m ? m.id : null, field: f };
};
const rows = [];
for (const [word, name] of NAMES) {
  const L = helpers.safeOptionLabel(name);
  const S = helpers.safePendingSummary('Archive ' + name + '?');
  const Q = helpers.safeQuestionFragment('Which company did you mean — ' + name + ' or Beta Corp?');
  const b = armed(name.toLowerCase(), [opt('x', name), opt('y', 'Beta Corp')]);
  const N = belt(name + ' was not archived.');
  const F = belt(name + ' was archived.');
  const replayAssertion = helpers.PAST_COMPLETION_CLAIM_PATTERN.test(name) || helpers.COMPLETION_WORD.test(name);
  rows.push({ word, name, L, S, Q, bind: b.id, field: b.field, N, F, replayAssertion });
}
const bad = [];
console.log('word         name                          L        S      Q      SELECT            trueNeg  fabCaught  replay');
for (const r of rows) {
  const Lok = r.L !== null, Sok = r.S !== null, Qok = r.Q !== null, sel = r.bind === 'x' && r.field === 'archiveCompanyIds';
  console.log(r.word.padEnd(12) + r.name.padEnd(30)
    + (Lok ? 'kept  ' : 'BLANK ').padEnd(9) + (Sok ? 'kept ' : 'DROP ').padEnd(7) + (Qok ? 'kept ' : 'DROP ').padEnd(7)
    + (sel ? 'selectable      ' : ('NOT SELECTABLE(' + r.bind + ')').padEnd(16))
    + (r.N === false ? '  SURVIVES' : '  DESTROYED').padEnd(9) + (r.F === true ? '  caught ' : '  MISSED ').padEnd(11)
    + (r.replayAssertion ? 'neutral' : 'quoted'));
  if (!Lok) bad.push([r.name, 'option label blanked (caller substitutes the derived canonical name)']);
  if (!Sok) bad.push([r.name, 'pending summary dropped']);
  if (!Qok) bad.push([r.name, 'clarification question dropped']);
  if (!sel) bad.push([r.name, 'NOT SELECTABLE by typing its own name — bind=' + r.bind + ' field=' + r.field]);
  if (r.N !== false) bad.push([r.name, 'TRUTHFUL NEGATIVE DESTROYED by the drift belt']);
  if (r.F !== true) bad.push([r.name, 'fabrication about it is NOT caught by the belt']);
}
console.log('\nfindings (' + bad.length + '):');
for (const [n, w] of bad) console.log('  * ' + n + ': ' + w);
