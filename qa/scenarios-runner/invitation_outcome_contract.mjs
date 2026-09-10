#!/usr/bin/env node
// THE INVITE ACTION MUST TERMINATE — BUG-037.
//
// The confirmed cause is not a missing message. `invitePerson()` has no top-level try/catch and the caller
// has no catch either, so a THROWN error leaves `setInvitingId(null)` unreachable and the row spins for
// ever. This suite pins the vocabulary and the classifier that make "terminated" checkable, and then pins
// the two structural properties that actually fix the bug.
//
// It is a SOURCE CONTRACT: it needs no database, no Supabase, and no network. That is deliberate — the
// defect it guards is a control-flow defect, and a test that needed production to run would not have been
// written tonight.
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
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log('OK   ' + name); }
  else { failures.push(name); console.log('FAIL ' + name + (detail ? NL + '       ' + detail : '')); }
};

// The vocabulary is TypeScript, so it is read and evaluated rather than imported: this battery runs on
// plain node with no build step, and adding one to test a constant list would be the harness deciding what
// the product may be written in.
const src = readFileSync(join(ROOT, 'web/lib/data/invitation-outcome.ts'), 'utf8');

const OUTCOMES = (src.match(/export const INVITATION_OUTCOMES = \[([\s\S]*?)\] as const;/) || [, ''])[1]
  .split(NL).map((l) => (l.match(/'([A-Z_]+)'/) || [])[1]).filter(Boolean);

check('the outcome vocabulary is present and non-trivial (' + OUTCOMES.length + ')',
  OUTCOMES.length >= 8, JSON.stringify(OUTCOMES));

// The founder's list, verbatim. A vocabulary that quietly loses a member is how "no terminal state" comes
// back one outcome at a time.
for (const required of ['SENT', 'DELIVERY_FAILED', 'ALREADY_MEMBER', 'INVITATION_ALREADY_PENDING',
  'INVALID_RECIPIENT', 'RATE_LIMITED', 'PROVIDER_UNAVAILABLE', 'UNKNOWN_ERROR']) {
  check('the vocabulary contains ' + required, OUTCOMES.includes(required));
}

// EVERY OUTCOME HAS A SENTENCE. A vocabulary with a member the UI cannot render is a spinner with extra
// steps.
const described = OUTCOMES.filter((o) => new RegExp("case '" + o + "':").test(src));
check('every outcome has a founder-facing sentence (' + described.length + ' of ' + OUTCOMES.length + ')',
  described.length === OUTCOMES.length,
  'undescribed: ' + OUTCOMES.filter((o) => !described.includes(o)).join(', '));

// NO SUCCESS BOOLEAN. `ok: true` is what let the old code report success when only the API call had
// succeeded — a FALSE SENT. The outcome carries the meaning now.
check('the result shape carries an OUTCOME, not a success boolean',
  /outcome: InvitationOutcome/.test(src) && !/\bok:\s*boolean/.test(src),
  'a boolean cannot distinguish "handed to a mailer" from "delivered"');

// THE CLASSIFIER DEFAULTS TO A TERMINAL VALUE. This is the property that actually fixes BUG-037: anything
// reaching the classifier has already failed, and the only wrong answer is to return nothing.
check('the error classifier has a total default, so an unrecognised error still ENDS',
  /return 'UNKNOWN_ERROR';\s*$/m.test(src.replace(/\r/g, '')),
  'an unclassified error must still produce an outcome — a spinner is not a classification');

// NO RAW PROVIDER TEXT REACHES A USER. A provider string is written for an operator and names hosts,
// credentials and internal states.
const describeBody = (src.match(/export function describeOutcome[\s\S]*?\n}/) || [''])[0];
check('no founder-facing sentence interpolates a provider or error string',
  !/\$\{[^}]*\b(err|error|message|e)\b[^}]*\}/.test(describeBody),
  'describeOutcome must not interpolate provider text; that is how a diagnostic becomes a disclosure');

// ---- the classifier, on the shapes a provider actually produces ------------------------------------
// Evaluated from the source rather than retyped, so the test cannot pass against a classifier that is not
// the one shipped.
// Lifted, not retyped — a retyped classifier tests a copy. The body is plain JavaScript apart from the
// parameter annotation and two `as` casts, so exactly those are removed and nothing else is touched.
const fnText = (src.match(/export function classifyError[\s\S]*?\n}/) || [''])[0]
  .replace('export function', 'function')
  .replace('(err: unknown)', '(err)')
  .replace('): InvitationOutcome {', ') {')
  .replace(/ as \{ message: unknown \}/g, '')
  .replace(/ as \{ status: unknown \}/g, '');
let classify = null;
try {
  // eslint-disable-next-line no-new-func
  classify = new Function(fnText + NL + 'return classifyError;')();
} catch (e) {
  check('the classifier can be lifted and evaluated', false, String(e && e.message || e));
}

if (classify) {
  const CASES = [
    [{ status: 429, message: 'Email rate limit exceeded' }, 'RATE_LIMITED'],
    [{ message: 'over_email_send_rate_limit: too many requests' }, 'RATE_LIMITED'],
    [{ message: 'Unable to validate email address: invalid format' }, 'INVALID_RECIPIENT'],
    [{ message: 'A user with this email address has already been registered' }, 'INVITATION_ALREADY_PENDING'],
    [{ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 10.0.0.1:587' }, 'PROVIDER_UNAVAILABLE'],
    [{ message: 'fetch failed' }, 'PROVIDER_UNAVAILABLE'],
    [{ status: 503, message: 'Service Unavailable' }, 'PROVIDER_UNAVAILABLE'],
    [{ message: 'SMTP relay refused the message' }, 'DELIVERY_FAILED'],
    [new Error('something nobody predicted'), 'UNKNOWN_ERROR'],
    [null, 'UNKNOWN_ERROR'],
    [undefined, 'UNKNOWN_ERROR'],
    ['a bare string', 'UNKNOWN_ERROR'],
  ];
  const wrong = [];
  for (const [input, want] of CASES) {
    let got;
    try { got = classify(input); } catch (e) { got = 'THREW: ' + (e && e.message); }
    if (got !== want) wrong.push(JSON.stringify(input) + ' -> ' + got + ' (want ' + want + ')');
  }
  check('the classifier maps real provider errors to the right outcome (' + CASES.length + ' shapes)',
    wrong.length === 0, wrong.join(NL + '       '));

  // THE PROPERTY THAT FIXES THE BUG: totality. Not "it handles the cases I thought of" — it never fails to
  // produce one. `null`, `undefined` and a bare string are in the table above precisely because those are
  // the shapes a hand-written classifier forgets, and forgetting one is a spinner.
  const NASTY = [0, '', false, [], {}, { message: null }, { status: 'x' }, new TypeError('t'), Symbol('s')];
  const nonTerminal = [];
  for (const v of NASTY) {
    let got;
    try { got = classify(v); } catch (e) { got = 'THREW'; }
    if (!OUTCOMES.includes(got)) nonTerminal.push(String(typeof v) + ' -> ' + String(got));
  }
  check('the classifier is TOTAL: every input produces an outcome, none throws',
    nonTerminal.length === 0, nonTerminal.join('; '));
}

// ---- the two structural properties that are BUG-037 itself ------------------------------------------
// These read the product, not this file. They are the reason the suite exists.
const people = readFileSync(join(ROOT, 'web/lib/data/people.ts'), 'utf8');
const invite = (people.match(/export async function invitePerson[\s\S]*?\n}/) || [''])[0];
// THE FIRST VERSION OF THIS ROW PASSED AGAINST THE UNFIXED FUNCTION. It asked only that a `try {` appear
// before `inviteUserByEmail` — and the original has one, wrapping `createAdminClient()` and nothing else.
// A guard satisfied by a try that does not ENCLOSE the risky calls reports the defect fixed while it is
// still there. The property is that the CATCH comes after the LAST risky await, so all of them are inside.
{
  const lastRisky = Math.max(
    invite.lastIndexOf('inviteUserByEmail'),
    invite.lastIndexOf('company_memberships'),
    invite.lastIndexOf('.update('));
  const catchAt = invite.lastIndexOf('catch');
  check('invitePerson CATCHES around every risky await, not merely somewhere in the function',
    lastRisky > 0 && catchAt > lastRisky,
    catchAt < 0 ? 'no catch at all'
      : 'the last catch is at ' + catchAt + ' but the last risky await is at ' + lastRisky
        + ' — a try that closes before the awaits leaves them able to reject the Server Action');
}

const table = readFileSync(join(ROOT, 'web/app/(app)/people/people-table.tsx'), 'utf8');
const confirm = (table.match(/function confirmInvite[\s\S]*?\n  }/) || [''])[0];
check('the invite caller clears its in-flight state even when the action rejects',
  /finally/.test(confirm) || /catch/.test(confirm),
  'setInvitingId(null) after a bare await is unreachable on rejection — the row spins for ever');

console.log('');
console.log('invitation_outcome_contract: ' + pass + ' passed, ' + failures.length + ' failed');
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); process.exit(1); }
