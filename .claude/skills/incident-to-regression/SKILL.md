---
name: incident-to-regression
description: What to do when a real defect is found - the self-improving QA loop from CLAUDE.md Section 12, generalized as a reusable skill. Use whenever the verifier, release operator, or a founder report surfaces a genuine defect, not just an implementation gap that hasn't been built yet.
---

# Incident to Regression

Every real production defect becomes permanent institutional knowledge — that is the
actual mechanism by which Brain OS gets harder to break over time, not a nice-to-have
process step.

## The loop, in order, every time

1. **Reproduce it deterministically.** Not "it seems like X might happen" — a real
   repro, with real inputs and a real observed-vs-expected gap.
2. **Record exact expected vs. actual state.** Canonical IDs involved, the real query
   or action that surfaced it, the timestamp/commit it was found at.
3. **Find the root cause**, not just the symptom. If a fix would make the symptom go
   away without fixing the actual mechanism, it's not done.
4. **Search for the same defect class elsewhere in the codebase.** One bug found is
   evidence of a possible systemic pattern, not an isolated event — grep for the exact
   shape of the mistake (e.g. `qa/KNOWN_FAILURE_MODES.md` #18 was found once as an
   approvals-deletion bug and turned out to be a ~20-function-wide pattern once actually
   searched for). Do this search for real, not as a formality — report what you
   actually found, including "searched and found no other instances."
5. **Add a permanent regression test** — SQL under `qa/scenarios-runner/`
   (rolled-back-transaction style) for anything DB/RLS-reachable, or the equivalent for
   a UI/AI-surface defect. This test must fail against the old (buggy) code and pass
   against the fix — if it would pass either way, it isn't actually testing the defect.
6. **Add the defect to `qa/KNOWN_FAILURE_MODES.md`** — match the file's existing entry
   format exactly (numbered heading with a one-line summary and status tag, "Found
   while," root cause, fix description, "Search performed for the same class," current
   status). If the defect isn't fixed yet, the entry still gets written — an honestly
   flagged open gap is real institutional knowledge; a silently-forgotten one is not.
7. **Fix it, if within your authority** (per the DB-push hard stop and every other
   fix-authority boundary already established for the dispatching agent).
8. **Re-run the entire scenario, not merely the failing assertion.** A fix that passes
   the one regression test but breaks something adjacent is not actually fixed.
9. **Only remove or downgrade a `KNOWN_FAILURE_MODES.md` entry after real runtime
   proof** — a code read is never sufficient grounds to mark something re-verified.
10. **Note anything reusable for next time** — a methodology trap, a gotcha, a pattern
    worth remembering — directly in the entry (this file's own `qa/KNOWN_FAILURE_MODES.md`
    already does this consistently, e.g. #21's `auth_user_id` vs `profile_id` mixup
    note).

## The standing rule this loop exists to serve

Do not solve only the specific bug reported. Treat every bug report as evidence of a
possible systemic failure class: reproduce on the real system → search the entire
architecture for the same design error → regression test for the class, not just the
instance → fix → re-verify → permanent record. This is CLAUDE.md's own final operating
principle, made concrete and reusable rather than left as prose everyone has to
remember to apply.
