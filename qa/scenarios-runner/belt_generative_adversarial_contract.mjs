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

const results = [];
const record = (label, ok, detail, shared) => results.push({ label, ok, detail, shared });

// ── PROPERTY 1: a truthful negative stays truthful whatever the LINKING WORD is.
// The link is what keeps the negator scoping over the completion. Which link is used is irrelevant,
// so the belt's answer must not vary across this slot. This is the run33 defect, generatively.
{
  let destroyed = 0, shared = 0, total = 0;
  const examples = [];
  for (const neg of NEGATORS) for (const link of LINKERS) for (const name of NAMES.slice(0, 4)) {
    const s = `${neg} ${HEADS[total % HEADS.length]} ${link} ${name} was ${PARTICIPLES[total % PARTICIPLES.length]}.`;
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
    const s = `${neg} ${HEADS[total % HEADS.length]} named ${name} was ${PARTICIPLES[total % PARTICIPLES.length]}.`;
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
    push(`${neg} ${name} ${head} was ${PARTICIPLES[total % PARTICIPLES.length]}.`);
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
    const s = `${name} was not, ${adv}, ${p}.`;
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
