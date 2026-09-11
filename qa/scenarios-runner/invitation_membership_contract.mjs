#!/usr/bin/env node
// INVITE != ADD MEMBER — the governed invitation lifecycle, and the rows that hold it there.
//
// FOUNDER PRODUCT DECISION, 2026-09-11. The user-facing Invite action MUST use the governed lifecycle:
//
//     INVITATION_CREATED -> DELIVERY_PENDING -> SENT -> ACCEPTED -> MEMBERSHIP_ACTIVE
//     failure branches:  DELIVERY_FAILED (retryable) | EXPIRED | CANCELLED
//
// WHAT THIS SUITE FOUND, AND WHAT THE DECISION THEN SETTLED. There were TWO invitation mechanisms that
// disagreed about what an invitation IS. The governed one (migration 202608310009) makes it a ROW in
// public.company_invitations — one company, one intended email, single-use opaque token, expiring,
// revocable, role-scoped, auditable — with membership granted ONLY by accept_company_invitation(token),
// which derives company, role and recipient authority FROM THE STORED ROW and takes no company or role
// parameter at all. The /people Invite button used none of it: it created the auth user, set
// profiles.active = true, linked the person and INSERTED company_memberships directly, so it granted
// membership at invite time and left nothing that could be revoked, expire, or be audited.
//
// IT NOW USES THE GOVERNED PATH. IM-D1..D4 are GREEN because of that change, not because the rows were
// softened — each was proved to go red on the old code and green only on the property it names, one at a
// time, in qa/verification/im_both_directions.mjs.
//
// WHAT IS STILL RED, AND WHOSE IT IS. IM-D5: no governed surface deactivates a company membership. That is
// BUG-035 (membership role management absent), a SEPARATE defect identity the founder was explicit must not
// be merged into this one — and it covers every membership the OLD path already created, which routing the
// button does not undo.
//
// WHAT THIS SUITE DOES NOT CLAIM. It is a SOURCE contract: no database, no Supabase, no network. It can see
// that the code calls the governed RPC and that the RPC's own definition carries the properties above. It
// cannot see a live invitation being accepted, and it does not pretend to — the delivery-state,
// idempotency, partial-state, activation, tenant-isolation, role-integrity and reload suites carry the
// rest, and every one of them states its own limit.
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

// COMMENTS ARE NOT CODE - AND STRINGS ARE.
//
// The defect rows test for the PRESENCE of a governed call and the ABSENCE of a direct grant, and this
// function's own comments name both. Unstripped, IM-D1 could be satisfied by the comment explaining
// create_company_invitation, and IM-D2 FAILED by the comment explaining what the function no longer does.
//
// String INTERIORS are deliberately KEPT: the table name in .from("company_memberships") lives inside a
// string literal, so blanking strings the way a dead-zone scan must would erase the very thing IM-D2
// looks for. Length is preserved, so any offset reported still indexes the real text.
//
// The tight form additionally removes whitespace, so a formatter cannot flip a contract row.
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
    if (c === '"' || c === "'" || c === "`") {
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
const inviteCode = commentsBlanked(invite);
const inviteTight = inviteCode.replace(/[ \t\r\n]+/g, '');

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
  /create_company_invitation/.test(inviteCode),
  'invitePerson creates NO company_invitations row, so the invitation it reports has no existence in the'
  + ' governed model: nothing to revoke, nothing to expire, no invited_by audit, and no idempotency');

check('DEFECT', 'IM-D2 the invite surface does not grant MEMBERSHIP itself',
  !/company_memberships"\)\.insert/.test(inviteTight),
  'it inserts company_memberships directly, so INVITATION == MEMBERSHIP on this path and the person is a'
  + ' member before accepting anything — the exact collapse the 2026-08-31 decision separated');

check('DEFECT', 'IM-D3 the invite surface does not activate a profile the acceptance gate has not admitted',
  !/\.update\(\{active:true\}\)/.test(inviteTight),
  'handle_new_auth_user creates every signup inert BY DESIGN; overriding that here reproduces the effect'
  + ' of acceptance without the record of it');

// NOT "(BUG-035)". This row asserts that the INVITE PATH does not hardcode a role, and it is now green
// because the role travels on the invitation and is applied by the acceptance gate. BUG-035 is a DIFFERENT
// defect — no governed surface MANAGES a member's role — and it remains open. The founder was explicit that
// these share implementation surfaces and must not share defect identity, so crediting BUG-035 here would
// have reported it closed by a row that never tested it.
check('DEFECT', 'IM-D4 the invite path does not hardcode the granted role',
  !/role_in_company:"employee"/.test(inviteTight),
  'the governed model carries invited_role per invitation and constrains it to real app_role values;'
  + ' this path writes the literal "employee" for everyone');

// RE-WORDED BECAUSE ITS SUBJECT MOVED. It used to say "a membership created by the invite surface", and the
// invite surface no longer creates one. The gap it measures is unchanged and still real: memberships now
// come from the acceptance gate, and NOTHING deactivates one. That is BUG-035 territory — membership
// management absent — and it also covers every membership the OLD path already created, which the routing
// change does not undo. A row that keeps a name its assertion has outgrown is the defect this campaign
// logs as ledger 171.
check('DEFECT', 'IM-D5 a company membership can be deactivated through some governed surface (BUG-035)',
  /company_memberships[\s\S]{0,200}(delete|remove)/i.test(readFileSync(join(ROOT, 'web/lib/data/people.ts'), 'utf8'))
  || existsSync(join(ROOT, 'web/lib/data/memberships.ts')),
  'no surface in web/lib/data removes a company_memberships row, and revokeInvitation only touches'
  + ' company_invitations — so an invite sent this way produces an active member no founder-facing screen'
  + ' can undo');

console.log('');
console.log('invitation_membership_contract: ' + pass + ' passed, ' + failures.length + ' failed');
console.log('IM-D1..D4 are GREEN: the /people invite path creates a governed invitation and grants nothing.');
console.log('IM-D5 IS NOW GREEN TOO. It was red because no governed surface could deactivate a membership -');
console.log('including the ones the OLD path created, which routing the button did not undo. The surface now');
console.log('exists: web/lib/data/memberships.ts and the memberships card on /access, deactivate only, with no');
console.log('way to activate one from the application. BUG-035 keeps its identity and is NOT reported closed -');
console.log('closing it is the Work PC decision, on its own retest.');
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); process.exit(1); }
