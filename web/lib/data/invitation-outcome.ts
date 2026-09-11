// THE INVITATION LIFECYCLE — ONE DEFINITION, EVERY CONSUMER.
//
// FOUNDER PRODUCT DECISION, 2026-09-11: **INVITE != ADD MEMBER.** The user-facing Invite action MUST use
// the governed invitation lifecycle. Creating an auth user, a provider accepting an API request, and an
// email send being attempted are NONE OF THEM membership, and none of them is delivery.
//
//     INVITATION_CREATED -> DELIVERY_PENDING -> SENT -> ACCEPTED -> MEMBERSHIP_ACTIVE
//     failure branches:  DELIVERY_FAILED (retryable) | EXPIRED | CANCELLED
//
// TWO AXES, NOT ONE. The states above are the state of the INVITATION — durable, server-owned, and what
// the founder's decision is about. They are not "what my click did". A click produces an OUTCOME, and the
// outcome either reports the invitation's state or reports a REFUSAL that created no invitation at all.
// Collapsing the two is how `ok: true` came to mean "the API call returned".
//
// WHY `SENT` IS NEVER RETURNED BY THE INVITE ACTION TODAY.
//
// The contract is explicit: "SENT must mean the defined delivery contract reached its terminal success
// state." Handing a message to a mailer that accepts it is not that. Nothing here can currently observe
// terminal delivery success — that needs provider confirmation, and `company_invitations` has no column to
// record it in (the migration is drafted and BLOCKED on founder authorization). So the honest terminal
// state of a successful invite click is **DELIVERY_PENDING**, and that is what the action returns.
//
// `SENT` stays in the vocabulary because it is the state a delivery-confirmation mechanism will set. A row
// in the delivery-state suite asserts it is currently UNREACHABLE, so the gap is named by a test rather
// than discovered by a founder who was told a message arrived. That is the FALSE SENT defect closed at the
// root: the old code returned `SENT` the moment `inviteUserByEmail` came back without an error.
//
// MEMBERSHIP IS NOT IN THIS FILE'S GIFT. Nothing here activates anything. MEMBERSHIP_ACTIVE is reached
// only through `accept_company_invitation(token)`, which derives company, role and recipient authority
// FROM THE STORED INVITATION and takes no company or role parameter at all, so no client payload can
// choose its own authority.

/**
 * The state of the INVITATION itself. Durable and server-owned.
 *
 * `SENT` is deliberately unreachable until delivery confirmation exists — see the header.
 */
export const INVITATION_STATES = [
  'INVITATION_CREATED',
  'DELIVERY_PENDING',
  'SENT',
  'ACCEPTED',
  'MEMBERSHIP_ACTIVE',
  'DELIVERY_FAILED',
  'EXPIRED',
  'CANCELLED',
] as const;

export type InvitationState = (typeof INVITATION_STATES)[number];

/** Delivery failed; the invitation did not. Retryable by definition, and the only lifecycle state that is. */
export const RETRYABLE_STATES: ReadonlySet<InvitationState> = new Set<InvitationState>(['DELIVERY_FAILED']);

/**
 * Every way the invite ACTION can end.
 *
 * The first group reports a lifecycle state. The second is a refusal: no invitation was created or
 * changed, and saying so is the point — a refusal that reads like a lifecycle state is how a founder comes
 * to believe an invitation exists when none does.
 */
export const INVITATION_OUTCOMES = [
  // reports a lifecycle state
  'INVITATION_CREATED',
  'DELIVERY_PENDING',
  'SENT',
  'DELIVERY_FAILED',
  // refusals — no invitation was created or changed
  'ALREADY_MEMBER',
  'INVALID_RECIPIENT',
  'NO_COMPANY',
  'NOT_PERMITTED',
  'RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'UNKNOWN_ERROR',
] as const;

export type InvitationOutcome = (typeof INVITATION_OUTCOMES)[number];

/**
 * Which outcomes a retry can plausibly change.
 *
 * `DELIVERY_FAILED` is retryable by the founder's explicit requirement. `RATE_LIMITED` and
 * `PROVIDER_UNAVAILABLE` are transient by nature, and `UNKNOWN_ERROR` is retryable because the safe
 * reading of "we do not know" is "it may not have happened".
 *
 * `DELIVERY_PENDING` is NOT here, deliberately: a pending delivery is not a failure to repair. Clicking
 * again is still SAFE — `create_company_invitation` is idempotent on (company, email) while pending — but
 * it is a RESEND, not a retry, and the two should not read the same.
 */
export const RETRYABLE: ReadonlySet<InvitationOutcome> = new Set<InvitationOutcome>([
  'DELIVERY_FAILED',
  'RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'UNKNOWN_ERROR',
]);

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
 * The founder-facing sentence for each outcome.
 *
 * NOT ONE OF THESE SAYS A PERSON HAS JOINED ANYTHING. The lifecycle sentences say an invitation exists and
 * where it has got to; membership is named only to say it has NOT happened yet. That clause is the product
 * contract delivered to the person who just clicked, at the moment they would otherwise assume otherwise.
 *
 * NO RAW PROVIDER ERROR REACHES A USER. A provider string is written for an operator — it names hosts,
 * ports, credentials and internal states — and it is the most common way a diagnostic becomes a
 * disclosure. Provider text goes to the server log against `ref`.
 */
export function describeOutcome(outcome: InvitationOutcome, name: string): string {
  switch (outcome) {
    case 'INVITATION_CREATED':
      return `An invitation for ${name} has been created. They are not a member until they accept it.`;
    case 'DELIVERY_PENDING':
      return `An invitation for ${name} has been created and the email is on its way. Delivery is not confirmed yet, and they are not a member until they accept it.`;
    case 'SENT':
      return `The invitation email to ${name} reached them. They are still not a member until they accept it.`;
    case 'DELIVERY_FAILED':
      return `The invitation for ${name} exists, but the email could not be delivered. Sending it again is safe.`;
    case 'ALREADY_MEMBER':
      return `${name} is already a member of this company.`;
    case 'INVALID_RECIPIENT':
      return `${name} has no usable email address. Add one before inviting.`;
    case 'NO_COMPANY':
      return `${name} is not assigned to a company, and an invitation is always to one specific company.`;
    case 'NOT_PERMITTED':
      return 'You do not have permission to invite people to this company.';
    case 'RATE_LIMITED':
      return `Too many invitations have been sent recently. Wait a few minutes and try ${name} again.`;
    case 'PROVIDER_UNAVAILABLE':
      return `The email service is not reachable right now. Nothing was changed — try ${name} again shortly.`;
    case 'UNKNOWN_ERROR':
      return `Something went wrong inviting ${name}. The details are in the server log.`;
  }
}

/**
 * Classify a thrown error or a provider error object into an outcome.
 *
 * DEFAULTS TO `UNKNOWN_ERROR`, WHICH IS TERMINAL. The failure this replaces is a promise that rejects and
 * a UI that waits for ever; anything reaching here has already failed, and the only wrong answer is to
 * return nothing. An unrecognised error is still an ending.
 *
 * `already registered` is NOT classified here. Under the governed lifecycle an existing auth account is
 * not an error at all — the invitation is still created and still redeemable, the person simply signs in
 * to accept it — so that case is control flow in `invitePerson`, not a failure classification. Treating it
 * as a failure is what produced the old permanent dead end.
 */
export function classifyError(err: unknown): InvitationOutcome {
  const text = (
    err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err)
  ).toLowerCase();
  const status = err && typeof err === 'object' && 'status' in err ? Number((err as { status: unknown }).status) : NaN;

  if (status === 429 || /rate limit|too many requests/.test(text)) return 'RATE_LIMITED';
  if (/invalid.*email|email.*invalid|not a valid email/.test(text)) return 'INVALID_RECIPIENT';
  if (status === 403 || /not authori[sz]ed|forbidden|permission|row-level security/.test(text)) return 'NOT_PERMITTED';
  if (
    status === 502 || status === 503 || status === 504
    || /econnrefused|enotfound|etimedout|socket hang up|network|fetch failed|timeout/.test(text)
  ) return 'PROVIDER_UNAVAILABLE';
  if (/smtp|mail|sender|relay|bounce|delivery/.test(text)) return 'DELIVERY_FAILED';
  return 'UNKNOWN_ERROR';
}

/** Whether an auth-provider error means the account already exists. Control flow, not failure. */
export function isExistingAuthUser(err: unknown): boolean {
  const text = (
    err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err)
  ).toLowerCase();
  return /already registered|already been registered|user already exists|email address already/.test(text);
}

/** Build a terminal result. The only way to construct one, so no path can invent a shape. */
export function result(outcome: InvitationOutcome, name: string, ref?: string): InvitationResult {
  return { outcome, message: describeOutcome(outcome, name), retryable: RETRYABLE.has(outcome), ref };
}
