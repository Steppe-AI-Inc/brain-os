# Follow-ups queued while verifier #75 runs

The candidate worktree `brain-os-wo-resolver` is frozen at `7e544bc7` / `ed1d916b` for the life of the
round, so nothing here may be applied there yet. Each item names the file and the exact change.

## 1. `WORKING_TREE_CLEAN` claims more than it checks

`qa/verification/release_manifest.mjs:114`:

```
identity.WORKING_TREE_CLEAN = git('status', '--porcelain', '--', DEPLOY_SURFACE) === '';
```

It checks the DEPLOY SURFACE, not the working tree, and that scope is correct: verifier #74 disclosed
(V74-O4) that running the battery REWRITES a tracked file — `v60_budget_intent_and_plan_evidence_contract`
regenerates `scratch/p1/mutants/V60-D8-probe.ts` — so a whole-tree cleanliness check is unrunnable after a
battery by construction.

**The scope is right; the NAME is a claim the code does not make.** It reported `true` with
`CANDIDATE_FREEZE.json` modified, which is exactly what the label says cannot happen. Rename to
`DEPLOY_SURFACE_CLEAN` and say at the declaration why the narrow scope is deliberate.

Same family as the two false comments found in `_gate_extract.mjs` this round, and as V74-D4, where a
comment promised a post-loop check that did not exist. A label is a claim.

## 2. The freeze target when the candidate lives in another worktree

Fixed in `scripts/factory-runner/dispatch-isolated-verifier.sh` on this branch already:
`BRAIN_OS_CANDIDATE_REPO` names the tree holding the candidate, defaulting to the dispatching repo. The
copy on `wo/clarification-resolver` still has the older form and must get the same change once the round
ends — it was reverted there deliberately rather than dirty a frozen candidate tree past its verified
commit, because the release manifest records `GIT_COMMIT_SHA` and that must be the commit #75 measured.

**#75 was frozen by hand** for this reason; the freeze is recorded in `CANDIDATE_FREEZE.json` and was
confirmed by an actual refused write, not asserted.

## 3. The factory-runner ambient authority (eleven scripts)

`factory_production_write_inventory` names them: complete-run, dispatch-task, plugin-attach, plugin-sync,
poll-and-dispatch, poll-plugin-operations, provider, register-worker, scheduler, supervisor, sync-agents.
Each reaches the database through `supabase db query --linked`, inheriting the machine CLI credential.

Verified safe to do during a verifier round: **neither `dispatch-isolated-verifier.sh` nor
`verifier-watchdog.sh` touches the database**, so converting these cannot disturb a running verifier.

The suite going green must coincide with `FACTORY_RUNNER_PG_URL` existing, not precede it: `db.mjs`
refuses without it, so the code change also stops the factory runner until the founder sets that variable.

## 4. Two stale copies to reconcile once the round ends

- `qa/verification/MORNING_REPORT.md` exists in BOTH `brain-os` and `brain-os-wo-resolver`. The
  wo-resolver copy is the snapshot taken at freeze time and must not be edited while the candidate tree is
  pinned to the verified commit; the live one is here. Delete the wo-resolver copy on the next commit to
  that branch — two copies of one document is the same one-concept-many-spellings problem the product keeps
  being audited for.
- The gate run writes `qa/verification/evidence/*.json` into the candidate tree, and the battery rewrites
  `scratch/p1/mutants/V60-D8-probe.ts` (V74-O4, observed again tonight). Both are expected; both need
  committing after #75 returns, and neither affects `DEPLOY_FILE_SHA256`.

## 5. H6b — a worked example, with the measurement that justifies it

`qa/verification/proposed/h6b_example_past_completion_claim_regex.mjs` converts the first of the four
reimplementation suites. The change is small: the pasted `PAST_COMPLETION_CLAIM_PATTERN` literal is
replaced by a lift of the declaration out of the source under test. **All thirteen cases are untouched.**

Two details the other three conversions will hit:

- the declaration is INDENTED (it lives inside a block, not at module scope), so a `startsWith` anchor
  finds nothing — trim first;
- a missing declaration must THROW, never skip. A suite that cannot find what it measures is reporting on
  nothing, which is the state being fixed.

**The measurement.** A mutant that removes `approved` from the has-been arm — a real weakening of a live
fabrication gate, covered by the suite's own first case:

```
original (pasted literal)   13 passed, 0 failed     <- blind
converted (lifted)          12 passed, 1 failed     <- catches it
```

The first mutant tried was `confirmed`, and BOTH versions passed: no case in the corpus uses that word, so
the mutant was ineffective and proved nothing either way. Recorded because it is the same discipline the
Edge mutation proof enforces — establish that a mutant changes behaviour before reading its survival as
evidence — and because it is the mistake anyone converting the other three will make first.

### The other three are NOT lift-and-go, and here is why

The example above worked because `PAST_COMPLETION_CLAIM_PATTERN` is a single declaration whose right-hand
side is self-contained. Checked against the source rather than assumed, the rest are not:

| suite | what it reimplements | is it liftable? |
|---|---|---|
| `sem_ai_command_named_person_lookup_truth` | `mergedPeopleData` (index.ts:3371) | **No** — an IIFE that closes over surrounding scope |
| | `personCurrentStatus` (index.ts:3432) | **No** — an inline ternary inside an object literal, not a named thing |
| | `COMMON_COMMAND_STOPWORDS` (index.ts:234) | Yes — a plain `const` |
| `sem_ai_command_company_restore_truth` | 499 lines of restore semantics | not assessed; the largest of the four |
| `sem_ai_command_factory_verification_selection` | the factoryWorkOrders context builder | not assessed |

So two of the three need a real WINDOW executed through `_gate_extract`, not a declaration lifted — the
technique exists and every other behavioural suite uses it, but it is a different and larger job than the
example above, and the window has to be chosen so the pack-building block runs with its dependencies.

**Deliberately not attempted tonight.** A partial conversion — lifting the stopword set while leaving the
two reimplementations in place — would leave a suite that LOOKS converted and is still blind to the logic
it names. That is a worse state than the honest one it is in now, because the next reader would stop
looking. The one converted example is a template for the shape, not a claim that the other three are close.

## 6. Factory-runner least privilege — PREPARED AND MEASURED, not applied

`qa/verification/proposed/APPLY_factory_runner_least_privilege.mjs`. Thirteen edits: two to `db.mjs`
(export `isMutating`, and make `read()` use it, so there is ONE definition of "this statement mutates"),
and one per script — the body of its single `runSql` is replaced by a shim that routes through `db.mjs`.

**Measured on an isolated copy of `scripts/factory-runner` plus the suite:**

```
before   factory_production_write_inventory   FAIL - 11 scripts hold ambient authority
after    factory_production_write_inventory   pass 3, fail 0
after    node --check on all eleven           all parse
after    db.read() with no FACTORY_RUNNER_PG_URL   FactoryDbRefusal, no fallback
```

**Why the call sites do not move:** every caller reads `.rows`, and `pg` returns `.rows`. The shapes
already agree — checked, not assumed — so 69 call sites are untouched by 11 edits.

**Why the shim classifies rather than always calling `write()`:** `db.mjs` splits read from write so a
reader cannot silently become a writer. Routing everything through `write()` would keep the letter of the
boundary and discard the property.

**Two things the conversion discovered by failing, both now handled:** `provider.mjs` names its accessor
`runSqlSelect`, not `runSql` — a loop over one fixed name finds that out only by breaking; and the files
are CRLF, so locating the end of a function by a newline-brace-newline marker matches nothing in any of the
eleven and reports "could not find the end of runSql" about a file that plainly has one.

**NOT APPLIED, deliberately.** Applying it stops the factory runner until the founder sets
`FACTORY_RUNNER_PG_URL`, because the module refuses rather than falling back — that refusal is the whole
point. The least-privilege role itself is DDL, which is founder authority: a module cannot bootstrap its
own boundary.

## 7. Ledger #144 — the regression that was owed now exists

`qa/verification/proposed/embedding_observability_regression.mjs`.

`PREPARED_EMBEDDING_OBSERVABILITY_STATUS.md` names its absence as the reason the embedding fix cannot
ship: *"a regression that FAILS when an embedding failure produces no signal (it does not exist yet, so
the fix is currently unfalsifiable)"*. A fix nothing can falsify is a claim.

```
against the CANDIDATE (no signal mechanism)     6 passed, 4 failed
against a COPY with the prepared patch applied  10 passed, 0 failed
```

Four DEFECT rows, one per degradation path `embedTexts` has — no key, non-2xx, a thrown request, a body
with no usable vector — each driven with a stubbed `fetch`. They ask only whether ANYTHING recorded a
reason, never which words it used: a row that pinned the wording would break on a rewrite and teach nobody
anything, which this session has already spent hours proving.

Three CONTRACT rows guard the other direction, because the point of the design is that chat never breaks
when embeddings are down: a degraded turn still returns an answer shaped like its input, a SUCCESSFUL
embedding records no degradation (a signal that cries wolf gets muted), and it still returns its vector.

On a source with no `embeddingDegradedReason` the DEFECT rows FAIL with that as their stated reason rather
than the suite erroring — a suite that cannot run against the file it is about looks exactly like a suite
that passes.

**Still owed before #144 ships:** the nine prepared mutants run against this base. The suite itself is no
longer the blocker.

## 8. Prompt caching — considered tonight and deliberately not advanced

`qa/PROMPT_CACHE_AUDIT_2026-09-09.md` lists five steps and states the constraint plainly: **do not
implement 1 without 2-4.** A cache that works but is unmeasurable is the exact shape this campaign keeps
finding — a real behaviour change nothing can confirm or refute afterwards.

Preparing 1 and 2 alone would violate that. Step 3 is two `model_usage` columns, which is a migration and
therefore founder authority. Step 4 requires per-model cache-read and cache-write pricing, and **I do not
have those figures.** Writing plausible constants would produce cost numbers that drift wrong in the
favourable direction, which the audit itself names as the harder error to notice — and inventing a number
is the failure mode this whole campaign exists to prevent.

So the audit IS the preparation, and it is complete as one. Recorded here so it reads as a decision rather
than an omission.

## 9. For the ledger: ENCODING depth, the same shape as escape depth

Repairing the morning report meant normalising its line endings, and the quickest way to do that is to read
and write as `latin1` — byte-preserving, so a round trip cannot damage what it does not touch. That is true
and it is not the whole story: **the lines being INSERTED were ordinary JavaScript strings**, and writing
`U+2014` through a latin1 encoder keeps only its low byte. Four em-dashes silently became `0x14`, a control
character, in prose a human would read right past.

It is the escape-depth family with a different alphabet: a value that survives one representation and is
quietly truncated by another, with no error at any step. The rule generalises the same way —
**byte-level I/O is for bytes you are moving, never for text you are composing.** Normalise endings on the
raw buffer if you must, then make every content edit through UTF-8.

Caught by looking for control characters afterwards, which is now worth doing after any encoding-level
rewrite: `[...s].filter(c => c.charCodeAt(0) < 32 && c !== newline && c !== return).length` should be 0.

Belongs in `qa/KNOWN_FAILURE_MODES.md` beside instances 13-16; it is here because that file is in the
frozen candidate tree.

## 10. The evidence layer stored a verdict without its numbers

`gate_evidence.mjs` truncated each gate record with `.slice(0, 4000)` — from the FRONT. Every gate in that
file prints its verdict and its counts on the LAST few lines, so the stored record for `mutation_proof`
said `PASS` and carried no evidence of how many mutants ran: reading the evidence back reported "mutants
exercised: 0" for a run that exercised sixteen.

The gate was correct; the RECORD of it was not falsifiable. That is the same shape the layer exists to
stop — a pass whose basis cannot be inspected afterwards is a claim, and the whole point of persisting
evidence is to avoid re-running to find out.

Now keeps the tail. Found by checking what the evidence actually contained rather than trusting that a
green gate had written a useful record.

### ...and the recorder is not an input to what it records

Fixing the truncation did NOT invalidate the existing evidence: `gate_evidence.mjs` declares each gate's
inputs as the deploy surface, the gate command and the suites — not itself. So the thin record stayed
`VALID_PASS` and the next run SKIPPED, leaving the improvement inert until something else went stale.

That is arguably correct — a gate's inputs are what it MEASURES, and re-running every gate because the
formatting of a record changed would be waste. But it means the recorder can change while every record
keeps the old shape, and nothing says so. Re-recorded here with `--force`; the general point is worth a
row: **a change to how evidence is written should at least be visible in the evidence.** A `recorder_version`
in each record would do it, and would cost one line per gate rather than a re-run.

### The first fix was aimed at the wrong truncation

The record was thin for two reasons and I fixed the wrong one first. `recordEvidence` caps the stored
detail with `.slice(0, 4000)` — that was real, and changing it to keep the tail was correct but INERT,
because the caller had already reduced the output to its **last six lines** before handing it over. Six
lines is the verdict and nothing behind it.

A 25-minute forced re-run was spent proving that the first fix changed nothing, and the second reading of
the same file found the operative line immediately. **Same shape as the mutation-probe misdiagnosis earlier
in this session: a plausible, self-consistent explanation aimed at the wrong operand, believed because it
was about the right FILE.** Both times the thing that settled it was reading the call site rather than
reasoning about the symptom.

The capture now keeps every line that names a case or carries a count, plus the tail, bounded by the
character cap. Verified on `tdz_triage`, which went from 6 lines to 11 and now names its findings.

## 11. H6b is FIVE suites, not four — and it now blocks four regression suites at once

Verifier #74/campaign-136 corrected the count: the old detector matched the full directory path, so
`sem_ai_command_execution_plan_truth.mjs` — which names the bare filename — was invisible to the row
written to find reimplementations. Both detectors are aligned now.

| suite | what it mirrors | liftable? |
|---|---|---|
| `sem_ai_command_past_completion_claim_regex` | one regex declaration | **yes — converted, measured, proposed** |
| `sem_ai_command_execution_plan_truth` | `buildExecutionPlanReport` (a top-level function) | **half** — the formatter lifts; the orchestration loop does not |
| | `executeActionPlan`'s loop, generalised to run without a database | no — takes a live client |
| `sem_ai_command_named_person_lookup_truth` | `mergedPeopleData` (an IIFE), `personCurrentStatus` (an inline ternary) | no — needs a real window |
| `sem_ai_command_company_restore_truth` | 499 lines of restore semantics | not assessed |
| `sem_ai_command_factory_verification_selection` | the factoryWorkOrders context builder | not assessed |

**The half-convertible one is a trap and is deliberately left alone.** Lifting `buildExecutionPlanReport`
would make the file open a source, which is exactly what the H6b detector tests — so the count would drop
from five to four while that suite still mirrors its orchestration loop by hand. **That improves the metric
without improving the coverage**, which is the anti-pattern this whole row exists to expose. Convert it
fully or leave it counted.

Priority is now higher than when this was first written: the same defect is held by FOUR regression suites
(v74, v75, v76 and the inventory row), so closing it turns four suites green at once — and until then, four
of the battery's six non-green suites are the same finding seen from different angles.

## 12. The fix for the over-crediting bug over-credited differently

V77-H1: the mutation proof credited always-red suites with catching every mutant, because ALREADY_RED was
a hand-written list of three while seven were red. The fix derives the reference by running, and lets an
already-red suite count only when its OUTPUT CHANGES.

**That reintroduced the same bug through a different door.** Two of those suites — `production_write_authority`
and `factory_production_write_inventory` — report on MACHINE CREDENTIALS, and produce different bytes on
two consecutive runs against an identical source. "Its output changed" was therefore true of every mutant,
and both were credited with catching everything. Several mutants had NO green-suite catcher at all and were
still reported as caught.

Found by asking the obvious question of the new rule rather than the old one: **if nothing changes, does
this suite say the same thing twice?** It does not. An already-red suite is now run twice on the reference
and is only usable as a catcher if it is deterministic; the unstable ones are named at the top of every run.

The general form is worth keeping: **a differencing test is only as good as the stability of what it
differences.** Two rounds of this instrument have now failed on that, in opposite directions — first by
ignoring output entirely and trusting an exit code, then by trusting output that was never stable.

## 13. A suite writes a temp file into the tracked tree, and it races with git

`escape_depth_and_source_hygiene_contract`'s falsifiability row writes
`qa/verification/scratch/p1/_anchor_falsifiability_probe.mjs`, runs it, and deletes it in a `finally`. It
has to live there because the script it copies resolves the repo root from its own location.

During a mutation-proof run the battery executes that suite dozens of times, so the file exists in bursts.
`git add -A` in that window fails with *"unable to index file … No such file or directory"* — the file was
listed and then deleted between the two operations. Nothing is corrupted; the commit simply refuses.

Worth fixing rather than working around: the probe could be written to the OS temp directory with the repo
root injected through an environment variable, which removes the file from the tracked tree entirely. Until
then, do not commit while a proof is running — and note that this is one more instrument writing into the
directory it is measuring, which is the same shape as the battery regenerating a tracked mutant probe
(V74-O4).
