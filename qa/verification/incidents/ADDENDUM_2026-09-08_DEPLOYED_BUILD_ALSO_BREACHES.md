# Addendum to INCIDENT_2026-09-08_TOKEN_PREFLIGHT_413 — the rollback did not make production safe

**Date:** 2026-09-08 · **Author:** Home-PC implementing session · **Status:** measured, source-level only,
**not** confirmed by a live request · **Independent judgement:** referred to verifier #60 (campaign #120),
which was asked to confirm or refute this before it was written.

## The claim

Rolling back to v92 source removed the *regression* and did not remove the *defect*. The deployed build has
no budget-aware pack assembly: it assembles the pack, estimates it, and returns HTTP 413 with no answer
whenever the estimate exceeds 12,000 tokens. Nothing bounds the pack's growth, so the deployed build breaches
its own preflight once a workspace is large enough — v93 merely reached that point sooner by adding roughly
1,772 tokens.

## The measurement

`qa/verification/scratch/p1/measure_v92_pack.mjs` builds the deployed source's own pack literal, saturated at
each collection's own `.limit(N)`, with the deployed estimator verbatim
(`Math.ceil(JSON.stringify({command, contextPack}).length / 4)`). The deployed source used is the copy
downloaded from production for the byte comparison, sha256 `795c20c8…`.

| Saturated workspace | Estimate | Hard max | Result |
|---|---|---|---|
| short names, no channel history | 17,038 | 12,000 | HARD STOP (413) |
| short names, history at its cap | 17,166 | 12,000 | HARD STOP (413) |
| long names, history at its cap | 25,970 | 12,000 | HARD STOP (413) |

Largest contributors at the caps: person assignments (1,718), people (1,356), company relationships (1,098),
financial reports (1,091), sales leads (1,008), tasks (997).

## How close production actually is today

Saturation is not the founder's current workspace: every collection would have to be at its cap at once.
The distance is measurable from the incident itself rather than estimated. The live v93 failure measured
**12,340** tokens on a brand-new empty channel, and the v93 pack was measured at roughly **1,772** tokens
larger than v92's. The same workspace on the deployed build therefore sits near **10,570** tokens, about
**1,430 below the hard stop**.

That margin is consumed by ordinary growth: roughly twenty more people, or one more populated company, or a
handful of person assignments. There is no warning before it happens and no degraded mode — the turn returns
an error and no answer.

## What this changes

1. **The candidate is a production fix, not only a regression fix.** The budget-aware assembly is what stops
   an ordinary question from becoming a hard stop, on any build. Deploying it removes a defect that exists in
   production right now; leaving it undeployed leaves that defect in place.
2. **Ledger #133 is corrected.** It records the failure class as introduced by v93. The class is
   unbounded pack growth against a fixed whole-request cap, present in v92 and reached first by v93.
3. **This is source-level evidence only.** Per the rule recorded in `CLAUDE.md` §6 this round, static
   verification cannot substitute for live request-shape acceptance. The 17,038 figure has not been produced
   by a real request. What has been observed live is the 12,340 measurement in the incident record.

## Not done here

No production request was made, no credential was used, and the candidate source was not modified — verifier
#60 is running against frozen bytes (`1a1efbb`, index.ts sha256 `8e9f14e0…`) and any source change would void
its certification.
