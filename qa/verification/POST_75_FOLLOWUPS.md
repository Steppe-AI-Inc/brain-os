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
