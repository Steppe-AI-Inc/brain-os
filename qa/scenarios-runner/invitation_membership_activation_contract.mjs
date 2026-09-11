#!/usr/bin/env node
// MEMBERSHIP ACTIVATION — there is exactly one gate, and it is not in TypeScript.
//
// FOUNDER CONTRACT: "acceptance through the governed invitation contract — ONLY THEN create/activate
// company membership." So the property is not "membership is created carefully". It is that the ONLY thing
// in this repository that can create or activate a company membership for an invited person is
// accept_company_invitation(token), and that nothing in the application can reach it with arguments that
// widen what a recipient receives.
//
// THE NARROW GATE IS THE WHOLE DESIGN. accept_company_invitation is SECURITY DEFINER because an inert new
// profile has no membership row and therefore no RLS standing to write one. That is a real privilege
// boundary, and the thing that makes it safe is that its signature takes NO company and NO role: both are
// read from the stored invitation. A caller cannot ask for more than it was given, because there is nowhere
// to ask.
//
// SOURCE CONTRACT. It proves the grant is unreachable except through the gate, and that the gate's inputs
// cannot carry authority. It does not execute a grant.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
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
const acceptPath = join(ROOT, 'web/lib/data/accept-invitation.ts');
const accept = existsSync(acceptPath) ? commentsBlanked(readFileSync(acceptPath, 'utf8')) : '';

// EVERY .ts/.tsx UNDER web/lib/data AND web/app, so the claim is about the application rather than about
// the two files I happened to look at. node_modules and build output are excluded by construction.
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const appFiles = [...walk(join(ROOT, 'web/lib')), ...walk(join(ROOT, 'web/app'))];

check('CONTRACT', 'MA-C0 the acceptance gate and its caller are both present',
  /accept_company_invitation/.test(sql) && accept.length > 400,
  'migration ' + sql.length + ' bytes, accept module ' + accept.length + ' bytes over '
  + appFiles.length + ' application files scanned');

// ── The grant exists in exactly one place, and it is SQL ────────────────────────────────────────────
// CREATES OR ACTIVATES. NOT "WRITES".
//
// This scan used to match `.insert | .upsert | .update` on company_memberships, while its claim is "creates
// or ACTIVATES". Those are not the same set, and the difference surfaced the moment BUG-035's IM-D5 was
// closed: a governed surface that DEACTIVATES a membership — which another suite REQUIRES to exist, because
// without it an accepted invitation produces an active member no screen can undo — was reported here as a
// second authority granting membership. It grants nothing. It only ever takes access away.
//
// Two suites contradicting each other is the signal; the resolution is to make the predicate say what the
// sentence says. An insert, an upsert, or an update that sets `active: true`. MA-C1b keeps the narrowing
// honest by proving an activating update is still caught.
const activatesMembership = (t) => /company_memberships"\)\.(insert|upsert)/.test(t)
  || /company_memberships"\)[\s\S]{0,80}\.update\(\{[^}]*active:true/.test(t);
const tsWriters = appFiles.filter((f) => {
  const t = commentsBlanked(readFileSync(f, 'utf8')).replace(/[ \t\r\n]+/g, '');
  return activatesMembership(t);
});
check('CONTRACT', 'MA-C1 NO application file creates or activates a company membership (' + appFiles.length
  + ' files scanned)',
  tsWriters.length === 0,
  'writers found: ' + JSON.stringify(tsWriters.map((f) => f.replace(ROOT, ''))) + ' — every one of these is a'
  + ' second authority over membership that the acceptance gate cannot see');

// A NARROWED CHECK NEEDS A FIXTURE, or the narrowing is just a way of going green.
{
  const caught = [
    'supabase.from("company_memberships").insert({company_id:c,profile_id:p,active:true})',
    'supabase.from("company_memberships").upsert({company_id:c,profile_id:p})',
    'supabase.from("company_memberships").eq("id",id).update({active:true})',
  ].map((t) => activatesMembership(t.replace(/[ \t\r\n]+/g, '')));
  const notCaught = [
    'supabase.from("company_memberships").eq("id",id).update({active:false})',
    'supabase.from("company_memberships").select("id,active")',
  ].map((t) => activatesMembership(t.replace(/[ \t\r\n]+/g, '')));
  check('CONTRACT', 'MA-C1b the narrowed scan still catches every ACTIVATING write, and no longer reports a'
    + ' deactivation as one',
    caught.every(Boolean) && notCaught.every((x) => x === false),
    'activating shapes caught: ' + JSON.stringify(caught) + ', deactivation/read caught: '
    + JSON.stringify(notCaught) + ' — if the first three are not all true, this row is the finding and MA-C1'
    + ' above is green for the wrong reason');
}

check('CONTRACT', 'MA-C2 the gate grants membership with the company AND role read from the stored row',
  /insert into public\.company_memberships[\s\S]{0,200}v_invitation\.company_id[\s\S]{0,120}v_invitation\.invited_role/.test(sql),
  'both values come from the invitation, so the grant is exactly what the inviter specified and nothing the'
  + ' recipient chose');

check('CONTRACT', 'MA-C3 the gate takes NO company and NO role parameter at all',
  /function public\.accept_company_invitation\(p_token text\)/.test(sql),
  'the only defence against a caller asking for more authority than it was given is there being nowhere to'
  + ' ask: a company_id or role parameter here would be a privilege-escalation surface');

check('CONTRACT', 'MA-C4 the application passes ONLY a token to the gate',
  /rpc\("accept_company_invitation", \{ p_token: t \}\)/.test(accept)
  && !/p_company|p_role|company_id|invited_role/.test(accept),
  'a second argument from the client would defeat MA-C3 even with the signature intact');

check('CONTRACT', 'MA-C5 activation is part of acceptance, not a separate step anything else can perform',
  /update public\.profiles set role = v_invitation\.invited_role[\s\S]{0,80}active = true/.test(sql),
  'the profile becomes active in the same transaction that records the acceptance, so there is no window in'
  + ' which someone is active without an accepted invitation');

const profileWriters = appFiles.filter((f) => {
  const t = commentsBlanked(readFileSync(f, 'utf8')).replace(/[ \t\r\n]+/g, '');
  return /profiles"\)\.update\(\{active:true/.test(t);
});
check('CONTRACT', 'MA-C6 no application file activates a profile as a substitute for acceptance',
  profileWriters.length === 0,
  'writers found: ' + JSON.stringify(profileWriters.map((f) => f.replace(ROOT, ''))));

check('CONTRACT', 'MA-C7 acceptance is recorded, not merely performed',
  /set status = 'accepted', accepted_at = now\(\), accepted_by_profile_id = v_profile_id/.test(sql),
  'who accepted and when is what makes a membership auditable back to an invitation; without it a member'
  + ' exists for no recorded reason');

console.log('');
console.log('invitation_membership_activation_contract: ' + pass + ' passed, ' + failures.length + ' failed');
console.log('The claim is about the whole application, not two files: MA-C1 and MA-C6 scan every .ts/.tsx');
console.log('under web/lib and web/app and report any second authority over membership by path.');
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); process.exit(1); }
