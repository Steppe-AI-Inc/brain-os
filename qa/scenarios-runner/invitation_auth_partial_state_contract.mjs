#!/usr/bin/env node
// AUTH-USER PARTIAL STATE — the class of defect that has no instances left, and why that is the claim.
//
// THE OLD SHAPE. invitePerson did five writes AFTER the mail call: read the profile the auth trigger made,
// set profiles.active = true, link people.profile_id, insert company_memberships. Any one of them could
// fail with the auth user already created, leaving a half-made member that a second click could not repair
// because the retry hit "already registered" and the profile_id guard. `bookkeepingFailure` existed to
// report that state politely.
//
// THE CLAIM THIS SUITE MAKES. There are NO WRITES AFTER THE MAIL CALL any more, so the partial state cannot
// be constructed. That is a stronger claim than "the error handling is better", and it is checkable: the
// rows below establish that the only write in the action is the invitation itself, which happens BEFORE
// delivery and is idempotent.
//
// AND AN EXISTING AUTH ACCOUNT IS NOT A FAILURE. It is control flow: the invitation exists, it is bound to
// that email, and the person signs in and accepts. Classifying "already registered" as an error is what
// turned the second click into a permanent dead end.
//
// SOURCE CONTRACT: no database, no auth provider. It proves the WRITES ARE NOT THERE. It cannot prove the
// provider behaves as documented.
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

const peopleRaw = readFileSync(join(ROOT, 'web/lib/data/people.ts'), 'utf8');
const invite = commentsBlanked((peopleRaw.match(/export async function invitePerson[\s\S]*?\n}/) || [''])[0]);
const tight = invite.replace(/[ \t\r\n]+/g, '');
const vocab = commentsBlanked(readFileSync(join(ROOT, 'web/lib/data/invitation-outcome.ts'), 'utf8'));
// classifyError's body alone: from its declaration to the next top-level export. Everything after it in
// the file is a different function with different rules.
const classifyErrorBody = (() => {
  const at = vocab.indexOf('export function classifyError');
  if (at < 0) return '';
  const rest = vocab.slice(at + 'export function classifyError'.length);
  const end = rest.indexOf('export ');
  return end < 0 ? rest : rest.slice(0, end);
})();
const MIG = join(ROOT, 'supabase/migrations/202608310009_invite_only_signup.sql');
const sql = existsSync(MIG) ? readFileSync(MIG, 'utf8') : '';

check('CONTRACT', 'AP-C0 the invite action is present and non-trivial',
  invite.length > 800, 'invitePerson ' + invite.length + ' bytes');

// ── There is nothing left to half-finish ────────────────────────────────────────────────────────────
//
// Measured by POSITION, not by absence alone: the claim is that the mail call is the LAST thing that can
// change anything, so every write must appear before it.
const mailAt = tight.indexOf('inviteUserByEmail');
const writes = ['.insert(', '.update(', '.upsert(', '.delete('];
const afterMail = writes.filter((w) => {
  const i = tight.indexOf(w, mailAt);
  return mailAt >= 0 && i > mailAt;
});
check('CONTRACT', 'AP-C1 NO write happens after the mail call, so an auth user cannot be left half-linked',
  mailAt >= 0 && afterMail.length === 0,
  mailAt < 0 ? 'the mail call was not found at all' : 'found after the mail call: ' + JSON.stringify(afterMail)
    + ' — every one of these is a chance to leave a member half-made that no retry can repair');

check('CONTRACT', 'AP-C2 the profile the auth trigger created is neither read nor activated here',
  !/from\("profiles"\)/.test(tight) && !/\{active:true\}/.test(tight),
  'reading it was how the old code found something to activate; activating it was the substitute for'
  + ' acceptance the contract forbids');

check('CONTRACT', 'AP-C3 the person-to-login LINK is not written by the invite action',
  !/from\("people"\)\.update/.test(tight),
  'linking people.profile_id at invite time asserts a relationship acceptance has not established yet');

check('CONTRACT', 'AP-C4 no bookkeeping-failure reporter survives, because there is no bookkeeping',
  // commentsBlanked, not the raw file: this suite's own sibling comment names the removed helper, and a
  // row satisfied or broken by a comment is measuring prose.
  !/bookkeepingFailure/.test(commentsBlanked(peopleRaw)),
  'a reporter for a state that can no longer occur is a standing invitation to recreate the state');

// ── An existing auth account is control flow ────────────────────────────────────────────────────────
check('CONTRACT', 'AP-C5 "already registered" is tested as CONTROL FLOW, not classified as a failure',
  /isExistingAuthUser/.test(tight) && /isExistingAuthUser/.test(vocab),
  'the invitation exists and is redeemable either way; the person signs in and accepts');

check('CONTRACT', 'AP-C6 the error classifier does NOT map an existing account onto a failure outcome',
  // BOUNDED TO classifyError ITSELF. Splitting on the name and taking everything after it swept in
  // isExistingAuthUser, whose entire purpose is to match that phrase — so the row failed on the very
  // design it exists to confirm.
  !/already registered/.test(classifyErrorBody),
  'classifying it as a failure is what made the second click a permanent dead end');

// ── An auth user, by itself, grants nothing ─────────────────────────────────────────────────────────
check('CONTRACT', 'AP-C7 the auth trigger creates every new account INERT, so an auth user is not access',
  /handle_new_auth_user/.test(sql) && /active\)/.test(sql) && /false/.test(sql),
  'migration 202608310009: a signup lands active=false with zero memberships, regardless of invite status —'
  + ' which is why creating an auth user is not a grant and must not be treated as one');

check('CONTRACT', 'AP-C8 the invitation is created BEFORE the service-role client exists',
  tight.indexOf('create_company_invitation') >= 0
  && tight.indexOf('create_company_invitation') < tight.indexOf('createAdminClient'),
  'ordering is the authorization: the governed RPC runs on the caller’s own client under RLS, and an'
  + ' unauthorised caller must never reach a service-role client at all');

console.log('');
console.log('invitation_auth_partial_state_contract: ' + pass + ' passed, ' + failures.length + ' failed');
console.log('The claim is not "partial state is handled better" — it is that there are no writes after the');
console.log('mail call, so the partial state cannot be constructed. AP-C1 measures that by POSITION.');
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); process.exit(1); }
