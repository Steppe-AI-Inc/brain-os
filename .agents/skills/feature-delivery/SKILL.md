---
name: feature-delivery
description: The standard end-to-end delivery workflow for a Brain OS feature change - design check, implementation, verification, deployment, evidence. Use for any Implementation/Integration/DB-Security Engineer Work Order, from the smallest fix to a full feature.
---

# Feature Delivery

The actual delivery discipline proven across every real feature shipped this session
(frictionless archive/restore, org-graph fix, employee invites). Follow this order —
skipping a step because a change "looks small" is exactly how a real regression gets
shipped.

## 1. Check before you build

Read `qa/KNOWN_FAILURE_MODES.md` for whether the defect class you're about to touch has
already been hit once. Check whether a `canonical-entity-graph` walk or a Product
Architect design already exists for this Work Order. Grep for the existing pattern
before inventing a new one — this codebase's own convention (one file per domain in
`web/lib/data/<domain>.ts`, the archive/restore RPC shape, the three-tier RLS pattern)
should be extended, not reinvented per feature.

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
- If you touched a Supabase Edge Function: `supabase functions deploy <name>
  --project-ref <ref>`, then `supabase functions download` + `diff` against your
  committed source — zero output required. A deploy command exiting 0 is not proof the
  live function matches what you wrote.
- If you touched schema/RLS/RPCs: hand off to `brain-os-db-security-engineer`'s
  discipline (`frictionless-secure-crud` skill) — never push yourself.

## 4. Add or extend a permanent regression test

Every real fix gets a rolled-back-transaction SQL script under `qa/scenarios-runner/`
(matching existing scripts' conventions) or the equivalent for the surface you touched.
"I tested it manually once" is not evidence that survives to the next change someone
makes nearby.

## 5. Ground any AI-facing claim in a real result

If your change affects `sem-ai-command`, the model's own claim of success must be
replaced (never merely prepended) by the real RPC/execution result when that result is
the entire point of the turn — a prepend has already been proven insufficient live (the
model can still contradict a correct prepended fact).

## 6. Commit with a real "why," push, and report precisely

Commit messages explain the reasoning and the real evidence gathered, not just what
changed. Never report a Work Order "done" without the evidence from steps 3-4 actually
in hand — that gap between claimed and real completion is exactly what
`brain-os-verifier` exists to catch, and being caught in it is a tracked failure, not a
minor style note.
