# Promotion note — verifier #13, campaign #73 (THIS FILE IS NOT LEDGER CONTENT)

Kept in a SEPARATE file on purpose. The #71 promotion pasted its own `# PROPOSED entry …`
preamble into `qa/KNOWN_FAILURE_MODES.md` (recorded as #12/D97). The #72 promotion tried to
strip that class and re-committed it with a worse cut: `qa/KNOWN_FAILURE_MODES.md:6931` now
reads ``## #72 …` section below**,`` followed by four lines of #12's own promotion note,
creating a duplicate `## #72` heading — while the `ace9b6a` commit message asserts "#72 was
appended preamble-stripped". Recorded this campaign as D104.

A note that lives inside the file being promoted can be mis-cut. A note that lives in a
different file cannot. So:

* `qa/verification/proposed/v13_known_failure_modes_entry_73.md` contains **ledger content
  only**, starting at its `## #73` heading and containing nothing else. `cat` it onto the
  end of `qa/KNOWN_FAILURE_MODES.md` — there is nothing to strip.
* Also delete `qa/KNOWN_FAILURE_MODES.md` lines 6931-6937 (the mangled `## #72 …` heading,
  the four quoted lines, and the stray `---`) in the same pass. Entry #72's real heading is
  at line 6939 and is correct.

## Other promotion items

1. `qa/verification/proposed/v13_regression_additions.mjs` →
   `qa/scenarios-runner/run13_defect_closure_contract.mjs`, **keeping the exit guard**
   (`if (fail > 0) process.exit(1)`, no kind-based carve-out). On `ace9b6a` it reports
   `12 pass, 47 fail (47 open #73 defects reproduce; 0 CONTRACT failures)`. Expectations are
   written as the FIXED behaviour, so the DEFECT rows go green as the fixes land; the
   CONTRACT rows must stay green throughout.
2. `qa/verification/proposed/v13_fixes.patch.md` — two validated hunks (FIX-3b, FIX-1+2),
   neither needing a DB push, both leaving the committed battery at 561/561.
3. `qa/verification/SESSION_CHECKPOINT.md` — the D96 line is genuinely fixed and its
   four-migration claim is now live-verified true, but the rest of the file is three
   campaigns stale (D105): the "Updated:" date, the #10/65ade7c certification pin, the
   line describing `CURRENT_CAMPAIGN.json` as "verifier #10 campaign record", and the
   NEXT-ACTIONS block that still dispatches verifier #11 against `66fa821d…`.
