# v35 PROMOTION NOTE — verifier #35, campaign #95 (candidate `0f96ff93` vs deployed v92)

VERDICT: **FAIL** — `EDGE STATUS = NOT DEPLOYMENT READY`. Candidate index.ts sha256 (CRLF working tree)
`b1f54b072cc41312d25248c2f2334545eafbb1aa09e0162564f86b9d9a720a23`, untouched throughout.

## What to promote

1. `qa/verification/scratch/v92/v35/v35_regression_additions.mjs` — CONTRACT/DEFECT/RESIDUAL, exits nonzero on any
   CONTRACT or DEFECT failure; locates index.ts via `SEM_INDEX_SRC` or by walking up from its own path (correct from
   any cwd); reconstructs deployed v92's gate from the candidate's own byte-identical PCCP literal (sha pinned).
   RED on this candidate by design (49/7). Promote into `qa/scenarios-runner/` only when it is green apart from the
   V35-F6 suite item, or after V35-F6 is fixed — never by deleting a DEFECT.
2. `qa/verification/scratch/v92/v35/battery.mjs` — a battery runner that reads each suite's exit status directly
   (never through a pipeline) from a non-root cwd, and classifies substantive / SUPERSEDED / helper from bytes.
   Recommended as the canonical way to state a battery count.
3. `qa/verification/scratch/v92/v35/gen_probe.mjs` — measures the generative suite's v92-shared fraction and its
   sensitivity under 17 single-edit reverts. Keep as the vacuity check for that suite.

## What to adopt (implementer's decision, with the measurements attached)

`qa/verification/scratch/v92/v35/build_fix39.mjs` rebuilds `fix39/index.ts` from the pristine candidate by exact
unique-anchor splices (A collapse-before-split R-AUXGAP; B "<participle> successfully" subject run; C token-internal
period is not a boundary; D status-guard pronoun/`;` tempering; E relative-clause negator). Evidence on fix39:
own harness 0 truth regressions / 1 ambiguous fabrication residual / D188 only; full battery 34/0 in
`fixtree/`; #34 58/0, #32 101/0, #30 PASS, generative 9/0, v92_open 28/0, parity 46/0; #33 90/2 (D188 + the D187
splitter-anchor pin that must be re-derived if C ships); `fix39_mutation.mjs` shows all five families load-bearing.
NOT deno-checked (deno unavailable this session) — required before adoption. If adopted, the mutation anchors in
`v35_mutation_proof.mjs` (implementing session) for the removed AUXGAP arm become no-ops and must be re-pinned on
the collapse regex instead; `v33_regression_additions.mjs` D187 anchor must be re-derived to the new splitter.

## Suite defect to fix regardless of the Edge decision

V35-F6: `belt_generative_adversarial_contract.mjs` P1/P2/P3/P2b-modifier truth frames use "was <participle>", which
deployed v92 destroys, so ~86% of rows are SHARED-excluded and the properties cannot fail there; the suite stays
green under 14/17 single-edit reverts (all six verifier-#34 edits included). Rewrite the truth frames with forms v92
preserves (wasn't / has not been / is being / had been) and add a fabrication frame crossing the interposed
adverbial with each scope-excused negator position (PP, relative clause, quoted title, idiom, negator name).

## Record corrections

- Identifier delta re-derived from bytes: top-level 57 → 57 (0/0); any-depth +199 / −0 (ledger #90's "176" is
  not reproducible); 95 linear commits; 863 files; deploy surface index.ts only.
- The launch prompt's "run14 window 2000 → 2600" is stale: the file is at 4000 (ledger #94) and the statement is
  3378 chars — spanning.
- Provenance this session is INTEGRATION-LEVEL (functions list + CI run correlation); byte-direct download was
  permission-gated. Ledger #90's byte-exact claim is confirmed at that level only, not re-established from bytes.
- The run30 R-IDIOM lexicon widening is dead code on this candidate (0/3 re-open when both idiom replaces are
  removed); by the campaign's own rule it should be removed or re-justified with a load-bearing shape.

## Cleanup

No production data was touched; no `QA-VERIFY-*` entities were created (this was a source-differential
campaign). Scratch build outputs (`fixtree/`, `mut/`, `fix39_mut/`, `c5/`, `v92_gitobject.ts`) are gitignored.
