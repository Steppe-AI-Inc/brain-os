#!/usr/bin/env node
// RELOAD AND RETRY — every ending is terminal, and nothing is granted twice.
//
// BUG-037 is not "a missing message". It is that the action did not END: the Server Action rejected, the
// caller's `setInvitingId(null)` sat after the await and never ran, and the row spun for ever. So the rows
// here are about ENDINGS — on the server, in the caller, and after a page reload, which is the case nobody
// tests until a user does it.
//
// THE RELOAD CASE IS THE SUBTLE ONE AND IT IS DELIBERATELY HONEST. The acceptance page redeems on render,
// because an emailed link is followed by mail-client prefetchers as often as by people and a confirm button
// would not stop a double redemption. What stops it is the database: the lookup is `status = 'pending'`
// under `for update`. A reload therefore reports ALREADY_USED on an invitation that genuinely succeeded —
// which is true, and is why success and already-used are worded as two different sentences instead of one
// hedged one that covers both and commits to neither.
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
const tableRaw = readFileSync(join(ROOT, 'web/app/(app)/people/people-table.tsx'), 'utf8');
const table = commentsBlanked(tableRaw);
const confirm = (table.match(/function confirmInvite[\s\S]*?\n  }/) || [''])[0];
const acceptPath = join(ROOT, 'web/lib/data/accept-invitation.ts');
const accept = existsSync(acceptPath) ? commentsBlanked(readFileSync(acceptPath, 'utf8')) : '';
const pagePath = join(ROOT, 'web/app/accept-invitation/page.tsx');
const page = existsSync(pagePath) ? readFileSync(pagePath, 'utf8') : '';
const MIG = join(ROOT, 'supabase/migrations/202608310009_invite_only_signup.sql');
const sql = existsSync(MIG) ? readFileSync(MIG, 'utf8') : '';

check('CONTRACT', 'RR-C0 both halves and the caller are present',
  invite.length > 800 && confirm.length > 100 && accept.length > 400 && page.length > 400,
  'invite ' + invite.length + ', caller ' + confirm.length + ', accept ' + accept.length + ', page ' + page.length);

// ── The server always ends ──────────────────────────────────────────────────────────────────────────
const lastRisky = Math.max(invite.lastIndexOf('inviteUserByEmail'), invite.lastIndexOf('rpc('));
check('CONTRACT', 'RR-C1 the invite action CATCHES after its last risky await, not merely somewhere',
  lastRisky > 0 && invite.lastIndexOf('catch') > lastRisky,
  'a try that closes before the awaits leaves them able to reject the Server Action, which is BUG-037'
  + ' exactly — and the first version of this row passed against the broken function because it only asked'
  + ' that a `try {` appear somewhere');

check('CONTRACT', 'RR-C2 the acceptance action also catches, so a thrown RPC is still an ending',
  /catch/.test(accept) && /classifyAcceptError/.test(accept),
  'acceptance is a Server Action too, and a rejection there leaves the page with nothing to render');

// ── The caller always ends, including when the server does not answer ───────────────────────────────
check('CONTRACT', 'RR-C3 the caller clears its in-flight state in a FINALLY, not after the await',
  /finally/.test(confirm),
  'setInvitingId(null) after a bare await is unreachable on rejection — the row spins for ever, which is'
  + ' the reported symptom');

check('CONTRACT', 'RR-C4 the caller has its own CATCH for the failures the server cannot report',
  /catch/.test(confirm),
  'a dropped connection, a timeout or a deploy mid-request never reach the server’s own error handling');

check('CONTRACT', 'RR-C5 the caller does not branch on an outcome the lifecycle no longer produces',
  !/"SENT"/.test(confirm),
  'it used to refresh only on SENT, which the governed lifecycle never returns, so the page would never have'
  + ' refreshed at all');

// ── A retry is safe, and a reload is truthful ───────────────────────────────────────────────────────
check('CONTRACT', 'RR-C6 redeeming twice cannot grant twice: the lookup is pending-only under a row lock',
  /where token = p_token and status = 'pending'[\s\S]{0,60}for update/.test(sql),
  'this is what makes redeeming on render safe against a mail-client prefetch, and it is why a reload is'
  + ' reported rather than prevented');

check('CONTRACT', 'RR-C7 a reload after success is reported as ALREADY_USED, with its own sentence',
  /ALREADY_USED/.test(accept) && /already been used/.test(accept),
  'the first redemption worked; saying "something went wrong" would be false, and one hedged sentence'
  + ' covering both states commits to neither');

check('CONTRACT', 'RR-C8 the token is consumed on the SERVER and never handed to a client component',
  !/"use client"/.test(page) && /await acceptInvitation/.test(page)
  && !/token=\{/.test(page) && !/data-token/.test(page),
  'a single-use bearer credential in client-visible markup is a credential exposure, and a page that renders'
  + ' it has published it to every extension in the browser');

check('CONTRACT', 'RR-C9 both halves revalidate, so a reload shows the state the action produced',
  /revalidatePath/.test(invite) && /revalidatePath/.test(accept),
  'without it the founder reloads onto a cached page that still shows the pre-click world and clicks again');

console.log('');
console.log('invitation_reload_retry_contract: ' + pass + ' passed, ' + failures.length + ' failed');
console.log('A reload of the acceptance page reports ALREADY_USED on an invitation that SUCCEEDED. That is');
console.log('true, not a bug: the database prevents the second grant, and the two states get two sentences.');
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); process.exit(1); }
