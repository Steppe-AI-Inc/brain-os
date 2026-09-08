# v53 promotion note — verifier #53, campaign #113 (v92 differential, seventeenth round)

**Verdict: FAIL** on candidate `904bf19b196a795f7ca10126b91fd8a4d421e835` (index.ts sha256 `bd21c2af8fa01cb396dfb07f113c69a71cefc214d3aeb5ffb202bb935255e95e`).

## What to promote
* `qa/verification/proposed/v53_regression_additions.mjs` → `qa/scenarios-runner/` once V53-D1 is closed (it is red by design on 904bf19: 33/1; green 34/0 on the
  prepared closure). It pins: provenance (download == c9dfab5b), LIFECYCLE/PAST byte-identity, the V53-D1 class (1,280 rows + 1,280 control + 2,560 truthful twins),
  V52-D1 staying closed (my own 160+160 rows), positive-only behaviour of BOTH prefix searches with an empty pack, the negation-phrase OPENER guarantee (0/120),
  the Step-3 truth attacks and refused shapes, V53-H1 (exactly one literal `;` in `readsAsCompletion`), the 13-name top-level belt list, and 20 matcher shapes.
* `qa/verification/scratch/v53/mut/closure_V53D1.ts` — the PREPARED closure (built by `scratch/v53/build_closure.mjs` from the candidate bytes; one anchor, found once).
  Adopt it verbatim by running the builder on the tree, not by hand-editing: it is one expression with no declaration and no literal semicolon, which is what keeps
  run15 and V50-C10 green. Measured: V53-D1 0/1280 shipped (was 640/1280), 0/640 truths destroyed, both corpora otherwise unchanged, 18/18 suites, deno 23.
* Ledger entry `qa/verification/proposed/v53_known_failure_modes_entry_118.md` → append to `qa/KNOWN_FAILURE_MODES.md` as the next verifier entry.

## Optional, measured at zero cost on 2,761 rows
* `namePrefixHit` cap 8 → 16 (`scratch/v53/mut/prefix_cap_16.ts`): closes V53-R2 (10+-word negator-initial titles), TR unchanged, FR 19 → 16.

## Record corrections to apply
* CURRENT_CAMPAIGN.json `gates_on_committed_candidate`: v32 98/3, v33 92/1, v36 60/1, v37 20/1, v38 27/2, v39 19/2, v40 76/1, v41 21/1, v45 51/3, v47 43/9, v31 32/2,
  v42 11/2 (measured here; every red classified in the ledger entry as V48-D3 empty-pack parity, stale anchor, or the #50 decision).
* Ledger #101 "verifier #39's gate 20/1" → 19/2.
* `open_deploy_blockers` on 904bf19: `[V53-D1]`.

## Not promoted
* The harness self-check's dependence on `scratch/v53/dl` (my download) — set `V92_INDEX_SRC` to `qa/verification/scratch/v92/index.v92.ts` (hashes identically) if
  the download directory is ever pruned.
