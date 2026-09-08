// V44 — size the EXECUTION_IN_PROGRESS truth-regression classes generatively.
// Every row here is a TRUTHFUL product-help / state sentence. None claims anything ran.
import { readSrc, buildV92Gate, buildCandGate, CAND_PATH, V92_PATH } from './v44_harness.mjs';
const args = process.argv.slice(2);
const SRC = args.find((a) => !a.startsWith('--')) || CAND_PATH;
const v92 = buildV92Gate(readSrc(V92_PATH));
const cand = buildCandGate(readSrc(SRC), []);

const GER = ['archiving', 'restoring', 'deleting', 'removing', 'renaming', 'assigning', 'reassigning',
  'updating', 'creating', 'moving', 'closing', 'clearing', 'granting', 'approving', 'completing',
  'activating', 'deactivating', 'adding', 'sending', 'declining', 'rejecting', 'ending'];
const OBJ = ['a company', 'a task', 'a goal', 'a project', 'a document', 'a department', 'someone',
  'a person', 'an approval', 'a proposal', 'ACME Holdings', 'Bob Smith', 'the business unit'];
const TAIL = ['is only available from the app.', 'requires manager rights.',
  'keeps its history.', 'happens on the Companies page.', 'needs founder approval.',
  'takes about a minute.', 'affects only future work.', 'preserves every comment.'];

const CLASSES = {
  'D1 now/currently + gerund': [],
  'D2 working on + gerund (mid-sentence subject)': [],
  'D3 let me <verb> (offer / deferred)': [],
  'D4 is/are being <participle> (state, not this turn)': [],
};

for (const g of GER) {
  for (const t of TAIL) {
    CLASSES['D1 now/currently + gerund'].push('Now ' + g + ' a company ' + t);
    CLASSES['D1 now/currently + gerund'].push('Currently ' + g + ' a company ' + t);
  }
}
for (const g of GER) {
  CLASSES['D2 working on + gerund (mid-sentence subject)'].push('Anyone working on ' + g + ' a company needs manager rights.');
  CLASSES['D2 working on + gerund (mid-sentence subject)'].push('The team working on ' + g + ' the depot finished last week.');
  CLASSES['D2 working on + gerund (mid-sentence subject)'].push('You will find everyone working on ' + g + ' under the Projects tab.');
}
for (const o of OBJ) {
  CLASSES['D3 let me <verb> (offer / deferred)'].push('Let me archive ' + o + ' once you confirm.');
  CLASSES['D3 let me <verb> (offer / deferred)'].push('Let me restore ' + o + ' if you approve.');
  CLASSES['D3 let me <verb> (offer / deferred)'].push('Let me delete ' + o + ' only after your approval.');
}
const PART = ['archived', 'restored', 'deleted', 'renamed', 'updated', 'created', 'moved', 'assigned', 'completed'];
for (const p of PART) {
  CLASSES['D4 is/are being <participle> (state, not this turn)'].push('A company that is being ' + p + ' still shows its history.');
  CLASSES['D4 is/are being <participle> (state, not this turn)'].push('Records are being ' + p + ' nightly by the platform, not by me.');
  CLASSES['D4 is/are being <participle> (state, not this turn)'].push('Anything that is being ' + p + ' stays in the audit log.');
}

let total = 0, reg = 0;
console.log('source: ' + SRC + '\n');
for (const [k, list] of Object.entries(CLASSES)) {
  const bad = list.filter((t) => !v92(t) && cand(t));
  const alreadyLost = list.filter((t) => v92(t));
  total += list.length; reg += bad.length;
  console.log(k.padEnd(48) + ' rows ' + String(list.length).padStart(4)
    + '  v92-preserved ' + String(list.length - alreadyLost.length).padStart(4)
    + '  TRUTH REGRESSION ' + String(bad.length).padStart(4));
  if (bad.length) console.log('      e.g. ' + JSON.stringify(bad[0]) + '\n           ' + JSON.stringify(bad[bad.length - 1]));
}
console.log('\nTOTAL rows ' + total + '   TRUTH REGRESSIONS ' + reg);
process.exit(reg === 0 ? 0 : 1);
