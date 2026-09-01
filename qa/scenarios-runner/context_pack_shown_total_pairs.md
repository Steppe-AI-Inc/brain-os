# PERMANENT REGRESSION — BUG-007

**Every collection in the chat context pack must ship BOTH `…Shown` and `…Total`.**

State: **EXPECTED_FAIL** until the five missing `Shown` fields exist. Linked: `qa/bugs/BUG-007.md`.

## Static assertion (source)

In `supabase/functions/sem-ai-command/index.ts`, every array placed in the context pack must
have a matching pair. Current state (~lines 2037-2047):

| Entity | Shown | Total |
|---|---|---|
| tasks | ✅ | ✅ |
| approvals | ✅ | ✅ |
| salesLeads | ✅ | ✅ |
| channels | ✅ | ✅ |
| departments | ✅ | ✅ |
| documents | ✅ | ✅ |
| **companies** | ❌ | ✅ |
| **people** | ❌ | ✅ |
| **projects** | ❌ | ✅ |
| **goals** | ❌ | ✅ |
| **inventory** | ❌ | ✅ |

`all_pass` = zero entities in the ❌ column.

Why it matters: the system prompt's truncation rule (~line 594) is written as a comparison
*between the pair* — "if `tasksShown` < `tasksTotal`…". With no `Shown`, the rule has nothing
to compare and cannot fire for that entity.

## Live assertion (browser)

Ask, in a fresh channel:

> `How many companies are there in total, and how many are archived? Be precise.`

**Assert:** the reply matches the real DB totals, **or** explicitly says "N of M shown".
It must not report the window size (12) as the total.

Repeat for people, projects, goals, inventory.

## Recorded baseline — deployed `sem-ai-command v92`, 2026-09-01

| | Brain said | DB truth |
|---|---|---|
| companies | **12** (9 active, 3 archived) | **20** (10 active, 10 archived) |
| archived named | test5, test8, test9 | + test7, test unit, test, test3, QA-C002-RENAMED-X, QA-VERIFY-BU, QA-LIFECYCLE-BU |
| tasks *(control)* | "27 active tasks total (15 shown here)" | ✅ correct |
| people | "16 people total" | ✅ 16 — but see note |

**Note on people:** correct only because the real total (16) is under its `.limit(30)` window.
The defect is **latent** there, not absent — it will surface once people exceed 30. A future
green result for people is therefore not evidence the class is fixed.

## Guard against a vacuous pass

If every entity's real count happens to sit below its window, the live half passes without
proving anything. Treat that as **INCONCLUSIVE** and rely on the static assertion, which is
always decisive.
