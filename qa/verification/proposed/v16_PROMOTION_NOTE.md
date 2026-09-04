# Promotion note — verifier #16, campaign #76

Kept OUT of `v16_known_failure_modes_entry_76.md` on purpose: that file is a `## #76 — …`
ledger section and must paste into `qa/KNOWN_FAILURE_MODES.md` with no preamble.

## What to promote, and when

| artifact | promote to | when |
|---|---|---|
| `v16_known_failure_modes_entry_76.md` | append to `qa/KNOWN_FAILURE_MODES.md` | now — it is the campaign record whether or not the defects are fixed |
| `v16_regression_additions.mjs` | `qa/scenarios-runner/run16_defect_closure_contract.mjs` | **after** D123/D124/D125 are closed, with DEFECT expectations flipped to the fixed behaviour, exactly as run15 was promoted |

Do **not** promote the regression file into `qa/scenarios-runner/` while it still exits 1 —
that is the run15 pattern (a verifier's proposed file exits nonzero by design; the *closing*
session promotes it once green). It currently reports 14 pass / 36 fail, and every one of the
36 is an open defect reproducing on purpose. **0 CONTRACT failures** is the number that says
the file itself is sound.

## Verdict and deploy authority

**FAIL.** Production stays at v92. No deploy. `ALLOW_FUNCTIONS_DEPLOY` was never requested and
must not be, because an independent PASS on these exact bytes was not reached.

Note for whoever reads this next: the candidate is a **real improvement** over `d724d8c` on
every axis I measured — D117/D118 move both belt directions at once for the first time in the
#72–#75 sequence, D119 is a sound product decision that destroys no real name the database
knows, and D122 is genuinely closed. The FAIL is not "this made things worse". It is:
**D116 is reported CLOSED and is only NARROWED**, and the most natural founder self-correction
in the language — `"acme? no, the holdings one"` — still archives the wrong company.

## Fix guidance (for the closing session, not applied here)

* **D123** — do not extend the word list; that is the axis this very commit retires elsewhere.
  Two structural options, both better than more words:
  1. Dead-end whenever the reply contains **any** negator anywhere AND the matched option is
     not the only thing left after removing it — i.e. make ambiguity, not vocabulary, the test.
  2. Better: treat a single-match reply carrying a negator **anywhere in the reply** as
     ambiguous and fall through to the LLM. The measured cost is one round-trip on
     `acme, no rush` / `acme, nothing else` (currently the pinned LIMIT). Weigh a lost
     round-trip against a wrong archive; the ledger's own D116 reasoning says which wins.
  At minimum, the punctuation inversion (`acme - no` dead-ends, `acme, no` binds) must go —
  those two must not disagree.
* **D124** — one-line class of fix: make `canonicalKnowsIt` compare against the **same**
  fallback `displayName` actually produced, rather than recomputing a different one. Separately,
  `employee` must either be normalised to `person` before `displayName`/`canonicalById` lookup,
  or removed from `CLARIFICATION_ENTITY_ACTION_FIELD` — it is currently executable and
  unresolvable at the same time, which is the worst combination.
* **D125** — add en dash, em dash, colon, newline and the parenthesis characters to the
  `readsAsCompletion` clause splitter. Do **not** add "and": that would re-split legitimate
  compound truthful negatives. Re-measure both directions on the #76 corpora before accepting.
* **D126** — the run15 `renderLabel` helper must be extended to drive the whole gating block
  (label loop + drop + numbering), and a MIXED-list case added. `v16_regression_additions.mjs`
  already contains a working extraction of the full block that can be lifted wholesale.

## Reproduce anything here

```
node qa/verification/scratch/v16_battery.mjs             # 27 suites, parsed from output text
node qa/verification/scratch/v16_s0_matcher_attack.mjs   # D123, both directions, vs d724d8c
node qa/verification/scratch/v16_s3_belt_attack.mjs      # D125 + the both-directions belt table
node qa/verification/scratch/v16_s4_s8_drop_attack.mjs   # D124 + the founder lexical-branch scenario
node qa/verification/scratch/v16_s7_question_belt.mjs    # question belt unchanged, both directions
node qa/verification/scratch/v16_mutations.mjs           # 14 mutations
node qa/verification/scratch/v16_mutations2.mjs          # 6 more, with validity/drift-guard discrimination
node qa/verification/proposed/v16_regression_additions.mjs
```

`qa/verification/scratch/baseline_d724d8c_index.ts` is `git show d724d8c:…/index.ts`, kept so
every comparison in the entry is re-runnable. The mutation harnesses restore
`supabase/functions/sem-ai-command/index.ts` byte-identically and abort loudly if the sha256
is not `0c3616b4e82b53f18e0b597aa0fe935b4c0bed1dcae86fbc9d4c59b91812fc26` before and after.

## Coverage gaps in this run — stated, not hidden

* **`*.sql` suites not run.** DB / RLS / archive-restore-ownership lifecycle truth is
  **BLOCKED — out of scope** for campaign #76, which is a source-level Edge Function campaign.
  Nothing here says anything about `archive_company` / `restore_task` / `archive_goal`
  behaviour in the database.
* **No browser.** UI truth and live AI-chat truth were not exercised — no
  `mcp__claude-in-chrome__*` tooling was used in this run. Those checks are **BLOCKED**, not
  silently skipped. Every AI-behaviour finding above is from the real shipped source driven
  directly, which is strictly weaker evidence than a live chat turn.
* **Production is v92** and none of this code is live, so no finding here is `LIVE VERIFIED`.
  The correct evidence level for the whole campaign is **UNIT VERIFIED / CODE INSPECTED**
  against the candidate bytes, plus **LIVE VERIFIED** for the one read-only production
  function-version check.
* **No synthetic `QA-VERIFY-*` data was created**, because no database writes were performed.
  There is nothing to clean up.
