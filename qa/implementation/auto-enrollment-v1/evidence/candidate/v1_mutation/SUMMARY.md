# v1 new-invariant mutation proof — summary

**Tool:** `qa/factory/v1/v1_mutation_proof.mjs`, run in bounded foreground chunks with `--controls controls.json`. Every
suite's control runs on the same commit as the mutants it judges; a control from another commit is never reused.

**Result: 47 of 47 mutants killed.**

| chunk file | commit | mutants | result |
|---|---|---|---|
| `chunk-01-admin-revocation-tls-schema.txt` | `578785d` | RV ID S7 TA TF RT PS LK TL IP LD LX LR PR LG LG2 LG3 RC | 18/18 |
| `chunk-02-eligibility-a.txt` | `578785d` | G2 G3 G4a G4b G5 G6a G6b G7h G8 | 9/9 |
| `chunk-03-eligibility-b.txt` | `578785d` | G9 G10a G10b G11a G11c G12 DB NP KR | 9/9 |
| `chunk-04-takeover-independence-enrollment.txt` | `578785d` | FN IN IN2 CP PH PC PD | 7/7 |
| `chunk-05-release-a.txt` | `578785d` | RU (its HS line is superseded: see below) | RU 1/1 |
| `chunk-05b-release-HS.txt` | `d7d63a6` | HS | 1/1 |
| `chunk-05c-release-HO-RD.txt` | `d7d63a6` | HO RD | 2/2 |

`d7d63a6` differs from `578785d` only in the proof's own HS definition (`git diff --name-only 578785d d7d63a6` lists
`qa/factory/v1/v1_mutation_proof.mjs` alone). The product code and every suite are byte-identical between the two
commits.

## What the proof found (each fixed and committed before the final chunks)

| mutant | finding | fix |
|---|---|---|
| RT | Eight v1 suites had `try`/`finally` with no `catch`. A crash exited 1 with no named row, so the defect was detected but not attributed. | `c49ae28`: each suite records `X0 <suite> did not complete` |
| RC | schema_acceptance L3 reused one node id, so a wrongly ALLOWED reserved-capability insert crashed the suite instead of failing L3. | `812899e` |
| LX | A legacy EXECUTE grant planted inside the migration is revoked by `990_finalize`'s own sweep, which is a second layer that holds. | `812899e`: the mutant now plants after the sweep and self-check, so C6 / L2 are the rows judged |
| IN2 | **Coverage gap (AC-14).** No test had a run that held a lease but wrote no consumed checkpoint, so the lease-holder branch of the S-13 authoring set was untested. | `e6fcfb7`: row (j2) |
| HS | The first definition planted a fake digest, which made supervisors hand off to each other endlessly. Detected (X0), but not the defect named. | `d7d63a6`: HS skips only the self-verification refusal |

## Kills at setup

LD and LR are killed at setup (X0). The migration's own self-check (`990_finalize.sql`) refuses the planted privilege, so the
migration never commits. That is the self-check layer doing its job, before the schema rows are reached.

## Two-layer invariants reverted as a pair

Some invariants have two layers, and one mutant reverts both:
- **ID:** the Edge and the SQL front door;
- **PS:** the front door and the table guard;
- **IN:** the claim gate 7 and the certify floor.

Reverting a single layer of these is covered by the other layer.

## Gate 1

Gate 1 is enforced by the per-call credential re-check (RV, and LK for its serialization). The gate function's own gate-1
branch cannot be reached through any API, because the session check refuses first.

## Superseded runs

Earlier chunks are kept in `superseded-runs/`: at `6fcfd85`, and before the fixes above. They show the survivors that
led to the fixes.

`superseded-runs/stray-queue2-full-run-at-6eb3b6a.txt` is an unchunked full run by a queue script. TaskStop had stopped only its
outer pipeline, so the script went on by itself and ran concurrently with the chunks. It ran at `6eb3b6a`, before the fixes, and
found the same six survivors independently (RT, LD, LX, LR, RC, IN2: 39 of 45). The script is gone, and so is the other queue
script (PID 4960), terminated at 22:2xZ.
