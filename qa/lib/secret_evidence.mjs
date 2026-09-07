// SECRET_VARIABLE_NAME_PRESENT != SECRET_VALUE_EXPOSED
//
// Permanent QA rule, written after I told the founder a live Supabase service-role key was readable
// on this laptop and recommended immediate rotation. It was not readable. A subagent had reported
// that three `web/.env.*.local` files "each contain a SUPABASE_SERVICE_ROLE_KEY"; I read the
// presence of the NAME as the presence of the VALUE and escalated without inspecting the bytes. The
// value was Vercel's 13-character redaction placeholder, written on `env pull` for a variable
// already marked Sensitive — i.e. the mitigation I was urgently recommending was already in place.
//
// The failure was not carelessness about one file. It was collapsing four distinct states into one
// bit. This module keeps them apart, and every future secret finding must be reported as one of
// them:
//
//   ABSENT          the variable is not there at all.
//   REDACTED        the name is there; the value is a placeholder. NOT an exposure. This is what
//                   correct handling looks like, and reporting it as exposure cries wolf.
//   PRESENT         a value with the SHAPE of real key material is readable. An exposure by
//                   default — but still not proof the key is valid, current, or privileged.
//   VALIDATED_LIVE  the value was proven to work against the live service. Only this state
//                   justifies "the key is live". Reaching it requires deliberately using the
//                   credential, which is itself an action needing authorization — so in practice a
//                   finding stops at PRESENT and says so.
//
// NEVER PRINT THE SECRET TO ESTABLISH THE DISTINCTION. Every field this module returns is a
// property OF the value (length, shape, prefix class), never the value. That is not politeness: a
// finding gets pasted into reports, issues and chat logs, and a detector that must quote the key to
// justify itself turns every audit into a new leak.

export const EVIDENCE = Object.freeze({
  ABSENT: 'ABSENT',
  REDACTED: 'REDACTED',
  PRESENT: 'PRESENT',
  VALIDATED_LIVE: 'VALIDATED_LIVE',
});

// Placeholders real tooling writes. Vercel's is the one that caused the false finding.
const PLACEHOLDER = /^(\[REDACTED\]|\*+|x+|<[^>]*>|changeme|your[-_ ]?\w*[-_ ]?(key|secret|token)|todo|placeholder|dummy|example|null|undefined|)$/i;

// Shapes of real key material. Deliberately narrow: a false PRESENT is what started this.
const SHAPES = [
  ['supabase_jwt', /^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/],
  ['supabase_secret_key', /^sb_secret_[A-Za-z0-9_-]{10,}$/],
  ['supabase_publishable_key', /^sb_publishable_[A-Za-z0-9_-]{10,}$/],
  ['github_pat', /^gh[pousr]_[A-Za-z0-9]{20,}$/],
  ['vercel_token', /^[A-Za-z0-9]{24}$/],
  ['postgres_url_with_password', /^postgres(ql)?:\/\/[^:]+:[^@]{6,}@/],
];

/**
 * Classify a candidate secret value WITHOUT revealing it.
 * @param {string|null|undefined} raw the value as read from disk/env. Never logged.
 * @param {{validatedLive?: boolean}} [opts] set validatedLive only when the credential was
 *   actually exercised against the live service and worked. Nothing infers this.
 * @returns {{state:string, shape:string|null, length:number, reason:string}}
 */
export function classifySecret(raw, opts = {}) {
  if (raw === null || raw === undefined) {
    return { state: EVIDENCE.ABSENT, shape: null, length: 0, reason: 'No value present.' };
  }
  const value = String(raw).trim().replace(/^["']|["']$/g, '');
  if (value === '') {
    return { state: EVIDENCE.ABSENT, shape: null, length: 0, reason: 'Value is empty.' };
  }
  if (PLACEHOLDER.test(value)) {
    return { state: EVIDENCE.REDACTED, shape: null, length: value.length,
      reason: 'Value is a placeholder, not key material. The variable NAME is present; the SECRET '
        + 'is not. This is not an exposure and must not be reported as one.' };
  }
  const hit = SHAPES.find(([, re]) => re.test(value));
  if (!hit) {
    return { state: EVIDENCE.REDACTED, shape: null, length: value.length,
      reason: 'Value matches no known key shape. Reported as non-exposure because a finding that '
        + 'guesses is the failure this module exists to prevent — widen SHAPES deliberately rather '
        + 'than defaulting unknown strings to PRESENT.' };
  }
  if (opts.validatedLive === true) {
    return { state: EVIDENCE.VALIDATED_LIVE, shape: hit[0], length: value.length,
      reason: 'Shape matches ' + hit[0] + ' AND the credential was proven to work against the live '
        + 'service.' };
  }
  return { state: EVIDENCE.PRESENT, shape: hit[0], length: value.length,
    reason: 'A value with the shape of ' + hit[0] + ' is readable. Treat as exposed. This does NOT '
      + 'establish that the key is valid, current or privileged — that would be VALIDATED_LIVE, '
      + 'which requires deliberately using the credential and is a separate authorized action.' };
}

/** A one-line finding safe to paste anywhere. Contains no part of the value. */
export function describeFinding(label, raw, opts) {
  const c = classifySecret(raw, opts);
  return label + ': ' + c.state + ' (shape=' + (c.shape || 'none') + ', length=' + c.length + ')';
}
