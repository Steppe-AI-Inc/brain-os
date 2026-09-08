---
name: feature-delivery
description: The standard end-to-end delivery workflow for a Brain OS feature change - design check, implementation, verification, deployment, evidence. Use for any Implementation/Integration/DB-Security Engineer Work Order, from the smallest fix to a full feature.
---

# Feature Delivery

The delivery discipline for a Brain OS change. The contract it serves is
`docs/architecture/FEATURE_COMPLETENESS_CONTRACT.md` (what must be defined before code,
the defect classes, the shared primitives, the definition of done); this skill is the
order of operations, not a second rule source. Skipping a step because a change "looks
small" is exactly how a real regression gets shipped.

## 0. Define before you build

For anything touching state, authorization, a relationship, a lifecycle, a collection
shown to the founder, or a Brain Chat mutation: write the feature contract first
(`docs/architecture/templates/FEATURE_CONTRACT_TEMPLATE.md`), including inverse actions
and every failure mode, and consult `docs/architecture/CAPABILITY_IMPACT_REGISTRY.yaml`
for the surfaces the change can drift.

## 1. Check before you build

Read `qa/KNOWN_FAILURE_MODES.md` for whether the defect class you're about to touch has
already been hit once. Check whether a `canonical-entity-graph` walk or a Product
Architect design already exists for this Work Order. Grep for the existing pattern
before inventing a new one — this codebase's own convention (one file per domain in
`web/lib/data/<domain>.ts`, the archive/restore RPC shape via `lib/contracts/lifecycle.ts`,
the three-tier RLS pattern, the shared contracts under `web/lib/contracts/`) should be
extended, not reinvented per feature.

## 2. Implement against real state, not assumption

Never assume a table/column/RLS policy has a particular shape — read it. Never assume a
UI component already exists with the behavior you need — check. The single most common
real defect this codebase has produced came from an agent assuming rather than
verifying (e.g. assuming a task's `owner_agent_id` was ever populated by any code path —
it wasn't, confirmed only by grepping the actual execution code).

## 3. Verify before claiming done — every time, no exceptions

- `npx tsc --noEmit` from `web/`, clean.
- `npx eslint <touched files>`, clean.
- `npm run build` from `web/`, clean.
- `qa/scenarios-runner/architecture_*` contracts pass (collection envelopes, mutation
  envelopes, final-claim rule, archived-parent policy, lifecycle-RPC-only, org scope).
- If you touched a Supabase Edge Function: `deno check` gated by error class, CRLF-pure
  `index.ts`, an independent verifier on the exact SHA. Deploying is a founder-only
  action (`CLAUDE.md` §8): prepare, ask `ALLOW_FUNCTIONS_DEPLOY=1?` once, and after the
  founder's deploy run `scripts/factory-runner/verify-deployed-bytes.sh`.
- If you touched schema/RLS/RPCs: hand off to `brain-os-db-security-engineer`'s
  discipline (`frictionless-secure-crud` skill) — never push yourself; the production
  path is the release broker.

## 4. Add or extend a permanent regression test

Every real fix gets a rolled-back-transaction SQL script under `qa/scenarios-runner/`
(matching existing scripts' conventions) or the equivalent for the surface you touched.
"I tested it manually once" is not evidence that survives to the next change someone
makes nearby.

## 5. Ground any AI-facing claim in a real result

If your change affects `sem-ai-command`, every mutation path records an
`ExecutionResultEnvelope` with a fresh postcondition and the founder-facing account is
rendered from it (`governance/OPERATING_TRUTH_MODEL.md` §3-§4). The model's prose never
self-certifies execution.

## 6. Commit with a real "why," open a PR, and report precisely

Commit messages explain the reasoning and the real evidence gathered, not just what
changed. Production reaches `master` only through a pull request carrying the PR
template's definition of done. Never report a Work Order "done" without the evidence from
steps 3-4 actually in hand, and never mark a Work-PC bug CLOSED — publish a fix report
with `ready_for_retest` (`FEATURE_COMPLETENESS_CONTRACT.md` §8-§9). That gap between
claimed and real completion is exactly what `brain-os-verifier` exists to catch.
