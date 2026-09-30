# CHANGE REQUEST — DIRECTOR DECISION REQUIRED

**CR-012 — AC-3 "Exactly one done run per work order" for a work order that FAILED verification and was repaired**

- **Filed:** 2026-09-28 by the IMPLEMENTER capability, on `factory/auto-enrollment-v1-implementation`.
- **Built on:** Director r3 `c7a845b61a3b0b419e8c9dfeff397547fdc75b03`.
- **Kind:** a request for clarification of how AC-3's count is taken. No Director text is edited, no evidence is rewritten, and no
  behaviour changes because of this request.
- **Until the Director decides, the candidate keeps its current behaviour**, and the candidate report states the query it uses.

## Requirement (the r3 texts)

- **AC-3** (`qa/verification/auto-enrollment-v1/ACCEPTANCE_MATRIX.md`): "Exactly one done run per work order."
- **Contract §2 Verification** (`docs/architecture/features/factory-node-management-auto-enrollment.md`): "VERIFICATION_FAILED ->
  IMPLEMENTED: a **new** candidate (a new authoring run) through repair"; "There is no automatic re-verification of the same
  candidate"; "A new candidate whose content is identical to a FAILED one (the same tree) is refused as a resubmission".
- **WO-9**: `VERIFICATION_FAILED` is never COMPLETE; a new candidate means a new authoring run.

## Evidence (what the candidate does)

- A FAIL changes only the certified work order (VERIFICATION_FAILED, back to the queue) and the verification run. The run that
  produced the failed content is left as it finished, `done`: it did complete, its row is evidence, and the FAIL certification
  points at it through `candidate_run_id`.
- The repair is a second authoring run on the same work order, and it finishes `done` too. Counting `done` authoring runs per
  work order literally therefore gives 2 for a repaired work order.
- `work_orders.current_candidate_run_id` names the candidate the latest certification is about; a certification counts only while
  its provenance is that current candidate (S-13).

## Why it must be the Director's decision

AC-3 is binding acceptance text. Whether "one done run" counts every run that finished, or the certified current candidate, decides
what the verifier's evidence query is. The implementer may propose the query but not choose the reading.

## Requested decision (any one)

1. **AC-3 counts the certified current candidate:** per work order, the authoring runs with status `done` that no FAIL certification
   names as its candidate (`certifications.verdict = 'FAIL'` and `candidate_run_id`), which equals `work_orders.current_candidate_run_id`
   for verification-required work. The run behind the FAIL remains readable and is listed next to the count. No code change.
2. **The FAIL also rewrites the run it judged** (for example its status or its termination reason), so that a plain count of `done`
   runs leaves it out. That edits a run's row after it finished, so the Director would have to say it is not an evidence rewrite.
3. **Some other rule the Director specifies.**

## Alternative considered (and why not adopted)

Option 2 without a decision: it changes a finished run's row and the meaning of `done` for the 69df2f52 run table, which AC-9 and the
compatibility matrix keep. Not done.

## Impact

- Option 1: evidence query only (the candidate report and the verifier's AC-3 read); no code, schema or suite change.
- Option 2: a node_certify change and a developer regression; the compatibility matrix row "certification" is revisited.
