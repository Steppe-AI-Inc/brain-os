# VERIFIER #47 — running findings (campaign 107, candidate bbc37ba)

Base commit: bbc37ba0eaff9f15d2fffe09513ce7b8482261f9
index.ts sha256 at start: db0aa63588d8b3f67d5c4bbba0b4bd9d6df97c03ef03685bbe564afc8fd78e63

## STEP 1 — provenance

- `qa/verification/scratch/v92/deployed/.../index.ts` (committed download artifact, 325682 B, CRLF)
  LF-normalises to **321370 B / sha256 795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc**
  which is **byte-identical to `git show c9dfab5bd433:supabase/functions/sem-ai-command/index.ts`**.
  `qa/verification/scratch/v92/index.v92.ts` is the same bytes (eol=lf attribute holds).
- **Provenance level this run: REPOSITORY-ARTIFACT-LEVEL, not byte-direct.** I could not execute
  `supabase functions list/download` myself — the harness approval gate blocked it in this
  non-interactive session. The "live download == these bytes" link is INHERITED from ledger #108 /
  verifiers #45 and #46, not re-measured by me. Stated plainly rather than overstated.
- The candidate's index.ts is 477857 B / 6004 CRLF lines; LF-normalised it is 6004 lines vs v92's
  4313 (+1691).

## V47-D1 (P1, INSTRUMENT) — the two-arm correction is itself incomplete: v92 has a THIRD prose arm

`qa/verification/lib/v92_reference.mjs` models `FUTURE_PROMISE_PATTERN` and
`PAST_COMPLETION_CLAIM_PATTERN`. Deployed v92 has a **third prose-driven overwrite of
`result.summary` on the same ungrounded turn**:

- `claimsLifecycleClaim()` — v92 index.v92.ts:441-448 — a pure prose test.
- fed by `claimsTaskDeleted` (:2667), `claimsCompanyDeleted` (:2973), `claimsPersonDeleted` (:3060),
  `claimsGoalDeleted` (:3135). Every gate on those is *empty id arrays* + `!modelProposedPendingAction`
  — exactly the ungrounded, `result.pendingAction === null` turn the whole campaign differential holds
  fixed. Nothing about them requires a resolved entity.
- they build `lifecycleMismatchCorrections` (:4095-4099), which **overwrites `result.summary` at
  :4174**, before the future/past arms even run.

Measured on my own corpus (664 rows): the third arm destroys **10 rows the two-arm model says v92
preserves**, and the two-arm model therefore **mis-counts 6 truthful rows as candidate truth
regressions when they are v92 parity** — including three ordinary product-help sentences
("Archiving a company does not delete its tasks.", "Restoring a company brings back its people as
well.", "Ending employment historicises the person's assignments.").

Truth regression on my corpus: **55 under the two-arm model → 49 under the three-arm model.**

Direction of the error, proved not assumed: `claimsLifecycleClaim`'s body and all four
`claims*Deleted` declarations are **byte-identical between v92 and the candidate** (t4_arm3_parity),
and over a generated 420-row lifecycle space there are **0** rows arm 3 kills that the candidate
preserves. So arm 3 can only ever remove truth regressions, never add fabrication regressions — the
one-directionality claim survives, but the magnitude in the record does not.

Witness that distinguishes arm 3 from both modelled arms: `"Deleting the task now."`
— `v92Destroys()` says PRESERVE, deployed v92 destroys it.

## STEP 2 Q2 — four quadrants, my own corpus, three-arm model

corpus 664 rows = 431 truthful / 233 fabrication (>=200 / >=150 required).

| | cand preserves | cand destroys |
|---|---|---|
| v92 preserves | 283 | 95 |
| v92 destroys | 63 | 223 |

- **TRUTH REGRESSION (truthful, v92 keeps, candidate destroys) = 49** — *all 49 in
  S6.conditioned-offer*, the disclosed product blocker. Nothing else.
- **FABRICATION REGRESSION (fabrication, v92 catches, candidate misses) = 0.**
- Candidate saves 63 truthful rows v92 destroys; catches 0 extra fabrications v92 misses on this
  corpus (v92's PAST arm is broad, so it already "catches" them — by destroying everything).
- Shared blind spot (NOT a regression): bare participle-initial `"Archived <Name>."` /
  `"I ended employment for <Name>."` — 37 rows neither v92 nor the candidate corrects.

## Entity signal is inert on a natural corpus

Populating `knownEntityNames` with all 40 corpus entity names changes **0 of 664** verdicts.
Truth regression 49 either way; fabrication regression 0 either way. The positive-only signal is
sound (absence never used) but it is not doing work outside the engineered class it was built for.
