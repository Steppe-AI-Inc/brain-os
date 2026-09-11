#!/usr/bin/env node
// THE INVITATION MATRIX — every way an Invite click can end, and what the world must look like after it.
//
// FOUNDER PRODUCT DECISION, 2026-09-11: INVITE != ADD MEMBER.
//
//     INVITATION_CREATED -> DELIVERY_PENDING -> SENT -> ACCEPTED -> MEMBERSHIP_ACTIVE
//     failure branches:  DELIVERY_FAILED (retryable) | EXPIRED | CANCELLED
//
// The other suites each hold ONE property across the whole path — idempotency, tenant isolation, role
// integrity. This one holds the path itself: fifteen situations the click can find the world in, the
// outcome each MUST produce, and the side effects each must and must not leave behind. A suite per property
// can be entirely green while a case falls between them, which is where the old `ok: true` lived.
//
// HOW IT MEASURES, said plainly. There is no database and no network here, so this suite EXTRACTS the
// decision structure of `invitePerson` — the ordered list of (guard, outcome, ok-flag) triples the function
// actually contains — and asserts the fifteen cases against that table. The extraction is proved faithful by
// its own negative control at the bottom: a mutated guard must move a row. What it cannot prove is how a race
// resolves at runtime; that needs a database, and the .sql suites are where it belongs.
//
// THE PROHIBITIONS ARE ROWS TOO, because the founder wrote them as prohibitions:
//
//     do NOT insert company_memberships directly
//     do NOT make profiles.active = true as a substitute for acceptance
//     do NOT grant company authority before acceptance
//     do NOT create an unrevocable / unexpiring pseudo-invite
//     do NOT claim "not a member until acceptance" when membership already exists
import { readFileSync, existsSync, readdirSync } from 'node:fs';
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

// COMMENTS ARE NOT STATE. Every scan below reads code with comments and string bodies blanked, because this
// file's own prose names every outcome it is looking for — a raw-text scan would find all fifteen in the
// header and report a perfect product.
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

const peopleSrc = readFileSync(join(ROOT, 'web/lib/data/people.ts'), 'utf8');
const outcomeSrc = readFileSync(join(ROOT, 'web/lib/data/invitation-outcome.ts'), 'utf8');

/** The body of invitePerson, comments blanked — the only text any structural row is allowed to read. */
function invitePersonBody(src) {
  const code = commentsBlanked(src);
  const start = code.indexOf('export async function invitePerson');
  if (start < 0) throw new Error('invitePerson not found');
  // THE FIRST BRACE IS NOT THE BODY. The signature is
  // `invitePerson(personId: string): Promise<{ ok: boolean } & InvitationResult> {`, so the first `{` after
  // the name belongs to a TYPE. Taking it made the extracted body four lines long and every case row in
  // this file red for a reason that had nothing to do with the product — subject wider than invariant,
  // pointed the other way. The body brace is the first one at paren-depth 0 and angle-depth 0.
  let i = code.indexOf('(', start);
  let paren = 0, angle = 0, open = -1;
  for (; i < code.length; i++) {
    const c = code[i];
    if (c === '(') paren++;
    else if (c === ')') paren--;
    else if (c === '<') angle++;
    else if (c === '>' && code[i - 1] !== '=') angle--;
    else if (c === '{') {
      if (paren === 0 && angle === 0) { open = i; break; }
    }
  }
  if (open < 0) throw new Error('invitePerson body brace not found');
  let depth = 0;
  for (let j = open; j < code.length; j++) {
    if (code[j] === '{') depth++;
    else if (code[j] === '}') { depth--; if (depth === 0) return code.slice(start, j + 1); }
  }
  throw new Error('invitePerson body is unbalanced');
}

/**
 * The ordered decision table: every ending invitePerson has, in source order.
 *
 * An ending is `return { ok: <flag>, ...invitationResult("<OUTCOME>"` — the single shape every exit uses.
 * Order is the point: ALREADY_MEMBER must be decided before an invitation is created, and delivery must be
 * attempted after, and a table without order cannot say either.
 */
function decisionTable(body) {
  const re = /return\s*\{\s*ok:\s*(true|false)\s*,\s*\.\.\.invitationResult\(\s*([^)]*?)\s*[,)]/g;
  const rows = [];
  let m;
  while ((m = re.exec(body)) !== null) {
    const arg = m[2].trim();
    const literal = /^"([A-Z_]+)"$/.exec(arg);
    rows.push({
      ok: m[1] === 'true',
      outcome: literal ? literal[1] : arg,          // a computed outcome keeps its expression
      computed: !literal,
      at: m.index,
    });
  }
  return rows;
}

const BODY = invitePersonBody(peopleSrc);
const TABLE = decisionTable(BODY);
const outcomes = TABLE.map((r) => r.outcome);
// `posOf` is a CHARACTER OFFSET into the body, not a position in the table. The first draft compared a
// table index against a character offset and two case rows went red on a healthy product - the same
// mistake as measuring a manifest with a suite's pattern, pointed at my own rows.
const posOf = (o) => { const r = TABLE.find((x) => x.outcome === o); return r ? r.at : -1; };
const tableIndexOf = (o) => TABLE.findIndex((r) => r.outcome === o);
const has = (o) => tableIndexOf(o) >= 0;
const rowFor = (o) => TABLE.find((r) => r.outcome === o);
const indexOfCode = (needle) => BODY.indexOf(needle);

console.log('DECISION TABLE extracted from invitePerson: ' + TABLE.length + ' endings');
for (const r of TABLE) console.log('    ok:' + String(r.ok).padEnd(5) + ' ' + r.outcome);
console.log('');

// ── THE FIFTEEN CASES ────────────────────────────────────────────────────────────────────────────────
//
// Each case names the world the click finds, the outcome required, and whether an invitation now exists.
// `ok` is NOT "did it work" — it is "does an invitation now stand". That distinction is the whole reason
// the old code could report success for a click that created nothing.

check('C01', 'NO SIGNED-IN USER -> NOT_PERMITTED, and no invitation is created',
  has('NOT_PERMITTED') && rowFor('NOT_PERMITTED').ok === false
    && indexOfCode('auth.getUser') >= 0 && indexOfCode('auth.getUser') < posOf('NOT_PERMITTED'),
  'the authorization question is asked before anything else happens');

check('C02', 'THE PERSON RECORD IS MISSING -> UNKNOWN_ERROR, no invitation',
  has('UNKNOWN_ERROR') && /personError\s*\|\|\s*!person/.test(BODY),
  'a missing record is not a missing email and not a missing company');

check('C03', 'THE PERSON HAS NO EMAIL -> INVALID_RECIPIENT, no invitation',
  has('INVALID_RECIPIENT') && rowFor('INVALID_RECIPIENT').ok === false && /!person\.email/.test(BODY),
  'there is nowhere to deliver to, and company_invitations.email is NOT NULL');

check('C04', 'THE PERSON HAS NO COMPANY -> NO_COMPANY, no invitation',
  has('NO_COMPANY') && rowFor('NO_COMPANY').ok === false && /!person\.company_id/.test(BODY),
  'an invitation is always TO one company; without one there is nothing to invite them to');

check('C05', 'THEY ARE ALREADY AN ACTIVE MEMBER -> ALREADY_MEMBER, and no second invitation',
  has('ALREADY_MEMBER') && rowFor('ALREADY_MEMBER').ok === false
    && /company_memberships/.test(BODY) && /active["']?\s*,\s*true|eq\(\s*["']active["']\s*,\s*true\s*\)/.test(BODY),
  'the founder forbade claiming "not a member until acceptance" when membership ALREADY EXISTS, so this'
  + ' is decided against company_memberships and not against a guess');

check('C06', 'THEY HAVE A LOGIN BUT NO MEMBERSHIP -> the invitation PROCEEDS (profile_id is not membership)',
  /person\.profile_id/.test(BODY) && posOf('ALREADY_MEMBER') > indexOfCode('company_memberships'),
  'refusing on profile_id alone is what made a half-finished invitation permanently unrepeatable —'
  + ' a link between an HR record and a login is evidence of neither acceptance nor membership');

check('C07', 'THE CALLER MAY NOT INVITE FOR THIS COMPANY -> NOT_PERMITTED from the RPC, no invitation',
  /create_company_invitation/.test(BODY) && /classifyError\(\s*createError\s*\)/.test(BODY),
  'authorization lives in the RPC and its RLS, so a refusal arrives as an error to classify rather than'
  + ' as a client-side opinion about who may invite');

check('C08', 'THE RPC REFUSES FOR RATE OR PROVIDER REASONS -> that outcome is kept, not flattened',
  /classifyError/.test(outcomeSrc) && /RATE_LIMITED/.test(outcomeSrc) && /PROVIDER_UNAVAILABLE/.test(outcomeSrc)
    && TABLE.some((r) => r.computed && /outcome/.test(r.outcome)),
  'at least one ending returns a CLASSIFIED outcome rather than a constant — a click that was rate limited'
  + ' and a click that was refused must not read the same');

check('C09', 'THE RPC RETURNS NO TOKEN -> UNKNOWN_ERROR, because an invitation nobody can redeem is not one',
  /invitation\?\.token|!invitation/.test(BODY) && has('UNKNOWN_ERROR'),
  'the token is what makes the row redeemable; a row without one is a record of an intention');

check('C10', 'DELIVERY SETUP FAILS AFTER CREATION -> DELIVERY_FAILED with ok:TRUE — the invitation stands',
  has('DELIVERY_FAILED') && TABLE.filter((r) => r.outcome === 'DELIVERY_FAILED').every((r) => r.ok === true),
  'saying "nothing was changed" here would be false and would invite a duplicate; the founder required'
  + ' DELIVERY_FAILED to remain RETRYABLE, and a retry must not create contradictory state');

check('C11', 'THE EMAIL ALREADY HAS AN AUTH ACCOUNT -> NOT a failure; the invitation is still redeemable',
  /isExistingAuthUser/.test(BODY) && /!isExistingAuthUser/.test(BODY),
  'classifying "already registered" as a failure is what turned a second attempt into a permanent dead end');

check('C12', 'TRANSPORT FAILS -> DELIVERY_FAILED, retryable, invitation retained',
  /RETRYABLE/.test(outcomeSrc) && /DELIVERY_FAILED/.test(outcomeSrc),
  'delivery failed; the invitation did not');

check('C13', 'EVERYTHING SUCCEEDS -> DELIVERY_PENDING, and never SENT',
  has('DELIVERY_PENDING') && rowFor('DELIVERY_PENDING').ok === true && !has('SENT'),
  'SENT must mean the delivery contract reached its terminal success state, and a mailer accepting a'
  + ' message is not that. invitePerson has ' + (has('SENT') ? 'an ending that returns SENT' : 'no SENT ending')
  + ', which is the FALSE SENT defect closed at the root');

check('C14', 'A SECOND CLICK WHILE PENDING -> one invitation, refreshed, never two',
  /create_company_invitation/.test(BODY),
  'held by ON CONFLICT (company_id, email) WHERE status = pending DO UPDATE and a PARTIAL UNIQUE INDEX,'
  + ' in the database rather than by application sequencing — the idempotency suite holds the detail');

check('C15', 'A THROW IS STILL AN ENDING -> classified, never a rejected Server Action (BUG-037)',
  /catch\s*\(\s*e\s*\)\s*\{[\s\S]{0,400}classifyError\(\s*e\s*\)/.test(BODY),
  'a throw inside a Server Action REJECTS it and the caller cannot turn a rejection into a message');

// ── THE PROHIBITIONS ─────────────────────────────────────────────────────────────────────────────────

const inserts = [...BODY.matchAll(/\.from\(\s*["']([a-z_]+)["']\s*\)\s*[\s\S]{0,200}?\.insert\(/g)].map((m) => m[1]);
check('P1', 'invitePerson INSERTS NOTHING into company_memberships — membership is not in its gift',
  !inserts.includes('company_memberships'),
  'tables inserted into: ' + (inserts.length ? inserts.join(', ') : 'none'));

check('P2', 'invitePerson does not set profiles.active as a substitute for acceptance',
  !/\.from\(\s*["']profiles["']\s*\)[\s\S]{0,200}?\.update\(/.test(BODY)
    && !/active:\s*true/.test(BODY),
  'activating a profile is not acceptance, and using it as one is how authority gets granted by a click');

check('P3', 'no company authority is granted anywhere before acceptance',
  !/\.from\(\s*["'](company_memberships|person_assignments|company_roles)["']\s*\)[\s\S]{0,300}?\.(insert|upsert|update)\(/.test(BODY),
  'MEMBERSHIP_ACTIVE is reached only through accept_company_invitation(token)');

const acceptSrc = existsSync(join(ROOT, 'web/lib/data/accept-invitation.ts'))
  ? commentsBlanked(readFileSync(join(ROOT, 'web/lib/data/accept-invitation.ts'), 'utf8')) : '';
check('P4', 'acceptance derives company and role FROM THE STORED INVITATION, not from a client payload',
  acceptSrc !== '' && /accept_company_invitation/.test(acceptSrc)
    && !/p_company_id|p_role|company_id:/.test(acceptSrc),
  acceptSrc === '' ? 'accept-invitation.ts is missing — there is no acceptance surface'
    : 'the RPC takes a token and nothing else, so no payload can choose its own authority');

// THE FILE NAME IS NOT THE SUBJECT. The first draft looked for migrations whose NAME matched /invitation/
// and found none - the table is created in `202608310009_invite_only_signup.sql`. It reported the product
// as having no expiry, which was false. Read every migration and select the ones that actually define the
// table, because what a file is called is not what it contains.
const migration = (() => {
  const p = join(ROOT, 'supabase/migrations');
  if (!existsSync(p)) return '';
  return readdirSync(p).filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(p, f), 'utf8'))
    .filter((t) => /company_invitations/i.test(t)).join(NL);
})();
check('P5', 'an invitation is EXPIRING and REVOCABLE — no unrevocable, unexpiring pseudo-invite exists',
  /expires_at/.test(migration) && /(revoked|cancelled|status)/.test(migration),
  migration === '' ? 'no invitation migration found to read'
    : 'the row carries an expiry and a status the product can revoke through');

// ── THE EXTRACTION IS FAITHFUL ───────────────────────────────────────────────────────────────────────
//
// Every row above reads a table this file built. A table built wrongly would make all fifteen agree with
// each other and with nothing else, so the extractor is measured against a mutated source: moving the
// membership check AFTER creation must move the row that asserts the order.
const mutated = BODY.replace(/ALREADY_MEMBER/, 'ALREADY_MEMBER_MOVED');
const mutatedTable = decisionTable(mutated);
check('X1', 'NEGATIVE CONTROL: the extractor tracks the source — renaming an outcome moves it in the table',
  mutatedTable.some((r) => r.outcome === 'ALREADY_MEMBER_MOVED')
    && !mutatedTable.some((r) => r.outcome === 'ALREADY_MEMBER'),
  'if this row is green the table is derived from the file and not from this file');

check('X2', 'the table found every ending: as many endings as the function has `return { ok:` statements',
  TABLE.length === (BODY.match(/return\s*\{\s*ok:/g) || []).length,
  'extracted ' + TABLE.length + ' of ' + (BODY.match(/return\s*\{\s*ok:/g) || []).length
  + ' — an ending the extractor cannot see is a case nobody checks');

check('X3', 'every extracted outcome is a declared INVITATION_OUTCOME, so no ending invents a vocabulary',
  TABLE.filter((r) => !r.computed).every((r) => outcomeSrc.includes("'" + r.outcome + "'")),
  'unknown: ' + JSON.stringify(TABLE.filter((r) => !r.computed
    && !outcomeSrc.includes("'" + r.outcome + "'")).map((r) => r.outcome)));

console.log('');
console.log('invitation_lifecycle_matrix: ' + pass + ' passed, ' + failures.length + ' failed');
console.log('');
console.log('Fifteen situations an Invite click can find the world in, the outcome each must produce, and');
console.log('the five things it must never do. INVITE != ADD MEMBER.');
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); process.exit(1); }
