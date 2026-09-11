#!/usr/bin/env node
// DELIVERY STATE BELONGS TO THE INVITATION — and BUG-037 is that there is no terminal one.
//
// FOUNDER CONTRACT, 2026-09-11:
//   "Do not grant membership merely because auth user creation succeeded / the provider accepted the API
//    request / an email send was attempted. SENT must mean the defined delivery contract reached its
//    terminal success state. DELIVERY_FAILED must remain retryable."
//
// THE HONEST CONSEQUENCE, AND THE ONE THIS SUITE EXISTS TO HOLD. Nothing in this system can observe
// terminal delivery success. There is no provider webhook, no delivery query, and no column on
// company_invitations to record one in. So `SENT` IS NOT REACHABLE, and the invite action must not return
// it — a successful click ends at DELIVERY_PENDING.
//
// DS-D1 states that unreachability as a NAMED RED ROW rather than leaving it as a comment. The alternative
// is a vocabulary that contains a state nothing can set, which is indistinguishable from a state that
// works until someone is told an email arrived that did not. That row is BUG-037's remaining half and it
// closes when delivery state is persisted and confirmed, not before.
//
// WHAT THIS SUITE CANNOT DO. It is a SOURCE contract: no database, no mail provider, no network. It can
// prove that the code never claims delivery it has not observed. It cannot prove an email arrives, and a
// row claiming otherwise would be the exact defect it is here to prevent.
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

// Comments name the states too, so a text scan that reads them answers a different question from the one
// its name claims. Strings are kept: the state names ARE string literals.
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

const vocabRaw = readFileSync(join(ROOT, 'web/lib/data/invitation-outcome.ts'), 'utf8');
const vocab = commentsBlanked(vocabRaw);
const peopleRaw = readFileSync(join(ROOT, 'web/lib/data/people.ts'), 'utf8');
const invite = commentsBlanked((peopleRaw.match(/export async function invitePerson[\s\S]*?\n}/) || [''])[0]);
const MIG = join(ROOT, 'supabase/migrations/202608310009_invite_only_signup.sql');
const sql = existsSync(MIG) ? readFileSync(MIG, 'utf8') : '';

check('CONTRACT', 'DS-C0 the vocabulary and the invite action are both present and non-trivial',
  vocab.length > 2000 && invite.length > 800,
  'vocabulary ' + vocab.length + ' bytes, invitePerson ' + invite.length + ' bytes');

// ── The lifecycle is the founder's, exactly ─────────────────────────────────────────────────────────
const STATES = (vocab.match(/export const INVITATION_STATES = \[([\s\S]*?)\] as const;/) || [, ''])[1]
  .split(NL).map((l) => (l.match(/'([A-Z_]+)'/) || [])[1]).filter(Boolean);
const REQUIRED = ['INVITATION_CREATED', 'DELIVERY_PENDING', 'SENT', 'ACCEPTED', 'MEMBERSHIP_ACTIVE',
  'DELIVERY_FAILED', 'EXPIRED', 'CANCELLED'];
check('CONTRACT', 'DS-C1 the lifecycle carries every state the founder named, and no invented extras ('
  + STATES.length + ')',
  REQUIRED.every((s) => STATES.includes(s)) && STATES.every((s) => REQUIRED.includes(s)),
  'declared ' + JSON.stringify(STATES) + ' vs required ' + JSON.stringify(REQUIRED));

// ── SENT is never claimed ───────────────────────────────────────────────────────────────────────────
check('CONTRACT', 'DS-C2 the invite action NEVER returns SENT, because nothing here can observe delivery',
  !/"SENT"|'SENT'/.test(invite),
  'the old code returned SENT the moment inviteUserByEmail came back without an error, which is a FALSE'
  + ' SENT: a mailer accepting a message is not the delivery contract reaching terminal success');

check('CONTRACT', 'DS-C3 a successful invite ends at DELIVERY_PENDING',
  /"DELIVERY_PENDING"/.test(invite),
  'the honest terminal state of a click that created an invitation and handed off a message');

// ── Retryability is the founder's requirement, not a preference ─────────────────────────────────────
const RETRY = (vocab.match(/export const RETRYABLE: ReadonlySet<InvitationOutcome> = new Set<InvitationOutcome>\(\[([\s\S]*?)\]\)/) || [, ''])[1];
check('CONTRACT', 'DS-C4 DELIVERY_FAILED is retryable, and identity or authority refusals are not',
  /'DELIVERY_FAILED'/.test(RETRY)
  && !/'ALREADY_MEMBER'/.test(RETRY) && !/'NOT_PERMITTED'/.test(RETRY) && !/'INVALID_RECIPIENT'/.test(RETRY),
  'retrying a refusal of identity or authority cannot change it; retrying a delivery can. ' + JSON.stringify(RETRY.trim()));

// ── None of the three things the founder forbade as grounds for membership ──────────────────────────
check('CONTRACT', 'DS-C5 neither an auth user, a provider acceptance nor a send attempt grants membership',
  !/company_memberships"\)\.insert/.test(invite.replace(/\s+/g, ''))
  && !/\.update\(\{active:true\}\)/.test(invite.replace(/\s+/g, '')),
  'the three grounds the contract names explicitly, none of which is acceptance');

// ── A delivery failure must not read as "nothing happened" ──────────────────────────────────────────
const described = (vocabRaw.match(/case 'DELIVERY_FAILED':[\s\S]*?return `([^`]*)`/) || [, ''])[1];
check('CONTRACT', 'DS-C6 the DELIVERY_FAILED sentence says the invitation EXISTS and may be resent',
  /exists/i.test(described) && /again/i.test(described) && !/nothing was changed/i.test(described),
  'telling the founder "nothing was changed" when a governed invitation is standing is how duplicates get'
  + ' made: ' + JSON.stringify(described));

// ── What is NOT yet true, named rather than omitted ─────────────────────────────────────────────────
//
// This row is BUG-037's remaining half. It is RED, and it is red for a reason that is founder-gated: the
// column it needs is a production migration.
const hasDeliveryColumn = /delivery_state|delivery_status|delivered_at/.test(sql);
check('DEFECT', 'DS-D1 delivery state is PERSISTED on the invitation, so SENT is reachable and a failure'
  + ' survives a reload (BUG-037 remaining half)',
  hasDeliveryColumn,
  'company_invitations has status (pending/accepted/revoked/expired) — the INVITATION axis — and no'
  + ' DELIVERY axis at all. So DELIVERY_PENDING and DELIVERY_FAILED live only in the reply to one click:'
  + ' reload the page and the distinction is gone, and SENT can never be set by anything. Adding the'
  + ' column is a production migration and therefore BLOCKED — FOUNDER AUTHORIZATION. The draft is'
  + ' supabase/drafts/, deliberately outside the applied migration path.');

console.log('');
console.log('invitation_delivery_state_contract: ' + pass + ' passed, ' + failures.length + ' failed');
console.log('RED BY DESIGN: DS-D1 — delivery state is not persisted. That is BUG-037’s remaining half and');
console.log('it needs a production migration, which is a founder authorization. Everything this suite CAN');
console.log('prove without a database is green: the code never claims a delivery it has not observed.');
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); process.exit(1); }
