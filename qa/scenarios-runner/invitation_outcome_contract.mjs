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
// INVITATION_ALREADY_PENDING IS DELIBERATELY ABSENT (founder lifecycle, 2026-09-11). A second click on a
// live invitation REFRESHES it and returns DELIVERY_PENDING; naming it "already pending" made a normal
// resend read as a refusal, and a founder who reads a refusal clicks again.
for (const required of ['SENT', 'DELIVERY_FAILED', 'ALREADY_MEMBER', 'DELIVERY_PENDING',
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
    // AN EXISTING AUTH ACCOUNT IS NOT A FAILURE and is no longer classified as one. It reaches
    // UNKNOWN_ERROR here only because this fixture asks classifyError about it at all; the real path
    // tests isExistingAuthUser FIRST and never consults the classifier. The row below pins that.
    [{ message: 'A user with this email address has already been registered' }, 'UNKNOWN_ERROR'],
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

// THE SUITE REPORTED 17 OF 17 AGAINST A FILE THAT DID NOT COMPILE (2026-09-11).
//
// Both defects were inside invitePerson, the one function this suite exists to guard, and both were
// sitting in source it already held in a string. A source contract cannot typecheck and this one does
// not pretend to - the typecheck is a SEPARATE required instrument, and its absence is why these two
// shipped. What a source contract CAN do is ask the two questions below, so it now does.

// CODE IS NOT COMMENTS AND IT IS NOT STRING TEXT.
//
// The first draft of ROW A matched `person` inside the literal "that person" and reported a dead-zone
// read on a file that had just been fixed - a scan that cannot tell code from text answers a different
// question from the one its name claims. Comment bodies and string interiors are blanked to spaces,
// LENGTH PRESERVED, so the offsets this row reports still index the real file.
function codeOnly(t) {
  const S = " ", LF = String.fromCharCode(10), BS = String.fromCharCode(92);
  let out = "", i = 0;
  while (i < t.length) {
    const c = t[i], d = t[i] + t[i + 1];
    if (d === "//") { while (i < t.length && t[i] !== LF) { out += S; i++; } continue; }
    if (d === "/*") {
      while (i < t.length && t[i] + t[i + 1] !== "*/") { out += (t[i] === LF ? LF : S); i++; }
      out += S + S; i += 2; continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      out += c; i++;
      while (i < t.length) {
        if (t[i] === BS) { out += S + S; i += 2; continue; }
        if (t[i] === c) { out += c; i++; break; }
        out += (t[i] === LF ? LF : S); i++;
      }
      continue;
    }
    out += c; i++;
  }
  return out;
}

// ROW A - THE TEMPORAL DEAD ZONE. Derived from the declarations themselves, never from a list of names.
// `person?.full_name` on a const declared twelve lines lower throws ReferenceError: optional chaining
// guards the PROPERTY, not the BINDING. Inside a Server Action that throw becomes a REJECTION, which IS
// BUG-037 - so the fix for the spinning row reintroduced the spinning row on the not-permitted path.
{
  const code = codeOnly(invite);
  // Earliest declaration wins, so a name bound twice is not reported as reading its own later shadow.
  const first = new Map();
  const note = (name, at) => { if (!first.has(name) || at < first.get(name)) first.set(name, at); };
  let m;
  const decl = /(?:const|let)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*[=:]/g;
  while ((m = decl.exec(code))) note(m[1], m.index);
  // Destructured bindings: `const { data: person, error: personError }` binds the names AFTER the colons,
  // and `const { data: { user } }` binds the innermost. Both shapes appear in this function.
  const destr = /(?:const|let)\s*{([^}]*(?:{[^}]*}[^}]*)*)}\s*=/g;
  while ((m = destr.exec(code))) {
    const at = m.index;
    for (const part of m[1].split(",")) {
      const t = part.trim().replace(/[{}]/g, " ").trim();
      if (!t) continue;
      const name = (t.includes(":") ? t.slice(t.lastIndexOf(":") + 1) : t).trim();
      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) note(name, at);
    }
  }
  const early = [];
  for (const [name, at] of first) {
    const seen = code.slice(0, at).search(new RegExp("\\b" + name + "\\b"));
    if (seen >= 0) early.push(name + " read at " + seen + ", declared at " + at);
  }
  check("no binding in invitePerson is read above its own declaration (temporal dead zone)",
    first.size > 0 && early.length === 0,
    first.size === 0 ? "no bindings found at all - the extraction is broken, not the source"
      : early.join("; ") + " - a TDZ read throws ReferenceError, and a throw inside a Server Action"
        + " REJECTS it, which is exactly the BUG-037 spinner this suite exists to prevent");
}

// ROW B - THE DECLARED RETURN TYPE MUST CARRY WHAT THE CALLER READS.
// Every return path did carry an outcome; the SIGNATURE erased it, so the caller branching on
// `result.outcome` was reading a property the type system says is not there. The check expands the named
// type from ITS OWN DEFINITION rather than accepting the name as sufficient - a signature saying
// `InvitationResult` proves nothing if InvitationResult has no `outcome`.
//
// The return type is taken from the declaration LINE, not with `[^{]*`: the first `{` in this signature
// is the one inside `Promise<{ ok: boolean } & InvitationResult>`, so stopping at it silently yields an
// empty field list and a row that fails for the wrong reason.
{
  // A SIGNATURE IS NOT A LINE. This read `[^\n]*` and produced an EMPTY field list the moment invitePerson
  // gained a second parameter and wrapped across three lines — reporting that the declared return type
  // carries nothing the caller reads, about a return type that had not changed at all. The declaration runs
  // from the name to the brace that opens the BODY: the first `{` after the parameter list closes, at
  // paren-depth and angle-depth zero. Anything less structural reads a type as a body or a body as a type.
  const decl = (() => {
    const at = people.indexOf("export async function invitePerson");
    if (at < 0) return "";
    let i = people.indexOf("(", at), paren = 0, angle = 0;
    for (; i < people.length; i++) {
      const c = people[i];
      if (c === "(") paren++;
      else if (c === ")") paren--;
      else if (c === "<") angle++;
      else if (c === ">" && people[i - 1] !== "=") angle--;
      else if (c === "{" && paren === 0 && angle === 0) return people.slice(at, i);
    }
    return "";
  })();
  const line = decl.replace(/[\r\n]+/g, " ");
  const ret = line.slice(line.lastIndexOf("):") + 2);
  let fields = ret.match(/[A-Za-z_$][A-Za-z0-9_$]*(?=\s*[?]?:)/g) || [];
  for (const named of ret.match(/\bInvitation[A-Za-z]*\b/g) || []) {
    const body = (src.match(new RegExp("type\\s+" + named + "[^=]*=\\s*{([^}]*)}")) || [, ""])[1];
    fields = fields.concat(body.match(/[A-Za-z_$][A-Za-z0-9_$]*(?=\s*[?]?:)/g) || []);
  }
  const read = [...new Set((confirm.match(/\bresult\.[A-Za-z_$][A-Za-z0-9_$]*/g) || [])
    .map((r) => r.slice("result.".length)))];
  const missing = read.filter((r) => !fields.includes(r));
  check("invitePerson's declared return type carries every property the caller reads ("
    + read.join(", ") + ")",
    read.length > 0 && missing.length === 0,
    read.length === 0 ? "the caller reads nothing off the result - this row would pass vacuously"
      : "declared: [" + fields.join(", ") + "] but the caller reads: " + missing.join(", "));
}
// THE MECHANISM, NOT THE FIXTURE. The classifier is asked about an existing account only by this suite.
// The product tests isExistingAuthUser first and treats it as control flow, so the invitation stands and
// the person signs in to accept. This row fails if that test is ever removed, which is the regression
// that would restore the permanent dead end.
{
  const vocabSrc = readFileSync(join(ROOT, 'web/lib/data/invitation-outcome.ts'), 'utf8');
  const peopleSrc = readFileSync(join(ROOT, 'web/lib/data/people.ts'), 'utf8');
  check('an existing auth account is CONTROL FLOW in the invite action, not a classified failure',
    /export function isExistingAuthUser/.test(vocabSrc) && /isExistingAuthUser\(/.test(peopleSrc),
    'without this the second click classifies as a failure and the invitation looks unrepeatable');
}
console.log('');
console.log('invitation_outcome_contract: ' + pass + ' passed, ' + failures.length + ' failed');
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); process.exit(1); }
