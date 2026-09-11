# BUG-036 / BUG-037 HOME-PC FIX REPORT

**Date:** 2026-09-11 · **Branch:** `wo/invitation-delivery` · **Worktree:** `C:/Users/Dell/dev/brain-os-invite`

Repository and runtime evidence only. Every SHA below was re-derived with `git rev-parse`, not copied from
an abbreviation. **Nothing in this report closes anything** — the Work PC is the independent acceptance
authority.

---

## STATUS

| bug | status | precisely what that means |
|---|---|---|
| **BUG-036** — P1, invitation/email E2E delivery failure | **PARTIAL** | The **architectural** half is IMPLEMENTED and DEVELOPER VERIFIED. The **E2E email delivery** half is **BLOCKED** and its provider root cause is **UNCONFIRMED**. |
| **BUG-037** — P2, no terminal delivery state | **PARTIAL** | The action now **terminates on every path** with a canonical outcome: IMPLEMENTED and DEVELOPER VERIFIED. A **durable** terminal delivery state is **BLOCKED — FOUNDER AUTHORIZATION** (migration drafted, not applied). |
| **BUG-035** — membership role management absent | **SEPARATE — UNCHANGED** | Nothing in this work changes it. Two rows measure it and both are RED: `RI-D1` and `IM-D5`. Shares implementation surfaces; **does not share defect identity**. |

**No bug is CLOSED by this report and Home PC may not close one.**

---

## ROOT CAUSE

### The architectural defect, confirmed from source

**The user-facing Invite path bypassed the governed company invitation lifecycle.**

`invitePerson()` performed effects equivalent to membership activation directly, instead of routing through:

```
company_invitations  →  governed delivery  →  accept_company_invitation(token)  →  membership activation
```

Concretely, in the pre-fix code it called `auth.admin.inviteUserByEmail`, then set `profiles.active = true`,
linked `people.profile_id`, and **inserted `company_memberships` directly**. It created **no
`company_invitations` row at all** — the governed model existed in the database (migration
`202608310009`, the founder's 2026-08-31 decision) and the product's own Invite button used none of it.

### Consequences, each derived from source rather than inferred

| consequence | mechanism |
|---|---|
| **INVITE != MEMBERSHIP invariant violated** | membership was created in the same action that sent the invitation |
| **membership granted before acceptance** | `company_memberships` inserted at invite time; `accept_company_invitation` never involved |
| **no governed expiry** | `expires_at` lives on the `company_invitations` row that was never created |
| **no governed revocation** | `revokeInvitation()` updates `company_invitations`; with no row there is nothing to revoke — **and no surface anywhere in `web/` deactivates a `company_memberships` row**, so the membership could not be undone through any screen |
| **no invitation audit trail** | `invited_by_profile_id`, `accepted_by_profile_id`, `accepted_at` all live on the absent row |
| **retry/idempotency path bypassed** | `create_company_invitation` carries `on conflict (company_id, email) where status = 'pending' do update … token = <fresh>` — idempotent by construction. The button never called it; it instead refused on `person.profile_id` already being set, which made a half-finished invitation **permanently unrepeatable** |
| **UI semantics contradicted backend truth** | the outcome vocabulary told the founder *"they are not a member until they accept it"* while the code had already made them a member |

**A second, related gap found while fixing this:** `accept_company_invitation` had **no caller anywhere in
`web/`** — the identifier appeared only in three comments. `/pending-activation` told users *"once you
accept that invitation…"*, which was unreachable. The governed lifecycle could create, list and revoke
invitations and could never complete one. Routing the button without building acceptance would therefore
have produced invitations nobody could redeem — worse than the violation it replaced.

### The email-delivery evidence for BUG-036 — what is and is not established

**ESTABLISHED (repository evidence):**

* There is **no repository-managed SMTP configuration**. This is a fact about the repository.
* A **FALSE SENT existed**: `inviteUserByEmail()` returning without error means the auth user was created
  and a message handed to whatever mailer is configured — not that anything was delivered. The pre-fix code
  returned `SENT` on exactly that condition.
* The deployed production build was bound earlier in this campaign:
  `DEPLOYED_WEB_SHA 55a159172a9bbc9b69cde4d2f832418573a4b0b9`, deployment
  `dpl_JBQSWhr6uRcjJ7jNxxQj2VRjwrKJ`, host `brain.open-spot.ai`, with **six of six audited blobs matching**
  the deployed commit — so the Work-PC findings are statements about code that actually ran.

**NOT ESTABLISHED — and deliberately not asserted:**

* **The mail-provider root cause is UNCONFIRMED.** No provider configuration has been inspected, no send
  has been observed, and no bounce or delivery record has been read.
* **`NO SMTP IN REPOSITORY` is not `PRODUCTION_SMTP_NOT_CONFIGURED`.** Inferring a production fact from a
  repository absence is the same error class as inferring an exposed secret from a variable name. The
  Work-PC's line on this was right and is preserved.
* Confirming or excluding a provider cause needs read-only inspection of the Supabase **Auth email
  configuration** — provider, sender identity, and the exact error from the failed invite. That is a
  founder-boundary action.

---

## IMPLEMENTATION

**Implementation commit (full SHA, re-derived):**

```
FIX_SHA  823ff7fee6701e76166b48c5181abfe44493612a
```

Full chain on `wo/invitation-delivery`, oldest first:

| abbreviated | full SHA | what it did |
|---|---|---|
| `1224b6ad` | `1224b6ad74ef8d6a562834b423425ca0efedc782` | BUG-037 first pass: terminal outcome on every path |
| `836fd53a` | `836fd53ae3f26ab50dd884fcd61f2361d73249f4` | the typecheck found that fix reintroducing BUG-037 via a temporal-dead-zone read |
| `d85a18cd` | `d85a18cd65f4a5c82745dace2b5bd0a9e833fc72` | the bypass identified; contract rows registered, nothing patched |
| `e60d8d65` | `e60d8d65c2fb2f3efd8e3002838e6c81fdec54e8` | **INVITE != ADD MEMBER** — the governed route, plus the acceptance surface |
| `823ff7fe` | `823ff7fee6701e76166b48c5181abfe44493612a` | the eight suites, the drafted migration, the classifier correction |

### Governed invitation route

`invitePerson()` now: reads the person → refuses with `INVALID_RECIPIENT` / `NO_COMPANY` where applicable →
checks **real membership** (not `profile_id`) → calls `create_company_invitation` **on the caller's own
client** → only then constructs the service-role client → initiates delivery with the governed token in
`redirectTo`. It performs **no** membership insert, **no** `profiles.active` write, and **no** person link.

**Ordering is a security property.** `create_company_invitation` is `security invoker`, so RLS and its own
`is_founder_or_admin() or is_company_manager(p_company_id)` check are the authority. The service-role client
is built only after that gate passes, so an unauthorised caller never reaches it. The pre-fix code kept a
duplicated founder/admin list in the application and **it had already drifted** — it refused company
managers whom the governed model permits.

### Invitation lifecycle

```
INVITATION_CREATED → DELIVERY_PENDING → SENT → ACCEPTED → MEMBERSHIP_ACTIVE
failure branches:  DELIVERY_FAILED (retryable) | EXPIRED | CANCELLED
```

Two axes are kept distinct: the **invitation** state (`company_invitations.status`) and the **delivery**
state. Collapsing them is how "the provider accepted the API request" came to mean "sent".

### Membership activation timing

Membership is created **only** by `accept_company_invitation(token)`, in the same transaction that records
the acceptance. `MA-C1` and `MA-C6` scan **every `.ts`/`.tsx` under `web/lib` and `web/app` — 175 files** —
and report any second authority over membership or profile activation by path. Both find none.

### Idempotency behaviour

Enforced in the **database**, not by application sequencing — two clicks are two requests, and an
application check races itself:

* second click on a live invitation → `ON CONFLICT … DO UPDATE`, token and expiry rotated;
* two live invitations for one `(company, email)` → impossible, partial unique index;
* accepted twice → `status = 'pending'` lookup under `FOR UPDATE`;
* already-active membership → `ON CONFLICT (company_id, profile_id) DO UPDATE SET active = true`;
* expired or revoked → outside the partial index, so a resend starts a fresh invitation.

### Partial-auth-user behaviour

**There are no writes after the mail call**, so the half-made member cannot be constructed. `AP-C1`
measures this **by position**, not by absence: it locates `inviteUserByEmail` and requires that no
`.insert(`, `.update(`, `.upsert(` or `.delete(` appears after it. `bookkeepingFailure` was deleted with the
class it reported.

An **existing auth account is control flow, not a failure** (`isExistingAuthUser`, tested before the
classifier is consulted): the invitation exists and is redeemable, the person signs in and accepts.
Classifying "already registered" as an error is what made a second click a permanent dead end.

### Retry behaviour

`DELIVERY_FAILED` returns `ok: true` — the invitation **exists**, is revocable and is retryable. Reporting
"nothing was changed" while a governed invitation stands would be false and would invite a duplicate.

### Tenant isolation

Creation refuses a company the caller does not manage; `company_id` is `NOT NULL` with `ON DELETE CASCADE`;
the management policy is `FOR ALL` and company-scoped with RLS enabled; redemption derives the company from
the **stored row**; and the caller's profile email must equal the invitation's email — which is what makes a
Google or other OAuth account safe, and a forwarded token useless to a colleague.

**No cross-tenant attempt is executed, deliberately.** Proving a cross-tenant write fails means performing
one, and that is the write that must never succeed — the same reasoning the battery applies to Codex E.

### Role integrity

`invited_role` is constrained to the seven real application roles and cast to `public.app_role` on
application. The role travels on the invitation and is applied by the gate to both the profile and the
membership. No application file writes a `role_in_company` literal or sets a profile role.

### Terminal UX / result behaviour

Every path returns exactly one canonical outcome with a derived sentence; **no raw provider text reaches a
user**. The caller clears in-flight state in a `finally` and has its own `catch` for failures the server
cannot report. The acceptance page is a **server** component: the token is consumed server-side and never
enters the client bundle or the markup.

---

## TEST EVIDENCE

Exact counts, read from the artifacts at `FIX_SHA`:

| suite | result |
|---|---|
| `invitation_membership_contract` | **10 passed, 1 failed** (`IM-D5`) |
| `invitation_delivery_state_contract` | **7 passed, 1 failed** (`DS-D1`) |
| `invitation_idempotency_contract` | **10 passed, 0 failed** |
| `invitation_auth_partial_state_contract` | **9 passed, 0 failed** |
| `invitation_membership_activation_contract` | **8 passed, 0 failed** (175 application files scanned) |
| `invitation_tenant_isolation_contract` | **9 passed, 0 failed** |
| `invitation_role_integrity_contract` | **7 passed, 1 failed** (`RI-D1`) |
| `invitation_reload_retry_contract` | **10 passed, 0 failed** |
| `invitation_outcome_contract` (retargeted) | **20 passed, 0 failed** |

**Typecheck:** clean except `app/layout.tsx(21,50) TS2304: Cannot find name 'LayoutProps'` — a Next.js
**generated** global from `.next/types` in a worktree that has never been built. Verified rather than
assumed: the file is byte-identical to the main worktree, and the same typecheck there, where `.next/types`
exists, reports it **zero** times.

**Both-directions proof:** `qa/verification/im_both_directions.mjs` builds a mirror tree and reintroduces
each contract violation one at a time. `IM-D1`–`IM-D4` each go **RED on their own regression** with nothing
else moving and no contract row broken; `IM-D5` goes **green on its own fix**. A row that cannot move is
decoration.

### The three intentionally red rows

#### `DS-D1` — delivery state is persisted on the invitation

* **Invariant represented:** delivery state belongs to the invitation, and `SENT` must mean the delivery
  contract reached terminal success.
* **Why it remains red:** `company_invitations` has a `status` column covering the **invitation** axis
  (`pending/accepted/revoked/expired`) and **no delivery axis at all**. So `DELIVERY_PENDING` and
  `DELIVERY_FAILED` exist only in the reply to one click — reload and the distinction is gone — and `SENT`
  can never be set, because nothing has anywhere to write it.
* **Owner:** **FOUNDER AUTHORIZATION.** The column is a production migration.
* **Why it must not be normalised green:** a vocabulary containing a state nothing can set is
  indistinguishable from one that works, right up until a founder is told an email arrived that did not.
  The red row is what keeps that gap visible; BUG-037's remaining half *is* this row.

#### `IM-D5` — a company membership can be deactivated through some governed surface

* **Invariant represented:** an authority that can be granted must be removable.
* **Why it remains red:** nothing in `web/lib/data` deactivates a `company_memberships` row, and
  `revokeInvitation()` only touches `company_invitations`. Routing the Invite button does **not** undo this:
  every membership the **old** path already created still exists and still cannot be removed from any screen.
* **Owner:** **BUG-035** (membership role management absent).
* **Why it must not be normalised green:** the routing change makes new invitations governed; it does not
  give anyone a way to remove a membership. Marking it green would report an ungranted capability as present
  and would also quietly absorb BUG-035 into this work, which the founder forbade.

#### `RI-D1` — some governed surface lets an inviter choose the invited role

* **Invariant represented:** the role is the inviter's recorded choice, not the code's assumption.
* **Why it remains red:** no file passes `p_invited_role`, so every invitation takes the `employee`
  default. The constrained, auditable, per-invitation role the schema models is **unreachable from the
  product**.
* **Owner:** **BUG-035**, seen from the invitation side.
* **Why it must not be normalised green:** the role *pipeline* is sound end to end — that is what `RI-C1`
  through `RI-C6` establish. A sound pipeline with no chooser is still a missing capability, and collapsing
  the two would report BUG-035 closed by rows that never tested it.

---

## CLASSIFIER DEFECT

**Discovered defect: `mail` matched inside `email`.**

The delivery arm of `classifyError` was `/smtp|mail|sender|relay|bounce|delivery/`. Because `mail` is a
substring of `email`, **any** provider message mentioning an email address classified as `DELIVERY_FAILED` —
including `"A user with this email address has already been registered"`. The founder would be told the
message could not be delivered, and that retrying was worthwhile, for an error that is neither.

Found by a fixture row in the older outcome suite which expected that message **not** to be a delivery
failure. The fixture was right and the code was wrong — the useful direction for a test to fail in.

**Structural correction:**

* **word-bounded classification** — `\bsmtp\b`, `\bmailer\b`, `\brelay\b`, `bounced?`, `\bundeliverable\b`,
  an explicit *"(not|could not|failed to) be delivered"*, and `\bdelivery (failed|error)`;
* **`sender` removed** from delivery-failure classification;
* **configuration failures remain distinct from delivery failures.**

**Why `sender` had to go:** *"sender identity not verified"* is **configuration / provider readiness**. It
is a statement that the provider is not ready to send — not evidence that a send was attempted and failed.
Classifying it as a delivery failure tells the founder to retry, which cannot help, and it records a failed
delivery attempt that never happened. Transport-level unreachability already has its own outcome,
`PROVIDER_UNAVAILABLE`.

---

## SUPERSEDED CONTRACT ROWS

Two rows in `invitation_outcome_contract` were **RETARGETED, NOT DELETED**:

1. *"the vocabulary contains `INVITATION_ALREADY_PENDING`"*
2. the classifier fixture expecting `"already been registered"` → `INVITATION_ALREADY_PENDING`

**The old behaviour was valid under the superseded contract.** Under the previous semantics a second click
on a live invitation *was* an "already pending" condition, and an existing auth account *was* reported as
one. Those rows correctly pinned the behaviour as it then stood.

**The founder changed canonical invitation semantics on 2026-09-11.** A second click is now a legitimate
**RESEND** that refreshes the row and returns `DELIVERY_PENDING`; an existing auth account is **control
flow**, not a failure. The rows became wrong because the contract moved, not because they were badly written.

**Regression history remains preserved.** Each retargeted row carries, in place, the statement of what it
used to assert and why the contract changed. **Nothing has been rewritten to make the old tests look
wrong** — they were right for the contract they were written against.

**New rows pin the governed mechanism.** One row was *added* asserting that `isExistingAuthUser` exists and
is consulted by the invite action **before** the classifier, so the new fixture's answer can never be
mistaken for the design, and removing that test fails a row rather than silently restoring the dead end.

---

## BUG-037 / DELIVERY STATE

**Draft migration: `supabase/drafts/202609110001_invitation_delivery_state.sql` — NOT APPLIED.**

It is outside `supabase/migrations/` deliberately; `supabase db push` does not see it.

What it does:

* adds `delivery_state` (`pending` / `sent` / `failed`), `delivery_attempted_at`, `delivered_at`,
  `delivery_error_code`, `delivery_attempts`;
* **makes `SENT` without a confirmation timestamp unrepresentable** — a CHECK constraint
  (`delivery_state <> 'sent' or delivered_at is not null`), so the false SENT cannot be stored, not merely
  discouraged;
* **the database stamps `delivered_at`** inside one `SECURITY DEFINER` writer, from the database clock;
* therefore **the caller cannot invent a confirmation timestamp** — there is no parameter for one;
* a second CHECK requires an error code whenever `delivery_state = 'failed'`, so "retryable" is never a guess;
* stores **no provider text** — only a code from the application's own vocabulary.

**Production application: BLOCKED — FOUNDER AUTHORIZATION.**

> **THIS MIGRATION DOES NOT PROVE EMAIL ARRIVAL.**
>
> A durable `SENT` state is not mailbox delivery evidence. Setting it truthfully requires a provider that
> reports delivery — a webhook or a delivery query — which is separate work with its own authorization
> (provider account, secret, public endpoint). Until that exists, `delivery_state` can move only between
> `pending` and `failed`.

**BUG-037 therefore remains open** until the product contract and the Work-PC acceptance requirements are
satisfied.

---

## PRODUCTION PROVENANCE

```
FIX_SHA             823ff7fee6701e76166b48c5181abfe44493612a
BRANCH              wo/invitation-delivery   (not present on any remote)
DEPLOYED_WEB_SHA    NOT DEPLOYED
DEPLOYMENT_ID       n/a
DEPLOYMENT_TIME     n/a
DEPLOYMENT STATUS   not deployed; production web deploy is BLOCKED — FOUNDER AUTHORIZATION
```

**The implementation commit is not a production build.** Production currently serves
`55a159172a9bbc9b69cde4d2f832418573a4b0b9` (deployment `dpl_JBQSWhr6uRcjJ7jNxxQj2VRjwrKJ`, host
`brain.open-spot.ai`) — the build the Work-PC findings were made against, and the base this branch was
written on. None of the work in this report is running anywhere.

---

## REAL DELIVERY STATUS

Stated separately, because API success is not mailbox delivery:

| stage | status | evidence |
|---|---|---|
| **SEND REQUEST** | **NOT VERIFIED** | no runtime was executed; every finding here is source-level |
| **PROVIDER ACCEPTANCE** | **NOT VERIFIED** | no send was performed, so no acceptance was observed |
| **MAILBOX ARRIVAL** | **NOT VERIFIED** | no mailbox was inspected; nothing in this repository can observe one |
| **OTP ARRIVAL** | **NOT APPLICABLE / NOT VERIFIED** | the invitation flow uses an invite link carrying the governed token, not an OTP. If production Auth is configured to send an OTP instead, that is itself a finding and belongs to the founder-boundary inspection |

**API success is not collapsed into mailbox delivery anywhere in the code or in this report.** That
conflation was the defect; `SENT` is unreachable precisely so it cannot recur.

---

## WORK-PC HANDOFF

```
READY_FOR_INDEPENDENT_WORK_PC_RETEST = false
```

**Why false:** the branch is **not deployed** (`DEPLOYED_WEB_SHA = NOT DEPLOYED`, not on any remote), and
the **external mail dependency is unconfirmed** — no provider configuration has been inspected and no send
has been observed. Independent acceptance of an end-to-end invitation flow cannot begin against code that is
not running, and cannot conclude against a mail path whose configuration is unknown.

**It becomes true when both hold:** this branch (or its successor) is deployed under the existing production
authorization gate, **and** the mail provider configuration is confirmed ready.

**The Work PC remains the authority to retest the whole chain:**

```
INVITE → ACTUAL EMAIL RECEIPT → AUTH → ACCEPTANCE → MEMBERSHIP
       → TENANT ISOLATION → ROLE → RELOAD → LOGOUT/REAUTH
```

**Home PC may not close the bug.** This report records IMPLEMENTED and DEVELOPER VERIFIED only.
`qa/BUG_QUEUE.json`, `qa/COVERAGE_LEDGER.json`, `qa/FIXTURE_REGISTRY.json` and `qa/HANDOFF_STATE.json` on
`origin/qa/work-pc` are **untouched**.

---

## FOUNDER-BLOCKED, TRACKED SEPARATELY

| item | status |
|---|---|
| production application of `202609110001` (delivery state) | **BLOCKED — FOUNDER AUTHORIZATION** |
| production web deploy of this branch | **BLOCKED — FOUNDER AUTHORIZATION** |
| mail-provider / Auth dashboard / secret inspection or change | **BLOCKED — FOUNDER BOUNDARY** (read-only Auth email configuration inspection is what would confirm or exclude the BUG-036 provider cause) |
| a governed surface for choosing an invited role, and for deactivating a membership | **BUG-035**, separate defect identity, unchanged |

A blocked subtask here does not block unrelated work, and none of these stops the Edge campaign or the
Factory transition.
