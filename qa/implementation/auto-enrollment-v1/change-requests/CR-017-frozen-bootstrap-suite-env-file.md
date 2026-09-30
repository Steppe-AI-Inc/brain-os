# CHANGE REQUEST — DIRECTOR DECISION REQUIRED

**CR-017 — the certified reference suite `qa/factory/package_bootstrap_regression.mjs` (frozen at `69df2f52`) empties
`FACTORY_RUNNER_ENV_FILE` in its fresh-clone branch, which resolves the default `~/.brain-factory/runner.env` (S-15; VERIFICATION_SPEC
§3.7)**

- **Filed:** 2026-09-29 by the IMPLEMENTER capability, on `factory/auto-enrollment-v1-implementation`, after the A7 verifier review
  (the L6-4 follow-up).
- **Built on:** Director r3 `c7a845b61a3b0b419e8c9dfeff397547fdc75b03`.
- **Kind:** a Director clarification or a ratified successor for a file the candidate may not change. No Director text is edited, and
  the frozen file is unchanged (`git diff --quiet 69df2f52 HEAD -- qa/factory/package_bootstrap_regression.mjs` exits 0).
- **Until the Director decides, the candidate keeps the r3 rule:** the file stays at its `69df2f52` bytes, and the implementer's
  tools run only its `--static` rows (`qa/implementation/auto-enrollment-v1/tools/run_reference_suites.mjs` already excludes the
  fresh-clone rows, for another S-15 reason: the F6 restore path re-registers this PC's live task). The candidate relies on nothing
  requested here.

## Requirement (the r3 texts)

- **S-15** (`docs/architecture/features/factory-node-management-auto-enrollment.SECURITY_TENANCY.md`): "Candidate tests never touch
  ... `~/.brain-factory/runner.env` ...".
- **VERIFICATION_SPEC §3.7** (`qa/verification/auto-enrollment-v1/VERIFICATION_SPEC.md`, lines 396-406): "The set is exact. Each
  file below runs at its `69df2f52` bytes in the candidate checkout, unless a Director-ratified successor replaces it", and the list
  names `package_bootstrap_regression.mjs`. The same section lists the suites excluded by S-15; this one is not among them.

## Evidence

- The frozen file's fresh-clone branch (it runs unless `--static` is given) sets `FACTORY_RUNNER_ENV_FILE` to an empty value for its
  child processes. With the frozen resolver, that can resolve the default `~/.brain-factory/runner.env`, which is the live node's file
  on a machine that runs a node.
- The candidate's own suite isolation (`qa/factory/v1/isolation.mjs`, L6-4) names an absent absolute path instead, but it cannot
  reach a frozen file's own children.
- The line-level analysis went to the Director privately, through the founder (ledger rule 3).

## Why a decision is needed

The file must run at its frozen bytes (§3.7), and running its fresh-clone branch on a machine that holds a live `runner.env` would let
a candidate test read that file, which S-15 forbids. The implementer cannot change the file or the rule. Only the Director can
reconcile the two.

## Alternatives (for the Director)

1. **Ratify a successor** of `package_bootstrap_regression.mjs` whose `cleanEnv` names an absent absolute path (as
   `isolatedSuiteEnv()` does) instead of `''`, with every other byte unchanged. The implementer can prepare the exact diff on request.
2. **State that the fresh-clone branch runs only under the verifier's isolated account**, where no `~/.brain-factory/runner.env`
   exists, and record that the implementer's machine runs its `--static` rows only (as today).
3. **Add its fresh-clone rows to the §3.7 S-15 exclusion list**, beside the live-task rows of `reboot_recovery_acceptance.mjs`, and
   state where their semantics are proved instead.

## Impact

- On the candidate: none until decided (nothing is implemented against this request).
- On the verifier: the §3.7 run of this suite needs one of the three conditions above to meet S-15 on a machine with a live node.
