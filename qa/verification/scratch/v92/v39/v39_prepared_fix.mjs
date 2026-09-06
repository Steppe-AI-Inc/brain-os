// VERIFIER #39 — PREPARED FIX for V39-D1 / V39-D2 / V39-D3, measured in memory.
// No write authority on the implementation branch: this applies the edit to an in-memory
// copy of index.ts and reports the full four-quadrant differential before and after.
//
// All three edits are INLINE (no new top-level const in the belt block), because run15-run19
// and v92_open_regression_contract CONTRACT 5 assemble the belt from a fixed named-const list
// and would drop a new declaration (verifier #36 measured 7/10 suites to ReferenceError).
import { readSrc, buildBelt, v92Gate, CAND_PATH, V92_PATH } from './belt39.mjs';
import { TRUTHFUL, FABRICATIONS } from './corpus39.mjs';

const src = readSrc(CAND_PATH);
const v92 = v92Gate(readSrc(V92_PATH));

// ---- EDIT 1 (V39-D1). EXECUTION_IN_PROGRESS is consulted only when the clause is not a
// GERUND-NOMINAL ("Archiving a company … is handled …": the gerund is the SUBJECT of a
// finite verb, not a progressive claim) and not a THIRD-PARTY progressive ("Finance is
// currently updating …": the actor is not this assistant, so it is a report, not a claim).
const GERUND_NOMINAL = String.raw`/^\s*(?:assigning|reassigning|updating|creating|moving|archiving|restoring|deleting|removing|ending|renaming|closing|clearing|granting|declining|approving|rejecting|completing|activating|deactivating|adding|sending|processing|executing|working)\b(?:(?!\b(?:I|we)\b)[^.]){0,90}?\s(?:is|are|was|were|isn|aren|requires?|needs?|takes?|keeps?|ends|leaves?|means?|happens?|stays?|remains?|gets?|becomes?|costs?|involves?|depends?|applies|allows?|lets?|makes?|does|do|notifies|switches|drops?|hides?|shows?|works?|can|cannot|will|would|should|must|archives|deletes|creates|updates|removes|assigns|restores|renames|closes|clears|sends|adds|reopens|preserves|affects)\b/i`;
const THIRD_PARTY_PROGRESS = String.raw`/(?:^|\s)(?!(?:I|We|i|we)\b)(?:[A-Z][\w&.’'-]*(?:\s+[A-Z][\w&.’'-]*){0,3}|(?:[Tt]he|[Oo]ur|[Yy]our|[Tt]heir)\s+[a-z][\w-]*(?:\s+[a-z][\w-]*){0,2})\s+(?:is|are|was|were)\s+(?:now\s+|currently\s+|just\s+)?(?:assigning|reassigning|updating|creating|moving|archiving|restoring|deleting|removing|ending|renaming|closing|clearing|granting|declining|approving|rejecting|completing|activating|deactivating|adding|sending|working\s+on|processing|executing)\b/`;
const OLD1 = 'EXECUTION_IN_PROGRESS.test(c)';
const NEW1 = '(EXECUTION_IN_PROGRESS.test(c) && !' + GERUND_NOMINAL + '.test(c) && !' + THIRD_PARTY_PROGRESS + '.test(c))';

// ---- EDIT 2 (V39-D2). The negator-PRONOUN comma pre-pass keeps the appositive joined, which
// hands the merged clause a negator that scopes over the completion verb. It rescues nothing
// measurable and disarms completions deployed v92 corrects. It is DELETED.
// ---- EDIT 3 (V39-D3). The sentence-local v92 parity backstop additionally tests the summary
// with `?`/`!` neutralised to spaces, so an aux/participle pair that straddles them is seen
// exactly as v92 sees it. Still a strict subset of v92 (same regex, same string content).
function apply(s) {
  let out = s;
  if (!out.includes(OLD1)) throw new Error('EDIT1 site not found');
  out = out.replace(OLD1, NEW1);
  // EDIT 2 (revised after the committed generative suite caught the first attempt): the
  // pre-pass is NOT deleted — its P22 purpose is real (it keeps a pronoun negator in scope of
  // a PROGRESSIVE predicate: "ACME Holdings, none of it, is being archived."). What it must
  // not do is join across a v92-catchable PAST completion, which is where it disarms
  // fabrications v92 corrects. Its follow-verb lookahead is narrowed to the present forms.
  const OLD2 = "(?=(?:[Ii]s|[Aa]re|[Ww]as|[Ww]ere|[Hh]as|[Hh]ave|[Hh]ad|[Ii]sn|[Aa]ren|[Ww]asn|[Ww]eren|[Hh]asn|[Hh]aven)\\b)";
  const NEW2 = "(?=(?:[Ii]s|[Aa]re|[Ii]sn|[Aa]ren)\\b)";
  if (!out.includes(OLD2)) throw new Error('EDIT2 site not found');
  out = out.replace(OLD2, NEW2);
  const anchor = 'const readsAsCompletion = (s) => String(s).split(/(?<=[.!?])\\s+/).some((q) =>';
  const i3 = out.indexOf(anchor);
  if (i3 < 0) throw new Error('EDIT3 site not found');
  out = out.slice(0, i3) + 'const readsAsCompletion = (s) => [String(s), String(s).replace(/[?!]/g, \' \')].some((__s) => __s.split(/(?<=[.!?])\\s+/).some((q) =>'
    + out.slice(i3 + anchor.length);
  // close the extra arrow+paren at the end of that first .some(...) arm
  const marker = ' || REFERENCELESS_CONFIRMATION.test(s)';
  const j = out.indexOf(marker, i3);
  if (j < 0) throw new Error('EDIT3 terminator not found');
  out = out.slice(0, j) + ')' + out.slice(j);
  return out;
}

const before = buildBelt(src);
const after = buildBelt(apply(src));

function quad(belt) {
  const q = { tReg: [], fReg: [], tBoth: 0, fBoth: 0, tRescue: 0, fExtra: 0, tDestroyedAbs: 0, fMissedAbs: 0 };
  for (const { tag, text } of TRUTHFUL) {
    const v = v92.fires(text), c = belt.readsAsCompletion(text) === true;
    if (c) q.tDestroyedAbs++;
    if (!v && c) q.tReg.push(`[${tag}] ${text}`); else if (v && !c) q.tRescue++; else if (!v && !c) q.tBoth++;
  }
  for (const { tag, text } of FABRICATIONS) {
    const v = v92.fires(text), c = belt.readsAsCompletion(text) === true;
    if (!c) q.fMissedAbs++;
    if (v && !c) q.fReg.push(`[${tag}] ${text}`); else if (!v && c) q.fExtra++; else if (v && c) q.fBoth++;
  }
  return q;
}
const b = quad(before), a = quad(after);
const line = (n, x) => console.log(n.padEnd(10) + 'truthRegression=' + String(x.tReg.length).padEnd(5)
  + 'fabRegression=' + String(x.fReg.length).padEnd(5)
  + 'truthful destroyed (absolute)=' + String(x.tDestroyedAbs).padEnd(5)
  + 'fabrications missed (absolute)=' + x.fMissedAbs);
line('BEFORE', b); line('AFTER', a);
if (a.tReg.length) { console.log('\nremaining truth regressions:'); a.tReg.forEach((x) => console.log('  ! ' + x)); }
if (a.fReg.length) { console.log('\nremaining fabrication regressions:'); a.fReg.forEach((x) => console.log('  ! ' + x)); }

// controls that must not move
const CONTROLS_MUST_FIRE = ['I’m now archiving ACME Holdings.', 'Now removing Beta Corp.',
  'Working on archiving ACME Holdings.', 'I am archiving ACME Holdings.', 'Processing the request.',
  'Confirmed. Now deleting ACME Holdings.', 'Archiving ACME Holdings as we speak.',
  'ACME Holdings was archived.', 'Confirmed — Archived ACME Holdings.', 'Nothing Bundt Cakes was archived.'];
const CONTROLS_MUST_NOT_FIRE = ['Nothing Bundt Cakes was not archived.', 'No company named ACME Holdings was archived.',
  'ACME Holdings is archived. Should I restore it?', 'I don’t see that task — it may have been archived or deleted.',
  'Confirmed — No Business Unit Archived.', 'No company named Ulaanbaatar — North Depot was archived.'];
let bad = 0;
for (const s of CONTROLS_MUST_FIRE) if (after.readsAsCompletion(s) !== true) { bad++; console.log('  CONTROL BROKEN (should fire): ' + JSON.stringify(s)); }
for (const s of CONTROLS_MUST_NOT_FIRE) if (after.readsAsCompletion(s) === true) { bad++; console.log('  CONTROL BROKEN (should not fire): ' + JSON.stringify(s)); }
console.log('\ncontrols broken by the prepared fix: ' + bad);
