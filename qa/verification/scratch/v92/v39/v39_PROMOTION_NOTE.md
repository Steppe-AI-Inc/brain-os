# v39 PROMOTION NOTE — campaign #99, verifier #39

**VERDICT: FAIL. EDGE STATUS = NOT DEPLOYMENT READY. Production stays v92.**

Candidate `494157179fde8bf9c4a7d1db581f8f0e8a304339`,
`supabase/functions/sem-ai-command/index.ts` sha256
`ae4c598c5390c691ef9b575981eaf7c120d9117792d64b55bba40706842f4ac9` (unchanged by this run —
asserted at start, after two temporary working-tree edits, and at the end).

Do **not** run `supabase functions deploy` for this candidate. Do **not** ask for
`ALLOW_FUNCTIONS_DEPLOY=1`.

---

## The one-line reason

Two independent deploy blockers, both measured against DEPLOYED v92 on a corpus I built this
run, not against the campaign baseline:

* **V39-D1 (P1)** — 28 truthful how-to / third-party-progress answers that v92 preserves are
  destroyed by the candidate, replaced with *"I can't actually do that from chat — nothing was
  changed."* and **persisted to `work_orders.output`**. The cause is
  `EXECUTION_IN_PROGRESS`'s clause-initial bare-gerund arm, which **v92 does not have at all**.
* **V39-D2 (P1)** — 8 completion claims that v92 corrects are shipped by the candidate, because
  this campaign's negator-pronoun comma pre-pass joins across a past completion.

Plus **V39-D3 (P2)** 3 fabrications lost to the `?`/`!` sentence split and **V39-D4 (P2)** 4
truthful policy statements lost to `CONFIRMED_COMPLETION`'s closed disarm lexicon.

---

## What to promote regardless of the verdict

1. `qa/verification/proposed/v39_regression_additions.mjs` → promote to
   `qa/scenarios-runner/`. It is the gate that fails on all four defects and holds 15 contracts
   that are true today, including the ones nobody had pinned:
   * `V39-C2` — #38's parity backstop really is a **subset of v92** (checked, not believed).
   * `V39-C8` — CONTRACT 5's narrowed detector catches an injected top-level declaration at
     **all 11** positions, not just the one the committed COVERAGE case tries.
   * `V39-C9` — the count of `SUPERSEDED` no-op stub suites may not grow past 5. A "34 suites,
     0 failures" battery number that silently includes 5 stubs overstates coverage.
   * `V39-D1.pinsAreNotVacuous` — RED today: `run11 D87.hold.legit` and `run12 D94.hold.legit`
     must stop resting on the same mid-clause string.
2. `qa/verification/proposed/v39_prepared_fix.patch` — three inline edits, measured:
   truth regression **32 → 5**, fabrication regression **11 → 0**, 0/16 controls broken,
   committed battery **34/34**, verifier gates #32/#34/#35/#36/#37/#38 + #30 probe green,
   #33 unchanged at its disclosed 92/1. Adopt, then re-verify with a fresh verifier.
3. Two harness repairs that are not product changes:
   * `qa/verification/scratch/v92/v30_regression_additions.mjs` is **unrunnable from any cwd**
     (its path math resolves to `qa/supabase/functions/…`). Fix or retire it.
   * `qa/verification/scratch/v92/v92.lf.ts` is CRLF despite the `.lf` name (identical hash to
     `index.v92.ts`). Rename or normalise.
4. **Repo hygiene, real:** the candidate's `index.ts` is committed **CRLF** while v92's is
   **LF**, so the deploy diff is a whole-file rewrite and cannot be reviewed without
   normalisation; there is also one **lone `\r`** at line 5719. Add a `.gitattributes`
   `*.ts text eol=lf` before the next deploy, so the next reviewer sees 51 hunks instead of
   10,301 changed lines.

---

## Corrections to the incoming narrative

| Claim in `CURRENT_CAMPAIGN.json` | My finding |
|---|---|
| battery 34 suites / 0 failures | **CONFIRMED** by my own per-process exit codes — but 5 of the 34 are one-line `SUPERSEDED` stubs. Honest: 29 asserting / 5 stubs. |
| #38 gate 29/0, #37 21/0, #36 62/0, #35 56/0, #34 58/0, #32 101/0, generative 25/0, run15 57/0 | **ALL CONFIRMED** by re-running them myself. |
| #33 92/1 disclosed, #31 F3b still open | **CONFIRMED** — both are red exactly as declared. |
| "the backstop's truth-regression set is empty BY CONSTRUCTION" | **CONFIRMED for that arm**, structurally and on 578 strings. **Materially incomplete as a statement about the belt**: V39-D1 lives in a different arm and destroys 28 truthful answers. |
| "five shipped fixes" | **Four and a half.** The R-AUXGAP arm is a complete no-op on its own — fully masked by #38's backstop. #31's own committed mutation proof already says `F3.auxGap (mutation was a no-op)`. |
| "run14's budget is gone" | **CONFIRMED**, and the three retargeted pins go RED when I revert run14 (restored byte-identically). Residual: they pin the literal string `statement end not found` plus **one** exact budget spelling, so a differently-spelled budget keeps all three green. |
| CONTRACT 5 narrowing | **HONEST.** Still fails for the reason it exists, at all 11 top-level positions, and hides nothing — `completionIsNegated`'s locals genuinely travel with run15's brace-balanced grab. |
| deployed v92 == `c9dfab5bd433` | **INTEGRATION-LEVEL, not byte-direct, in this run.** `functions download` was permission-blocked. Version 92 + `ezbr_sha256` + a CI `entrypoint_path` + a deploy 44.5 s after the commit + the git bytes' hash matching. A future run that can execute `functions download` should close this. |

---

## Rollback target

Exact and available: **v92 = git `c9dfab5bd433`**, `index.ts` sha256
`795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc`, mirrored byte-identically
(modulo CRLF) at `qa/verification/scratch/v92/index.v92.ts`. Nothing needs to be rolled back —
**production was never changed by this run.** No `functions deploy`, no `db push`, no migration.

---

## Evidence

| artifact | what it is |
|---|---|
| `qa/verification/scratch/v39/belt39.mjs` | my own belt/gate extractor (executes the real source) |
| `qa/verification/scratch/v39/corpus39.mjs` | my corpus: 385 truthful / 231 fabrications, sectioned |
| `qa/verification/scratch/v39/v39_differential.mjs` | four-quadrant v92 differential |
| `qa/verification/scratch/v39/v39_matcher_differential.mjs` | 30 disambiguation shapes |
| `qa/verification/scratch/v39/v39_mutation_proof.mjs`, `v39_mut2.mjs` | single and DOUBLE reverts (how the masked R-AUXGAP arm was found) |
| `qa/verification/scratch/v39/contract5_probe.mjs` | CONTRACT 5 detector audit, 11 positions |
| `qa/verification/scratch/v39/revert_run14_test.mjs` | the run14 revert test, with sha restore proof |
| `qa/verification/scratch/v39/run_battery.mjs`, `battery/` | 34 suites, per-process exit codes, full logs |
| `qa/verification/scratch/v39/v39_prepared_fix.mjs`, `v39_fix_battery*.mjs`, `fix/` | the prepared fix and its full re-verification |
| `qa/verification/scratch/v39/FINDINGS.md` | the running log, written as findings were made |
