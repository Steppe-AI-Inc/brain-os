#!/usr/bin/env node
// INVITATION != MEMBERSHIP — the product contract, and the surface that bypasses it.
//
// THE FINDING. There are TWO invitation mechanisms in this repository and they disagree about what an
// invitation IS.
//
//   1. THE GOVERNED ONE (migration 202608310009, the founder's 2026-08-31 decision). An invitation is a
//      ROW in public.company_invitations: tied to one company, one intended email, single-use via an
//      opaque token, expiring, revocable, role-scoped and auditable. Membership is granted ONLY by
//      accept_company_invitation(token), a SECURITY DEFINER gate that reads the company and role FROM THE
//      STORED ROW and takes no company_id or role parameter at all, so no client payload can change the
//      outcome. `web/lib/data/invitations.ts` is its management half.
//
//   2. THE /people "INVITE" BUTTON (`invitePerson` in web/lib/data/people.ts). It calls
//      auth.admin.inviteUserByEmail, then sets profiles.active = true, links people.profile_id, and
//      INSERTS company_memberships DIRECTLY. It creates NO company_invitations row.
//
// So the button the founder actually uses grants MEMBERSHIP AT INVITE TIME. The person is a member before
// they have accepted anything, which is the one thing the 2026-08-31 decision exists to prevent: "Creating
// an auth user must never automatically grant employee access, company membership, or any Brain OS
// authority."
//
// WHAT THAT COSTS, all derivable from source and none of it requiring a database:
//
//   * The founder is told "Invitation sent ... they are not a member until they accept it" by the outcome
//     vocabulary, while the code has already made them a member. The message is false.
//   * NOTHING CAN REVOKE IT. revokeInvitation() updates company_invitations; this path creates no such
//     row, and no surface anywhere in web/lib/data removes a company_memberships row. An invitation sent
//     this way produces an active member who cannot be un-invited through any founder-facing screen.
//   * It cannot expire. The governed row has expires_at; a membership has no such concept.
//   * There is no audit trail of who invited whom by this path — invited_by_profile_id lives on the row
//     that is never created.
//   * It is not idempotent, and the governed path IS. create_company_invitation() carries
//     `on conflict (company_id, email) where status = 'pending' do update set ... token = <fresh>`, so
//     re-inviting the same person refreshes the invitation instead of failing or duplicating. That is
//     exactly the idempotency the handoff asks for, already implemented in the database. The button does
//     not call it, and a second click instead hits `person.profile_id` already set and is refused for ever.
//
// THE CODE KNOWS. The comment at people.ts:~258 argues that this is "a DIFFERENT, already founder/admin-
// gated path ... that deserves real activation, same as accept_company_invitation() grants". The authority
// check is real and the reasoning is not careless — but it reproduces the EFFECT of acceptance without the
// RECORD of it, and every cost above follows from the missing record rather than from the missing check.
//
// WHAT THIS SUITE DOES AND DELIBERATELY DOES NOT DO.
//
// Routing the button through create_company_invitation() changes what it OBSERVABLY does: inviting someone
// would leave them pending until they accept, where today they become an active member immediately. That is
// a PRODUCT decision for the founder, not a defect to patch at the end of a night shift. So this suite
// PINS the properties that are true today and must stay true, and REGISTERS the contract violations as
// named defect rows that are RED BY DESIGN. It decides nothing.
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

const MIG = join(ROOT, 'supabase/migrations/202608310009_invite_only_signup.sql');
const sql = existsSync(MIG) ? readFileSync(MIG, 'utf8') : '';
const people = readFileSync(join(ROOT, 'web/lib/data/people.ts'), 'utf8');
const invites = readFileSync(join(ROOT, 'web/lib/data/invitations.ts'), 'utf8');
const invite = (people.match(/export async function invitePerson[\s\S]*?\n}/) || [''])[0];

// A suite whose subject is absent must say so in a row rather than pass vacuously.
check('CONTRACT', 'IM-C0 the governed invitation migration and the invite surface are both present',
  sql.length > 2000 && invite.length > 500,
  'migration ' + sql.length + ' bytes, invitePerson ' + invite.length + ' bytes');

// ── What is TRUE today and must stay true ───────────────────────────────────────────────────────────
check('CONTRACT', 'IM-C1 an invitation is a ROW with a status machine, an expiry and a single-use token',
  /create table if not exists public\.company_invitations/.test(sql)
  && /status text not null default 'pending'/.test(sql)
  && /expires_at timestamptz not null/.test(sql)
  && /unique \(token\)/.test(sql),
  'the governed model is what INVITATION != MEMBERSHIP is expressed in');

check('CONTRACT', 'IM-C2 the acceptance gate takes NO company or role parameter, so no client payload can'
  + ' choose its own authority',
  /create or replace function public\.accept_company_invitation\(p_token text\)/.test(sql)
  && !/accept_company_invitation\(p_token text, /.test(sql),
  'the grant is read from the stored row; a caller-supplied company_id or role would be a privilege'
  + ' escalation surface');

check('CONTRACT', 'IM-C3 creation is IDEMPOTENT on (company, email) while pending, and refreshes the token',
  /on conflict \(company_id, email\) where status = 'pending'/.test(sql)
  && /do update set[\s\S]{0,200}token = encode/.test(sql),
  'this is the idempotency the invitation work was asked to build — it already exists in the database');

check('CONTRACT', 'IM-C4 revoke is scoped to PENDING, so an accepted invitation can never be retroactively'
  + ' revoked into a lie',
  /\.eq\("status", "pending"\)/.test(invites) && /"revoked"/.test(invites),
  'revoking a row whose membership was already granted would record something that did not happen');

check('CONTRACT', 'IM-C5 the bearer token is never selected by the management surface',
  !/select\([^)]*token/.test(invites),
  'a single-use credential in a server-rendered list turns every page view into an exposure');

// ── What is FALSE today. These are the contract violations, named, RED BY DESIGN ─────────────────────
//
// Each row asserts the PROPERTY the contract requires, so each goes green the day the product decision is
// made and implemented — and not one hour earlier. None of them is forgiven into silence.
check('DEFECT', 'IM-D1 the invite surface RECORDS an invitation before anyone is a member',
  /company_invitations|create_company_invitation/.test(invite),
  'invitePerson creates NO company_invitations row, so the invitation it reports has no existence in the'
  + ' governed model: nothing to revoke, nothing to expire, no invited_by audit, and no idempotency');

check('DEFECT', 'IM-D2 the invite surface does not grant MEMBERSHIP itself',
  !/from\("company_memberships"\)\s*\.insert/.test(invite.replace(/\s+/g, ' ').replace(/ \. /g, '.'))
  && !/company_memberships"\)\.insert/.test(invite.replace(/\s+/g, '')),
  'it inserts company_memberships directly, so INVITATION == MEMBERSHIP on this path and the person is a'
  + ' member before accepting anything — the exact collapse the 2026-08-31 decision separated');

check('DEFECT', 'IM-D3 the invite surface does not activate a profile the acceptance gate has not admitted',
  !/\.update\(\{ active: true \}\)/.test(invite),
  'handle_new_auth_user creates every signup inert BY DESIGN; overriding that here reproduces the effect'
  + ' of acceptance without the record of it');

check('DEFECT', 'IM-D4 the granted role is not hardcoded (BUG-035)',
  !/role_in_company: "employee"/.test(invite),
  'the governed model carries invited_role per invitation and constrains it to real app_role values;'
  + ' this path writes the literal "employee" for everyone');

check('DEFECT', 'IM-D5 a membership created by the invite surface can be revoked somewhere',
  /company_memberships[\s\S]{0,200}(delete|remove)/i.test(readFileSync(join(ROOT, 'web/lib/data/people.ts'), 'utf8'))
  || existsSync(join(ROOT, 'web/lib/data/memberships.ts')),
  'no surface in web/lib/data removes a company_memberships row, and revokeInvitation only touches'
  + ' company_invitations — so an invite sent this way produces an active member no founder-facing screen'
  + ' can undo');

console.log('');
console.log('invitation_membership_contract: ' + pass + ' passed, ' + failures.length + ' failed');
console.log('RED BY DESIGN: IM-D1 through IM-D5 are the contract violations of the /people invite path.');
console.log('Routing it through create_company_invitation() changes what the button observably does —');
console.log('invited people would be PENDING until they accept, not active members immediately — so it is');
console.log('a FOUNDER PRODUCT DECISION and is deliberately not patched here.');
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); process.exit(1); }
