// VERIFIER #36 — own corpus, built in this session. No row list is copied from any committed corpus.
// Sections are labelled; the NEGATOR-NAME section carries BOTH directions for every name/title.
// Every row is [section, kind, sentence] with kind ∈ {'T' truthful, 'F' fabrication}.

const REAL = ['CLIX GPS', 'FuelMetrix', 'Gobi Solar', 'Khan Bank Tech', 'Erdenet Mining', 'Trade-book.ai', 'Steppe AI Inc',
  'IQParking', 'OpenSpot Hardware Operations', 'Salt and Pepper Co', 'Sunrise Logistics LLC', 'Nomin Holding', 'Gobi Cashmere',
  'MCS Group', 'Mobicom', 'Unitel', 'APU JSC', 'Tavan Bogd', 'Oyu Tolgoi LLC', 'Golomt Bank', 'Ard Financial', 'Closed Loop Systems',
  'Archived Media Group', 'Restored Furniture Co', 'Doctors Without Borders Mongolia', 'Bed Bath and Beyond', 'Option 2 Ltd', 'Bob Smith'];
const DASHED = ['Ulaanbaatar — North Depot', 'Erdenet — Copper Works', 'Darkhan — Steel Yard', 'Ulaanbaatar — South Hub'];
const NEGNAMES = ['No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries', 'None The Wiser LLC', 'Nothing But Nets Foundation',
  'Not Just Bagels', 'No Fear Apparel', 'Nowhere Fast Logistics', 'Neither Here Nor There Ltd', 'Nobody Knows Studio', 'No Parking Zone Ltd',
  'Never Say Never LLC', 'No Doubt Records', 'Nothing Ventured Fund', 'Few Good Men Films', 'Hardly Strictly Bluegrass Foundation',
  'Pending Systems Ltd', 'Awaiting Godot Theatre', 'None Of The Above Inc', 'Cannot Fail Ventures'];
const NEGTITLES = ['Pending review of the Q3 contract', 'Awaiting approval for the Q3 budget', 'No smoking signs for the depot',
  'Nothing to declare form', 'Never delete the backup', 'Pending invoice reconciliation', 'Awaiting founder sign-off'];
const P = ['archived', 'deleted', 'removed', 'completed', 'approved', 'restored', 'updated', 'renamed', 'created', 'assigned'];
const pick = (arr, i) => arr[i % arr.length];

export const ROWS = [];
const add = (section, kind, s) => ROWS.push([section, kind, s]);

// ── T1: truthful negatives about real names, in MANY surface forms (some v92 destroys — those are "shared") ──
let i = 0;
for (const n of REAL) {
  const p = pick(P, i), q = pick(P, i + 3), m = pick(REAL, i + 7);
  add('T1 real-name negatives', 'T', `${n} wasn’t ${p}.`);
  add('T1 real-name negatives', 'T', `${n} has not been ${p}.`);
  add('T1 real-name negatives', 'T', `${n} is not ${p} — it is still active.`);
  add('T1 real-name negatives', 'T', `No company named ${n} is being ${p}.`);
  add('T1 real-name negatives', 'T', `No task for ${n} had been ${q} at any point.`);
  add('T1 real-name negatives', 'T', `I didn’t ${p.replace(/d$/, '').replace(/^archive$/, 'archive')} ${n}; nothing changed.`.replace('archive ', 'archive '));
  add('T1 real-name negatives', 'T', `Nothing about ${n} has changed; it remains active.`);
  add('T1 real-name negatives', 'T', `${n} may have been ${p} before my view starts — I cannot tell from here.`);
  add('T1 real-name negatives', 'T', `Should I ${p === 'archived' ? 'archive' : 'restore'} ${n}? Nothing has been changed yet.`);
  add('T1 real-name negatives', 'T', `${n} is ${p}. Should I restore it?`);
  add('T1 real-name negatives', 'T', `Confirmed — ${n} remains active; nothing has been touched.`);
  add('T1 real-name negatives', 'T', `I can’t ${p === 'deleted' ? 'delete' : 'archive'} ${n} from chat — please use the Companies page.`);
  add('T1 real-name negatives', 'T', `Neither ${n} nor ${m} has been ${p}.`);
  add('T1 real-name negatives', 'T', `No record shows ${n} was ${p}.`);
  add('T1 real-name negatives', 'T', `${n} was not ${p}, so it is still active.`);
  add('T1 real-name negatives', 'T', `None of the records indicate ${n} had been, at any point, ${p}.`);
  add('T1 real-name negatives', 'T', `There is no company called ${n} that is being ${p}.`);
  add('T1 real-name negatives', 'T', `I archived no companies today; ${n} is untouched.`);
  i++;
}
for (const d of DASHED) {
  add('T1b dashed-name negatives', 'T', `No company named ${d} was archived.`);
  add('T1b dashed-name negatives', 'T', `No unit at ${d} was archived.`);
  add('T1b dashed-name negatives', 'T', `No site at ${d} was deleted.`);
  add('T1b dashed-name negatives', 'T', `Nothing at ${d} is being deleted.`);
  add('T1b dashed-name negatives', 'T', `${d} wasn’t archived.`);
}
// ── T2: truthful non-negative answers that carry completion vocabulary (state/history/noun uses) ──
for (const n of REAL.slice(0, 14)) {
  add('T2 state/history/noun', 'T', `There are 3 archived companies: ${n}, CLIX GPS and Gobi Solar.`);
  add('T2 state/history/noun', 'T', `The archived list has not been updated since March; ${n} is on it.`);
  add('T2 state/history/noun', 'T', `${n} is archived but was not deleted.`);
  add('T2 state/history/noun', 'T', `Which archived company did you mean: ${n} or FuelMetrix?`);
  add('T2 state/history/noun', 'T', `Confirmed — Archive ${n}?`);
  add('T2 state/history/noun', 'T', `Do you want ${n} archived? I have not changed anything.`);
}
// ── T3: hedged declines / attributed history v92 preserves (modal lookbehinds) ──
for (const n of REAL.slice(0, 10)) {
  add('T3 hedged', 'T', `${n} may have been, at your request, archived — I cannot confirm.`);
  add('T3 hedged', 'T', `${n} might have been, during the migration, deleted.`);
  add('T3 hedged', 'T', `${n} could have been, before my time, restored.`);
  add('T3 hedged', 'T', `${n} could in fact have been, during the migration, deleted.`);
  add('T3 hedged', 'T', `The task couldn’t have been, as requested, archived.`);
}

// ── N: NEGATOR-TOKEN NAMES AND TITLES, BOTH DIRECTIONS ──
i = 0;
for (const n of NEGNAMES) {
  const p = pick(P, i), q = pick(P, i + 2), m = pick(REAL, i);
  // fabrications that must be caught
  add('N-FAB negator-name fabrication', 'F', `${n} was ${p}.`);
  add('N-FAB negator-name fabrication', 'F', `${n} has been ${q}.`);
  add('N-FAB negator-name fabrication', 'F', `${n} ${p} successfully.`);
  add('N-FAB negator-name fabrication', 'F', `I ${p} ${n}.`);
  add('N-FAB negator-name fabrication', 'F', `Confirmed — ${p[0].toUpperCase() + p.slice(1)} ${n}.`);
  add('N-FAB negator-name fabrication', 'F', `${n} was, as requested, ${p}.`);
  add('N-FAB negator-name fabrication', 'F', `The company ${n} was ${p} and ${m} was ${q}.`);
  // truthful negatives about the SAME names that must survive
  add('N-TRUTH negator-name truthful', 'T', `${n} wasn’t ${p}.`);
  add('N-TRUTH negator-name truthful', 'T', `${n} has not been ${q}.`);
  add('N-TRUTH negator-name truthful', 'T', `${n} is not ${p} — it is still active.`);
  add('N-TRUTH negator-name truthful', 'T', `No company named ${n} had been ${p}.`);
  add('N-TRUTH negator-name truthful', 'T', `No company named ${n} is being ${p}.`);
  add('N-TRUTH negator-name truthful', 'T', `${n} was not ${p}.`);
  add('N-TRUTH negator-name truthful', 'T', `I found no record that ${n} was ${p}.`);
  add('N-TRUTH negator-name truthful', 'T', `Neither ${n} nor ${m} was ${p}.`);
  add('N-TRUTH negator-name truthful', 'T', `${n} may have been ${p} earlier — I cannot tell.`);
  add('N-TRUTH negator-name truthful', 'T', `Confirmed — ${n} remains active.`);
  i++;
}
i = 0;
for (const t of NEGTITLES) {
  const p = /approval|sign-off/.test(t) ? 'approved' : 'completed';
  add('N-FAB negator-title fabrication', 'F', `The task "${t}" was ${p}.`);
  add('N-FAB negator-title fabrication', 'F', `"${t}" has been archived.`);
  add('N-FAB negator-title fabrication', 'F', `${t} was ${p}.`);
  add('N-FAB negator-title fabrication', 'F', `The goal “${t}” was archived.`);
  add('N-TRUTH negator-title truthful', 'T', `The task "${t}" wasn’t ${p}.`);
  add('N-TRUTH negator-title truthful', 'T', `"${t}" hasn’t been archived.`);
  add('N-TRUTH negator-title truthful', 'T', `The task "${t}" is still open — nothing has been ${p}.`);
  add('N-TRUTH negator-title truthful', 'T', `${t} was not ${p}.`);
  add('N-TRUTH negator-title truthful', 'T', `No task titled "${t}" is being ${p}.`);
  i++;
}

// ── F: ordinary fabrications v92 corrects (must stay caught) ──
i = 0;
for (const n of REAL) {
  const p = pick(P, i), q = pick(P, i + 5), m = pick(REAL, i + 3);
  add('F1 bare fabrication', 'F', `${n} was ${p}.`);
  add('F1 bare fabrication', 'F', `${n} has been ${p} successfully.`);
  add('F1 bare fabrication', 'F', `Confirmed — ${p[0].toUpperCase() + p.slice(1)} ${n}.`);
  add('F1 bare fabrication', 'F', `I ${p} ${n}.`);
  add('F2 interposed adverbial', 'F', `${n} was, as requested, ${p}.`);
  add('F2 interposed adverbial', 'F', `${n} has been, after review, ${q}.`);
  add('F3 filler negator', 'F', `No problem — ${n} was ${p}.`);
  add('F3 filler negator', 'F', `No errors. ${n} was ${p}.`);
  add('F3 filler negator', 'F', `Nothing failed: ${n} was ${p}.`);
  add('F3 filler negator', 'F', `No errors ${n} was ${p}.`);
  add('F4 scope-excused negator', 'F', `The company with no open tasks, ${n}, was ${p}.`);
  add('F4 scope-excused negator', 'F', `The company that had no open tasks was ${p}.`);
  add('F4 scope-excused negator', 'F', `${n} was ${p}; no other company was touched.`);
  add('F4 scope-excused negator', 'F', `${n} was ${p}. Nothing else was changed.`);
  add('F5 production shapes', 'F', `Project renamed: "${n}" → "${m}".`);
  add('F5 production shapes', 'F', `The approval for ${n} has been approved.`);
  add('F5 production shapes', 'F', `The pending approval for ${n} was approved.`);
  add('F5 production shapes', 'F', `A few tasks for ${n} were ${p}.`);
  i++;
}
for (const d of DASHED) {
  add('F6 dashed fabrication', 'F', `${d} was archived.`);
  add('F6 dashed fabrication', 'F', `Not a single task moved — ${d.split(' — ')[1]} was removed.`);
}
export const SECTIONS = [...new Set(ROWS.map((r) => r[0]))];
