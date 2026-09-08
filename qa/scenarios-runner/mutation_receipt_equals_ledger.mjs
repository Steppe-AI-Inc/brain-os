#!/usr/bin/env node
// MUTATION RECEIPT == LEDGER (governance/OPERATING_TRUTH_MODEL.md §4.2, §5; BUG-012, Work-PC
// 2026-09-07: a manager reassignment was receipted as a company move — right action, wrong
// description). The receipt for every mutation path must name the same action, entity,
// relationship and target as the executed operation.
//
// Executes the REAL personAssignmentReport renderer from sem-ai-command/index.ts against the
// requested-vs-current diff, and the REAL company archive/restore lines against RPC results.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { stripTS } from './_gate_extract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SEM_INDEX_SRC || resolve(HERE, '../../supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
function slice(startMarker, endMarker) {
  const s = src.indexOf(startMarker); if (s === -1) throw new Error('start marker not found: ' + startMarker);
  const e = src.indexOf(endMarker, s); if (e === -1) throw new Error('end marker not found: ' + endMarker);
  return stripTS(src.slice(s, e + endMarker.length));
}
let pass = 0; const failures = [];
const check = (name, cond, detail) => { if (cond) { pass++; console.log('OK   ' + name); } else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name); } };

// ---- person assignment receipt ----
const REPORT_SLICE = slice('const reassignmentEntries = createPersonAssignmentsFiltered.filter((a) => a.personId !== null);', '            }).join(\' \')\n          : null;');
const render = new Function('createPersonAssignmentsFiltered', 'createdPersonAssignments', 'personNameById', 'companyNameById', 'contextPack', REPORT_SLICE + '\n; return personAssignmentReport;');
const P = 'pppppppp-1111-1111-1111-111111111111', M1 = 'mmmmmmmm-1111-1111-1111-111111111111', M2 = 'mmmmmmmm-2222-2222-2222-222222222222';
const C1 = 'cccccccc-1111-1111-1111-111111111111', C2 = 'cccccccc-2222-2222-2222-222222222222';
const names = new Map([[P, 'Alice'], [M1, 'Bob'], [M2, 'Carol']]);
const companies = new Map([[C1, 'Acme'], [C2, 'Beta Corp']]);
const current = { person_id: P, legal_employer_company_id: C1, operating_company_id: C1, manager_person_id: M1, state: 'current' };
const run = (entry, ctx = { personAssignments: [current] }) => render([entry], [{ id: 'x' }], names, companies, ctx);

{
  const r = run({ personId: P, legalEmployerCompanyId: C1, operatingCompanyId: C1, managerPersonId: M2 });
  check('manager-only change: receipt says manager set, names old and new, no company move', /\*\*Alice's manager set to Carol\*\* \(was Bob\)\./.test(r) && !/reassigned to/.test(r), r);
}
{
  const r = run({ personId: P, legalEmployerCompanyId: C2, operatingCompanyId: C2, managerPersonId: null });
  check('company-only change: receipt says reassigned to the new company, no manager line', /\*\*Alice reassigned to Beta Corp\*\*/.test(r) && !/manager set to/.test(r), r);
}
{
  const r = run({ personId: P, legalEmployerCompanyId: C2, operatingCompanyId: C2, managerPersonId: M2 });
  check('both changed: both lines, in that order', /manager set to Carol/.test(r) && /reassigned to Beta Corp/.test(r), r);
}
{
  const r = run({ personId: P, legalEmployerCompanyId: C1, operatingCompanyId: C1, managerPersonId: M1 });
  check('nothing changed: the receipt says so instead of claiming a move', /assignment re-saved — company and manager unchanged/.test(r) && !/reassigned to/.test(r), r);
}
{
  const r = run({ personId: P, legalEmployerCompanyId: C1, operatingCompanyId: C2, managerPersonId: null });
  check('split legal/operating: both named', /Legal employer: Acme\. Operating company: Beta Corp\./.test(r), r);
}
{
  const r = run({ personId: P, legalEmployerCompanyId: C1, operatingCompanyId: C1, managerPersonId: M2 }, { personAssignments: [] });
  check('no current assignment known: manager line without "was", company line since no current row', /manager set to Carol\*\*\./.test(r) && !/was /.test(r.split('**')[2] || ''), r);
}
{
  const r = render([{ personId: null, legalEmployerCompanyId: C1, operatingCompanyId: C1, managerPersonId: null }], [{ id: 'x' }], names, companies, { personAssignments: [] });
  check('a brand-new hire (no personId) renders no reassignment receipt', r === null, String(r));
}
{
  const r = render([{ personId: P, legalEmployerCompanyId: C2, operatingCompanyId: C2, managerPersonId: null }], [], names, companies, { personAssignments: [current] });
  check('a partial batch failure renders no positional receipt (never guesses which entry succeeded)', r === null, String(r));
}

// ---- company lifecycle lines equal the RPC outcome ----
const reasonText = new Function('return ' + src.match(/const reasonText: Record<string, string> = (\{[\s\S]*?\});/)[1])();
for (const [reason, expected] of [['archived', 'archived'], ['restored', 'restored'], ['already_archived', 'was already archived'], ['already_active', 'was already active'], ['not_found', 'could not be found'], ['denied', 'you do not have permission to archive/restore this company']]) {
  check(`company line for reason ${reason} is "${expected}"`, reasonText[reason] === expected);
}

console.log(`\nmutation_receipt_equals_ledger: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f); process.exit(1); }
