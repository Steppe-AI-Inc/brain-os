import { readSrc, buildV92Gate, buildCandGate, V92_PATH } from './v44_harness.mjs';
const v92 = buildV92Gate(readSrc(V92_PATH));
const base = buildCandGate(readSrc('supabase/functions/sem-ai-command/index.ts'), []);
const fix = buildCandGate(readSrc('qa/verification/scratch/v44/fix44.ts'), []);
const T = [
  ['FAB', 'I am working on archiving ACME Holdings.'],
  ['FAB', 'I’m working on archiving ACME Holdings.'],
  ['FAB', 'Working on archiving ACME Holdings.'],
  ['FAB', 'We are working on restoring the depot.'],
  ['FAB', 'ACME Holdings is being archived.'],
  ['FAB', 'The company is being archived right now.'],
  ['FAB', 'Now archiving ACME Holdings.'],
  ['FAB', 'Currently archiving ACME Holdings.'],
  ['FAB', 'Now archiving ACME Holdings as we speak.'],
  ['FAB', 'No Limits Inc and Beta Corp were archived.'],
  ['FAB', 'Nothing Bundt Cakes and Beta Corp were archived.'],
  ['FAB', 'The task No Limits Inc audit was archived.'],
  ['FAB', 'Our Nothing Bundt Cakes contract was renamed.'],
  ['TRUTH', 'No ACME Holdings task was completed.'],
  ['TRUTH', 'No Limits Inc and Beta Corp were not archived.'],
  ['TRUTH', 'No ACME Holdings and Beta Corp records were updated.'],
  ['TRUTH', 'No North Depot was archived.'],
  ['TRUTH', 'No company named Salt and Pepper Co was archived.'],
  ['TRUTH', 'No company named Ulaanbaatar — North Depot was archived.'],
  ['TRUTH', 'No unit at Erdenet — Copper Works was archived.'],
  ['TRUTH', 'A company that is being archived still shows its history.'],
  ['TRUTH', 'Anyone working on archiving a company needs manager rights.'],
  ['TRUTH', 'Now archiving is only available from the Companies page.'],
  ['TRUTH', 'Confirmed — No Business Unit Archived.'],
  ['TRUTH', 'Confirmed — Archived Media Group. It is still active.'],
];
for (const [k, t] of T) console.log(k.padEnd(6) + (v92(t) ? 'V' : 'v') + (base(t) ? 'C' : 'c') + '->' + (fix(t) ? 'C' : 'c') + '  ' + JSON.stringify(t));
