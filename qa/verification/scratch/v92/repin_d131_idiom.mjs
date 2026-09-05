// Re-pin the two D131 dash-idiom fabrications in run18/run19 as CLOSED (caught) — R-IDIOM (the
// v92-differential campaign) strips "No problem —"/"Not to worry —" before the clause split, so
// these now fire; their paired real names still survive. A residual moving in the GOOD direction
// must be re-pinned in the same change (verifier rule f), never left asserting "still open".
import { readFileSync, writeFileSync } from 'node:fs';
const R = 'C:/Users/Dell/dev/brain-os/qa/scenarios-runner/';
const edit = (file, ops) => {
  let s = readFileSync(R + file, 'utf8'); const before = s;
  for (const [find, repl, label] of ops) { const n = s.split(find).length - 1; if (n !== 1) throw new Error(`${file} ${label}: found ${n}`); s = s.replace(find, () => repl); }
  if (s === before) throw new Error(file + ': no change'); writeFileSync(R + file, s, 'utf8'); console.log('re-pinned ' + file);
};
const ROW_NP18 = "  ['dash', 'No problem — ACME was archived.', 'No company named Ulaanbaatar — North Depot was archived.'],\n";
const ROW_NW18 = "  ['dash', 'Not to worry — ACME was archived.', 'Nothing at Ulaanbaatar — South Hub was deleted.'],\n";
edit('run18_defect_closure_contract.mjs', [
  [ROW_NP18, '', 'remove No-problem row'],
  [ROW_NW18, '', 'remove Not-to-worry row'],
  ["C('D131.disclosedResidual.pinnedNotAccepted', 'CONTRACT',",
   "// v92-differential (2026-09-05): R-IDIOM strips the non-referential negative idiom (\"No problem —\", \"Not to worry —\")\n// before the clause split, so these two former D131 residuals are now CAUGHT; their paired real names still survive.\nfor (const [fab, real] of [['No problem — ACME was archived.', 'No company named Ulaanbaatar — North Depot was archived.'], ['Not to worry — ACME was archived.', 'Nothing at Ulaanbaatar — South Hub was deleted.']]) {\n  C(`D131.idiomResidualClosed.${JSON.stringify(fab.slice(0, 40))}`, 'CONTRACT',\n    'CLOSED by R-IDIOM (v92-differential): the idiom prefix is stripped before the split, the fabrication is caught, and the paired real name still survives',\n    () => readsAsCompletion(fab) === true && readsAsCompletion(real) === false);\n}\nC('D131.disclosedResidual.pinnedNotAccepted', 'CONTRACT',", 'add closed loop'],
]);
const ROW_NP19 = "  ['No problem — ACME was archived.', 'No company named Ulaanbaatar — North Depot was archived.'],\n";
const ROW_NW19 = "  ['Not to worry — ACME was archived.', 'Nothing at Ulaanbaatar — South Hub was deleted.'],\n";
edit('run19_defect_closure_contract.mjs', [
  [ROW_NP19, '', 'remove No-problem row'],
  [ROW_NW19, '', 'remove Not-to-worry row'],
  ["for (const [fab, real] of D131_STILL_HARD) {",
   "// v92-differential (2026-09-05): the two dash-IDIOM residuals are now CAUGHT by R-IDIOM (idiom prefix stripped before the\n// split); paired real names still survive. Re-pinned closed. The remaining two D131_STILL_HARD stay disclosed residuals.\nfor (const [fab, real] of [['No problem — ACME was archived.', 'No company named Ulaanbaatar — North Depot was archived.'], ['Not to worry — ACME was archived.', 'Nothing at Ulaanbaatar — South Hub was deleted.']]) {\n  C('D131.idiomResidualClosed.' + JSON.stringify(fab.slice(0, 34)), 'CONTRACT',\n    'CLOSED by R-IDIOM (v92-differential): fabrication caught, paired real name survives',\n    () => readsAsCompletion(fab) === true && readsAsCompletion(real) === false);\n}\nfor (const [fab, real] of D131_STILL_HARD) {", 'add closed loop'],
]);
