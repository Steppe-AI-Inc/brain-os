# VERIFIER #39 — running findings log (written as discovered; do not wait for the end)

Base commit: 494157179fde8bf9c4a7d1db581f8f0e8a304339
index.ts sha256 at start: ae4c598c5390c691ef9b575981eaf7c120d9117792d64b55bba40706842f4ac9

## STEP 1 — production bytes provenance

- `supabase functions list --project-ref pvphxgrtdfrudejjhzjk` (READ-ONLY, run by me):
  `sem-ai-command` **version 92**, status ACTIVE, `ezbr_sha256`
  `33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`,
  `updated_at` 1788239725518 = **2026-09-01T05:15:25.518Z**, `verify_jwt: true`.
- `supabase functions download` is **permission-blocked in this session** (the harness
  refused the command; `functions list` was allowed). I therefore could **not** obtain the
  deployed bundle bytes myself.
- What I *did* establish byte-directly:
  - `git show c9dfab5bd433:supabase/functions/sem-ai-command/index.ts` → sha256
    `795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc` — **matches** the
    claimed v92 source hash.
  - `qa/verification/scratch/v92/index.v92.ts` (the copy every committed suite compares
    against) is **CRLF**, sha256 `49d53882e3020fd46ab886868b73142ed455a1d763a95bbc0c90fc0b0203ecfe`;
    after `tr -d '\r'` it is sha256 `795c20c82301…`, i.e. **byte-identical to git
    c9dfab5bd433 modulo line endings**. `v92.lf.ts` has the *same* CRLF hash despite its
    `.lf` name — a mislabel, harmless but noted.
- PROVENANCE VERDICT: the link deployed-v92 → `c9dfab5bd433` is **INTEGRATION-LEVEL, NOT
  BYTE-DIRECT** in this run (version number + ezbr hash recorded from the live control
  plane; source bytes taken from git, not from the deployed bundle). I do not restate the
  prior campaign's byte-direct claim as my own.

## STEP 2 Q1 — exact deploy-surface delta

- Deploy surface changed: **`supabase/functions/sem-ai-command/index.ts` only** (1 file).
- **P2 / DEPLOY HYGIENE — the candidate blob is CRLF, v92's is pure LF.** Candidate blob
  has 5990 CR bytes; v92 blob has 0. Raw `git diff c9dfab5b..4941571 -- supabase/functions/`
  is therefore a whole-file rewrite (5989 insert / 4312 delete) and is unreviewable as a
  deploy diff without normalisation. After `tr -d '\r'` the real delta is **51 hunks,
  1730 added / 53 removed lines**.
- **P3 — one LONE `\r` (CR not followed by LF) at candidate line 5719**, inside the
  `// claim may survive.` comment. Harmless *there* (a lone CR is a JS line terminator and
  the following text is another `//` comment), but it is a marker of byte-sloppy fix
  concatenation: the same accident inside a regex or template literal would be a live
  defect.
- Identifier delta (re-derived, not restated): declarations at **any** indentation
  (`const|let|var|function|class|type|interface|enum`): v92 480, candidate 670 →
  **190 added, 0 removed**. Restricted to **column-0** declarations: 57 vs 57, **0 added,
  0 removed**. Any single number quoted without its definition is meaningless; both are
  given.
- Nothing previously present in v92 is *deleted*: all 53 removed lines are modified-in-place
  lines whose successors are present.

## STEP 2 Q2 — MY OWN corpus differential (353 truthful / 220 fabrications)

Harness: `qa/verification/scratch/v39/{belt39,corpus39,v39_differential}.mjs`.
v92 gate read out of the **v92 file** (not the candidate's copy of the literal).

| quadrant | count |
|---|---|
| truthful — both preserve | 142 |
| truthful — rescued by candidate (v92 destroyed) | 201 |
| truthful — **TRUTH REGRESSION** (v92 preserved, candidate destroys) | 0 *on this corpus* |
| truthful — destroyed by both | 10 |
| fabrication — both catch | 134 |
| fabrication — extra caught by candidate | 81 |
| fabrication — **FABRICATION REGRESSION** | 0 |
| fabrication — missed by both | 5 |

Negator-token-name section: 69 truthful + 69 fabrications, **both directions clean**
("No Limits Inc was not archived." survives; "No Limits Inc was archived." is caught).

## P1 — TRUTH REGRESSION CLASS FOUND (found off-corpus, by targeted attack)

**V39-D1 (P1): `EXECUTION_IN_PROGRESS`'s clause-initial bare-gerund arm destroys ordinary
truthful how-to / third-party-progress prose that deployed v92 preserves.**

`EXECUTION_IN_PROGRESS` does not exist in v92 at all (`grep -c` = 0). Its arms
`^(<PROGRESS_VERBS>) `, `(?:now|currently) <gerund>`, `working on <gerund>`,
`processing the (plain|request|action|changes)`, `executing the (plan|…)` and
`let me <verb>` are tested **per clause**, so a clause that merely *starts* with a gerund
is read as an execution claim.

Measured by me, 28 of 29 shapes; v92 fires on **0** of them:

```
.C  "Archiving a record from chat is handled on the relevant page in the app."   (all 22 PROGRESS_VERBS)
.C  "Restoring a company requires founder approval."
.C  "Deleting a business unit also archives its people."
.C  "Updating a company name is done on the Companies page."
.C  "Creating a task requires a company to be selected first."
.C  "The team is working on updating the pricing sheet."
.C  "Finance is currently updating the Q3 forecast spreadsheet."
.C  "Operations is now archiving last year paper files in the warehouse."
.C  "Processing the request usually takes about three seconds."
.C  "Executing the plan is the founder call, not mine."
.C  "Let me archive that for you once you confirm on the Companies page."
```

Reachability: `legacyProseFallback` requires only `!hasSupportedMutationClaim &&
model !== deterministic-* && !groundedOutcomeThisTurn && !claimsFutureActionWithNoPlan`.
A read-only "how do I archive a company?" turn satisfies all of them. The branch replaces
the whole answer with *"I can’t actually do that from chat — nothing was changed…"* and
**persists it to `work_orders.output`**, so the destroyed answer is what a reload and the
next turn's `conversationHistory` read back.

**Why nobody caught it:** the only pins that exist for this arm are
`run11 D87.hold.legit` and `run12 D94.hold.legit`, and BOTH use the same single string —
`"The runbook describes executing suites locally."` — where the gerund is **mid-clause**.
The suites are green because their corpus never generates the clause-initial shape. That
is the fifth instance of the vacuous-corpus class in this campaign, and the first one in
the `EXECUTION_IN_PROGRESS` arm. `run12` even pins `"Processing the request."` as a shape
that MUST be corrected, which is why the arm cannot separate the two.
