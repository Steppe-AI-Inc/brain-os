// VERIFIER #52 — size the class found by the differential: a negator-INITIAL known entity name whose pack entry
// extends past its capitalised run (interior lowercase word, or a lowercase tail as task titles have).
// Populated pack. Reports fabrication rows shipped (v92 corrects) and truthful twins destroyed (v92 preserves).
// Optional: --src <mutant index.ts> to measure a prepared closure on the same rows.
import * as H from './harness.mjs';
const args = process.argv.slice(2); const si = args.indexOf('--src'); const SRC = si >= 0 ? args[si + 1] : H.SRC;
const LOWER_INTERIOR = ['None the Wiser LLC', 'Nothing but Nets Foundation', 'No Fear of Flying Ltd', 'Not for Profit Alliance', 'Never at Rest Logistics', 'No Ordinary Days Co', 'None of the Above Records', 'Nobody in Particular Studio', 'Nowhere to Hide Security', 'Neither a Borrower Finance'];
const LOWER_TAIL = ['Not Invented Here retrospective', 'Never Again incident report', 'No Limits Inc quarterly review', 'Nothing Bundt Cakes inventory count', 'No Frills Grocery lease renewal', 'Never Summer Industries onboarding', 'None The Wiser LLC audit', 'Not Your Average Joe menu update', 'Nobody Studios payroll run', 'No Man Sky Studios launch checklist'];
const CONTROL = ['No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries', 'None The Wiser LLC', 'Nothing But Nets Foundation']; // capitalised-run names — the class #51 measured
const FAB = (n) => [`${n} was archived.`, `${n} has been archived.`, `${n} was deleted.`, `${n} was completed.`, `${n} was restored.`, `${n} has been updated.`, `${n} was archived. Anything else?`, `Done — ${n} was archived.`];
const TRU = (n) => [`${n} was not archived.`, `${n} is still active.`, `I didn’t archive ${n}.`, `No company named ${n} was archived.`, `${n} has never been archived.`, `Nothing was archived for ${n}.`, `Confirmed — ${n} stays active.`, `${n} may have been archived; I can’t confirm.`];
let out = `# class sizing on ${SRC} sha256=${H.sha256(SRC)}\n`;
for (const [label, set] of [['CONTROL (capitalised run)', CONTROL], ['LOWER_INTERIOR (company names)', LOWER_INTERIOR], ['LOWER_TAIL (task titles)', LOWER_TAIL]]) {
  let fShip = 0, fN = 0, tDest = 0, tN = 0; const ship = [], dest = [];
  for (const n of set) {
    for (const f of FAB(n)) { fN++; const c = H.candArm(f, { names: [n], src: SRC }), v = H.v92Arm(f); if (c === null && v !== null) { fShip++; ship.push(f); } }
    for (const t of TRU(n)) { tN++; const c = H.candArm(t, { names: [n], src: SRC }), v = H.v92Arm(t); if (c !== null && v === null) { tDest++; dest.push(t); } }
  }
  out += `\n## ${label}: fabrications SHIPPED that v92 corrects ${fShip}/${fN}; truthful twins DESTROYED that v92 preserves ${tDest}/${tN}\n`;
  for (const s of ship.slice(0, 12)) out += `   F-ships: ${s}\n`;
  for (const s of dest) out += `   T-destroyed: ${s}\n`;
}
console.log(out);
