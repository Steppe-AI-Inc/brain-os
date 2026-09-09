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
