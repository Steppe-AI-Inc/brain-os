---
name: demo-fixture-reset
description: The deterministic, idempotent synthetic demo dataset and reset operation for commercial demos. Use to set up or refresh a clean demo environment - never use real confidential business data for a demo, and never leave demo runs cluttering production with duplicates.
---

# Demo Fixture Reset

## The fixture shape

```
Demo Holding
├── Demo Mongolia
│   ├── Sales
│   └── Operations
└── Demo Kazakhstan
```
Each populated with: people (CEO, Country Manager, Salesperson, Technician,
Bookkeeper), goals, tasks, projects, documents, customers, sales leads, approvals — a
believable but entirely synthetic small operating company, matching the real breadth of
what Brain OS actually manages, not a token one-row-per-table stub.

## Absolute rule

**Never use real confidential business data for this.** No real customer names, no real
revenue figures, no real employee PII repurposed as demo content — entirely synthetic,
even where a real founder-visible number would make the demo more impressive. This
mirrors the exact same rule `brain-os-verifier` follows for its own destructive testing
(`QA-VERIFY-*` prefixed synthetic entities only).

## The operation itself

A real, reusable operation (not a one-off manual script) — implement as a
`/demo-fixture-reset` action once the factory can support it, or as a standalone
rolled-forward (not rolled-back — this data is meant to persist for demo use) SQL/RPC
script in the interim:
1. Remove any previous synthetic fixture data from a prior reset run (identify it by a
   consistent naming prefix or a dedicated `is_seed_data`-style marker — `companies`
   already has an `is_seed_data` column, reuse it rather than inventing a new marker).
2. Create the deterministic demo entities fresh, with stable, predictable
   names/relationships (so a demo script can reference "Demo Mongolia" reliably run to
   run).
3. Create the relationships (organization hierarchy, employment assignments, goal/task
   ownership).
4. Run the global integrity assertions from `brain-os-truth-verification` against the
   freshly created data — a demo fixture with a real orphan reference or contradiction
   in it would undermine the exact thing the demo is supposed to prove.
5. Return the real IDs/status of what was created, not a bare "done."

## Idempotency is the actual test that matters here

Running the reset operation twice in a row must produce **identical, non-duplicated**
state — not two Demo Mongolias, not doubled task counts. This is the single most
important thing to verify before trusting this operation ahead of a real demo, since a
demo that silently accumulates duplicate data across rehearsals is worse than no fixture
automation at all.
