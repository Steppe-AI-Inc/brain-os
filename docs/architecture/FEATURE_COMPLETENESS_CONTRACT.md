# Feature Completeness Contract

The development contract for Brain OS. It exists because the same defect families kept
recurring: a feature was "done" when a component rendered, and the inverse action, the
other surfaces, the archived parent, the truthful receipt and the fresh-session check were
discovered later by independent QA. From 2026-09-07 this document is the one place that
says what "complete" means, and `CLAUDE.md` binds every session to it.

Truth semantics: `governance/OPERATING_TRUTH_MODEL.md`. The operation chain and the
parent/child policy: `governance/CANONICAL_WORK_CONTRACT.md`. Authorization content:
`governance/BRAIN_OS_CONSTITUTION.md`.

---

## 1. The development pipeline

```
PRODUCT CONTRACT → STATE MACHINE → INVARIANTS → SECURITY / TENANCY → SHARED PRIMITIVES
→ UX STATES → IMPLEMENTATION → DEVELOPER VERIFICATION → DEPLOY → INDEPENDENT WORK-PC ACCEPTANCE
```

Product semantics are defined first. Shared primitives enforce them. Code implements
them. Independent QA verifies them. Claude does not invent product semantics while
coding; when a semantic question surfaces mid-implementation it is written down in the
feature contract (section 2) and answered there before the code that depends on it.

## 2. What must be defined before implementation

Every meaningful product capability has a feature contract (template:
`docs/architecture/templates/FEATURE_CONTRACT_TEMPLATE.md`, filed under
`docs/architecture/features/<slug>.md`). It fixes:

1. **Canonical state** — which table/columns are the truth; which fields are derived.
2. **State machine** — states, transitions, who triggers each, what each transition
   preserves.
3. **Product invariants** — sentences that must stay true on every surface
   ("an archived company is never offered in an active selector").
4. **Authorization** — which roles/capabilities may perform each transition; re-derived
   inside the operation.
5. **Organization / tenant scope** — how the scope is resolved; what a foreign-org target
   returns.
6. **Relationships** — parents, children, links; what happens to each on every transition
   (per the centralized parent/child policy).
7. **UX surfaces** — every page, selector, badge, notification, chat interaction, search
   and dashboard that displays or mutates the entity.
8. **Inverse actions** — the reverse of every transition, in scope for the same delivery.
9. **Failure modes** — required, each with the exact user-visible result:
   missing entity · stale state · duplicate request · unauthorized · foreign org ·
   already in target state · partial backend failure · conflicting concurrent update ·
   archived / inactive target or parent.
10. **Acceptance criteria** — the checks the Work PC will run, written before code.

Small changes (copy, styling, a pure refactor with no semantic change) do not need a
feature contract; anything that touches state, authorization, a relationship, a
lifecycle, a collection shown to the founder, or a Brain Chat mutation does.

## 3. Lifecycle completeness

A capability is in scope together with its inverse and its neighbours, or it is not in
scope at all:

```
create → edit → archive → restore
assign → reassign → unassign
invite → accept → revoke
enable → disable → re-enable
move A → B → A
pending → clarify → confirm → execute / cancel / expire
```

Each arrow is tested in the same delivery with the same receipt discipline.

## 4. Defect class before patch

Before fixing a reported defect, name its class and search for the class across the
codebase (the `incident-to-regression` skill). The classes seen so far:

| Class | Shape |
|---|---|
| EXECUTION_TRUTH | success claimed without a verified execution receipt |
| GROUNDING_PRECEDENCE | history or prose outranked fresh canonical state |
| CONTEXT_WINDOW_AS_UNIVERSE | an entity treated as non-existent because it was outside a capped window |
| TRUNCATION_WITHOUT_METADATA | a capped collection presented as complete |
| RECEIPT_MISMATCH | the receipt names a different action/relationship than the one executed |
| ARCHIVED_PARENT_LEAK | a child under an archived parent presented as normally active |
| DUPLICATED_OPERATION | UI and chat (or two pages) implement the same business action separately |
| SILENT_EMPTY_STATE | a control with no options and no reason |
| POSTCONDITION_ASSUMED | `postconditionPassed` set without a fresh re-read |
| AUTHORITY_NOT_ENFORCED | a rule that lives only in prose |

A fix that closes the reported instance but not the class is not complete.

## 5. Shared primitives first

Before writing a special-case helper, decide whether the concept belongs in a shared
primitive. The inventory and homes:

| Primitive | Home (web) | Home (Edge) | Status 2026-09-07 |
|---|---|---|---|
| `ExecutionResultEnvelope`, `MutationReceipt` | `web/lib/contracts/execution.ts` | `supabase/functions/_shared/execution.ts` | introduced in the P1 package |
| `CollectionEnvelope<T>` | `web/lib/contracts/collection.ts` | `supabase/functions/_shared/collection.ts` | introduced in the P1 package |
| `LifecycleResult`, `callLifecycleRpc()` | `web/lib/contracts/lifecycle.ts` | `supabase/functions/_shared/lifecycle.ts` | introduced in the P1 package |
| Archived-parent policy, `canActOnParent()` | `web/lib/policy/archived-parent.ts` (+ `web/lib/data/company-ref.ts`) | `supabase/functions/_shared/parent-policy.ts` | introduced in the P1 package |
| `resolveOrgScope()` | `web/lib/data/org-scope.ts` | n/a (Edge scope is the caller JWT) | introduced in the P1 package |
| Pending action (`chat_channel_state`) | n/a | `sem-ai-command/index.ts` | present; precedence corrected in the P1 package |
| Lifecycle RPCs + guard triggers | `supabase/migrations/202608280013`, `202608290001`, `202608290008` | | present |
| RLS helpers (`has_company_access`, `is_company_manager`, `is_founder_or_admin`) | schema | | present |

Introducing a new shared primitive updates this table and
`docs/architecture/CAPABILITY_IMPACT_REGISTRY.yaml` in the same change.

## 6. Change-impact analysis

Before implementing, state (in the feature contract or the PR):

- which shared primitives are touched or must be introduced;
- which entity types reuse them;
- which surfaces may drift (pages, selectors, AI interactions, searches, dashboards,
  notifications, APIs);
- which regression families must run.

`docs/architecture/CAPABILITY_IMPACT_REGISTRY.yaml` is the lightweight map from shared
concept to the surfaces that depend on it; keep it current.

## 7. Definition of done

A feature is DONE only when all of the following are true. A feature is **not** complete
because a component renders, TypeScript compiles, a button works, a row changes, an RPC
returns success, a unit test passes, a toast appears, Brain produces a plausible sentence,
Claude says "implemented", or Home-PC tests are green.

- [ ] Feature contract exists and the implementation matches it (states, invariants,
      failure modes, inverse actions).
- [ ] The full path is covered: PRECONDITION → ACTION → BACKEND RESULT → POSTCONDITION →
      RELOAD → FRESH SESSION / FRESH QUERY.
- [ ] Inverse actions tested in the same delivery.
- [ ] Cross-surface consistency verified on every surface the registry lists for the
      touched concept (Dashboard, Companies, People, Projects, Tasks, Goals, Departments,
      Documents, Search, Selectors, Brain Chat, Notifications, Audit, Mobile as applicable).
- [ ] AI truth verified: receipts truthful, grounding from fresh state, no claim without
      a verified envelope (Operating Truth Model §5 table all clear).
- [ ] Shared primitives used; no entity-specific reimplementation of a shared concept.
- [ ] Authorization and tenancy: positive and negative persona cases, including
      foreign-org and archived-parent cases.
- [ ] Regression tests added for the defect class (not only the instance); the
      architecture contracts under `qa/scenarios-runner/architecture_*` pass.
- [ ] Static gates clean (`tsc`, `eslint`, `next build`; Edge `deno check` gated by
      error class); CRLF discipline for `sem-ai-command/index.ts`.
- [ ] No known contradiction between DB, UI and AI for the same entity.
- [ ] Build / deploy provenance recorded (commit SHA, deployed SHA, function version).
- [ ] Classified with a real release state (`CLAUDE.md` §"Release states"), never "done".

## 8. Ownership

| Home / Main PC (implementation) | Work PC (independent acceptance) |
|---|---|
| architecture, implementation, migrations, developer testing, source invariants, deployment after the founder boundary, fix reports | deployed-browser acceptance, adversarial QA, production regressions, independent evidence |
| may mark READY FOR DEPLOYMENT, DEPLOYED, READY FOR INDEPENDENT QA (`ready_for_retest`) | alone marks CLOSED / REOPENED |
| may never mark PRODUCTION VERIFIED, CLOSED, or "production accepted" | owns `qa/BUG_QUEUE.json`, `qa/COVERAGE_LEDGER.json`, `qa/FIXTURE_REGISTRY.json`, `qa/HANDOFF_STATE.json` (single-writer) |

Fix reports go to branch `qa/home-pc-handoff` at `qa/home-pc-handoff/fixes/<BUG_ID>.json`.

## 9. Fix-report contract

```
{
  bug_id, status_report ('ready_for_retest' | 'fix_prepared' | 'blocked'),
  root_cause, defect_class (section 4), changed_primitives[], changed_files[],
  regression_tests[] (paths), verification { unit, integration, source_invariants, deno_or_tsc },
  deploy_provenance { commit_sha, web_deployment, edge_function_version, edge_sha256 },
  fixture_notes, ready_for_retest (boolean), never 'closed'
}
```

## 10. Deploy and release authority (pointer)

Production writes (database migrations, Edge Function deploys, secrets, auth/security
configuration) are founder-only actions, executed only through the authorized path
described in `docs/FOUNDER_ACTION_RUNBOOK.md` and the release broker
(`scripts/release-broker/`, PR #8). An implementation session prepares the exact change
and stops at the boundary. Web changes reach production through a pull request into the
protected `master` branch, never by a direct push or a manual `vercel --prod`.
