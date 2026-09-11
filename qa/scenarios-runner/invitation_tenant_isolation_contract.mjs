#!/usr/bin/env node
// TENANT ISOLATION — an invitation is always to ONE company, and nobody can redirect it.
//
// There are four places an invitation could leak across tenants, and each has its own row:
//
//   1. CREATION      could the caller name a company they do not manage?
//   2. STORAGE       could a row exist without a company, or with one that vanishes?
//   3. VISIBILITY    could a manager of company A read or revoke company B's invitations?
//   4. REDEMPTION    could a token issued for company A grant membership in company B, or to
//                    somebody other than the intended recipient?
//
// The fourth is the one that matters most and the one that is easiest to get wrong, because the recipient
// is the attacker in that scenario: they hold the token. The defence is that acceptance reads the company
// from the STORED ROW and additionally requires the caller's own profile email to equal the invitation's
// email. A stolen or forwarded token is therefore useless to anyone else — including to a Google or other
// OAuth account, which is exactly the case the contract names.
//
// SOURCE CONTRACT. It reads the declared policies and signatures. It cannot execute a cross-tenant attempt,
// and that is deliberate: proving a cross-tenant write fails means performing one, which is the write that
// must never succeed. The same reasoning the battery already applies to Codex E.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
function repoRoot() {
  let d = HERE;
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(d, 'web/lib/data/people.ts'))) return d;
    const up = dirname(d); if (up === d) break; d = up;
  }
  throw new Error('repo root not found');
}
const ROOT = repoRoot();
const NL = String.fromCharCode(10);

let pass = 0;
const failures = [];
const check = (kind, name, ok, detail) => {
  if (ok) { pass++; console.log('OK   [' + kind + '] ' + name); }
  else { failures.push(name); console.log('FAIL [' + kind + '] ' + name + (detail ? NL + '       ' + detail : '')); }
};

function commentsBlanked(t) {
  const S = ' ', LF = String.fromCharCode(10), BS = String.fromCharCode(92);
  let out = '', i = 0;
  while (i < t.length) {
    const c = t[i], d = t[i] + t[i + 1];
    if (d === '//') { while (i < t.length && t[i] !== LF) { out += S; i++; } continue; }
    if (d === '/*') {
      while (i < t.length && t[i] + t[i + 1] !== '*/') { out += (t[i] === LF ? LF : S); i++; }
      out += S + S; i += 2; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      out += c; i++;
      while (i < t.length) {
        if (t[i] === BS) { out += t[i] + (t[i + 1] || ''); i += 2; continue; }
        if (t[i] === c) { out += c; i++; break; }
        out += t[i]; i++;
      }
      continue;
    }
    out += c; i++;
  }
  return out;
}

const MIG = join(ROOT, 'supabase/migrations/202608310009_invite_only_signup.sql');
const sql = existsSync(MIG) ? readFileSync(MIG, 'utf8') : '';
const peopleRaw = readFileSync(join(ROOT, 'web/lib/data/people.ts'), 'utf8');
const invite = commentsBlanked((peopleRaw.match(/export async function invitePerson[\s\S]*?\n}/) || [''])[0]);
const accept = existsSync(join(ROOT, 'web/lib/data/accept-invitation.ts'))
  ? commentsBlanked(readFileSync(join(ROOT, 'web/lib/data/accept-invitation.ts'), 'utf8')) : '';

check('CONTRACT', 'TI-C0 the migration, the invite action and the acceptance module are all present',
  sql.length > 2000 && invite.length > 800 && accept.length > 400,
  'migration ' + sql.length + ', invite ' + invite.length + ', accept ' + accept.length);

// 1. CREATION
check('CONTRACT', 'TI-C1 creation refuses a company the caller neither owns nor manages',
  /create_company_invitation[\s\S]{0,600}if not \(public\.is_founder_or_admin\(\) or public\.is_company_manager\(p_company_id\)\) then[\s\S]{0,120}raise exception/.test(sql),
  'the check is on the company PASSED IN, so naming someone else’s company is refused rather than silently'
  + ' scoped away');

check('CONTRACT', 'TI-C2 the invite action passes the PERSON’S company, never a client-supplied one',
  /p_company_id: person\.company_id/.test(invite)
  && !/p_company_id: [a-z]*[Ii]nput|p_company_id: companyId/.test(invite),
  'the company is read from the person record the server just fetched by id; a value arriving from the'
  + ' browser would make the caller’s own claim the authority');

// 2. STORAGE
check('CONTRACT', 'TI-C3 an invitation cannot exist without a company, and dies with it',
  /company_id uuid not null references public\.companies\(id\) on delete cascade/.test(sql),
  'NOT NULL makes a tenant-less invitation unrepresentable; the cascade stops an orphan token outliving the'
  + ' company it was scoped to');

// 3. VISIBILITY
check('CONTRACT', 'TI-C4 management visibility is scoped per company, for reads AND writes',
  /create policy "company_invitations_manage_scope" on public\.company_invitations for all using/.test(sql)
  && /is_company_manager/.test(sql),
  '`for all` covers select, insert, update and delete — a read-only policy would leave revoke unscoped');

check('CONTRACT', 'TI-C5 RLS is enabled on the invitation table at all',
  /alter table public\.company_invitations enable row level security/.test(sql),
  'a policy on a table without RLS enabled is decoration');

// 4. REDEMPTION — the important one
check('CONTRACT', 'TI-C6 redemption derives the company from the STORED ROW, not from the caller',
  /function public\.accept_company_invitation\(p_token text\)/.test(sql)
  && /v_invitation\.company_id/.test(sql),
  'the holder of a token is the one person who would benefit from choosing their own company');

check('CONTRACT', 'TI-C7 a token is useless to anyone but its intended recipient (the OAuth case)',
  /if lower\(v_caller_email\) <> lower\(v_invitation\.email\) then[\s\S]{0,120}raise exception/.test(sql),
  'the caller’s profile email must equal the invitation’s, case-insensitively. This is what makes a Google'
  + ' or other OAuth account safe: the invited address accepts, any other address is refused even holding a'
  + ' valid token — and it is why a forwarded invitation cannot be used by the recipient’s colleague');

check('CONTRACT', 'TI-C8 the token is a lookup key, not an identity: it is never selected into a page',
  !/select\([^)]*token/.test(accept) && /p_token/.test(accept),
  'the application hands the token to the gate and never reads it back; a token rendered into markup is a'
  + ' credential in a page');

console.log('');
console.log('invitation_tenant_isolation_contract: ' + pass + ' passed, ' + failures.length + ' failed');
console.log('NO CROSS-TENANT ATTEMPT IS EXECUTED HERE, DELIBERATELY. Proving a cross-tenant write fails means');
console.log('performing one, and that is the write that must never succeed — the same reasoning the battery');
console.log('already applies to Codex E. These rows read the declared policies and signatures instead.');
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); process.exit(1); }
