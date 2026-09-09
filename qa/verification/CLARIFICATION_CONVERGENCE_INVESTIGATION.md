# P1 CONVERGENCE INVESTIGATION — the clarification / pending-action failure family

Founder directive 2026-09-09. Work-PC evidence read at `qa/work-pc` @ `4205716`.
First job as stated: **confirm or falsify the shared-code-path hypothesis** — do not assume four unrelated
prompt defects, and do not assume one branch either.

## VERDICT: the hypothesis SPLITS. Two share one mechanism; two were separate branches and are already fixed.

| | finding | verdict |
|---|---|---|
| **BUG-010** | fabricated presence — clarification later treats a nonexistent entity as real | **SHARED ROOT CAUSE** with BUG-029 |
| **BUG-029** | fabricated absence — assign/clarification claims a real entity does not exist | **SHARED ROOT CAUSE** with BUG-010 |
| **BUG-002 D3** | a pendingAction bypasses current-turn truth guarding | **SEPARATE BRANCH — ALREADY FIXED** on this candidate |
| **Issue #5 Class B** | a clarification with no representable actionType coerced to a destructive default | **SEPARATE BRANCH — ALREADY FIXED** on this candidate |

Reporting this as "one shared branch" would have been wrong, and reporting it as "four unrelated prompt
defects" would also have been wrong. Both halves matter, and neither was assumed.

### BUG-002 D3 — already closed, verified in source

The D3 short-circuit is the literal `&& !result.pendingAction` on the past-completion gate. It is **not
present**: `claimsPastCompletionWithNoGrounding = rewriteFromStructure || legacyProseFallback`, with no
pendingAction term. The one surviving `!result.pendingAction` is on the **future-promise** gate and is
deliberate and documented — *a future promise WITH a pending question is honest* ("I'll archive it, shall
I?" is not a fabricated completion). Removing that one would create false positives, not close a defect.

### Issue #5 Class B — already closed, verified in source

`resolveClarificationField(entityType, actionType)` returns `undefined` unless BOTH are present AND the
pair is an own-property of the field map, so an absent `actionType` falls through to the ordinary LLM path
instead of selecting a default. The historical defect — `[pendingAction.actionType || 'archive']`, which
turned an assign clarification into an **archived company** — cannot recur through this function.

## THE SHARED ROOT CAUSE (BUG-010 + BUG-029)

**Canonical name resolution is keyed to the CURRENT turn's command text, and a clarification turn does not
contain the name of the entity it is about.**

`commandNameTokens` is extracted from `command` alone, and gates every canonical named lookup
(`namedCompanyLookup`, `namedPersonLookup`, `namedTaskLookup`, `namedGoalLookup`, `namedProjectLookup`,
`namedDepartmentLookup`). Those lookups are what populate `context.namedTargets` — the only part of the
pack that is a **direct, status-blind, server-side read of the named row**, as opposed to a bounded window.

The entity a clarification turn is about lives in `pendingAction` (its `question`, `summary`,
`candidateIds`, `options`) and in the previous turn. **Neither feeds the resolver.**

### Measured, using the candidate's own extractor (`clarification_resolution_probe.mjs`)

    "yes"                              []                                  no lookup at all
    "that one"                         []                                  no lookup at all
    "Yes, that one."                   ["one."]                            a lookup runs, for nothing
    "What is that project called now?" ["project","called"]                a lookup runs, for generic words
    "What is QA-C002-PROJ-EDITED-01
      called now?"                     ["qa-c002-proj-edited-01","called"] THE ENTITY
    "Does the company
      QA-C002-RENAMED-X exist?"        ["qa-c002-renamed-x","exist"]       THE ENTITY

**6 of 7 clarification/ambiguous turns run no lookup for the entity they are about.** The first form of this
hypothesis — "no lookup runs" — was too crude and is corrected here: sometimes a lookup runs, for the wrong
thing, which is worse because it returns rows and therefore looks like grounding.

### Why this explains both bugs, and predicts the evidence rather than restating it

* **BUG-029 (fabricated absence).** The direct question resolves the entity because it carries the name;
  the assign/clarification turn does not, so `namedTargets` is empty and the only evidence available is a
  bounded window the entity may not be in. Absence from that window is then reported as absence from the
  database. Work-PC's own controls already proved truncation was NOT the cause — row 14 answered correctly
  while row 13 was denied, and the denied entity resolved when asked directly. That is exactly what this
  mechanism predicts and what a truncation theory cannot explain.
* **BUG-010 (fabricated presence).** Nothing canonical is fetched for the entity, so the only account of it
  is the channel's own prior claims. The invented rename survives because nothing contradicts it.
* **The branch-selectivity BUG-010 measured** — ambiguous form contaminated 2 of 3, unambiguous 0 of 2 —
  is a *consequence* of this mechanism, not a coincidence: the unambiguous form carries the name, which is
  the only thing that makes the resolver look at the right row.

### It is one mechanism, not one branch

The two bugs share a **missing primitive**, not a shared `if`. There is no code path where a clarification
decides existence; there is instead no canonical resolution result that clarification prose is required to
be grounded in. That distinction matters for the fix: adding a guard to a branch would close neither bug,
because the defect is what the model was *not given*, on a turn where it was asked to assert existence.

## THE FIX, structurally

Feed the SAME canonical resolution primitive from the pending action and the referenced turn, not only from
the current command — "clarification and direct execution consume the same resolver; do not create a
second one".

The resolver's input becomes the union of:
1. the current command's name tokens (unchanged), and
2. the entity references carried by `pendingAction` — `candidateIds` and `options[].id` are canonical ids
   and resolve exactly, and the names inside `question`/`summary` resolve the same way a direct command's
   name does.

`CONTEXT ABSENCE != ENTITY NON-EXISTENCE` then has something to be true about: on a clarification turn the
named row is present in `namedTargets` exactly as it would be on the direct turn, so a denial has to
contradict a canonical row rather than an empty window.

## SWEEP SCOPE

The resolver is entity-type-generic (companies, people, tasks, goals, projects, departments), so the fix
and its regressions must cover every one of those, not the two resource types the two bugs happened to
manifest on.

## WORK-PC OWNERSHIP

Home PC publishes fix reports only. **BUG-010, BUG-029, BUG-002 and Issue #5 are NOT marked CLOSED here.**
Work PC independently retests and closes or reopens. Issue #5 Class B and BUG-002 D3 are reported as
*already fixed on this candidate with the source evidence above* — that is a claim for Work PC to verify,
not a closure.
