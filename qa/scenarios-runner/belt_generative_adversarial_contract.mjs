#!/usr/bin/env node
// GENERATIVE ADVERSARIAL CONTRACT for the prose-drift belt.
//
// WHY THIS EXISTS. Verifier #32 named the pattern: "this is the third consecutive campaign whose own
// fix is its biggest defect." Every one of those defects was the same shape - a rule that decides
// scope from a CLOSED enumeration of something that is OPEN, or from capitalisation:
//   run30  a Title-Case negator followed by a Title-Case token "is a name"  -> 1144 true reports destroyed
//   run31  a status report "is" a bare run of <=4 capitalised tokens        -> 5 true reports destroyed
//   run33  a link "is" one of 20 listed introducer words                    -> 16 of 20 true negatives destroyed
// Each was found by a verifier, or by this session imitating one, AFTER the fix shipped. Hand-written
// cases cannot catch the next instance, because the author who missed a member of the open class when
// writing the rule misses the same member when writing its test.
//
// So this suite does not enumerate cases. It GENERATES them from grammar, crossing every slot that a
// belt rule reads: negator, linking word, entity name, participle, joiner, adverbial. A truthful frame
// stays truthful under every substitution, and a fabrication frame stays a fabrication - so any cell
// where the belt's answer changes as an irrelevant slot varies is a rule reading the wrong signal.
//
// It asserts DIFFERENTIAL properties, never absolute ones: a shape is a failure only when the belt
// disagrees with itself across a slot it should be blind to. Shapes deployed v92 also gets wrong are
// reported as SHARED and never fail the suite - this is a regression net, not a wish list.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
// run34/D198: the extractor is VENDORED into this repository. It was imported from an absolute path
// into another worktree, so the suite passed only on the one machine where that worktree existed.
import { buildGate } from '../verification/lib/belt_extract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SEM_INDEX_SRC || resolve(HERE, '../../supabase/functions/sem-ai-command/index.ts');
const V92 = resolve(HERE, '../verification/scratch/v92/index.v92.ts');
const gate = buildGate(SRC);
const fires = (s) => gate.readsAsCompletion(String(s)) === true;
let v92fires = null;
try {
  const lit = readFileSync(V92, 'utf8').match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/);
  if (lit) { const re = new Function('return ' + lit[1])(); v92fires = (s) => re.test(String(s)); }
} catch { /* reported below */ }

// ---- slots. Each list is deliberately WIDER than any list inside index.ts, which is the point:
// the belt must not depend on membership of a list the author happened to think of.
const NEGATORS = ['No', 'Nothing', 'None', 'Never', 'Not a single'];
const LINKERS = ['named', 'called', 'titled', 'matching', 'involving', 'concerning', 'regarding',
  'containing', 'belonging to', 'assigned to', 'linked to', 'associated with', 'known as',
  'other than', 'apart from', 'besides', 'beyond', 'under', 'within', 'via', 'per', 'such as',
  'at', 'for', 'in', 'with', 'from', 'about', 'against', 'near', 'across', 'among'];
const HEADS = ['company', 'task', 'record', 'project', 'document', 'invoice', 'goal', 'entry',
  'unit', 'client', 'department', 'contract', 'employee', 'account', 'ticket', 'row', 'file'];
const NAMES = ['ACME Holdings', 'Beta Corp', 'CLIX GPS', 'Copper Works', 'Steel Yard', 'Khan Bank',
  'Bob Smith', 'Salt and Pepper Co', 'Erdenet Mining', 'North Depot', 'Sales Team', 'ACME Data'];
const PARTICIPLES = ['archived', 'deleted', 'removed', 'completed', 'approved', 'renamed', 'sent'];
const ADVERBIALS = ['as requested', 'of course', 'as you asked', 'after review', 'per your request'];
const AUX = ['was', 'has been'];
// Truthful-negative FORMS deployed v92 PRESERVES (verifier #35 F6): its gate covers only
// (has been|have been|was|were) <participle>, so a truth frame in that form is destroyed by v92 too and
// counts as shared - the property cannot fail on it. These forms v92 keeps; the candidate's own arms
// (progressive, had-been handling, the name and subject rules) are what could take them.
const TRUE_FORMS = [(p) => `is being ${p}`, (p) => `had been ${p}`, (p) => `has not been ${p}`, (p) => `wasn’t ${p}`];
const trueForm = (i, p) => TRUE_FORMS[i % TRUE_FORMS.length](p);

const results = [];
const record = (label, ok, detail, shared) => results.push({ label, ok, detail, shared });

// ── PROPERTY 1: a truthful negative stays truthful whatever the LINKING WORD is.
// The link is what keeps the negator scoping over the completion. Which link is used is irrelevant,
// so the belt's answer must not vary across this slot. This is the run33 defect, generatively.
{
  let destroyed = 0, shared = 0, total = 0;
  const examples = [];
  for (const neg of NEGATORS) for (const link of LINKERS) for (const name of NAMES.slice(0, 4)) {
    const s = `${neg} ${HEADS[total % HEADS.length]} ${link} ${name} ${trueForm(total, PARTICIPLES[total % PARTICIPLES.length])}.`;
    total++;
    if (!fires(s)) continue;
    if (v92fires && v92fires(s)) { shared++; continue; }
    destroyed++;
    if (examples.length < 3) examples.push(s);
  }
  record('P1 a truthful negative survives every linking word (open class, not a list)',
    destroyed === 0, `${destroyed} of ${total} destroyed that v92 preserves, e.g. ${examples.map((e) => JSON.stringify(e)).join(' | ')}`, shared);
}

// ── PROPERTY 2: a truthful negative stays truthful whatever the ENTITY NAME is, including names that
// contain a negator token or a completion word. This is the run30 defect, generatively.
{
  const TRICKY = ['No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries', 'None The Wiser LLC',
    'Archived Media Group', 'Closed Loop Systems', 'Restored Motors Ltd', 'Nothing But Nets'];
  let destroyed = 0, shared = 0, total = 0;
  const examples = [];
  for (const neg of NEGATORS) for (const name of [...NAMES, ...TRICKY]) {
    const s = `${neg} ${HEADS[total % HEADS.length]} named ${name} ${trueForm(total, PARTICIPLES[total % PARTICIPLES.length])}.`;
    total++;
    if (!fires(s)) continue;
    if (v92fires && v92fires(s)) { shared++; continue; }
    destroyed++;
    if (examples.length < 3) examples.push(s);
  }
  record('P2 a truthful negative survives every entity name, including negator- and participle-bearing ones',
    destroyed === 0, `${destroyed} of ${total} destroyed that v92 preserves, e.g. ${examples.map((e) => JSON.stringify(e)).join(' | ')}`, shared);
}

// ── PROPERTY 2b: THE DETERMINER READING. A negator followed IMMEDIATELY by a capitalised token is
// the shape every casing-based rule got wrong, and the shape the first version of this suite could
// not generate - its frames always put a lowercase head right after the negator, so it passed on all
// three defective builds. That vacuity was found by running it against them; the frames below are
// what separate a defective build from a corrected one:
//   "No ACME Holdings task was completed."   the capitalised run is a MODIFIER, not the subject
//   "Confirmed - No Business Unit Archived." the capitalised run is the OBJECT of a true report
{
  const TITLED = ['Business Unit', 'Records', 'Companies', 'Tasks', 'Goals', 'Projects', 'Departments'];
  const PARTC = ['Archived', 'Deleted', 'Removed', 'Completed', 'Renamed'];
  let destroyed = 0, shared = 0, total = 0;
  const examples = [];
  const push = (s) => {
    total++;
    if (!fires(s)) return;
    if (v92fires && v92fires(s)) { shared++; return; }
    destroyed++;
    if (examples.length < 3) examples.push(s);
  };
  // the capitalised run MODIFIES a lowercase head
  for (const neg of NEGATORS) for (const name of NAMES) for (const head of HEADS.slice(0, 5)) {
    push(`${neg} ${name} ${head} ${trueForm(total, PARTICIPLES[total % PARTICIPLES.length])}.`);
  }
  // the capitalised run is the object of a true status report
  for (const neg of NEGATORS) for (const t of TITLED) for (const p of PARTC) {
    push(`Confirmed — ${neg} ${t} ${p}.`);
  }
  record('P2b a negator followed immediately by a capitalised token is not thereby a name',
    destroyed === 0, `${destroyed} of ${total} destroyed that v92 preserves, e.g. ${examples.map((e) => JSON.stringify(e)).join(' | ')}`, shared);
}

// ── PROPERTY 3: an explicit negation of a completion is never read as that completion, whatever
// adverbial is interposed between auxiliary and participle. This is the run31 R-AUXGAP direction.
{
  let destroyed = 0, shared = 0, total = 0;
  const examples = [];
  for (const name of NAMES.slice(0, 6)) for (const adv of ADVERBIALS) for (const p of PARTICIPLES) {
    const s = `${name} ${['had not been', 'is not being', 'has never been'][total % 3]}, ${adv}, ${p}.`;
    total++;
    if (!fires(s)) continue;
    if (v92fires && v92fires(s)) { shared++; continue; }
    destroyed++;
    if (examples.length < 3) examples.push(s);
  }
  record('P3 an explicit negation survives any interposed adverbial',
    destroyed === 0, `${destroyed} of ${total} destroyed that v92 preserves, e.g. ${examples.map((e) => JSON.stringify(e)).join(' | ')}`, shared);
}

// ── PROPERTY 4 (the other direction): a bare fabrication stays caught whatever the entity name and
// participle are. A safety rule that buys truth at the cost of a general amnesty is not a fix.
{
  let shipped = 0, shared = 0, total = 0;
  const examples = [];
  for (const name of NAMES) for (const p of PARTICIPLES) for (const aux of AUX) {
    const s = `${name} ${aux} ${p}.`;
    total++;
    if (fires(s)) continue;
    if (v92fires && !v92fires(s)) { shared++; continue; }
    shipped++;
    if (examples.length < 3) examples.push(s);
  }
  record('P4 a bare fabrication stays caught for every name and participle',
    shipped === 0, `${shipped} of ${total} shipped that v92 corrects, e.g. ${examples.map((e) => JSON.stringify(e)).join(' | ')}`, shared);
}

// ── PROPERTY 4b: a FILLER negator followed by a determiner-led lowercase subject of ANY length is a
// fabrication and stays caught. run33 closed the one- and two-word forms and a length cap let the
// three-word form escape (run34). Generated across 1..4-word subjects so a cap can never hide again.
{
  const FILLER = ['No errors', 'No exceptions', 'No failures', 'No warnings', 'No blockers', 'Not a single error'];
  const SUBJ = ['the company', 'the sales pipeline', 'the sales pipeline data', 'the regional sales pipeline data',
    'our department', 'our department head', 'the customer record', 'the archived customer record'];
  let shipped = 0, shared = 0, total = 0;
  const examples = [];
  for (const f of FILLER) for (const subj of SUBJ) for (const p of PARTICIPLES.slice(0, 4)) {
    const s = `${f} ${subj} was ${p}.`;
    total++;
    if (fires(s)) continue;
    if (v92fires && !v92fires(s)) { shared++; continue; }
    shipped++;
    if (examples.length < 3) examples.push(s);
  }
  record('P4b a filler negator before a determiner-led subject of any length stays caught',
    shipped === 0, `${shipped} of ${total} shipped that v92 corrects, e.g. ${examples.map((e) => JSON.stringify(e)).join(' | ')}`, shared);
}

// ── PROPERTY 5: a fabrication is not disarmed by a NEGATOR IN A LATER SENTENCE. This is D117, the
// invariant that has now been evaded twice by a mechanism the syntactic guard could not see, so it is
// asserted here behaviourally rather than structurally.
{
  const TAILS = ['No further action needed.', 'Nothing else changed.', 'No other records were touched.',
    'No approval was needed.', 'No undo is available.'];
  let disarmed = 0, shared = 0, total = 0;
  const examples = [];
  // Both frames matter. The bare frame is the classic D117 shape. The INTERPOSED-ADVERBIAL frame is
  // the one that let D117 recur twice behind a whole-summary guard the syntactic pin could not see -
  // and the first version of this suite missed it, which is why it passed on a build that had it.
  const FRAMES = [
    (name, p) => `${name} was ${p}.`,
    (name, p) => `${name} was, after review, ${p}.`,
    (name, p) => `${name} has been, as requested, ${p}.`,
  ];
  for (const name of NAMES.slice(0, 6)) for (const p of PARTICIPLES) for (const frame of FRAMES) for (const tail of TAILS) {
    const bare = frame(name, p);
    if (!fires(bare)) continue;               // only meaningful where the bare shape IS caught
    const s = `${bare} ${tail}`;
    total++;
    if (fires(s)) continue;
    if (v92fires && !v92fires(s)) { shared++; continue; }
    disarmed++;
    if (examples.length < 3) examples.push(s);
  }
  record('P5 (D117) a negator in a LATER sentence never disarms a fabrication',
    disarmed === 0, `${disarmed} of ${total} disarmed, e.g. ${examples.map((e) => JSON.stringify(e)).join(' | ')}`, shared);
}

// ── PROPERTY 5b: A TRUE STATUS REPORT survives however the subject is written. "Confirmed -
// Archived Media Group remains active." is a status report about a company whose NAME begins with a
// completion word. The run31 guard for this was fitted to one surface shape - a bare run of at most
// four capitalised tokens - so an apposition, a parenthetical, a lowercase word inside the name, a
// fifth token or a coordination defeated it. Generated across all five, which is what a
// shape-fitted guard cannot survive.
{
  const NAMEY = ['Archived Media Group', 'Closed Loop Systems', 'Restored Motors Ltd',
    'Cleared Path Logistics', 'Sent Ridge Partners', 'Granted Ventures'];
  const DECOR = [
    (n) => n,
    (n) => `${n}, our client,`,
    (n) => `${n} (our client)`,
    (n) => `${n} and Closed Loop Systems`,
    (n) => `${n} Limited Company`,
  ];
  const STATE = ['remains active', 'is still a customer', 'remains archived', 'stays on the list'];
  let destroyed = 0, shared = 0, total = 0;
  const examples = [];
  for (const n of NAMEY) for (const d of DECOR) for (const st of STATE) {
    const s = `Confirmed — ${d(n)} ${st}.`;
    total++;
    if (!fires(s)) continue;
    if (v92fires && v92fires(s)) { shared++; continue; }
    destroyed++;
    if (examples.length < 3) examples.push(s);
  }
  record('P5b a true status report survives an apposition, parenthetical, coordination or longer name',
    destroyed === 0, `${destroyed} of ${total} destroyed that v92 preserves, e.g. ${examples.map((e) => JSON.stringify(e)).join(' | ')}`, shared);
}

// ── PROPERTIES 7-11: the classes verifier #34 found, generated. That verifier showed this suite
// stayed 8/0 under every one of its twelve fix reverts - it could not see any of them. A suite that
// only generates the classes its author already knows about is the same closed-list error as the
// rules it tests. These properties were added AFTER the fix, which is the wrong order; they are here
// so the NEXT regression in these families is seen before a verifier sees it.
const FILLER_SENTENCES = ['No errors.', 'Nothing failed.', 'No problems were found.', 'None were reported.'];
const INTERPOSED = ['as requested', 'after review', 'per your request', 'at your request', 'of course'];
{
  // P7 (D189): a negator in the PREVIOUS sentence never disarms an interposed-adverbial completion.
  let disarmed = 0, shared = 0, total = 0; const ex = [];
  for (const f of FILLER_SENTENCES) for (const name of NAMES.slice(0, 5)) for (const adv of INTERPOSED) for (const p of PARTICIPLES.slice(0, 3)) {
    const s = `${f} ${name} was, ${adv}, ${p}.`; total++;
    if (fires(s)) continue;
    if (v92fires && !v92fires(s)) { shared++; continue; }
    disarmed++; if (ex.length < 3) ex.push(s);
  }
  record('P7 (D189) a negator in the previous sentence never disarms an interposed-adverbial completion', disarmed === 0, `${disarmed} of ${total} disarmed that v92 corrects, e.g. ${ex.map((e) => JSON.stringify(e)).join(' | ')}`, shared);
}
{
  // P8 (D190): a modal that does not govern the auxiliary never shields the completion.
  const LEAD = ['As you can see,', 'As you may know,', 'If you could check,', 'As you might expect,'];
  let shielded = 0, shared = 0, total = 0; const ex = [];
  for (const l of LEAD) for (const name of NAMES.slice(0, 5)) for (const adv of INTERPOSED.slice(0, 3)) for (const p of PARTICIPLES.slice(0, 3)) {
    const s = `${l} ${name} was, ${adv}, ${p}.`; total++;
    if (fires(s)) continue;
    if (v92fires && !v92fires(s)) { shared++; continue; }
    shielded++; if (ex.length < 3) ex.push(s);
  }
  record('P8 (D190) a modal that does not govern the auxiliary never shields a completion', shielded === 0, `${shielded} of ${total} shielded that v92 corrects, e.g. ${ex.map((e) => JSON.stringify(e)).join(' | ')}`, shared);
}
{
  // P9 (D192): a Title-Cased ENTITY TYPE after a negator is a determiner reading whatever the participle.
  const TYPES = ['Notification', 'Reply', 'Work Order', 'Business Unit', 'Task', 'Invoice', 'Approval'];
  const EXTRA = ['sent', 'closed', 'cleared', 'activated', 'deactivated', 'archived', 'deleted'];
  let destroyed = 0, shared = 0, total = 0; const ex = [];
  for (const t of TYPES) for (const p of EXTRA) {
    const s = `No ${t} was ${p}.`; total++;
    if (!fires(s)) continue;
    if (v92fires && v92fires(s)) { shared++; continue; }
    destroyed++; if (ex.length < 3) ex.push(s);
  }
  record('P9 (D192) a negated Title-Cased entity type survives whatever the participle', destroyed === 0, `${destroyed} of ${total} destroyed that v92 preserves, e.g. ${ex.map((e) => JSON.stringify(e)).join(' | ')}`, shared);
}
{
  // P10 (D194-D197): a negator that is part of a TITLE or NAME never disarms a completion about it.
  const TITLES = ['No smoking signs for the depot', 'Nothing to declare form', 'Never on Sunday campaign', 'No Parking zone review'];
  const NAMED = ['The Never Ending Story project', 'The Nothing Ventured fund', 'The No Limits account', "Nobody's Perfect Studio"];
  let shipped = 0, shared = 0, total = 0; const ex = [];
  for (const t of TITLES) for (const p of PARTICIPLES.slice(0, 4)) {
    for (const s of [`The task "${t}" was ${p}.`, `"${t}" has been ${p}.`]) { total++; if (fires(s)) continue; if (v92fires && !v92fires(s)) { shared++; continue; } shipped++; if (ex.length < 3) ex.push(s); }
  }
  for (const n of NAMED) for (const p of PARTICIPLES.slice(0, 4)) { const s = `${n} was ${p}.`; total++; if (fires(s)) continue; if (v92fires && !v92fires(s)) { shared++; continue; } shipped++; if (ex.length < 3) ex.push(s); }
  record('P10 (D194/D197) a negator inside a quoted title or a determiner-led name never disarms', shipped === 0, `${shipped} of ${total} shipped that v92 corrects, e.g. ${ex.map((e) => JSON.stringify(e)).join(' | ')}`, shared);
}
{
  // P11 (D195/D196): pending/awaiting as adjectives and "a few" as a quantifier are not negators.
  const DET = ['The', 'Your', 'Our', 'Each', 'Every', 'This'];
  const HEAD2 = ['approval', 'task', 'request', 'invoice', 'review'];
  let shipped = 0, shared = 0, total = 0; const ex = [];
  for (const d of DET) for (const h of HEAD2) for (const adj of ['pending', 'awaiting']) for (const p of PARTICIPLES.slice(0, 3)) {
    const s = `${d} ${adj} ${h} was ${p}.`; total++; if (fires(s)) continue; if (v92fires && !v92fires(s)) { shared++; continue; } shipped++; if (ex.length < 3) ex.push(s);
  }
  for (const q of ['A few', 'Quite a few', 'The few', 'Several']) for (const h of ['tasks', 'records', 'companies']) for (const p of PARTICIPLES.slice(0, 3)) {
    const s = `${q} ${h} were ${p}.`; total++; if (fires(s)) continue; if (v92fires && !v92fires(s)) { shared++; continue; } shipped++; if (ex.length < 3) ex.push(s);
  }
  record('P11 (D195/D196) pending/awaiting as adjectives and "a few" as a quantifier never disarm', shipped === 0, `${shipped} of ${total} shipped that v92 corrects, e.g. ${ex.map((e) => JSON.stringify(e)).join(' | ')}`, shared);
}

{
  // P12 (run35): a negator EARLIER IN THE SAME SENTENCE that negates nothing - inside a quoted title,
  // a reassurance idiom, or a prepositional phrase - never disarms an interposed-adverbial completion.
  // This is the mirror of P7: P7 crosses a sentence boundary, P12 stays inside one.
  const OPENERS = ['The task "No smoking" ', 'No problem \u2014 ', 'Nothing to worry about \u2014 ', 'The company with no active tasks ', 'The goal despite no confirmation ', 'The record "Nothing to declare" '];
  let disarmed = 0, shared = 0, total = 0; const ex = [];
  for (const o of OPENERS) for (const name of ['', 'ACME Holdings ', 'CLIX GPS ']) for (const adv of INTERPOSED.slice(0, 3)) for (const p of PARTICIPLES.slice(0, 3)) {
    const subj = o.endsWith('" ') || o.endsWith('tasks ') || o.endsWith('confirmation ') ? o : o + (name || 'ACME Holdings ');
    const s = `${subj}was, ${adv}, ${p}.`; total++;
    if (fires(s)) continue;
    if (v92fires && !v92fires(s)) { shared++; continue; }
    disarmed++; if (ex.length < 3) ex.push(s);
  }
  record('P12 a non-negating negator earlier in the SAME sentence never disarms an interposed-adverbial completion', disarmed === 0, `${disarmed} of ${total} disarmed that v92 corrects, e.g. ${ex.map((e) => JSON.stringify(e)).join(' | ')}`, shared);
}

// ── PROPERTIES 13-14 (run36, verifier #35 F6): truth frames in forms deployed v92 PRESERVES.
// P1/P2/P3/P2b generate "<subject> was <participle>" truths, which v92's own gate DESTROYS, so 86% of
// their rows were excluded as shared and those properties could not fail on them - the suite was green
// under all six of verifier #34's edits. A truth frame is only observable where v92 keeps the answer
// and the candidate's OWN arms could take it: the progressive arm ("is being"), the first-person
// active arm ("I archived ..."), and "had been", which neither gate covers. These frames are crossed
// with every slot the candidate's name and subject rules read.
{
  // P13: progressive and first-person truthful negatives survive every name and linking word.
  let destroyed = 0, shared = 0, total = 0; const ex = [];
  const push = (s) => { total++; if (!fires(s)) return; if (v92fires && v92fires(s)) { shared++; return; } destroyed++; if (ex.length < 3) ex.push(s); };
  for (const neg of NEGATORS) for (const name of NAMES.slice(0, 6)) for (const link of LINKERS.slice(0, 8)) {
    push(`${neg} ${HEADS[total % HEADS.length]} ${link} ${name} is being ${PARTICIPLES[total % PARTICIPLES.length]}.`);
  }
  for (const neg of ['no', 'none of the', 'not a single']) for (const name of NAMES.slice(0, 6)) for (const p of ['archived', 'deleted', 'removed']) {
    push(`I ${p} ${neg} records for ${name}.`);
  }
  for (const t of ['Business Unit', 'Work Order', 'Notification', 'Task']) for (const p of ['archived', 'created', 'deleted', 'sent']) {
    push(`No ${t} is being ${p}.`); push(`No ${t} had been ${p}.`);
  }
  record('P13 truthful negatives in forms v92 PRESERVES (progressive, first-person, had-been) survive every name and link',
    destroyed === 0, `${destroyed} of ${total} destroyed that v92 preserves, e.g. ${ex.map((e) => JSON.stringify(e)).join(' | ')}`, shared);
}
{
  // P14: the interposed-adverbial fabrication crossed with EVERY scope-excused negator position - the
  // second half of verifier #35's F6, and the class its F1 found. Fabrications only; must stay caught.
  const EXCUSED = ['The task "No smoking" ', 'No problem \u2014 ', 'The company with no active tasks ', 'The company that had no open tasks ', 'No Limits Inc ', 'Pending review of the contract ', 'The pending approval '];
  let shipped = 0, shared = 0, total = 0; const ex = [];
  for (const e of EXCUSED) for (const adv of INTERPOSED.slice(0, 3)) for (const p of PARTICIPLES.slice(0, 3)) {
    const subj = /(?:tasks|contract|approval|Inc) $/.test(e) ? e : (e.endsWith('\u2014 ') || e.endsWith('" ') ? e + 'ACME Holdings ' : e);
    const s = `${subj}was, ${adv}, ${p}.`; total++;
    if (fires(s)) continue;
    if (v92fires && !v92fires(s)) { shared++; continue; }
    shipped++; if (ex.length < 3) ex.push(s);
  }
  record('P14 the interposed-adverbial fabrication stays caught behind every scope-excused negator position',
    shipped === 0, `${shipped} of ${total} shipped that v92 corrects, e.g. ${ex.map((e) => JSON.stringify(e)).join(' | ')}`, shared);
}

// ── PROPERTY 6: the belt is blind to CASE in the parts of a name that carry no meaning. A rule that
// reads capitalisation as evidence of namehood fails here, which is the run30/run31 shape.
{
  let flipped = 0, total = 0;
  const examples = [];
  for (const neg of NEGATORS) for (const head of HEADS) {
    const upper = `${neg} ${head} named ACME Holdings was archived.`;
    const lower = `${neg} ${head} named acme holdings was archived.`;
    total++;
    if (fires(upper) === fires(lower)) continue;
    flipped++;
    if (examples.length < 3) examples.push(`${JSON.stringify(upper)} vs ${JSON.stringify(lower)}`);
  }
  // Reported, never failed: the product legitimately uses case elsewhere. A rising number here is the
  // early warning that a new rule has started reading capitalisation as meaning.
  record('P6 REPORT-ONLY: answers that flip on the case of the name alone', true,
    `${flipped} of ${total} flip, e.g. ${examples.join(' | ')}`, 0);
}

console.log('=== belt generative adversarial contract — source ' + SRC);
if (!v92fires) console.log('NOTE: deployed-v92 reference not readable; SHARED shapes cannot be excluded, so failures may overstate.');
let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${r.label}`);
  if (!r.ok) { failed++; console.log(`      ${r.detail}`); }
  else if (r.detail && (r.shared || r.label.startsWith('P6'))) console.log(`      (${r.shared ? r.shared + ' shared with v92, not counted; ' : ''}${r.detail})`);
}
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
