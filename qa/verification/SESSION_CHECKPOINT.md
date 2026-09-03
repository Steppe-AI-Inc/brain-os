# DURABLE SESSION CHECKPOINT — Main-PC implementation session
Updated: 2026-09-03 (campaign #74 CLOSED, verifier #15 dispatched and RUNNING, all four
DB migrations' round-2 findings closed). A completely fresh Claude Code session must be
able to resume from this file without asking the founder for context.

## WHY the current task exists
Overnight campaign (TEAM-READY → BRAIN EVERYWHERE → REAL OPERATIONS), P0 = BUG-002
execution truth. The loop is fixed and standing: independent verifier returns a verdict →
implementing session reproduces, root-causes, sweeps the same defect class, fixes
structurally, adds an executable regression, MUTATION-PROVES it, produces ONE new exact
SHA, dispatches a fresh verifier on that SHA. No step is skipped and none is asked about.

## Current state (exact)
- Branch: `pending/d3-past-completion-gate-pendingaction-shortcircuit` @ `C:/Users/Dell/dev/brain-os`
  (main tree; hot file `supabase/functions/sem-ai-command/index.ts` — ONE writer only).
- **HEAD `d724d8c`**, `index.ts` sha256 **`1b291f370d285ae79844c7f363a3959d2c668ab5d368a69805b0c9a16227ef64`**.
- **VERIFIER #15 (campaign #75) IS RUNNING AGAINST THAT EXACT SHA.** Windows PID 22980,
  dispatched 2026-09-03 12:44 local, output buffers to
  `qa/verification/scratch/verifier15_output.log` (empty until it exits — `-p` buffers).
  **DO NOT MODIFY `index.ts` UNTIL IT RETURNS.** It asserts the SHA before and after every
  temporary edit; a change from this side invalidates the whole campaign.
- `master` @ `C:/Users/Dell/dev/brain-os-bug006` worktree — **PULL FIRST** (run12/D96: a
  stale checkout once made a reviewer report an existing migration as non-existent).
  HEAD `0392d71`. Holds all four PREPARED, UNPUSHED migrations.

## WHAT has already been proven (do NOT repeat)
- **Campaign #73 CLOSED** (`f1722f2`): all twelve of verifier #13's defects (D98–D103).
  Promoted suite `qa/scenarios-runner/run13_defect_closure_contract.mjs` (60/60); mutation
  proof `qa/verification/proposed/v13_mutation_proof.mjs` (7/7 observable). Ledger entry
  #73 + closure postscript appended to `qa/KNOWN_FAILURE_MODES.md`, preamble-stripped.
- Committed battery: **25 `.mjs` suites, 0 failures**, ~622 enumerated checks.
- **All 47 DB review round-2 findings CLOSED** across the four migrations and the four
  acceptance artifacts (worktree commits `80074c2`, `5324518`, `a51ff58`, `c6b56ab`,
  `d0d09c1`, response record `0392d71`).
- Runs 7/8/9 defect closures (D40–D76 lineage) — KNOWN_FAILURE_MODES #66–#69.
- BUG-006 CLOSED by Work-PC live retest. BUG-008/009 fixed on master (12191e8).
- v92 untouched; zero production writes all campaign.
- Capacity-resilience pattern proven: #10 scenario 1 checkpoint survived a
  PROVIDER_CAPACITY_BLOCKED exit and attempt 2 resumed from scenario 2 without rerun.

## VERIFIER #14 (campaign #74) — VERDICT FAIL, CLOSED in `d724d8c`
Three of its four source defects were MINE, shipped in `f1722f2`. Full record:
`qa/KNOWN_FAILURE_MODES.md` #74 + closure postscript;
`qa/verification/archive/campaign-f1722f2-verify14.json`.

- **D106 (P1)** — the D102 raw fallback could bind a founder's reply to the WRONG entity
  and arm `archiveCompanyIds` with it. Fixed with SPECIFICITY + a RESIDUAL-MENTION guard +
  the raw tie-break confined to the tied set. **The applied fix is verifier #14's, not the
  one I prepared** — mine guessed on multi-mention replies, and my own probe contained no
  multi-mention case, which is why my self-validation read clean.
- **D114** — FIX-3b REPLACED run12's first-person belt rather than adding to it. Both axes
  now present, first-person carrying a clause-position lookbehind.
- **D112** — `CONFIRMED_COMPLETION` destroyed truthful answers; now negation- and
  determiner-aware.
- **D113** — the corroboration gate was itself lexical. Now two rules, only the second
  lexical. Ends D78 → D86 → D91 → D100 → D113 at five campaigns.
- **D107–D111** (eleventh vacuous-guard recurrence) — remedied by `run14` (68 cases), no
  source change. **D115** ledger corruption deleted.

Battery: 25 suites, 0 failures, 690 checks. Mutation proof 10/10 including LIMITS.

## WHAT must not be repeated / broken
- **Never derive PASS from an exit code.** exit 0 + provider-capacity text ⇒
  `BLOCKED — PROVIDER_CAPACITY`, never PASS. Count failures from OUTPUT TEXT.
- **Never close one direction of the question belt by reopening the other.** Three
  campaigns have now done it. Any change there must be A/B measured on BOTH corpora
  (assertion leaks AND clarification drops) before it is committed.
- **Mutate a guard's LIMITS, not only its coverage.** Ten vacuous guards have shipped; the
  eleventh (`REFERENCELESS_CONFIRMATION`'s end-anchor) was found by mutation, not review.
- **A contract asserted against SQL or source must be comment-stripped.** Twice a
  "passing" assertion was satisfied by a comment naming the thing it looked for.
- `$$` in a JS string replacement is an escape for `$` — it silently corrupts SQL
  dollar-quoting in mutation harnesses. Use a replacement function.
- Never fix D77 by weakening D70 (abbreviation questions must survive) — the guard's
  DIRECTION was wrong, not its existence. Contracts D70.hold/D78.legit/D81.state.hold/
  D84.hold must stay green.
- Never re-add the D3 pendingAction short-circuit; never let the model's claims-array
  choice disarm the rewrite; prose gates are defense-in-depth only.
- Two implementation sessions must never modify `index.ts`, the same migration, or the
  same worktree concurrently. Verifiers are dispatched per
  `qa/verification/DISPATCH_RUNBOOK.md` (narrow `--allowedTools`).

## NEXT EXECUTABLE ACTIONS (in order)
1. **WAIT** for verifier #15 to exit (a Monitor is armed on PID 22980). Do not touch
   `index.ts` before then.
2. Read its final verdict and `v15_regression_additions.mjs`. Classify exactly as
   PASS / FAIL / BLOCKED — PROVIDER_CAPACITY / BLOCKED — OTHER.
3. Fix in severity order, sweeping the class each time. Anything that can select a
   DIFFERENT entity is P1 and goes first.
4. Promote `run15_defect_closure_contract.mjs`, mutation-prove every new guard **including
   its limits**, append ledger entry #75, ONE new SHA, dispatch **verifier #16**.
5. DB side: an independent **round-3** review of all four migrations, each with its OWN
   verdict. See `qa/verification/DB_REVIEW_ROUND3_RESPONSE.json` for what changed and what
   round 3 should attack hardest.
6. Work-PC retest list post-deploy unchanged (bare yes, E-multi, progressive wording,
   off-by-one, continuity honesty, reload, durable pending state, 50/100/200-turn).

## Authorization state (survives restarts; never inferred forward)
- **NOTHING is currently authorized.** Prior `ALLOW_FUNCTIONS_DEPLOY=1` was consumed by
  c9dfab5/v92. Prior db-push authorizations were consumed by 202609010001/2.
- **`supabase db push`: NOT AUTHORIZED, and NOT YET REQUESTED — deliberately.** The
  standing rule is not to ask while remaining engineering work can still materially change
  the package. It can: the migrations have never been parsed by a real PostgreSQL (no psql,
  no docker, no `db query` access — three consecutive review rounds now blocked), no
  independent round-3 review has happened, and migration A alone gained three RPCs and four
  triggers in this batch. Everything on the DB side is **CODE INSPECTED**, never LIVE
  VERIFIED. Migration C is additionally **ahead of its own gate** (the standing guardrail
  is no messaging work before Phase 11 acceptance, which has not run).
- **`ALLOW_FUNCTIONS_DEPLOY=1`: NOT AUTHORIZED, and NOT YET REQUESTED.** `d724d8c` has had
  NO independent verification — #15 is still running. Nothing is certifiable to deploy, and
  the last four campaigns each found a defect in the previous one's "clean" state.
- The two approvals are separate and must never be combined into one request.
- **BUG-002 and GitHub issue #5 remain OPEN/PARTIAL.** Closure requires
  IMPLEMENTED → INDEPENDENTLY VERIFIED → DEPLOYED → LIVE VERIFIED → WORK-PC E2E VERIFIED.
  Neither unit tests, nor mutation proofs, nor a verifier PASS, nor an applied migration,
  nor a deployed Edge Function closes them on its own.
