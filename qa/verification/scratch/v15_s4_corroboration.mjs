// VERIFIER #15 — SCENARIO 4 + 8 + THE FOUNDER-DIRECTED SCENARIO.
// Runs the REAL D113 decision (extracted verbatim from index.ts, byte-asserted) over the
// same label set TWICE: once with a canonical row behind the id (PRESENT branch) and once
// without (ABSENT branch). Reports, as separate numbers, how many REAL NAMES are destroyed
// and how many EXECUTION ASSERTIONS survive, per branch.

import { readSource, buildLabelGate } from './v15_extract.mjs';

const { text } = readSource();
const build = buildLabelGate(text);
const ID = '11111111-1111-4111-8111-111111111111';

// PRESENT: the canonical read knows this id and says the row is called `canonicalName`.
// ABSENT : the canonical read has nothing for this id.
function render(label, canonicalName) {
  const maps = canonicalName
    ? { canonicalById: new Map([[`company|${ID}`, { name: canonicalName }]]) }
    : {};
  const g = build(maps);
  const o = { id: ID, entityType: 'company', label };
  return g.gateOneOption(o, 0);
}

const bare = (s) => String(s).replace(/[“”‘’"']/g, '').trim().toLowerCase();
const isTypedFallback = (s) => /^(the [a-z ]+|option \d+)$/i.test(String(s).trim());

// ---------------------------------------------------------------------------------
// SET 1 — EXECUTION ASSERTIONS. These are model-authored claims, never names.
// A SURVIVING assertion means the founder is shown a fabricated completion as a label.
// ---------------------------------------------------------------------------------
const ASSERTIONS = [
  'Terminated Bob Smith',
  'ACME Deleted',
  'Deleted ACME',
  'I archived ACME, ok?',
  'Now removing ACME.',
  "I'm now removing ACME.",
  'Confirmed — the company is not archived',
  'Wiped All Data',
  'Revoked Access',
  'Suspended Bob Smith',
  'Disabled the account',
  'Purged the records',
  'Archived ACME',
  'Restored Bob Smith',
  'Assigned the task to Bob',
  'Approved the request',
  'Removed Bob from ACME',
  'Completed the migration',
];

// ---------------------------------------------------------------------------------
// SET 2 — REAL ENTITY NAMES. Legitimate company/person names that happen to contain
// completion vocabulary. These must survive when the canonical read confirms them.
// ---------------------------------------------------------------------------------
const REAL_NAMES = [
  'Closed Loop Systems',
  'Deleted Scenes Media',
  'Archived Media Group',
  'Terminated Cable Co',
  'Completed Works Ltd',
  'Assigned Risk Insurance',
  'Removed Solutions LLC',
  'Restored Timber Co',
  'Approved Vendors Inc',
  'Closed Circuit Security',
  'Bob Smith',
  'ACME Holdings',
  'Advanced Closed Systems',
];

function measure(branchName, useCanonical) {
  console.log(`\n############ ${branchName} ############`);
  let assertionsSurvive = 0, realNamesDestroyed = 0;

  console.log('--- execution assertions (must NOT survive verbatim) ---');
  for (const a of ASSERTIONS) {
    const canonical = useCanonical ? 'ACME Holdings' : null;
    const out = render(a, canonical);
    const survived = bare(out) === bare(a);
    if (survived) assertionsSurvive++;
    console.log(`${survived ? 'SURVIVES ' : 'replaced '} ${JSON.stringify(a)} -> ${JSON.stringify(out)}`);
  }

  console.log('--- real names (must survive / stay identifiable) ---');
  for (const n of REAL_NAMES) {
    // In the PRESENT branch the canonical row IS this name, which is the whole point.
    const canonical = useCanonical ? n : null;
    const out = render(n, canonical);
    const identifiable = bare(out) === bare(n);
    if (!identifiable) realNamesDestroyed++;
    console.log(`${identifiable ? 'survives ' : 'DESTROYED'} ${JSON.stringify(n)} -> ${JSON.stringify(out)}${isTypedFallback(out) ? '   (typed fallback — identity lost)' : ''}`);
  }

  console.log(`\n>>> ${branchName}: execution assertions surviving = ${assertionsSurvive}/${ASSERTIONS.length}`);
  console.log(`>>> ${branchName}: real names destroyed          = ${realNamesDestroyed}/${REAL_NAMES.length}`);
  return { assertionsSurvive, realNamesDestroyed };
}

const present = measure('BRANCH A — CANONICAL ROW EXISTS', true);
const absent = measure('BRANCH B — NO CANONICAL ROW', false);

// ---------------------------------------------------------------------------------
// SCENARIO 4 — targeted probes of the corroboration path itself.
// ---------------------------------------------------------------------------------
console.log('\n############ SCENARIO 4 — corroboration probes ############');
const probes = [
  ['fabricated label matching ANOTHER real entity name',
    () => render('Beta Corporation', 'ACME Holdings'),
    'must render ACME Holdings — the id\'s own canonical name'],
  ['id absent from the canonical read, benign label',
    () => render('ACME Holdings.', null), 'run8/D72b: keeps its repair'],
  ['id absent, assertion-shaped label inside COMPLETION_WORD',
    () => render('Archived ACME', null), 'rule 2 must replace'],
  ['id absent, assertion OUTSIDE the 24-word list',
    () => render('Terminated Bob Smith', null), 'THE REMAINING LEXICAL HOLE'],
  ['empty canonical read + empty label',
    () => render('', null), 'must not blank the option'],
  ['canonical name is itself completion-shaped',
    () => render('Closed Loop Systems', 'Closed Loop Systems'), 'must survive'],
  ['label is a CASE variant of the canonical name',
    () => render('ACME HOLDINGS', 'ACME Holdings'), 'bare() lowercases — agrees'],
  ['label is a WHITESPACE variant of the canonical name',
    () => render('ACME  Holdings', 'ACME Holdings'), 'bare() does NOT collapse inner runs'],
  ['label is a QUOTED variant of the canonical name',
    () => render('“ACME Holdings”', 'ACME Holdings'), 'bare() strips quotes — agrees'],
  ['label is a CYRILLIC confusable of the canonical name',
    () => render('АСМЕ Holdings', 'ACME Holdings'), 'must render the canonical spelling'],
  ['label CONTAINS the canonical name plus a fabricated verb',
    () => render('Terminated Bob Smith', 'Bob Smith'), 'equality, not containment — must replace'],
];
for (const [name, thunk, note] of probes) {
  let out; try { out = thunk(); } catch (e) { out = 'THREW ' + e.message; }
  console.log(`  ${name}\n      -> ${JSON.stringify(out)}   (${note})`);
}

console.log('\n############ SUMMARY ############');
console.log(`BRANCH A (canonical row EXISTS): real names destroyed = ${present.realNamesDestroyed}/${REAL_NAMES.length}, execution assertions surviving = ${present.assertionsSurvive}/${ASSERTIONS.length}`);
console.log(`BRANCH B (NO canonical row)    : real names destroyed = ${absent.realNamesDestroyed}/${REAL_NAMES.length}, execution assertions surviving = ${absent.assertionsSurvive}/${ASSERTIONS.length}`);
