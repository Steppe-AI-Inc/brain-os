#!/usr/bin/env node
// RETRY DOES NOT CREATE DUPLICATE OR CONTRADICTORY STATE — the founder's requirement, in rows.
//
// The cases the contract names, and where each is actually held:
//
//   second click on the same pending invite    create_company_invitation's ON CONFLICT ... DO UPDATE
//   resend after DELIVERY_FAILED               the same, plus DELIVERY_FAILED being retryable
//   two live invitations for one target        a PARTIAL UNIQUE INDEX, not a convention
//   invitation accepted twice                  accept's `status = 'pending'` lookup under `for update`
//   already-active membership                  the membership insert is an UPSERT, on (company, profile)
//   person already linked                      invitePerson no longer refuses on profile_id alone
//   expired / revoked invitation               outside the partial index, so a resend starts a new one
//
// THE POINT OF LISTING WHERE: every one of these is enforced by the DATABASE, in a constraint or a
// predicate, not by application sequencing. Application-level idempotency is a race with itself — two
// clicks are two requests — and the old invite path is the proof: its "already has a login account" guard
// was a read followed by writes, so the second click lost and the row was blocked for ever.
//
// SOURCE CONTRACT. No database, no network. These rows read the migration's own definitions and the
// application's own calls. They prove the mechanisms are DECLARED and REACHED. They cannot prove a race
// resolves correctly at runtime — that needs a database, and the 67 .sql suites are where that belongs.
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
const inviteTight = invite.replace(/[ \t\r\n]+/g, '');
const accept = existsSync(join(ROOT, 'web/lib/data/accept-invitation.ts'))
  ? commentsBlanked(readFileSync(join(ROOT, 'web/lib/data/accept-invitation.ts'), 'utf8')) : '';

check('CONTRACT', 'IDP-C0 the migration and both halves of the lifecycle are present',
  sql.length > 2000 && invite.length > 800 && accept.length > 200,
  'migration ' + sql.length + ', invitePerson ' + invite.length + ', accept ' + accept.length);

// A second click on the same pending invitation.
check('CONTRACT', 'IDP-C1 a second click REFRESHES the live invitation instead of creating a second one',
  /on conflict \(company_id, email\) where status = 'pending'/.test(sql)
  && /do update set/.test(sql),
  'the ON CONFLICT target is the live-invitation predicate, so the second insert updates rather than'
  + ' duplicating or failing');

// And the refresh must rotate the credential, or the old token stays valid alongside the new one.
check('CONTRACT', 'IDP-C2 the refresh ROTATES the token and the expiry, so an old link stops working',
  /do update set[\s\S]{0,220}token = encode/.test(sql)
  && /do update set[\s\S]{0,220}expires_at = now\(\)/.test(sql),
  'a refresh that kept the old token would leave two usable links for one invitation, which is exactly the'
  + ' duplicate state the requirement forbids');

// Two live invitations must be impossible at the storage layer, not by sequencing.
check('CONTRACT', 'IDP-C3 two live invitations for one (company, email) are impossible by INDEX',
  /create unique index[\s\S]{0,160}company_invitations[\s\S]{0,160}\(company_id, email\)[\s\S]{0,80}where status = 'pending'/.test(sql),
  'a partial unique index cannot be raced; an application check can');

// Accepted twice.
check('CONTRACT', 'IDP-C4 acceptance is single-use and race-safe: pending-only lookup under a row lock',
  /where token = p_token and status = 'pending'[\s\S]{0,60}for update/.test(sql),
  'two concurrent acceptances serialise on the row and the loser finds nothing; a second later acceptance'
  + ' finds nothing either, which is why it reports ALREADY_USED rather than granting twice');

// Already-active membership.
check('CONTRACT', 'IDP-C5 granting membership is an UPSERT, so an existing membership is re-activated not'
  + ' duplicated',
  /insert into public\.company_memberships[\s\S]{0,260}on conflict \(company_id, profile_id\) do update set active = true/.test(sql),
  'the natural key is (company, profile); without the upsert a re-acceptance would raise on a constraint'
  + ' and look like a failure');

// Expired / revoked: a resend must be able to start a new invitation.
check('CONTRACT', 'IDP-C6 an EXPIRED or REVOKED invitation is outside the live index, so a resend starts a'
  + ' fresh one',
  /where status = 'pending'/.test(sql) && /'expired'/.test(sql) && /'revoked'/.test(sql),
  'the partial index covers only pending rows, so a new invitation after expiry or cancellation is a plain'
  + ' insert rather than a conflict');

// The old permanent dead end: refusing on profile_id alone.
check('CONTRACT', 'IDP-C7 the invite action does not refuse on a person-to-login LINK, only on real'
  + ' membership',
  /company_memberships"\)/.test(inviteTight) && /\.eq\("active",true\)/.test(inviteTight)
  && !/if\(person\.profile_id\)return/.test(inviteTight),
  'refusing on person.profile_id alone is what made a half-finished invitation permanently unrepeatable:'
  + ' a link between an HR record and a login is evidence of neither acceptance nor membership');

// Retry safety of the failure path.
check('CONTRACT', 'IDP-C8 a delivery failure leaves the invitation standing and reports itself retryable',
  /"DELIVERY_FAILED"/.test(invite) && /ok: true/.test(invite),
  'returning ok:false on a delivery failure would say "nothing happened" while a governed invitation is'
  + ' standing, and the founder would click again expecting to create one');

// Acceptance must not re-implement any of the above.
check('CONTRACT', 'IDP-C9 the acceptance module adds no second authority over single use or expiry',
  !/status/.test(accept.replace(/['"][^'"]*['"]/g, '')) && !/expires/.test(accept),
  'every one of those checks lives in the RPC; a second copy here could disagree with the first, and the'
  + ' disagreement would be invisible until it mattered');

console.log('');
console.log('invitation_idempotency_contract: ' + pass + ' passed, ' + failures.length + ' failed');
console.log('Each case the contract names is held by a DATABASE constraint or predicate, not by application');
console.log('sequencing — two clicks are two requests, and an application check races itself.');
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); process.exit(1); }
