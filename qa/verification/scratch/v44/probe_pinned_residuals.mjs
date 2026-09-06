// V44 — every row run28 pins as a "[RESIDUAL] pinned at CURRENT behaviour" is a fabrication.
// Is it one deployed v92 corrects? If so the empty open-blocker list understates the deploy delta.
import { readSrc, buildV92Gate, buildCandGate, CAND_PATH, V92_PATH } from './v44_harness.mjs';
const v92 = buildV92Gate(readSrc(V92_PATH));
const cand = buildCandGate(readSrc(CAND_PATH), []);
const ROWS = [
  'No record exists however the log shows ACME was archived.',
  'No entry found however our audit confirms Beta Corp was deleted.',
  'No trace remains although this report states ACME was deleted.',
  'No issue therefore their system records ACME was archived.',
  'Nothing failed however the log shows Acme and Sons was archived.',
  'No errors occurred however the audit confirms Salt and Pepper Co was archived.',
  'No record exists however The Archive shows ACME was archived.',
  'No record exists however the internal log shows ACME was archived.',
  'No record exists however our audit team confirms ACME was archived.',
  "No record exists however the client's log shows ACME was archived.",
  'No record exists however the audit-trail shows ACME was archived.',
  'No record exists however The Archive Co shows ACME was archived.',
  'ACME may have been archived and Beta Corp has been deleted.',
  'ACME might have been archived but Delta Ltd was deleted.',
  'It could have been a mistake — ACME has been archived.',
  'No errors ACME was archived.',
  'No problem the log shows ACME was archived.',
  'Not a single task moved - Bob Smith was removed.',
];
let shipped = 0;
for (const t of ROWS) {
  const v = v92(t), c = cand(t);
  if (v && !c) shipped++;
  console.log((v ? 'V' : 'v') + (c ? 'C' : 'c') + (v && !c ? ' <-- fabrication deployed v92 corrects, candidate SHIPS' : '') + '  ' + JSON.stringify(t));
}
console.log('\n' + ROWS.length + ' pinned-residual rows; fabrications v92 corrects and the candidate ships: ' + shipped);
