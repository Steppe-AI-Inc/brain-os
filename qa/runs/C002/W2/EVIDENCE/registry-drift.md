# C002 / W2 — FIXTURE_REGISTRY.json drift audit (read-only)

Scenario: C002-P2-fixture-registry-drift  Capability: CAP-FIXTURE-REGISTRY-INTEGRITY
Method: static repository audit only. No browser, no DB, no production, no mutation.
Script: `EVIDENCE/audit_registry.py` (raw output: `EVIDENCE/audit_output.txt`, per-fixture counts: `EVIDENCE/forward_refs.json`, context snippets: `EVIDENCE/context_snippets.txt`).
Scope scanned: 186 text files under `qa/**` (registry itself and this worker's run dir excluded).
Registry snapshot: 24 fixtures; `last_updated` = 2026-09-02T09:19:16Z.

This file is EVIDENCE. Status decisions belong to the Orchestrator.

## 1. ACTIVE fixtures referenced nowhere outside the registry

None are referenced by literally nothing, but two are referenced ONLY by the bug queue and by no capability, ledger, scenario, or plan:

| fixture_id | name | inventory refs | bug queue refs | other |
|---|---|---|---|---|
| FX-CFWO-ADV-CO-A | CFWO-Adv Co A (emp1=manager) | 0 | 1 | 0 |
| FX-CFWO-ADV-CO-B | CFWO-Adv Co B (emp1 NOT a member) | 0 | 3 | 0 |
| FX-C002-ORGB-ANCHOR-PROJ | QA-ORGB-ANCHOR-PROJ | 0 | 3 | 0 |
| FX-C002-DEPT-FABTEST-06 | QA-C002-DEPT-FABTEST-06 | 0 | 36 | 2 |

Fixture IDs themselves (the `FX-*` / `C001-*` / `LEGACY-*` keys) are almost never used by other artifacts. 14 of 24 fixture_ids appear in zero other files; other artifacts reference fixtures by display name or canonical UUID instead. The registry key is therefore not the join key in practice.

## 2. Fixtures referenced by a bug or capability but ABSENT from the registry

Named synthetic entities that appear in `BUG_QUEUE.json` and/or `CAPABILITY_INVENTORY.json` with no registry row (counts are occurrences, BQ = bug queue, INV = inventory):

- Departments: QA-C002-DEPT-DELTEST-05 (BQ 7), QA-C002-DEPT-C0-OK (BQ 6), QA-C002-DEPT-C2-A (BQ 3), QA-C002-DEPT-F-RELOAD (BQ 3), QA-C002-DEPT-G-CHANNEL-A (BQ 2), QA-C002-DEPT-H-ORG (BQ 2), QA-C002-DEPT-FABTEST-07 / -99 (BQ 1 each), QA-C002-DEPT-01 (INV 2, pre-rename name of FX-C002-DEPT-01), QA-SWARM-DEPT-ARCHIVED-PARENT-TEST (INV 4, BQ 5), QA-SWARM-TEST-DEPT (INV 1, pre-rename name of the legacy dept).
- Projects: QA-C002-PROJ-FABTEST-04 (BQ 8), QA-C002-PROJ-MITTEST-02 (BQ 5), QA-C002-PROJ-CHATRENAME-01 (BQ 5, INV 1), QA-C002-PROJ-FABTEST-07/08/09, QA-C002-PROJ-MITTEST-01/03, QA-C002-PROJ-CHATRENAME-02, QA-C002-PROJ-CREATE-01 (INV 2, BQ 1), QA-RENAMED-PROJECT (INV 1).
- Companies: QA-MULTI-CO-V2 (INV 5, BQ 4), QA-C002-RENAMED-Y (BQ 1), QA-SWARM-TEST-CO / QA-SWARM-TEST-CO-RENAMED (INV 1 each, pre-rename names of the legacy company).
- People / business units / other: QA-VERIFY-BU (INV 9, BQ 10), QA-VERIFY-EMPLOYEE, QA-VERIFY-TASK, QA-VERIFY-GOAL, QA-LIFECYCLE-BU, QA-LIFECYCLE-EMPLOYEE, QA-LIFECYCLE-EMPLOYEE2, QA-MULTI-EMPLOYEE, QA-C002-BU-01, QA-C002-EMP-002, QA-C002-CLASSB-TARGET (BQ 4, INV 1), QA-C002-VAR-THATONE (BQ 2), QA-G1B-EMP, QA-G2-EMP, CFWO-Adv Goal A (BQ 1).
- Deliberate non-entities (chat negative probes, not drift): QA-MULTI-CO-TWIN-DOES-NOT-EXIST, QA-MULTI-CO-TWIM, QA-MULTI-CO-TWINS, QA-SWARM-PERSON-001-EDITE. Tokens QA-C002, QA-MULTI, QA-C002-VAR, QA-SWARM, QA-C002-BU, QA-COMMAND-CENTER-* and QA-PLATFORM-* are prefixes or capability labels, not fixtures.

UUIDs: 27 UUIDs in the inventory and 68 in the bug queue are not registry canonical ids. Most are chat channel ids, task ids or run ids rather than fixtures. Not individually classified within this run's budget; the full list is in `audit_output.txt`.

Several of the unregistered department and project names sit in bug-queue blocks that describe them as disposable throwaway fixtures (for example the permanent-delete matrix block that created a disposable department so as not to spend QA-SWARM-TEST-DEPT-EDITED). The registry `_doc` says CREATE is the only op permitted on an unregistered fixture; those throwaways were subsequently mutated or deleted by their own account, so their absence from the registry is a gate bypass on paper, regardless of whether the entities were synthetic.

## 3. Fixtures with canonical_id null

15 of 24. Two are DELETED and arguably need no id. The other 13 are recorded ACTIVE and therefore, by the registry's own safety-gate rule, are NOT actually mutation-authorized:

FX-BUG006-GOAL, FX-BUG006-PROJECT, FX-C002-PROJ-01, FX-C002-PERSON-03, FX-C002-MULTI-TASK, FX-C002-BU-EMPLOYEE-01, FX-C002-APPROVAL-TASK-01, FX-C002-PENDING-01, FX-C002-VAR-SURE, FX-C002-VAR-YEAH, FX-CFWO-ADV-CO-A, FX-CFWO-ADV-CO-B, FX-C002-ORGB-ANCHOR-PROJ, FX-C002-DEPT-FABTEST-06 (DELETED with null id: FX-C002-MULTI-PROJ, FX-C002-DEPT-01).

FX-C002-PROJ-01 (QA-C002-PROJ-EDITED-01) is the most exposed: it has 29 bug-queue references and 5 inventory references, has been edited and used as the BUG-010 repro target, yet has no canonical id in the registry.

## 4. Duplicate or contradictory entries

- No duplicate fixture_id, canonical_id, or name.
- Two schema generations coexist. The 4 legacy/C001 rows use `lifecycle` + `synthetic_display_name` + `owner_worker_id` + `authorized_worker_ids` + `scenario_id`. The 20 C002 rows use `state` + `name` (and mirror `lifecycle`) and have NO `owner_worker_id`, NO `authorized_worker_ids`, and NO `scenario_id`. The access-scope gate (`SHARED_CAMPAIGN = any authorized worker`) is therefore undecidable for every C002 fixture from the registry alone.
- FX-BUG006-GOAL and FX-BUG006-PROJECT have `state: ACTIVE` but no `lifecycle` key at all.
- FX-C002-MULTI-PROJ and FX-C002-DEPT-01 carry `lifecycle: DELETED`, which is not in the declared `lifecycle_states` enum (PLANNED, CREATED, REGISTERED, ACTIVE, CLEANED, RETAINED). The enum's own term for this is CLEANED.
- Registry `last_updated` is 2026-09-02T09:19:16Z, yet 20 rows carry `registered_at` of 2026-09-07 or later and several carry notes dated 2026-09-09. The header timestamp is stale.
- FX-C002-PROJ-01 `cleanup` says RETAINED while BUG-010 needs it, but `retained_for_regression` is not set on the row (the legacy schema field); the two conventions disagree about how retention is recorded.

## 5. Name disagreements between the registry and other artifacts

Registry name vs. how other artifacts refer to the same entity:

- LEGACY-C000-company-qa-swarm-test-co: registry says QA-SWARM-TEST-CO-VIA-CHAT. Inventory also carries the pre-rename names QA-SWARM-TEST-CO and QA-SWARM-TEST-CO-RENAMED as history. Consistent; no live disagreement.
- FX-C002-DEPT-01: registry says QA-C002-DEPT-01-RENAMED (DELETED). Inventory refers to it 5 times by that name and 2 times as QA-C002-DEPT-01. Consistent as rename history.
- C001-W2-person-001: registry says QA-SWARM-PERSON-001-EDITED. Inventory once uses QA-SWARM-PERSON-001. Consistent as history.
- QA-MULTI-CO vs QA-MULTI-CO-V2: the registry has no V2 row; the inventory (5) and bug queue (4) refer to a V2. Could not determine from the repository whether V2 is a distinct entity or a later name for FX-C002-COMPANY-MULTI (49ee1875). Flag for the Orchestrator.

### The specific check requested: LEGACY-C000-department-qa-swarm-test-dept / QA-SWARM-TEST-DEPT-EDITED

Repository evidence only:

- Registry: ACTIVE, canonical 9573a957-eebd-4552-b28a-b8ed2a9de37a, name QA-SWARM-TEST-DEPT-EDITED, parent LEGACY-C000-company-qa-swarm-test-co.
- CAPABILITY_INVENTORY.json (2 refs): CAP department edit evidence dated 2026-08-31 records the rename QA-SWARM-TEST-DEPT -> QA-SWARM-TEST-DEPT-EDITED. A second, later capability's evidence quotes a fresh chat channel being asked to "Delete the department QA-SWARM-TEST-DEPT-EDITED" and Brain Chat replying that it does not see a department by that name and that the only department shown is QA-SWARM-DEPT-ARCHIVED-PARENT-TEST.
- BUG_QUEUE.json (1 ref): the permanent-delete matrix block dated 2026-09-09 describes it as "the registered shared fixture QA-SWARM-TEST-DEPT-EDITED" and explicitly chose NOT to spend it, creating a disposable department instead.
- bugs/BUG-001.md (3 refs): lists it by that name and canonical id as a registered fixture and shows it rendering as an active row under QA-SWARM-TEST-CO-VIA-CHAT.
- runner/plans/C002-parallel-pilot.json (1 ref): the current campaign plan refers to it by that name.
- No artifact records a further rename, archive, or deletion of this department.

Conclusion from repository evidence: yes, other artifacts still refer to it as QA-SWARM-TEST-DEPT-EDITED, and the most recent one (2026-09-09 bug-queue block) treats it as live and deliberately preserved. The only dissonant signal is the chat transcript in the inventory where Brain Chat could not see it. That transcript is chat-context evidence, not DB truth, and the same capability family has open fabrication/resolution bugs (BUG-010, BUG-029), so it does not establish that the entity is gone. The parent company was archived and restored on 2026-09-07 (BUG-014); no artifact says the department was re-verified after that restore. DB truth was not checked in this run.

## Summary counts

| check | count |
|---|---|
| fixtures in registry | 24 |
| ACTIVE with canonical_id null | 13 |
| DELETED (non-enum lifecycle) | 2 |
| rows missing owner/authorized/scenario | 20 |
| ACTIVE referenced only by the bug queue | 4 |
| distinct unregistered named synthetics in INV or BQ (excluding probes/prefixes) | ~45 |
| duplicates | 0 |
