# PROPOSED entry for qa/KNOWN_FAILURE_MODES.md — verifier #11, campaign #71

(Placed under `qa/verification/proposed/` because this campaign's write authority is
`qa/verification/**` only. Same convention as `v10_known_failure_modes_entry_70.md`.
Append verbatim after entry #70.)

---

## #71 — fdb4564 (run10 closure + off-by-one/continuity/durable runtime) verified by #11 (fully executed): DEPLOY GATE OPEN — zero regressions, three PRE-EXISTING gaps newly demonstrated

Verifier #11, campaign #71, base `fdb4564`, `index.ts` sha256
`66fa821d…c13ddded` (re-asserted before and after every run; every mutation restored
from the original bytes and sha-verified — the working tree is byte-identical to the
commit). Attempt 1 was PROVIDER_CAPACITY_BLOCKED after the baseline only; attempt 2 ran
all five scenarios. Independently executed: the full 21-suite battery (445 checks, all
exit 0), 33 source mutations, 3 seam-attack harnesses, and a production read-only check
(sem-ai-command v92 ACTIVE, `ezbr_sha256` `33255b31…fe475`, `updated_at`
1788239725518 — byte-for-byte the fingerprint #10 recorded; zero writes).

**What fdb4564 genuinely closed** — verified by A/B against the prior certified SHA
(`qa/verification/scratch/v11a_ab_prior_sha.mjs`), not by reading the commit message:

| shape | 65ade7c | fdb4564 |
|---|---|---|
| D77 `"I archived ACME. ok?"` | escapes whole | cut to `"ok?"` |
| D83 `"ACME deleted, ok? Next?"` | escapes whole | cut to `"Next?"` |
| D78 option label `"ACME deleted"` | accepted verbatim | refused → derived canonical |
| E-multi `"Executing the plan…"` | ships | corrected |

D79 (quoted identity), D80 (flag), D81 (truthful history), D84 (imperative summaries)
likewise verified closed, each by killing a mutation of its guard. **On every shape
measured, fdb4564 is strictly better than 65ade7c and strictly better than deployed v92;
no measured shape regressed.** That is the basis of the OPEN gate.

### D85 (P2, EIGHTH recurrence of the missing-coverage class) — 7 of 33 guard mutations survived the entire committed battery

Mutating the real source and running every committed suite: 26 mutants killed, **7
survived with the whole battery still exiting 0**. The product code is CORRECT in all
seven cases; the *guards* are decorative. Same class as #61/D2, #63/D10, #63/D12,
#64/D19, #67, #70 — this is its eighth appearance and it recurred *in the same commit
that fixed the previous one*.

- **`historyWindowStart` off-by-one** and **`historyIsComplete` inverted** survive
  because `current_turn_and_continuity_contract.mjs` **reimplements the turn math in its
  own `compute()` helper** (lines 64-77) instead of executing the source. The suite
  written specifically to pin the off-by-one cannot fail when the off-by-one is
  reintroduced. Root cause is mechanical, not careless: the shared stripper in
  `_gate_extract.mjs` cannot strip an inline callback arrow (`.map((r: any, idx: number)
  => …)`), which is exactly the shape the real expression uses — so executing it was
  impossible and the author reimplemented instead.
- **The `buildContext` / `create_pending_work_order` ordering check is FAIL-OPEN**: it
  compares two `indexOf` results without asserting either anchor exists, so `-1 < n` is
  true. Renaming or inlining either call site turns the check permanently green.
- **The durable reader's `pending_action_source_work_order_id` requirement** is unpinned:
  a FOREIGN-source pending action becoming bindable by a bare "yes" survives.
- **`structuredProseDrift` (the D68/D81 arm) is entirely unpinned**: every committed case
  that touches it is also satisfied by another arm, so forcing it `false` — which
  re-opens D68 — survives. Same for the progressive vocabulary on the structured arm.
- **The `'…'` terminator** survives deletion because the committed `R10.term.…` case uses
  an aux-shaped assertion the `PAST_COMPLETION` belt catches anyway; the case passes for
  a reason unrelated to the guard it names.

**Regression test added:** `qa/verification/proposed/v11_regression_additions.mjs` — 26
CONTRACT cases that execute the REAL continuity block, the REAL durable reader and the
REAL gate slice. Proven non-decorative: re-applying all 7 surviving mutants,
**7/7 now exit 1 on the new suite while 7/7 still exit 0 on the committed suites**
(`qa/verification/scratch/v11a_mutation_report3_new_suite.json`). On promotion, fold the
callback-arrow strip into `_gate_extract.mjs` so the next author is not forced to
reimplement.

### D86 (P2, PRE-EXISTING — not a regression) — the Title-Case name-shape discriminator is defeated by capitalising one letter

`safeOptionLabel` refuses a completion-vocabulary label UNLESS it is Title-Cased
throughout (so `"Closed Loop Systems"` survives). Every committed D78 case is a lowercase
participle. Title-casing the identical assertion makes it an accepted, persisted option
label: `"ACME Deleted"`, `"ACME Archived"`, `"Project Completed"`, `"ACME Deleted
Everything"` and the participle-LED `"Deleted ACME"` all render under "Options:" verbatim.
Labels are model-authored, so this is a one-character bypass of the D78 fix.

Confirmed PRE-EXISTING: `"ACME Deleted"` is accepted identically on 65ade7c. Aux-shaped
labels (`"ACME Was Archived"`) still correctly fall back to the derived canonical, and the
D72/D79 controls still hold — so the safe fallback path already exists and is cheap to
reach. Suggested narrowing (NOT applied — no source-write authority this campaign): refuse
a completion-vocabulary label when a safe DERIVED canonical reference is available, and/or
refuse participle-LED labels outright. Do not close this by re-blanketing — that re-opens
D72/D79.

### D87 (P3, PRE-EXISTING) — `EXECUTION_IN_PROGRESS` arm 3 carries a strict subset of arm 2's verb list

`now (?:assigning|reassigning|updating|creating|moving|archiving|restoring|deleting)`
omits `removing|ending|renaming|closing|clearing|granting|declining`, all of which arm 2
(`i['’]?m (?:now )?…`) does carry. So `"Confirmed. Now removing ACME."` ships while
`"Confirmed. I'm now removing ACME."` is corrected — same claim, same turn, different
outcome, for no stated reason. An omission, not a disclosed lexical limit.

### D88 (P2, PRE-EXISTING, same class as run8/D61 and run10/D77+D83) — an assertion with NO terminator before a trailing short question survives whole

The structural cut only fires on a terminator; the `PAST_COMPLETION_CLAIM_PATTERN` belt
behind it only catches AUX shapes (`has been|have been|was|were` + participle) or
`X successfully`. A simple-past or participle-led assertion with only a comma before the
trailing question therefore reaches founder-facing text intact:

```
"I archived ACME, ok?"              -> ships whole
"ACME deleted everything, ok?"      -> ships whole
"Deleted ACME and its tasks, ok?"   -> ships whole
"I removed 3 people from ACME, ok?" -> ships whole
```

The rendered reply is self-contradictory — the correction preamble says *"I can't confirm
from this turn's execution record that the company was archived."* and is then followed by
*"I archived ACME, ok?"*.

**The `KNOWN_ABBREVIATION` list is NOT the cause.** `"ACME Inc. deleted everything, ok?"`
and `"I archived ACME B. ok?"` escape, but so do the identical shapes with no period at
all — the abbreviation merely removes the only terminator that would otherwise have cut.
Confirmed PRE-EXISTING (identical on 65ade7c). D70/D70b controls and plain clarification
questions still survive whole, so any fix must keep those green.

**The pattern worth naming:** D61, D77, D83 and now D88 are the same defect closed three
times for three different punctuation marks. The class — *a declarative assertion riding
in front of a short trailing question* — is still open, and closing D88 by adding "comma"
to the terminator set would be the fourth instance of the same whack-a-mole rather than a
class fix. Per CLAUDE.md §13, the durable fix is structural (require the surviving
fragment to be interrogative-shaped, rather than enumerating what precedes it).

### D89 (P2, bookkeeping) — three migrations are recorded as "PREPARED NOT PUSHED" but no migration file exists

`qa/verification/SESSION_CHECKPOINT.md` line 22 states: *"Migrations PREPARED NOT PUSHED:
202609020001 (channel state), 202609020002 (clear-manager), 202609020003 (messaging
foundation)."* `supabase/migrations/` contains nothing dated 2026-09-02 — the newest file
is `202609010002`. A repo-wide search finds `chat_channel_state` **only** inside
`index.ts`. "PREPARED" in this repo has always meant *a reviewable file exists that was
rollback-tested*; here there is nothing for the founder or a DB verifier to review, while
the checkpoint's "NEXT EXECUTABLE ACTIONS" step 1 dispatches a DB/security verifier at
those three migrations. Runtime impact: none — the durable path is feature-gated and
fail-closed (`catch → null`), so deploying `index.ts` without the table is byte-identical
to today's behaviour. Bookkeeping impact: real.

### CLEARED — the whole-file rewrite in 4de63e4 is an EOL normalization and hides nothing

Verifier #11 attempt 1 flagged that 4de63e4's raw diff of `index.ts` rewrites all 5,079
lines while `--ignore-space-at-eol` shows +110/-10. Resolved:

- `65ade7c` was **pure LF** (0 CRLF / 5,079 LF). `4de63e4` is **pure CRLF** (5,179 CRLF /
  0 bare LF) plus **one lone CR** at line 5032 (a comment-join artifact of a node-based
  edit, between two `//` comments). `fdb4564` is the same shape. The implementation
  session's node-based edits on Windows rewrote the file CRLF.
- **Nothing is hidden in the churn.** Normalizing all three revisions to LF and diffing as
  a line multiset gives 65ade7c→4de63e4 = 10 removed / 111 added and 4de63e4→fdb4564 = 4
  removed / 127 added, matching the disclosed `--ignore-space-at-eol` figures. All 14
  lines removed across both commits were individually reviewed and every one is accounted
  for by a disclosed change (old inverted abbreviation guard, old terminator set without
  `?`, old `PAST_COMPLETION` label collapse, old blanket `COMPLETION_WORD` pending-summary
  refusal, old `structuredProseDrift`, old `pack = { command, … }`, old un-numbered
  `conversationHistory`). **No undisclosed removal** — the check that would have caught
  run9's silent D78 removal was run, and it is clean.
- **Behaviourally irrelevant for Deno**: CRLF and a lone CR are both ECMAScript line
  terminators, both sides of the lone CR are comments, and ECMAScript normalizes CRLF/CR
  to LF inside template literals, so the system-prompt text sent to the model is
  unchanged.
- **Two real costs, neither a deploy blocker.** (1) The post-deploy byte-verification step
  (`functions download` + diff) will report every line as differing if the platform
  returns LF — a `diff --strip-trailing-cr`, or normalizing both sides, is required, or a
  real difference could be waved away as "just line endings". (2) `git diff`/`blame` on
  the most security-sensitive file in the repo was destroyed for one commit. Recommended:
  add `.gitattributes` with `supabase/functions/** text eol=lf` so the EOL cannot flip
  again (there is no `.gitattributes` today).

### Bookkeeping verified accurate

- #70's closure postscript matches what the source actually does on every claim checked by
  mutation. One phrase to tighten: "never accept" reads as absolute but the Title-Case
  allowance does accept (see D86).
- The promotion of #10's case file into `run10_defect_closure_contract.mjs` is honest — a
  line-level diff against the preserved original shows exactly ONE changed expectation
  (`D79.taskTitle`, bare → quoted), disclosed in the file header; three EMULTI cases added;
  the exit guard restored. No other expectation was weakened.
- Both QA-tooling fixes are real and land in 4de63e4: regex-literal skipping in
  `_gate_extract.mjs` (`git log -S` confirms first appearance) and the restored exit guard.
  Every non-superseded suite was audited for a genuine nonzero-exit-on-failure path.
- The 5 suites that print "SUPERSEDED" with zero checks were superseded at `c0b6fc0`
  (2026-09-01), which **predates** the commits under test — not neutered by this work.
- `pack.command` really has no consumer anywhere in `functions/` or `web/`
  (independently grep-verified; the commit message's claim holds).
- Stale comment: `run10_defect_closure_contract.mjs` line 7 still says "NOT yet in
  qa/scenarios-runner/" although that is now its own path.

### Scope of this verification

Source-level and executable-logic level, on the exact SHA. **NOT covered:** no database
access was granted this session, no browser/UI tooling was available, and production was
strictly read-only — so live UI truth, live AI-chat truth and live RLS behaviour are
**BLOCKED, not verified**, and the durable channel-state runtime is verified only through
its extracted reader/writer logic against stubbed rows (the table does not exist in
production and no migration for it exists in the repo — see D89). The Work-PC live retest
list remains the required post-deploy step.
