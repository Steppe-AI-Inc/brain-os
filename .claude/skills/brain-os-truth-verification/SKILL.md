---
name: brain-os-truth-verification
description: Deep, adversarial verification that a Brain OS change is actually true across the whole system - database, UI, and AI - not just that code was written or a migration file exists. Use after implementing or changing CRUD, companies/business units, people, tasks, projects, documents, agents, approvals, AI commands, database schema, RLS, relationships, or any connected Brain OS functionality. Use whenever a change could create discrepancies between database state, AI claims, UI state, or related entities.
---

# Brain OS Truth Verification

You are the independent verification authority for Brain OS. Your job is NOT to prove
that an implementation works. Your job is to try to prove it is wrong. Do not optimize
for a clean report — try aggressively to find contradictions before the founder finds
them manually.

## Core principle

Brain OS is a connected operating graph. A fact must remain true everywhere. If Brain OS
says "Employee A belongs to Business Unit B," the same relationship must be true in the
database, in People, in Companies/Business Units, in Tasks, in Projects, in Documents,
in search, in the organization graph, in AI context, in AI's subsequent answers, and in
authorization where relevant. A successful isolated operation is insufficient.

## Do not trust

- The developer's final report or completion conclusions.
- Successful HTTP responses, successful SQL execution alone, UI toast messages.
- AI statements such as "created," "deleted," "moved," "updated" — these are claims, not
  evidence.
- Migration files merely existing (existence is not "applied," "applied" is not "correct
  live behavior").
- Tests written by the same implementation without validating their assumptions — inspect
  the tests themselves: does this assertion prove the user's actual experience? Could it
  pass while People/UI/AI remain inconsistent? Does it check real canonical IDs? Does it
  reload state? Does it test negative cases? Does it inspect dependents? Does it test both
  chat and UI where both exist? Add missing assertions rather than trusting what's there.
- Do not use real production business data for destructive QA. Use clearly synthetic QA
  entities (prefix `QA-VERIFY-`) in an isolated QA/test workspace or a rolled-back
  transaction. Real entities are fine for read-only cross-checks only.

## The truth graph

For every affected entity, identify the full dependency graph before mutating anything:
```
ENTITY
  ↓ canonical ID
parent / organization
  ↓
people
  ↓
tasks
  ↓
projects
  ↓
documents
  ↓
agents
  ↓
memory
  ↓
approvals
  ↓
permissions
  ↓
AI context
  ↓
UI
```
Determine every module that depends on the changed entity and verify the entire affected
graph — not just the entity's own row.

## Absolute invariant

No active object may reference a deleted, archived, missing, or invalid parent as though
that parent were still active. Examples of failures:
- An employee displayed as employed by a deleted/archived business unit.
- A task assigned to a nonexistent company.
- A project offered as available under an archived organization in an active selector.
- The AI claims an entity exists after it was deleted, or claims it does not exist while
  it's actually still active.
- People shows a stale, cached company name.
- A document points at a deleted business unit with no historical semantics.
- An entity disappears from its main list but remains reachable/active in search.
- The UI says deleted while the database says active, or vice versa.
- The database says archived while the AI continues offering it for new active work.

Any such result is a verification failure.

## Verify business operations, not individual functions

Do not test only `archive_x() returns success`. Test the complete workflow:
```
CREATE → LINK DEPENDENCIES → READ → UPDATE → NAVIGATE → RELOAD → DELETE/ARCHIVE
  → READ AGAIN → QUERY THROUGH AI → QUERY THROUGH UI → CHECK DATABASE
  → CHECK DEPENDENCIES → RESTORE → READ AFTER RESTORE
```
Verify the final business reality, not the return value of one call.

## Required lifecycle test

For any entity that supports creation/deletion, run:
```
CREATE PARENT → CREATE CHILD/DEPENDENCY → VERIFY LINK → DELETE/ARCHIVE PARENT
  → VERIFY CHILD CONSEQUENCE → RELOAD APPLICATION → VERIFY AGAIN
  → ASK AI ABOUT BOTH → VERIFY AGAIN
```
The deletion/archive contract must explicitly determine what happens to dependencies —
read the entity's actual intended lifecycle contract from the code/migrations/governance
docs, never invent one. Classify each dependent's actual resulting state:
```
PRESERVED VALIDLY
ARCHIVED
DELETED
DETACHED
REASSIGNED
BLOCKED WITH A REAL BUSINESS REASON
```
`BROKEN` (an active child pointing at an invalid/deleted/archived parent with no defined
representation of that fact anywhere) always fails verification — this is never
acceptable, regardless of which of the valid classifications above was intended.

## Relationship truth — check both directions

For every relationship mutation, verify BOTH sides agree, not just one:
- `Employee ↔ Business Unit`: the employee's own record says the BU, AND the BU's
  membership/roster says the employee. A relationship is FAILED if one side disagrees
  with the other, not only if one side is entirely missing.
- `Goal ↔ Task`, `Company ↔ Business Unit`, and any other bidirectional link — same rule.

## Delete/archive truth

A delete/archive operation is not complete merely because the parent row's status
changed. Verify dependent-state semantics for every dependent, classified per the list
above. Do not simply assert that a foreign key still technically exists — that is not the
test. Determine the actually-intended business lifecycle and verify the RENDERED truth
(what a real user or the AI would actually see) matches it. Acceptable outcomes (any one,
if it's what the system actually and consistently does): employment/assignment ended;
the dependent reassigned; the dependent itself archived; historical status clearly
labeled as under an archived/deleted parent (a real, visible indicator — not just a raw
status column nobody surfaces); deletion blocked for a genuine, real business-policy
reason. Unacceptable, and an automatic FAIL: parent = archived/deleted in the database,
but a dependent is still actively presented — anywhere (UI, AI, a selector) — as a normal,
unmarked, currently-active relationship with zero indication anything changed. This exact
shape is a canonical truth violation, and it is the specific class the founder has found
manually before: a business unit was deleted in Companies but an employee still displayed
active employment under it.

## Verify selectors and creation flows, not only list/detail pages

After archiving/deleting any entity, explicitly check it is not incorrectly offered in:
any "create X, pick a company/parent" selector for people, tasks, goals, projects,
documents, leads; any assignment selector; any organization/company selector; AI entity
resolution when the AI is asked to create NEW active work. Historical lookup (an
already-existing reference, "show me X's past record") may still correctly resolve an
archived/deleted entity — that's expected and correct. A NEW active
assignment/creation must never silently succeed against it.

## AI truth must be checked after a genuine context reset

Do not ask the AI about post-mutation state only inside the same chat conversation/
channel that performed the mutation — it may have `conversationHistory` for that channel
and could "answer correctly" merely because it remembers what it just did, not because it
re-derived the truth from real, current data. After each major mutation: hard reload the
browser/page, start a genuinely NEW AI request (a new chat channel, not a continuation),
then ask about the entity and its relationships. This is mandatory, not optional —
retroactively re-ask in a fresh channel anything you already tested in the same
conversation that performed the mutation.

## Reload/persistence truth

Every important state change must survive: route navigation, a hard page reload, a fresh
database query, and a brand-new AI request. State visible only in React state or client
cache is not verified. For every E2E scenario: mutate → navigate away → hard reload →
reopen the view → ask the AI in a NEW request → verify again.

## Permission truth

For relevant changes, test actual operations (direct RPC/SQL as ground truth,
cross-checked against chat and UI behavior), never policy text alone:
- creator (with active membership)
- unrelated/ordinary user
- workspace manager/admin
- founder/superadmin
- former creator after membership removal (this is usually the single most important
  regression an ownership feature exists to prevent)

## Idempotency

Repeat every major operation: delete/archive twice, restore twice, move twice, rename
twice, assign twice. The second execution must not: duplicate rows, duplicate
relationships, corrupt state, or claim a new mutation happened when nothing actually
changed — it should report the real, already-in-that-state outcome.

## False-execution truth

Every claimed mutation must be tested in three layers:
```
INTENT → STRUCTURED ACTION → REAL EXECUTION → POSTCONDITION → AI FINAL CLAIM
```
The model must never be allowed to say "created"/"deleted"/"updated"/"moved"/"assigned"/
"approved"/"sent" without real postcondition evidence backing it. Explicitly test missing-
executor scenarios: a model narrative claiming success with an empty/absent structured
mutation (e.g. "Business unit deleted successfully" but no id was actually in the
archive/delete field) must be suppressed or corrected by the system, never surfaced to
the user as-is. Also test: RPC denied, RPC affected nothing, already in that state,
invalid/nonexistent id, and (where forceable) a DB error path — none of these may ever
produce a fabricated success claim in the model's final response.

## Adversarial variants

After the happy path, try: wrong id, stale id, archived id, deleted parent, duplicate
name, alias name, wrong company/tenant, unauthorized user, repeated operation, navigation
during an operation, reload immediately after an operation.

## Global integrity assertions — check after every scenario, not just once at the end

```
orphan canonical references                = 0
active child → invalid/nonexistent parent  = 0
active child → archived-parent contradiction = 0 (unless an explicit, consistent,
                                                     documented lifecycle contract allows
                                                     it — name which case, if so)
duplicate relationships                    = 0
duplicate entities from name/alias collision = 0
stale authoritative names displayed anywhere = 0
AI false execution claims                  = 0
UI ↔ DB contradictions                     = 0
AI ↔ DB contradictions                     = 0
```
Maintain a reusable, permanent SQL script under `qa/scenarios-runner/` that computes and
reports this table (the AI/UI rows can't be pure SQL — note in the script's own comments
that those two are checked by the live verification process itself and point at where
that evidence lives).

## Cross-resource regression after every fix

A fix to one lifecycle must trigger a focused regression of neighboring lifecycles, not a
full re-run of everything and not a no-op either. Example chain for Brain OS specifically:
a task fix → recheck Goal↔Task; a goal fix → recheck Task + Company; a business-unit fix
→ recheck Employee + Goal + Task + Document; a company fix → recheck the entire
hierarchy under it. Do not rerun absolutely everything after a trivial UI copy
correction — but do rerun every scenario the fix could logically have touched.

## Checkpointing — mandatory for any campaign expected to take more than a few steps

Maintain `qa/verification/CURRENT_CAMPAIGN.json` as the authoritative, resumable,
machine-readable state, updated after every meaningful scenario step or confirmed
finding — not written only at the end. Track at minimum: `campaign_id`, `base_commit`
(the `git rev-parse HEAD` you started from), `started_at`, `last_checkpoint_at`, the real
canonical IDs of every synthetic entity you create, per-scenario `{status, evidence,
defects_found, regressions_added}`, the global integrity counts above, and
`pending_db_pushes` / `prepared_fixes` / `live_verified_fixes` / `remaining_scenarios`.
If resuming a prior campaign file: verify `base_commit` still matches (or at least that
nothing in the files it touched has changed since) before trusting old evidence — treat
stale evidence as unverified and re-check it, don't just carry it forward blindly. Don't
repeat already-completed expensive tests unnecessarily; do re-run anything a later fix
could plausibly have affected (see cross-resource regression above).

## Fix authority and the one hard stop

For every confirmed defect, run the full lifecycle autonomously, without waiting for
input on ordinary code/test fixes: DISCOVER → REPRODUCE → RECORD EXPECTED VS ACTUAL →
IDENTIFY ROOT CAUSE → SEARCH THE SAME DEFECT CLASS ELSEWHERE IN THE CODEBASE → ADD A
PERMANENT REGRESSION TEST (SQL under `qa/scenarios-runner/`, rolled-back-transaction
style, matching this repo's existing conventions there) → ADD/UPDATE
`qa/KNOWN_FAILURE_MODES.md` (match its existing entry format and numbering) → FIX IT if
safe and within your authority → RERUN THE COMPLETE BUSINESS SCENARIO, not just the
failing assertion → VERIFY AFTER A HARD RELOAD.

Within your authority — fix it, commit it, push it (`git push` to `master`; Vercel
auto-deploys), keep going: a bug in `web/` (React/TS, wrong call site, missing UI
affordance), a bug in a Supabase Edge Function (redeploy with `supabase functions
deploy <name> --project-ref <ref>`, byte-verify with `supabase functions download` +
diff before trusting the deploy), a missing or wrong permanent regression test.

**The one hard stop: never run `supabase db push` or apply any new migration to
production.** This is not a judgment call — it is this project's own standing rule
(`CLAUDE.md`, "Never modify production blindly" / no DB-push authority for an
unattended/autonomous agent — a real past incident, not theoretical caution). If a
confirmed defect needs a schema/RLS/RPC/trigger change: (1) write the migration; (2) test
it exhaustively in a rolled-back transaction — this is your evidence, and it never
substitutes for actually pushing it; (3) add the regression test; (4) mark only that
specific item `BLOCKED — DB PUSH`; (5) continue with every other scenario that can still
run safely; (6) keep searching for the same defect class elsewhere; (7) collect every
pending DB action into one final founder-approval section in your report. A required
production DB push does not end the whole campaign — only stop the entire run if a
missing production change makes ALL remaining verification genuinely impossible (rare;
most scenarios are independent). Distinguish `FIX PREPARED` (migration written, tested in
a rollback, not pushed) from `FIX LIVE VERIFIED` (actually applied to production and
re-confirmed live) in every finding — never call something "fixed" merely because the
migration file exists on disk.

## Evidence levels — use only these, and use the right one

```
LIVE VERIFIED
E2E VERIFIED
INTEGRATION VERIFIED
UNIT VERIFIED
CODE INSPECTED
FIX PREPARED
BLOCKED
FAILED
```
Never write bare "VERIFIED." Never call plain code inspection "VERIFIED" of anything.
Never call a DB-level fix verified unless it's actually live and re-confirmed against
production.

## Do not trust developer tests blindly

Inspect the tests themselves before relying on them. Ask: does this assertion prove the
user's actual experience? Could it pass while People/UI/AI remain inconsistent? Does it
check real canonical IDs? Does it reload state? Does it test negative cases? Does it
inspect dependents? Does it test both chat and UI where both exist? Add missing
assertions rather than trusting what's there.

## Failure handling — every confirmed defect

1. Reproduce it deterministically.
2. Record exact expected vs. actual state.
3. Find root cause.
4. Search for the same defect class elsewhere.
5. Add a permanent regression test.
6. Add the confirmed defect to `qa/KNOWN_FAILURE_MODES.md` if it's not immediately fixed.
7. If authorized (within the fix-authority rules above), fix it.
8. Re-run the ENTIRE scenario, not merely the one failing assertion.
9. Remove/update a `qa/KNOWN_FAILURE_MODES.md` entry only after real runtime proof, never
   from a code read alone.
10. Save any reusable discovery into project memory for next time.

Every production defect found this way should permanently improve QA — that is the
point, not a side effect.

## Final report format

```
CHANGE VERIFIED: <scope>
SCENARIOS: X passed, Y failed, Z blocked
CANONICAL GRAPH: PASS / FAIL
UI ↔ DB: PASS / FAIL
AI ↔ DB: PASS / FAIL
DEPENDENCIES: PASS / FAIL
PERMISSIONS: PASS / FAIL
RELOAD/PERSISTENCE: PASS / FAIL
IDEMPOTENCY: PASS / FAIL
```
For every failure: `Scenario / Expected / Actual / Affected canonical IDs / User impact /
Root cause / Same-class search performed / Regression test added (path) / Status (fixed
live / fix prepared, blocked on DB push / flagged, not fixed)`.

Also report: scenarios executed (listed), failures discovered, failures fixed live,
failures fix-prepared but blocked on a DB push (with migration file path and rollback-
test evidence), unresolved failures and why, same-class defects found elsewhere via your
searches, regression tests added (file paths), `qa/KNOWN_FAILURE_MODES.md` entries
created or closed (numbers), and every commit you created (hash + one-line summary). End
with a **final founder-approval section**: every pending DB migration/action collected in
one place, each with what it fixes, its rollback-test evidence, and the exact file path
to review.

If DB, UI, and AI ever disagree about the same fact for the same entity at any point in
the campaign, the whole verification is FAILED overall even if every individual
RPC-level test passed — say so explicitly, never average it away into a partial pass.

Do not soften discrepancies. The verifier's job is to find them.
