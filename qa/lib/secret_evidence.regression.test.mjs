// SECRET_VARIABLE_NAME_PRESENT_IS_NOT_SECRET_VALUE_EXPOSED
//
// The regression for the false exposure finding of 2026-09-04. The headline case is the exact
// state of this machine: the variable name present, the value redacted by Vercel — which I reported
// as a live key and recommended rotating on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifySecret, describeFinding, EVIDENCE } from './secret_evidence.mjs';

// Fake, but the right SHAPE. No real key material appears in this repository.
const FAKE_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + 'A'.repeat(40) + '.' + 'B'.repeat(43);
const FAKE_SB = 'sb_secret_' + 'C'.repeat(32);

test('THE_FALSE_FINDING — Vercel redaction placeholder is REDACTED, not PRESENT', () => {
  const c = classifySecret('"[REDACTED]"');
  assert.equal(c.state, EVIDENCE.REDACTED);
  assert.equal(c.length, 10, 'quotes stripped; the on-disk field is 13 characters with them');
  assert.match(c.reason, /not an exposure/i);
});

test('a real-shaped service-role JWT is PRESENT', () => {
  const c = classifySecret(FAKE_JWT);
  assert.equal(c.state, EVIDENCE.PRESENT);
  assert.equal(c.shape, 'supabase_jwt');
});

test('a real-shaped sb_secret_ key is PRESENT', () => {
  assert.equal(classifySecret(FAKE_SB).state, EVIDENCE.PRESENT);
});

test('PRESENT is not VALIDATED_LIVE, and nothing infers liveness', () => {
  // The distinction that would have stopped the false escalation running the other way too: even a
  // readable key is not a proven-working key until someone uses it, which is its own authorization.
  assert.equal(classifySecret(FAKE_JWT).state, EVIDENCE.PRESENT);
  assert.equal(classifySecret(FAKE_JWT, { validatedLive: true }).state, EVIDENCE.VALIDATED_LIVE);
  assert.equal(classifySecret(FAKE_JWT, { validatedLive: 'yes' }).state, EVIDENCE.PRESENT,
    'only a literal true promotes to VALIDATED_LIVE — a truthy value must not');
});

test('missing and empty values are ABSENT', () => {
  for (const v of [null, undefined, '', '   ', '""']) {
    assert.equal(classifySecret(v).state, EVIDENCE.ABSENT, 'for value: ' + JSON.stringify(v));
  }
});

test('common placeholders are REDACTED', () => {
  for (const v of ['[REDACTED]', '****', 'xxxxxxxx', '<your-key-here>', 'changeme', 'your-secret-key', 'TODO']) {
    assert.equal(classifySecret(v).state, EVIDENCE.REDACTED, 'for value: ' + JSON.stringify(v));
  }
});

test('an unrecognised string is not promoted to PRESENT by default', () => {
  // Failing closed in the direction that matters here: the cost of this module's own mistake must
  // be a missed finding someone widens SHAPES for, not another false rotation order.
  assert.equal(classifySecret('some-internal-config-value').state, EVIDENCE.REDACTED);
});

// THE RULE THAT MAKES THIS SAFE TO RUN ANYWHERE.
test('NO_FINDING_EVER_CONTAINS_THE_VALUE', () => {
  for (const secret of [FAKE_JWT, FAKE_SB, 'postgres://u:supersecretpw@h:5432/db']) {
    const c = classifySecret(secret);
    const serialized = JSON.stringify(c) + describeFinding('label', secret);
    assert.ok(!serialized.includes(secret), 'the full value leaked into the finding');
    // Nor any substantial fragment of it.
    for (let i = 0; i + 12 <= secret.length; i += 4) {
      assert.ok(!serialized.includes(secret.slice(i, i + 12)),
        'a 12-character fragment of the value leaked into the finding');
    }
  }
});

test('describeFinding is a single pasteable line', () => {
  const line = describeFinding('web/.env.production.local SUPABASE_SERVICE_ROLE_KEY', '"[REDACTED]"');
  assert.equal(line.includes('\n'), false);
  assert.match(line, /REDACTED \(shape=none, length=10\)/);
});
