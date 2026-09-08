---
name: canonical-entity-graph
description: How to check whether a new resource actually needs a new table, and how to wire a genuinely new one into Brain OS's existing canonical graph correctly. Use before designing any new database resource - a company, business unit, task, goal, work order, approval, document, memory, or anything factory-specific (agent run, artifact).
---

# Canonical Entity Graph

Brain OS is a connected operating graph, not a collection of independent tables. Before
proposing a new table, column, or relationship, answer these in order:

## 1. Does a canonical resource already cover this?

Check `supabase/schema-v0.7-production-core.sql` and `qa/KNOWN_FAILURE_MODES.md` #20
(the resource-support audit) before inventing anything. Real precedent already
established in this codebase:
- **Business units are not a separate table** — they're `companies` rows with
  `organization_type='business_unit'` plus a `company_relationships` edge
  (`relationship_type='business_unit_of'`) to their parent. Don't create a `business_
  units` table; extend the existing pattern.
- **`public.work_orders` is narrowly and exclusively "one row per AI chat turn"** —
  append-only, RLS-locked, tightly coupled to `chat_channels`/SSE streaming. It is not a
  generic multi-step work concept, despite the name. Never repurpose it — if you need a
  broader work-order concept (e.g. a Factory Work Order), that's a genuinely new,
  distinctly-named table that may *reference* a `work_orders.id` as "the chat command
  that originated this," never overload its shape.
- **`public.agents` is real but currently inert** — no write path exists through the
  app, it's a static reference table. Extending it (adding columns) is usually correct;
  replacing it with a parallel table is usually wrong.

## 2. Do not create parallel sources of truth

If an existing table almost fits, extend it (new nullable columns, a new enum value) —
don't fork a near-duplicate table because the existing one has a field you don't need.
Two tables that both claim to be the authoritative source for the same fact is the
exact failure class `qa/KNOWN_FAILURE_MODES.md` #8/#9/#11 document (RLS policy drift
between what's live and what's tracked) applied one level up, at the schema-design
stage instead of the deployment stage.

## 3. Walk the real dependency graph before finalizing a design

For the new (or extended) resource, trace every real dependency it will have, using
this repo's actual shape, not an abstract template:
```
entity → parent/organization (company_id, almost always)
  → people (who's assigned/who owns it)
  → tasks/goals (what work references it)
  → documents (what's attached)
  → memories (what the AI might recall about it)
  → approvals (what production-risk actions touch it)
  → audit_logs (what gets recorded)
  → AI context (does sem-ai-command's buildContext() need to know about it)
  → UI (which page/selector needs to filter it correctly)
```
Every one of these needs an explicit answer before implementation starts — "not
applicable" is a fine answer, "we'll figure it out later" is not. The founder has
personally hit the failure mode of an entity that's deleted in one surface but still
looks active in another (`qa/KNOWN_FAILURE_MODES.md` #19's original incident) — this
graph-walk is the actual prevention, not a formality.

## 4. Stable IDs, never mutable names, for any cross-reference

Every relationship in this codebase resolves by real UUID, never by matching a display
name — names collide, get renamed, get typo'd by the AI. If you're designing something
that references another entity "by name" anywhere in a data path (not just UI display),
that's a design defect, not a shortcut.

## 5. New capability needs a `governance/capabilities/CAPABILITY_MATRIX.yaml` row

If the new resource introduces a genuinely new authorization concept (not just "reuses
the standard three-tier pattern"), add a row following the exact existing YAML shape
(`enforced/mechanism/grants/live_verified`) — don't leave a new capability
undocumented the way `production.deploy` was found to be (a real, honestly-flagged gap
this factory's own security model is closing).
