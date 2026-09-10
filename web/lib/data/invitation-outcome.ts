// THE INVITATION OUTCOME VOCABULARY — ONE DEFINITION, TWO CONSUMERS.
//
// BUG-037 is that the invite action does not terminate. Its confirmed cause is not a missing message; it is
// that `invitePerson()` has no top-level try/catch and the caller has no catch either, so a THROWN error
// leaves the row spinning with `setInvitingId(null)` unreachable. A vocabulary alone would not have fixed
// that — but a vocabulary is what makes "terminated" checkable rather than a matter of opinion.
//
// Every path out of the invite action returns exactly one of these. There is no success boolean, because a
// boolean is what let the old code report `ok: true` when only the API call had succeeded and the message
// had not been delivered — a FALSE SENT, which the product contract forbids.
//
// INVITATION != MEMBERSHIP. Nothing in this file activates a membership. `SENT` means a message was handed
// to a mailer that accepted it; it does not mean anyone received it, and it certainly does not mean anyone
// joined an organization.

/** Every way the invite action can end. Exhaustive by construction: the server returns one, the UI renders one. */
export const INVITATION_OUTCOMES = [
  'SENT',
  'DELIVERY_FAILED',
  'ALREADY_MEMBER',
  'INVITATION_ALREADY_PENDING',
  'INVALID_RECIPIENT',
  'RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'NOT_PERMITTED',
  'UNKNOWN_ERROR',
] as const;

export type InvitationOutcome = (typeof INVITATION_OUTCOMES)[number];

export type InvitationResult = {
  outcome: InvitationOutcome;
  /** Founder-facing. Never a raw provider string — see `describeOutcome`. */
  message: string;
  /** True only for outcomes a retry can plausibly change. */
  retryable: boolean;
  /** Opaque correlation id for the server logs. Never contains provider text. */
  ref?: string;
};

/**
 * Which outcomes a retry can plausibly change.
 *
 * `DELIVERY_FAILED`, `RATE_LIMITED` and `PROVIDER_UNAVAILABLE` are transient by nature. `ALREADY_MEMBER`
 * and `INVITATION_ALREADY_PENDING` are not failures at all — they are the system telling you the work is
 * already done or already in flight, and retrying them is how duplicates get made.
 */
export const RETRYABLE: ReadonlySet<InvitationOutcome> = new Set<InvitationOutcome>([
  'DELIVERY_FAILED',
  'RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'UNKNOWN_ERROR',
]);

/**
 * The founder-facing sentence for each outcome.
 *
 * NO RAW PROVIDER ERROR REACHES AN ORDINARY USER. A provider string is written for an operator: it names
 * hosts, ports, credentials and internal states, and it is the most common way a diagnostic detail becomes
 * a disclosure. The provider's own text goes to the server log against `ref`; the person clicking Invite
 * gets a sentence that says what happened and what to do.
 */
export function describeOutcome(outcome: InvitationOutcome, name: string): string {
  switch (outcome) {
    case 'SENT':
      return `Invitation sent to ${name}. They are not a member until they accept it.`;
    case 'DELIVERY_FAILED':
      return `The invitation for ${name} could not be delivered. Nothing was changed — you can try again.`;
    case 'ALREADY_MEMBER':
      return `${name} is already a member of this company.`;
    case 'INVITATION_ALREADY_PENDING':
      return `${name} already has an invitation waiting. Resend it rather than creating a second one.`;
    case 'INVALID_RECIPIENT':
      return `${name} has no usable email address. Add one before inviting.`;
    case 'RATE_LIMITED':
      return `Too many invitations have been sent recently. Wait a few minutes and try ${name} again.`;
    case 'PROVIDER_UNAVAILABLE':
      return `The email service is not reachable right now. Nothing was changed — try ${name} again shortly.`;
    case 'NOT_PERMITTED':
      return 'Only the founder or an admin can invite people.';
    case 'UNKNOWN_ERROR':
      return `Something went wrong inviting ${name}. Nothing was changed — the details are in the server log.`;
  }
}

/**
 * Classify a thrown error or a provider error object into an outcome.
 *
 * DEFAULTS TO `UNKNOWN_ERROR`, WHICH IS TERMINAL. The failure this replaces is a promise that rejects and a
 * UI that waits forever; anything that reaches here has already failed, and the only wrong answer is to
 * return nothing. An unrecognised error is still an ending.
 */
export function classifyError(err: unknown): InvitationOutcome {
  const text = (
    err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err)
  ).toLowerCase();
  const status = err && typeof err === 'object' && 'status' in err ? Number((err as { status: unknown }).status) : NaN;

  if (status === 429 || /rate limit|too many requests/.test(text)) return 'RATE_LIMITED';
  if (/invalid.*email|email.*invalid|not a valid email/.test(text)) return 'INVALID_RECIPIENT';
  if (/already registered|already been registered|user already exists/.test(text)) return 'INVITATION_ALREADY_PENDING';
  if (
    status === 502 || status === 503 || status === 504
    || /econnrefused|enotfound|etimedout|socket hang up|network|fetch failed|timeout/.test(text)
  ) return 'PROVIDER_UNAVAILABLE';
  if (/smtp|mail|sender|relay|bounce|delivery/.test(text)) return 'DELIVERY_FAILED';
  return 'UNKNOWN_ERROR';
}

/** Build a terminal result. The only way to construct one, so no path can invent a shape. */
export function result(outcome: InvitationOutcome, name: string, ref?: string): InvitationResult {
  return { outcome, message: describeOutcome(outcome, name), retryable: RETRYABLE.has(outcome), ref };
}
