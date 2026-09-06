# HANDOFF — Brain OS Edge campaign (sem-ai-command v92 differential) + DB batch A/B/D

Written 2026-09-06 by the implementing session, for a fresh session after context compaction.
**Canonical truth is git + these artifacts, never this prose.** If they disagree, believe the artifacts.

---

## 1. WHERE TO LOOK FIRST (in this order)

| What | Where |
|---|---|
| Current campaign, verifier number, exact SHA, all gate numbers | `qa/verification/CURRENT_CAMPAIGN.json` |
| Every defect class, every fix, every retraction, entries #90–#107 | `qa/KNOWN_FAILURE_MODES.md` (read #102, #106 and #107 first) |
| The candidate under test | `supabase/functions/sem-ai-command/index.ts` |
| Verifier artifacts, one directory per verifier | `qa/verification/scratch/v92/v3*/` |
| Reusable probes and proofs this session wrote | `qa/verification/scratch/v92/v4*_*.mjs` |
| The permanent generative suite | `qa/scenarios-runner/belt_generative_adversarial_contract.mjs` |

---

## 2. STATE RIGHT NOW

- **Candidate:** commit `0007a02abd1855f438ccf9e5c735ac0ea42ae4ff`, `index.ts` sha256
  `7b9fd136cdc0379b2efeb56e2adf0738df8c980e6b7153cea43900d65405c0cd`. CRLF 5998 / bare LF 0.
- **Verifier #43 is RUNNING** (worktree `brain-os-verify-0007a02`, watchdog pid 42466). **Re-arm the
  watcher after compaction** with
  `bash scripts/factory-runner/watch-verifier-artifacts.sh 43 /c/Users/Dell/dev/brain-os-verify-0007a02 60`
  — it follows the ARTIFACTS as well as the watchdog, because #41's watchdog died silently with a
  0-byte log while the verifier ran to completion. **Silence is not a verdict.**
- **The entity signal is WIRED** (ledger #107). Verifier #39's `V39-C-ENTITY` test was red by design
  for four rounds and is now green; v39 reads 21/0 for the first time.
- **Nothing is deployed. Production is still v92.** No DB write, no migration, no `functions deploy`.
- **Rollback:** `git c9dfab5bd433`, `index.ts` sha256 `795c20c82301aba1…`. Take it FROM GIT.

## 3. THE STANDING CONTRACT (unchanged, from the founder)

Do not ask routine engineering questions. Continue autonomously. Stop only at a genuine production
authorization boundary: production DB migration, Edge production deploy, production auth/security
config, real credentials, external communication, financial commitment.

Loop on every verifier FAIL: reproduce → root cause → same-defect sweep → structural fix → executable
regression → mutation-prove → **new exact SHA** → **fresh independent verifier**. Never self-certify.

Verdicts are read from the verifier's OUTPUT TEXT, never from an exit code, and are exactly one of:
`PASS` / `FAIL` / `BLOCKED — PROVIDER_CAPACITY` / `BLOCKED — PROVIDER_TRANSIENT_ERROR` /
`BLOCKED — EXECUTION_MODE` / `BLOCKED — OTHER`.

**Ask `ALLOW_FUNCTIONS_DEPLOY=1?` exactly once, and only after a fresh verifier PASSES on the exact
bytes.** Thirteen verifiers have failed in a row; do not anticipate a pass.

---

## 4. HOW TO RUN THINGS

```bash
cd /c/Users/Dell/dev/brain-os

# dispatch a verifier (ALWAYS a separate top-level process in its own worktree, never in-session)
bash scripts/factory-runner/dispatch-isolated-verifier.sh <full-sha> <campaign> <verifier> \
     qa/verification/scratch/verifier<N>_prompt_template.txt 6

# the battery (per-process exit codes; never judge it through a pipeline)
for f in qa/scenarios-runner/*.mjs; do case "$f" in *corpus*|*_lib*|*_gate_extract*) continue;; esac; \
  node "$f" >/dev/null 2>&1 || echo "FAIL $f"; done

# any suite against a scratch build
SEM_INDEX_SRC=/abs/path/to/candidate.ts node qa/scenarios-runner/<suite>.mjs

# deno must equal the 23-error baseline
npx --yes deno@2 check supabase/functions/sem-ai-command/index.ts 2>&1 | grep Found
```

Every verifier gate lives at `qa/verification/scratch/v92/v3*/v3*_regression_additions.mjs` and takes
`SEM_INDEX_SRC`. Run **all** of them plus the battery before adopting anything.

---

## 5. EXPECTED GATE NUMBERS ON THE CURRENT CANDIDATE (`7b9fd136`)

battery **36 files, 1 failing** · #42 12/1 · #41 22/0 · #40 77/0 · #38 29/0 · #37 21/0 · #36 61/0 ·
#35 55/0 · #34 57/0 · #33 93/0 · #32 101/0 · generative 25/0 · entity positive contract 5/0 ·
labelled sweep clean · deno 23 · CRLF 5998 / bare LF 0.

**FOUR reds are expected, and only these four.**

| Gate | Reads | Why |
|---|---|---|
| `standing_reds_classification_contract` | 1 blocker | the unknown-entity case; it reports the rescue, states the condition, and refuses to rule |
| `v42` | 12/1 | its D2 test measures the EMPTY-set configuration — a verifier should re-derive it |
| `v30` | 25/1 | stale inventory pin over belt LOCALS. #41 and #42 both re-derived it: NOT a blocker |
| `v31` | 33/1 | lexicon assertion at the wrong locus. NOT a blocker; its harness no longer prints a deploy verdict |

**`v39` is now 21/0.** It was 20/1 by design for four rounds. If it is ever 20/1 again, the entity
signal has been unwired.

**The one open question:** `"Confirmed - Archived Media Group. It is still active."` is rescued when
the name is in the per-turn context pack and still destroyed when it is not, because absence
deliberately proves nothing. **A verifier must rule whether that blocks a deploy.** Do not call it a
residual — ledger #102 is what that word costs.

## 6. THE LESSON THAT COST THE MOST — READ THIS BEFORE WRITING ANY FIX

**An all-green gate set is not proof of absence.** Five times this campaign a suite was green only
because its corpus never generated the shape:

1. the D177 pin (pinned a regex idiom, not the property)
2. the R-IDIOM deadness proof (only aux+participle tails)
3. the generative suite's own truth frames (used a form production destroys, so ~86% of rows were
   excluded as shared and the property could not fail)
4. `v92_parity_contract` (911 strings, 7 parentheticals, none in the position that mattered)
5. the two gerund pins (both rested on the SAME string with the gerund mid-clause, so the arm that
   destroyed 28 ordinary answers was never observed)

**Eighth, from verifier #42.** The imminent arms of the in-progress belt had **never been guarded at
all** — 98 of 140 ordinary guidance sentences destroyed, evenly across both halves, where production
preserves every one. The only coverage anywhere in 35 suites and twelve gates was two lines of
first-person fabrications that must be CAUGHT. **Not one row in the entire estate generated the
other direction.** Generate BOTH directions of every class, not only the one the arm exists for.

**Seventh, from verifier #41, and it is the most expensive so far.** #39 found the gerund arm
destroying truthful sentences. #40 replaced its verb whitelist with a structural test and validated
it on a corpus whose objects were all lowercase placeholders. That test's object guard can only fire
on a LOWERCASE object, so a capitalised name defeats it, and the arm stayed **83% broken for proper
names — 1,100 of 1,320 truthful sentences destroyed**, where v92 preserves all 1,320. **When a fix is
validated on a corpus of lowercase placeholder objects, it has been validated on the half of the
class that does not occur in production.** A Brain OS answer names the company or the person the
founder asked about. **Generate the class; do not sample it.**

**Sixth, from verifier #40, and it is the opposite and worse.** `"No errors occurred the department
was removed."` is a fabrication production corrects and the candidate shipped. It was RED in this
repository's own `v33` gate for the WHOLE campaign, and every round since #33 — including every
summary written here — recorded that single failure as "the disclosed D188 residual". It is not a
residual; by the deploy rule it is a blocker. Five suites could not fail. This one DID fail, correctly,
every round, and was explained away in prose each time. **A gate that stays red long enough stops
being read as a failure and starts being read as furniture.** Re-derive the CLASSIFICATION of every
standing red from the deploy rule, not from its label.

**And: a closed list over an open class always leaks.** It has failed on names, linking words,
evidential verbs, state verbs, gerunds and finite verbs. Function words are the one legitimate closed
class. Prefer a morphological or structural test, and when you cannot find one, disclose the shape
rather than extending a list.

**Truth destruction is the worse direction.** Production replaces a destroyed answer with
"I can't actually do that from chat — nothing was changed", and that text is **persisted to
`work_orders.output`**, so a reload and the next turn read it back.

**Measure against production's actual behaviour, not its reputation.** "Production destroys it too"
was asserted for many shapes without checking production's participle list; it was wrong for several.
Every differential row needs an INTENDED TRUTH LABEL — an unlabelled diff cannot tell an improvement
from a regression (that mistake produced 11,760 false alarms in one sweep here).

---

## 7. WHAT THE CAMPAIGN DID (verifiers #30–#42, all FAIL)

Each verifier failed the candidate, and from #34 onward each also **prepared its own fix**, which this
session adopted verbatim after re-measuring and deno-checking it. Highlights only; the ledger has all:

- **#30–#33** closed the negator-vs-name classes (a negator inside a company name, a title, a
  prepositional phrase) and the interposed-adverbial shape.
- **#34** found that every "production destroys it too" argument had been checked against the wrong
  participle list.
- **#35** replaced a guard with a structural collapse; **#36** found that collapse reached past
  production's window; **#37** found the same fix's parenthetical handling manufactured a match.
- **#38** contributed the first fix whose safety is **empty by construction** (a sentence-local parity
  backstop that fires only where production's own gate fires) and judged the belt at its ceiling.
- **#39** found the campaign's worst defect: `EXECUTION_IN_PROGRESS`, an arm **production does not
  have**, read a clause-initial gerund as an execution claim and destroyed **28 of 29** ordinary
  product-help sentences.

Three fixes of this session's own were found defective by verifiers and corrected: a casing-based name
rule, an over-broad comma pre-pass, and a dead-code removal made on a vacuous proof (reversed).

---

## 8. OPEN, DISCLOSED, NOT FIXED

1. **D188 minimal pair** — `"No errors occurred the department was removed."` is morphologically
   identical to `"No company named No Limits Inc was archived."` Any rule separating them destroys
   three truthful negatives. #39 confirmed irreducible.
2. **Two gerund-arm truth regressions found after #39's fix**, both preserved by production and
   destroyed by the candidate: `"Completing a goal marks all its tasks done."` and
   `"Two options: archiving the company, or deactivating it."` #39's fix uses two closed lists and each
   shape falls outside one. **Two fixes were attempted and neither shipped** — a structural
   fragment test closes both but costs six candidate-only catches the suites pin as closed defects
   (production ships all six), which is a design trade, not a mechanical fix. Handed to #40, which is
   briefed on exactly this family. Full detail in `CURRENT_CAMPAIGN.json`
   → `found_while_v40_runs_NOT_FIXED`.
3. **`"Confirmed — Archived Media Group. It is still active."`** — production preserves it, the
   confirmed arm destroys it; surface-identical to a real fabrication about a person.
4. **`"No errors node.js was archived."`** — production catches it, the candidate ships it.
5. **`.gitattributes` LF pin is committed but UNVERIFIED** — the fresh-worktree test was flawed
   (the attribute was copied in after checkout). A clean clone is the real test.

---

## 9. THE AGREED NEXT STEP (both the session and verifiers #38/#39 concur)

The belt is at the ceiling of what pattern matching can do. The next durable gain is **deciding
against structured evidence**: `canonicalById` (index.ts ~line 4769) is a real per-turn, RLS-scoped
read of the workspace's own rows, already in scope at the belt, usable as a **POSITIVE-ONLY** name
signal — a capitalised run that matches a known entity IS a name; absence proves nothing and must
never be used as evidence.

Verifier #39 already shipped the first regression test **RED on purpose**:
`V39-C-ENTITY.beltConsultsKnownEntityNames`, paired with `V39-C-ENTITY.absenceIsNeverUsedAsEvidence`
which passes today and must keep passing.

**It is a harness change as well as a belt change**: a name set referenced inside the belt block
collides with the extractor suites (CONTRACT 5 forbids a new top-level declaration there; verifier #36
measured that a referenced top-level const takes 7 of 10 suites to a ReferenceError).

**#39's caveat, which stands:** the largest truth cost this campaign was **not** world-knowledge-bound
— 28 destroyed answers came from an ordinary English gerund.

---

## 10. THE DATABASE STREAM — BLOCKED ON THE FOUNDER, NOTHING ELSE PENDING

Repository `C:/Users/Dell/dev/brain-os-bug006`, branch `master`, commit `f6fa26a` (pushed).

**Authorized batch is ONLY** `202609020001` (A), `202609020002` (B), `202609030001` (D).
**Explicitly excluded:** `202609020003` (C), `202609040001`, and every other migration.
Do **not** re-ask this approval unless the migration bytes change, the scope changes, or the prior
conditions cannot be satisfied.

Ready and committed, nothing applied:
- `qa/dbtest/live_preflight_abd.mjs` — read-only live verification (`--pre` / `--post` / `--smoke`),
  per-migration LIVE VERIFIED / FAILED, asserts C and 040001 UNTOUCHED. Smoke-passing on PGlite.
- `qa/dbtest/selective_apply_abd.sh` — DRY-RUN by default; asserts bytes match the reviewed `e7c943e`
  package, curates a temp workdir so the CLI can apply at most A/B/D, and **refuses to push unless the
  dry-run set is exactly {A, B, D}**. `APPLY=1` pushes and runs the post-preflight. The push exit
  status is never treated as evidence.

The only missing input is founder credentials. The exact sequence is in `CURRENT_CAMPAIGN.json` and
`SESSION_CHECKPOINT.md`. The founder chose to run read-only commands themselves; the first two are:

```
cd C:\Users\Dell\dev\brain-os-bug006
npx supabase migration list --linked --project-ref pvphxgrtdfrudejjhzjk
bash qa/dbtest/selective_apply_abd.sh          # dry-run only
```

---

## 11. TRAPS THAT COST REAL TIME HERE

- **Shell heredocs eat backslashes.** Regex-bearing patch scripts must be written with the `Write`
  tool, or build the backslash as `chr(92)` / `String.fromCharCode(92)`. This broke files four times.
- **`supabase functions download` OVERWRITES the working tree.** Download into a scratch dir.
- **Never edit `index.ts` while a verifier is running.** Build in `qa/verification/scratch/v92/fixNN.ts`,
  measure there, apply only after the verdict.
- **A `;` inside a comment inside `readsAsCompletion` truncates the suites' extractor.** Comments go
  above the declaration.
- **No new top-level declaration inside the belt block** — the extractor-based suites silently drop it.
- **CRLF discipline:** `index.ts` is CRLF (5989 lines, 0 bare LF). Keep it.
- Verifier sessions are permission-gated: `functions download`, `deno`, `git push` and browser tools
  are often refused, so provenance is INTEGRATION-LEVEL, not byte-direct. That is a real coverage gap
  and is stated, not hidden.

---

## 12. IMMEDIATE NEXT ACTIONS FOR THE NEW SESSION

1. **Re-arm a `Monitor`** on `qa/verification/scratch/watchdog-verifier40_output.state`.
2. Read `qa/verification/scratch/verifier40_output.log` when it appears; take the verdict from its
   text.
3. **FAIL** → fetch its artifacts from its worktree branch, run every gate listed in §5, adopt its
   prepared fix if it has one (after re-measuring and deno-checking), close what it leaves as
   directions, mutation-prove, commit a new SHA, dispatch verifier #41.
4. **PASS** → confirm the SHA and sha256 match exactly, then ask `ALLOW_FUNCTIONS_DEPLOY=1?` once.
5. **BLOCKED — PROVIDER_CAPACITY** → the watchdog auto-resumes after the quota reset; checkpoint and
   wait. It has done this four times already.
6. If founder DB credentials arrive at any point, run §10 and report per-migration verdicts.
