# Canonical Work Contract

**Layer C of Brain OS governance.** Every business action in Brain OS, whether it starts
in the UI, in Brain Chat, in an agent, or through an API, is one canonical operation that
walks the same chain. This document is the single authoritative home for that chain, for
the one-operation rule, and for the centralized parent/child policy. Truth semantics are
in `governance/OPERATING_TRUTH_MODEL.md`; authorization content is in
`governance/BRAIN_OS_CONSTITUTION.md` and `governance/SECURITY_INVARIANTS.md`; the
per-feature definition work is in `docs/architecture/FEATURE_COMPLETENESS_CONTRACT.md`.

---

## 1. The chain

```
INTENT                       what the caller asked for, as a structured request (never inferred
                             from the response text)
→ CANONICAL ENTITY RESOLUTION explicit reference or name → lookup under the caller's authorization,
                             spanning the statuses the action requires → disambiguate only when
                             genuinely ambiguous → exact stable ID. Context-window absence is never
                             non-existence.
→ AUTHORIZATION              tenancy (organization scope) + role, re-derived inside the operation.
                             Denied is a truthful outcome, not an exception path.
→ GOAL / WORK ORDER          the durable unit of work the action belongs to
→ ATOMIC TASKS               the executable steps, each with acceptance criteria
→ ASSIGNMENT                 who or which agent executes
→ APPROVAL IF REQUIRED       per governance/ACTION_RISK_LEVELS.md and policies/*.yaml; the payload is
                             immutable after the request is created
→ EXECUTION                  the canonical operation (one RPC / one server action) runs once
→ POSTCONDITION              fresh re-read proves the intended state; rows affected recorded
→ EXECUTION RECEIPT          one ExecutionResultEnvelope persisted per operation
→ VERIFIED RESULT            what the caller is told, rendered from the receipt
```

Every mutation records: requested action → actual executed operation → canonical IDs →
rows affected → postcondition → persisted execution result. A step that is skipped must
be visible as skipped in the receipt (for example `executed: false, error: 'denied'`).

## 2. One product operation per business action

The same business action from UI, AI, agent or API converges on the same canonical domain
operation with the same authorization, tenancy checks, stable id, state transition,
postcondition and receipt.

- The canonical operation is a database RPC (`security definer`, `set search_path = ''`,
  authorization re-derived inside) or a single server action that calls it. Reference
  implementation: `archive_company` / `restore_company` in
  `supabase/migrations/202608280013_frictionless_company_delete.sql`; the build recipe is
  the `frictionless-secure-crud` skill.
- Where possible the single path is DB-enforced (a `BEFORE UPDATE` trigger that rejects a
  lifecycle transition made without the session flag the canonical RPC sets), not a
  convention every caller is expected to follow.
- Web wrappers go through one shared helper (`callLifecycleRpc` in
  `web/lib/contracts/lifecycle.ts`) that returns the RPC jsonb as a typed
  `LifecycleResult`. A chat executor goes through the same RPC and records the same
  envelope. Neither side re-implements the transition.
- Chat never resolves a lifecycle target by filtering to what happens to be in the
  context pack. It resolves server-side under the caller's RLS across the statuses the
  action requires (restore searches archived; archive searches active; both report
  `already_<state>` truthfully).

## 3. Lifecycle semantics

- **Archive is reversible and destroys nothing.** Permanent deletion is a separate,
  rare, explicitly labelled operation gated to founder/admin, reachable only from an
  archived-items view, and never the default "delete" from UI or chat.
- **Every lifecycle has its inverse in scope.** A feature that can archive can restore;
  assign can reassign and unassign; invite can revoke; enable can disable and re-enable;
  move A→B can move B→A. The inverse is part of the same feature, with the same receipt
  discipline, and it is tested in the same delivery.
- **Restore-to target is exact.** Where an entity has several pre-archive statuses, the
  previous status is stored and restored verbatim, never guessed.
- **Idempotency is a truthful outcome.** Archiving an archived entity returns
  `changed: false, reason: already_archived`; it is neither an error nor a silent no-op.

## 4. Parent/child policy (centralized)

One policy decides how descendants of a parent in a non-active state are treated. It is
implemented once (`web/lib/policy/archived-parent.ts` for the web app, mirrored in
`supabase/functions/_shared/parent-policy.ts` for the Edge runtime) and consumed by every
surface that joins a child to `companies` through the canonical join helper
`web/lib/data/company-ref.ts` (`COMPANY_REF`, `companyRefVia`, `isArchivedParent`).

| Parent state | Descendants (people, projects, departments, goals, tasks, documents) |
|---|---|
| **active** | Normal. |
| **archived** | Preserved, displayed with a visible "parent archived" indication on every surface; lifecycle-dependent controls (set manager, invite, onboarding, add project/department, new assignment) are disabled with the reason "Company is archived — restore it first"; chat refuses the same mutations with the same reason via the receipt; active lists and creation/assignment selectors exclude them; historical lookup still resolves them. Restore is symmetric: everything becomes normal again with no further action. |
| **inactive** (person) | Employment/assignment ended; the person is not offered as a manager or assignee; existing history is preserved and labelled. |
| **deleted** (permanent) | Only reachable from the archived state; descendants must have been ended, reassigned or archived first, or the operation is refused with a business reason. No descendant may ever point at a missing parent as though it were active. |

No destructive cascade is implied by archiving. A surface that renders a child under an
archived parent as a normal, unmarked, currently-active relationship is a defect
(class ARCHIVED_PARENT_LEAK).

## 5. Tenancy and authorization (pointers, not restatements)

- The organization scope of a request is resolved once through `resolveOrgScope()`
  (`web/lib/data/org-scope.ts`); pages do not hand-write the sentinel comparison.
- Every canonical operation runs as the caller (RLS-scoped). The Edge runtime uses the
  caller's JWT, never the service role. A cross-organization target yields
  `executed: false, error: 'denied'` in the envelope and a truthful receipt, and is a
  required negative test for every lifecycle operation.
- Roles, capabilities, data classification and risk levels: `BRAIN_OS_CONSTITUTION.md`
  and the files it points to. Agent instructions are not security.

## 6. Manager assignment semantics

- A person may not be their own manager.
- Setting a manager is a replacement: the previous manager relationship ends in the same
  operation, and the receipt names both ("manager of P set to M, was N").
- The picker offers only eligible people (same organization scope, active, not the
  subject); an empty candidate list shows a reason ("No other active people in
  <company>"), never a silent empty control.
- The current manager is visible before and after the change on the same surface.

## 7. Pending actions

A pending action (disambiguation, confirmation, clarification) is durable structured
channel state (`chat_channel_state`), TTL-guarded, and outranks stale narrative. A
pending action never grounds or excuses a completion claim; it only records what the next
turn may execute. Resolving it executes the canonical operation and produces a receipt
like any other turn.
