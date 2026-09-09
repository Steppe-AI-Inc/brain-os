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
