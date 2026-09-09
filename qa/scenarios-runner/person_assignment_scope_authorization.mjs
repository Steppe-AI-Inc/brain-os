#!/usr/bin/env node
// CODEX FINDING E — person-assignment authorization scope. Static security contract.
//
// This suite measures the POLICY TEXT in the repository, because that text is the whole of the
// authorisation: `sem_execute_ai_command` is SECURITY INVOKER, so an assignment written through chat is
// authorised by `person_assignments` RLS and by nothing else.
//
// It deliberately does NOT attempt a live cross-tenant write. Proving the exploit behaviourally means
// performing the very write that must never succeed, against a database this session has no authorisation
// to touch. So the behavioural half is registered as BLOCKED — NEEDS LIVE/DB EVIDENCE and the acceptance
// cases are written down in the prepared migration for whoever applies it.
//
// EXPECTED TO FAIL TODAY, BY DESIGN, and it says so here rather than leaving an unexplained red in the
// battery. The four FINDING rows go green only when supabase/drafts/202609090001_* is APPLIED, which is a
// production database action and therefore founder-only. Until then this suite is a registered standing red
// in the same class as production_write_authority: it is not a property of the Edge candidate, it does not
// block an Edge deployment, and it must stay visible rather than be silenced. Its redness IS the finding.
//
// The rows are tagged:
//   FINDING   fails while the shipped policy still authorises on the destination column alone
//   CONTRACT  properties that must hold before and after the fix
//
// Reads the SHIPPED policy from supabase/migrations, and the PREPARED replacement from supabase/drafts.
// ANY failure exits non-zero.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function repoRoot(startFile) {
  let d = dirname(startFile);
  for (let i = 0; i < 12; i++) { if (existsSync(join(d, 'qa/scenarios-runner/_gate_extract.mjs'))) return d; const u = dirname(d); if (u === d) break; d = u; }
  throw new Error('person-assignment scope: repo root not found');
}
const ROOT = repoRoot(fileURLToPath(import.meta.url));
const MIGRATIONS = join(ROOT, 'supabase/migrations');
const DRAFTS = join(ROOT, 'supabase/drafts');

let pass = 0; const failures = [];
const check = (tag, name, cond, detail) => {
  if (cond) { pass++; console.log('OK   [' + tag + '] ' + name); }
  else { failures.push('[' + tag + '] ' + name + (detail ? '\n       ' + detail : '')); console.log('FAIL [' + tag + '] ' + name + (detail ? '\n       ' + detail : '')); }
};

// The policy that is actually in force is the LAST one defined across the migration set, in filename order.
const sqlFiles = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
let effectiveWritePolicy = null, effectivePolicyFile = null;
for (const f of sqlFiles) {
  const text = readFileSync(join(MIGRATIONS, f), 'utf8').replace(/\r\n/g, '\n');
  const re = /create policy "(person_assignments_write[^"]*)" on public\.person_assignments for all\s*([\s\S]*?);\s*\n/g;
  let m;
  while ((m = re.exec(text))) { effectiveWritePolicy = m[2]; effectivePolicyFile = f + ' (' + m[1] + ')'; }
}
check('CONTRACT', 'E0 a write policy on person_assignments exists and is locatable',
  !!effectiveWritePolicy, 'no create policy ... for all found in supabase/migrations');

if (effectiveWritePolicy) {
  const body = effectiveWritePolicy;
  console.log('     effective write policy: ' + effectivePolicyFile);
  // Every org-bearing column on the row must be inside the caller's authority — not only the destination.
  check('FINDING', 'E1 the SOURCE person is scoped (an Org A manager cannot capture an Org B person)',
    /person_assignments\.person_id/.test(body) && /is_company_manager\(pe\.company_id\)/.test(body),
    'the policy authorises on operating_company_id alone, so the destination is checked and the person is not');
  check('FINDING', 'E2 the named MANAGER is scoped (no reporting line into a company the caller does not manage)',
    /manager_person_id/.test(body) && /is_company_manager\(mp\.company_id\)/.test(body));
  check('FINDING', 'E3 the LEGAL EMPLOYER is scoped',
    /legal_employer_company_id is null or public\.is_company_manager\(legal_employer_company_id\)/.test(body));
  // The regression half: a scope fix that breaks ordinary assignment or onboarding has traded one defect
  // for another, and an unattached person must stay assignable.
  check('CONTRACT', 'E4 the destination is still authorised (the original check is not lost)',
    /is_company_manager\(operating_company_id\)/.test(body));
  check('CONTRACT', 'E5 founder/admin authority is unchanged',
    /is_founder_or_admin\(\)/.test(body));
  check('FINDING', 'E6 an UNATTACHED person stays assignable (onboarding is not capture)',
    /company_id is null/.test(body),
    'a NULL source company must not be treated as a foreign company');
}

// The prepared fix must exist, must be OUT of the migration path, and must carry its acceptance cases.
{
  const draft = join(DRAFTS, '202609090001_person_assignment_scope_authorization.sql');
  const exists = existsSync(draft);
  check('CONTRACT', 'E7 the prepared fix exists', exists);
  if (exists) {
    const text = readFileSync(draft, 'utf8');
    check('CONTRACT', 'E8 the prepared fix is NOT in the migration path (it is a founder-authorised DB action)',
      !existsSync(join(MIGRATIONS, '202609090001_person_assignment_scope_authorization.sql')));
    check('CONTRACT', 'E9 the prepared fix is labelled BLOCKED — PRODUCTION DB AUTHORIZATION',
      /BLOCKED — PRODUCTION DB AUTHORIZATION/.test(text));
    check('CONTRACT', 'E10 the prepared fix carries its acceptance cases, including the two regression cases',
      /MUST SUCCEED \(no regression\)/.test(text) && /MUST SUCCEED \(onboarding\)/.test(text) && /MUST FAIL/.test(text));
  }
}

console.log('\nperson_assignment_scope_authorization: ' + pass + ' passed, ' + failures.length + ' failed');
if (failures.length) console.log('FAILURES:\n - ' + failures.join('\n - '));
console.log('BEHAVIOURAL HALF: BLOCKED — NEEDS LIVE/DB EVIDENCE. Proving the cross-tenant write behaviourally');
console.log('means performing it; the acceptance cases are in supabase/drafts/202609090001_*.sql.');
if (pass + failures.length === 0) { console.error('0 checks executed — harness failure'); process.exit(2); }
process.exit(failures.length ? 1 : 0);
