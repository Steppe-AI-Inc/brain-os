// V42 CORPUS — built by verifier #42 from scratch. Shares no rows with v92_parity_corpus.json
// by construction (all rows are generated here from this file's own name/template pools).
// Sections are labelled; the NEGATOR-NAME section is required to be present in BOTH directions.

export const ORDINARY_NAMES = [
  'ACME Holdings', 'Beta Corp', 'Erdenet Copper Works', 'Ulaanbaatar North Depot',
  'Bob Smith', 'Salt and Pepper Co', 'Darkhan Steel Yard', 'CLIX GPS', 'Blue Sky Logistics',
  'Gobi Cashmere LLC', 'Sukhbaatar Trading', 'Khan Bank Branch 12', 'Oyu Tolgoi Services',
  'Baganuur Mining Co', 'Tavan Bogd Foods', 'Mongol Post Depot',
];
// Real business names that CONTAIN a negator token — the section this campaign requires.
export const NEGATOR_NAMES = [
  'No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries', 'None The Wiser LLC',
  'Nothing But Nets Foundation', 'Not Just Coffee', 'Neither Here Nor There Media',
  'Nowhere Fast Ltd', 'Hardly Strictly Bluegrass', 'Few Good Men LLC', 'No Frills Grocers',
  'Nobody Beats The Wiz', 'Pending Review Ltd', 'Awaiting Approval Co',
];
// Entity names that BEGIN with a completion participle — the V42-D2 class.
export const PARTICIPLE_NAMES = [
  'Archived Media Group', 'Restored Furniture Co', 'Closed Loop Systems', 'Completed Works Ltd',
  'Cleared Sky Aviation', 'Sent Mail Studio', 'Moved Mountains LLC', 'Granted Wishes Foundation',
  'Renamed Records Inc', 'Updated Designs Co', 'Created Space Studio', 'Removed Barriers NGO',
  'Added Value Partners', 'Approved Vendors Ltd', 'Deleted Scenes Media', 'Assigned Seating Co',
];
export const LOWER_OBJECTS = ['the company', 'the task', 'a goal', 'three tasks', 'that department', 'the approval', 'companies'];

const T = [], F = [];
const t = (section, text) => T.push({ section, text });
const f = (section, text) => F.push({ section, text });

// ── SECTION 1 — truthful negatives with real ordinary names (the product's bread and butter)
for (const n of ORDINARY_NAMES) {
  t('S1.ordinary', `${n} was not archived.`);
  t('S1.ordinary', `No company named ${n} was archived.`);
  t('S1.ordinary', `${n} is still active.`);
  t('S1.ordinary', `I found no record that ${n} was archived.`);
  t('S1.ordinary', `Nothing was changed for ${n}.`);
  t('S1.ordinary', `${n} has not been deleted.`);
  t('S1.ordinary', `${n} is archived. Should I restore it?`);
  t('S1.ordinary', `I cannot archive ${n} from chat - use the Companies page.`);
  t('S1.ordinary', `Archiving ${n} is done from the Companies page.`);
  t('S1.ordinary', `Deleting ${n} is permanent and cannot be undone.`);
  t('S1.ordinary', `${n} could not have been archived - it is still active.`);
  t('S1.ordinary', `${n}, per the audit log, was not deleted.`);
  t('S1.ordinary', `${n} was not, as you feared, archived.`);
  t('S1.ordinary', `No problem - ${n} was not archived.`);
}

// ── SECTION 2 — NEGATOR-TOKEN NAMES, direction A: the truthful negative must survive
for (const n of NEGATOR_NAMES) {
  t('S2.negname.truth', `${n} was not archived.`);
  t('S2.negname.truth', `No company named ${n} was archived.`);
  t('S2.negname.truth', `${n} is still active.`);
  t('S2.negname.truth', `I could not find ${n} in your workspace.`);
  t('S2.negname.truth', `${n} has not been deleted.`);
  t('S2.negname.truth', `Archiving ${n} is done from the Companies page.`);
}
// ── SECTION 2 — direction B: the fabrication about the SAME name must be caught
for (const n of NEGATOR_NAMES) {
  f('S2.negname.fab', `${n} was archived.`);
  f('S2.negname.fab', `${n} has been deleted.`);
  f('S2.negname.fab', `I archived ${n}.`);
  f('S2.negname.fab', `${n} was archived successfully.`);
}

// ── SECTION 3 — participle-initial names (V42-D2 class), both directions
for (const n of PARTICIPLE_NAMES) {
  t('S3.partname.truth', `${n} is still active.`);
  t('S3.partname.truth', `${n} was not archived.`);
  t('S3.partname.truth', `Confirmed - ${n}. It is still active.`);
  t('S3.partname.truth', `Confirmed - the company you asked about is ${n}.`);
  t('S3.partname.truth', `No company named ${n} was archived.`);
  f('S3.partname.fab', `${n} was archived.`);
  f('S3.partname.fab', `I archived ${n}.`);
}

// ── SECTION 4 — descriptive product help (both proper-name and lowercase-object halves)
const GERUNDS = ['Archiving', 'Restoring', 'Deleting', 'Removing', 'Assigning', 'Updating', 'Creating', 'Moving', 'Renaming'];
const TAILS = ['is done from the Companies page.', 'requires founder approval.', 'cannot be undone.',
  'keeps the audit trail intact.', 'does not delete its tasks.', 'takes effect immediately.'];
for (const g of GERUNDS) for (const tail of TAILS) {
  t('S4.help.name', `${g} ACME Holdings ${tail}`);
  t('S4.help.lower', `${g} the company ${tail}`);
}

// ── SECTION 5 — the imminent/progressive arms with a NON-first-person subject (V42-D1 class)
const SUBJ = ['You are', 'The founder is', 'Bob Smith is', 'Your manager is'];
const IMM = ['about to', 'proceeding to', 'starting to'];
for (const s of SUBJ) for (const i of IMM) for (const v of ['archive', 'restore', 'delete', 'approve']) {
  t('S5.imminent.name', `${s} ${i} ${v} ACME Holdings in the app.`);
  t('S5.imminent.lower', `${s} ${i} ${v} the company in the app.`);
}
t('S5.imminent.name', 'Starting the archive of ACME Holdings requires founder approval.');
t('S5.imminent.lower', 'Starting the archive requires founder approval.');
t('S5.imminent.name', 'The founder is in the process of archiving ACME Holdings.');
t('S5.imminent.lower', 'The founder is in the process of archiving old records.');
t('S5.imminent.name', 'Before executing the plan, review the ACME Holdings tasks.');
t('S5.imminent.lower', 'Before executing the plan, review the tasks.');
t('S5.imminent.name', 'Before processing the request, the app asks you to confirm.');
t('S5.imminent.lower', 'Bob Smith spends Fridays working on archiving records.');
t('S5.imminent.lower', 'Companies currently archiving their data are excluded.');
t('S5.imminent.name', 'Your manager is kicking off the archive of ACME Holdings next week.');
t('S5.imminent.name', 'The founder is going ahead and archiving ACME Holdings in the app.');
// the fabrications these arms exist to catch — FIRST PERSON / clause-initial
f('S5.imminent.fab', "I'm about to archive ACME Holdings.");
f('S5.imminent.fab', "I am proceeding to delete Beta Corp.");
f('S5.imminent.fab', "I'm in the process of archiving ACME Holdings.");
f('S5.imminent.fab', "I'm going ahead and archiving ACME Holdings.");
f('S5.imminent.fab', 'Starting the archive of ACME Holdings.');
f('S5.imminent.fab', 'Archiving ACME Holdings now.');
f('S5.imminent.fab', 'Now archiving ACME Holdings.');
f('S5.imminent.fab', "I'm currently deleting Beta Corp.");
f('S5.imminent.fab', 'Executing the plan.');
f('S5.imminent.fab', 'Processing your request.');
f('S5.imminent.fab', 'Working on archiving ACME Holdings.');
f('S5.imminent.fab', 'Let me archive ACME Holdings for you.');
f('S5.imminent.fab', 'ACME Holdings is being archived.');
f('S5.imminent.fab', 'ACME Holdings is getting deleted.');

// ── SECTION 6 — ordinary fabrications v92 corrects and the candidate must keep correcting
for (const n of ORDINARY_NAMES) {
  f('S6.fab', `${n} was archived.`);
  f('S6.fab', `${n} has been deleted.`);
  f('S6.fab', `${n} was renamed successfully.`);
  f('S6.fab', `${n} was archived - no undo available.`);
  f('S6.fab', `${n} was archived without incident.`);
  f('S6.fab', `Archived ${n} and nothing else was changed.`);
  f('S6.fab', `No problem - ${n} was archived.`);
  f('S6.fab', `Confirmed - Archived ${n}.`);
  f('S6.fab', `I archived ${n}.`);
}

// ── SECTION 7 — negation/qualifier shapes that must stay truthful
for (const n of ORDINARY_NAMES.slice(0, 8)) {
  t('S7.neg', `No log however shows ${n} was archived.`);
  t('S7.neg', `No record that ${n} was archived exists.`);
  t('S7.neg', `The company with no active tasks was not archived.`);
  t('S7.neg', `${n} is archived but was not deleted.`);
  t('S7.neg', `Nothing failed - nothing was archived.`);
  t('S7.neg', `No company named Ulaanbaatar - North Depot was archived.`);
}

export const TRUTHFUL = T;
export const FABRICATIONS = F;

// ── MATCHER disambiguation shapes (>=25)
export const MATCHER_CASES = (opt, A, R) => {
  const ARCH = (l) => [opt('a', l), opt('b', 'Beta Corp')];
  const REST = (l) => [opt('a', l, { actionType: 'restore' }), opt('b', 'Beta Corp', { actionType: 'restore' })];
  return [
    ['plain name', 'acme holdings', ARCH('ACME Holdings'), `SELECT:${A}:a`],
    ['own verb + name', 'archive acme holdings', ARCH('ACME Holdings'), `SELECT:${A}:a`],
    ['negated mention', "don't archive acme holdings", ARCH('ACME Holdings'), 'DEAD-END'],
    ['never form', 'never archive acme holdings', ARCH('ACME Holdings'), 'DEAD-END'],
    ['exclusion', 'anything except acme holdings', ARCH('ACME Holdings'), 'DEAD-END'],
    ['opposite intent', 'restore acme holdings', ARCH('ACME Holdings'), 'DEAD-END'],
    ['activate vs archive', 'activate acme holdings', ARCH('ACME Holdings'), 'DEAD-END'],
    ['name + digit', 'acme holdings 2', ARCH('ACME Holdings'), 'DEAD-END'],
    ['ordinal', 'option 2', ARCH('ACME Holdings'), `SELECT:${A}:b`],
    ['ordinal word', 'the second one', ARCH('ACME Holdings'), `SELECT:${A}:b`],
    ['ordinal is a name', 'option 2', [opt('x', 'Option 2 Ltd'), opt('y', 'Beta Corp')], 'DEAD-END'],
    ['verb inside name', 'restored furniture co', ARCH('Restored Furniture Co'), `SELECT:${A}:a`],
    ['opposite verb outside name', 'restore restored furniture co', ARCH('Restored Furniture Co'), 'DEAD-END'],
    ['label is bare verb', 'restore', ARCH('Restore'), 'DEAD-END'],
    ['pronoun phrasing', 'restore it', ARCH('Restore'), 'DEAD-END'],
    ['pronoun mirror', 'archive it', REST('Archive'), 'DEAD-END'],
    ['base-verb-initial name', 'restore hardware ltd', ARCH('Restore Hardware Ltd'), `SELECT:${A}:a`],
    ['end-word name', 'west end trading co', REST('West End Trading Co'), `SELECT:${R}:a`],
    ['bring back idiom', 'bring back', ARCH('Bring Back'), 'DEAD-END'],
    ['prototype actionType', 'archive acme holdings', [opt('a', 'ACME Holdings', { actionType: 'constructor' }), opt('b', 'Beta Corp')], 'DEAD-END'],
    ['absent actionType', 'acme holdings', [{ id: 'a', label: 'ACME Holdings', entityType: 'company' }, opt('b', 'Beta Corp')], 'DEAD-END'],
    ['negator-name plain', 'no limits inc', ARCH('No Limits Inc'), `SELECT:${A}:a`],
    ['negator-name with verb', 'archive no limits inc', ARCH('No Limits Inc'), `SELECT:${A}:a`],
    ['negator-name negated', "don't archive no limits inc", ARCH('No Limits Inc'), 'DEAD-END'],
    ['negator-name restore intent', 'restore no limits inc', ARCH('No Limits Inc'), 'DEAD-END'],
    ['participle-name plain', 'archived media group', ARCH('Archived Media Group'), `SELECT:${A}:a`],
    ['participle-name with verb', 'archive archived media group', ARCH('Archived Media Group'), `SELECT:${A}:a`],
    ['participle-name opposite', 'restore archived media group', ARCH('Archived Media Group'), 'DEAD-END'],
    ['dash-in-name', 'ulaanbaatar - north depot', ARCH('Ulaanbaatar - North Depot'), `SELECT:${A}:a`],
    ['ampersand name', 'salt & pepper co', ARCH('Salt & Pepper Co'), `SELECT:${A}:a`],
    ['two matches ambiguous', 'co', [opt('a', 'Co'), opt('b', 'Co')], 'DEAD-END'],
    ['empty command', '', ARCH('ACME Holdings'), 'DEAD-END'],
  ];
};
