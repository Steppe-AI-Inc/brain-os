# PROPOSED entry for `qa/KNOWN_FAILURE_MODES.md` — verifier #12, campaign #72

> **Promotion note (do not paste this header into the ledger).** This campaign's write
> authority is `qa/verification/**` only. Append **only the `## #72 …` section below**,
> verbatim, after entry #71 — the #71 promotion accidentally pasted its own
> `# PROPOSED entry …` preamble into `qa/KNOWN_FAILURE_MODES.md` (now line 6710), so the
> canonical ledger currently contains an instruction-to-self claiming the entry is
> "PROPOSED" and lives elsewhere. Worth cleaning up in the same pass.

---

## #72 — f4763ef (run11 D85–D89 closure) verified by #12 (fully executed): DO NOT DEPLOY — one P1 regression, two P2 regressions, one guard still decorative

Verifier #12, campaign #72, base `f4763ef`, `index.ts` sha256
`1db38579…b369ec` (asserted before the run, re-asserted after every mutation and after
every temporary edit; the working tree is byte-identical to the commit). Independently
executed: the full 22-suite battery (491 checks, all exit 0), 11 source mutations, an
A/B differential against the prior certified SHA `fdb4564`, an executable attack harness
over the real gate slice and the real `matchDisambiguationOption`, and a production
read-only check (`sem-ai-command` v92 ACTIVE, `ezbr_sha256` `33255b31…fe475`,
`updated_at` 1788239725518 — unchanged; zero writes).

**What f4763ef genuinely closed** — verified by mutation, not by reading the commit
message. All five run11 defects have real, load-bearing fixes: killing any of the D86
position rule, the D86 leading-participle rule, the shared `PROGRESS_VERBS` list reaching
arm 3, the D88 comma-clause reduction, the D88 belt, the shared callback-arrow strip in
`_gate_extract.mjs`, or the ordering anchor turns the battery red. The 18 reproducing
cases from #11 are closed and the promoted suite's exit guard is genuinely hardened
(`if (fail > 0) process.exit(1)`, no kind-based carve-out). D89 is closed: all four
prepared migrations really are on branch `master` (`git log master -- supabase/migrations/`
confirms `202609020001`, `202609020002`, `202609020003`, `202609030001`).

**But the closure introduced two regressions and left one guard decorative.** On the
shapes measured, `f4763ef` is *not* strictly better than `fdb4564` — which is the standard
#11 used to open the previous gate.

### D92 (P1, REGRESSION) — the D88 belt destroys 60% of legitimate clarification questions

`if (COMPLETION_WORD.test(q)) return null;` (index.ts:4762) drops any question that
*mentions* completion vocabulary rather than one that *asserts* a completion. Measured
**12 of 20** realistic clarifications silently removed, including `"Who should the task be
assigned to?"` and `"Which archived company did you mean?"`. A/B: all survive on
`fdb4564`, all return `[]` on `f4763ef`. It fires on **ordinary turns**, not only
correction turns (`result.questions = envelopeQuestions`, 4986), and nulls
`pendingAction.question` (4962) while the action payload stays armed — the exact run10/D84
shape the same closure cites as *"worse than what it prevented"*. On correction turns
`envelopeQuestions` is spliced straight into founder-facing text (5193/5194), so the
founder gets the correction preamble and no question at all.

The blanket test is load-bearing for exactly **one** committed case
(`D88.single-letter-shield`, `"I archived ACME B. ok?"`) — verified by neutralising it and
observing the single resulting failure. Fix prepared, validated, and rollback-trivial:
`qa/verification/proposed/v12_d92_fix.patch.md` (battery stays 22/22 green, drops go
12/22 → 0/22, leaks stay 0/10).

### D93 (P2, REGRESSION) — real company names became unselectable in disambiguation

A genuine name carrying a completion word in a **non-leading** position now fails the D86
position rule, is refused, and is replaced by the *quoted* canonical label
(`“Advanced Closed Systems”`). `matchDisambiguationOption` (412–420) matches by
`normalizedCommand.includes(label.toLowerCase())`, so a founder typing the plain name does
**not** match — executed against the real matcher: NOT SELECTABLE. `web/` contains zero
references to `pendingAction`, so typing is the only selection route. Affected and
A/B-confirmed-new: `Advanced Closed Systems`, `Closed Loop AG`, `Closed Loop BV`,
`Closed Loop LLC`, `Closed Loop Systems UK`, `Global Closed Loop`, `First Closed Circuit`,
`Applied Closed Systems`, `Blue Closed Systems`, `Open Closed Design`. This is the run9/D72
dead-ended-disambiguation class via a new route.

### D90 (P2, NINTH recurrence of the vacuous-guard class) — the Title-Case gate is unobserved

Neutralising `if (!titleCasedName) return null;` (4802) leaves all 22 suites exit 0, yet it
changes behaviour on 8 of 10 probed inputs. The D86 POSITION rule does **not** subsume it:
an all-lowercase assertion label (`"deleted acme"`, `"removed all people"`) has
`completionIdx === 0` and no ALL-CAPS token after it, so both position checks pass and only
the Title-Case gate refuses it. Product code correct; guard decorative. Ninth appearance
of the class (#61/D2, #63/D10, #63/D12, #64/D19, #67, #70, #71/D85). Contract rows added.

### D91 (P2, PRE-EXISTING) — D86 is narrowed, not closed

A Title-Cased **leading** participle with a Title-Case (not ALL-CAPS) object still passes:
17 assertion labels accepted verbatim and rendered under `"Options: …"`, replaying as
`"Confirmed — <assertion>"` — `"Deleted The Project"`, `"Archived Everything"`,
`"Removed All People"`, `"Completed The Migration"`, `"Closed All Accounts"`, and 12 more.
The closure's stated safety net does not apply here: **the derived-canonical fallback only
fires on refusal**, and these are accepted. Also present on `fdb4564`, so not a regression
— but "D86 closed" is overstated.

### D94 (P3, PRE-EXISTING) — D87's progressive vocabulary residual is undisclosed

Escaping uncorrected with no claims and no evidence: passive voice (`"ACME is being
archived."`, `"The company is being deleted right now."`, `"ACME is getting archived."`),
`"about to"`, `"in the process of"`, `"kicking off"`, `"going ahead and"`, `"proceeding
to"`, `"starting the archive of"`, `"let me archive"`, `"as we speak"`, and any non-English
phrasing. Identical on `fdb4564` — run11 strictly *improved* coverage — but the closure
text says "closed" without naming the residual. Passive voice is the notable structural
gap: no arm handles `<subject> is being <verb>ed`.

### D95 (P3) — two out-of-context options collapse to the same label

When neither option's entity is in `contextPack`, both refused labels fall back to the
typed reference `"the company"`; `matchDisambiguationOption` then sees two matches and
returns `null`. The committed D79 control only covers the in-`contextPack` case.

### D96 (P3, bookkeeping) — the D89 correction is right about the branch, wrong about the worktree commit

`SESSION_CHECKPOINT.md` line 20 pins the master worktree at `12191e8`, and lines 22–27
claim all four prepared migrations live there, with line 28 instructing that any DB
verifier be dispatched against that worktree. Verified: `202609020001`, `202609020002`,
`202609020003` exist at `12191e8`; **`202609030001_agent_run_capacity_retry.sql` does
not** — it landed with `2e3445c`, two commits later. A verifier following line 28 without
pulling finds three of four. Lines 18 and 31 are also stale (they still name #10's
certification SHA `65ade7c` and describe `CURRENT_CAMPAIGN.json` as #10's record).

### Verified accurate in the #71 closure postscript

- "all 18 reproducing cases closed" — confirmed, `run11_defect_closure_contract` is 46/46.
- "exit guard hardened" — confirmed, no kind-based carve-out remains.
- "D85 root causes both fixed at source" — confirmed by mutation (both the shared
  callback-arrow strip and the ordering anchor guard are load-bearing).
- The **equivalent-mutant disclosure is honest and the classification is CONFIRMED**, with
  one correction: removing `iCtx >= 0 && iPending >= 0` is unobservable *only because*
  `run11_defect_closure_contract`'s `V11.order.failClosed` carries a duplicate existence
  check. Proof — mutating the anchor **and** the guard together (#12's M9) is killed by
  `run11_defect_closure_contract` alone; `current_turn_and_continuity_contract` does not
  kill it. The fail-open is real; redundancy in a second suite is what makes the single
  mutation equivalent. "Future-proofing, not present coverage" understates it slightly.
- `f4763ef`'s `web/` + `scripts/` portion (48 of its 118 changed files) is **byte-identical
  to branch `master`** — an undisclosed master catch-up folded into a commit whose message
  describes only the D85–D89 closure. Not fabricated work, but the commit message does not
  account for 833 of its changed lines.

### Scope of this verification

Source-level and executable-logic level on the exact SHA, plus a production read-only
check. **NOT covered:** no database access was exercised, no browser/UI tooling was
available, and no live AI chat turn was run — so live UI truth, live AI-chat truth and
live RLS behaviour are **BLOCKED, not verified**. `qa/verification/proposed/v12_regression_additions.mjs`
reproduces all 46 defect rows with 0 CONTRACT failures.
