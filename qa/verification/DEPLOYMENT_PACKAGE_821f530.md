# Production deployment package — Edge candidate 821f530 (frozen)

Prepared 2026-09-08 after verifier #59 (campaign #119) returned **PASS — EDGE STATUS = DEPLOYMENT READY (contract
bar)**. Nothing in this package is deployed. Deployment is a founder-only action taken through the single question
`ALLOW_FUNCTIONS_DEPLOY=1?` (`CLAUDE.md` §8). No verifier #60 is launched on this candidate; any further source
modification invalidates #59's certification and would require a fresh verifier.

## 1. Exact artifact

| Item | Value |
|---|---|
| Certified candidate commit | `821f5308a0ce9c9d624c6139ee65e25b37c4b35f` (branch `p1/execution-truth-governance`, 2026-09-08 01:36 +0800) |
| Deploy surface | exactly `supabase/functions/sem-ai-command/index.ts` (imports identical to v92; `_shared/*` not imported) |
| Edge source sha256 | `715246f3be9710b74193529ce9c07d44a6f3ad3739f132b6216ac04e8f519aa9` (539,535 B, CRLF-pure, 0 bare LF) |
| Branch HEAD at packaging | `1c52515` — QA-only commits on top of 821f530 (verifier #59 artifacts, the S1 suite repair, ledger #132); `git diff 821f530..HEAD -- supabase/` is empty |
| Verifier #59 report | `qa/verification/proposed/v59_known_failure_modes_entry_132.md`, `v59_PROMOTION_NOTE.md`, `v59_regression_additions.mjs`; findings in `qa/verification/CURRENT_CAMPAIGN.json` (`verifier59_*`); ledger `qa/KNOWN_FAILURE_MODES.md` #132 |

## 2. Production today (read-only, `supabase functions list`, 2026-09-08)

| Item | Value |
|---|---|
| `sem-ai-command` | version **92**, ACTIVE, `ezbr_sha256 33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`, updated 2026-09-01T05:15:25Z |
| Source of v92 | git `c9dfab5bd433`, index.ts LF sha256 `795c20c8…` (recorded live download `qa/verification/scratch/v92/index.v92.ts`; verifiers' provenance link is integration-level, not byte-direct) |
| Web | current `master` build on Vercel (`brain.open-spot.ai`); this package's web changes are NOT deployed (PR into protected `master` pending) |
| Migrations | none in this package (`git diff origin/master..HEAD -- supabase/migrations` empty); `chat_channel_state` (202609020001) is already live |
| Release state | FAILED; not Team-Ready; Work-PC bugs open; nothing CLOSED |

## 3. Verifier #59 PASS — checklist against the actual artifact

| Founder check | Evidence in #59's artifact |
|---|---|
| exact candidate SHA = 821f530 | `verifier59_base_commit` = 821f5308…; PREFLIGHT `git rev-parse HEAD` |
| exact Edge source hash | `verifier59_index_sha256` = 715246f3…; sha asserted before/after every in-place mutant (V59-3-VACUITY, sha-restored); index.ts byte-identical 02220b9→821f530 |
| architecture-contract results | V59-BATTERY: 55 suites exit 0 (final_claim 51/0, collection_envelope 57/0, mutation_envelope 35/0, grounding_precedence 17/0, lifecycle_evidence 93/93, v56 129/0, v57 306/0, v58 48/0, matrix 31/0); 2 machine-posture reds by design; 1 QA-file crash (S1, repaired in 1c52515: 31/31 on the certified bytes) |
| execution-envelope invariants | V59-2F-2G: create family re-reads ids; 34 evidence sites gated on a backend result; `postconditionPassed=false` never supports a claim; 22/22 verified envelopes render, 88/88 unverified/denied never claim |
| fresh canonical-state precedence | V59-2E: output persisted every turn; history marks UNVERIFIED turns; durable typed+unexpired row outranks stored output; expired/untyped rows yield; stored pendingAction expires at 30 min |
| lifecycle resolution | V59-2C: 234/240 lifecycle attack; 0/76 non-imperatives execute; exact and punctuated names resolve via command, model names and `requestIntent.targetName`; task/goal ids re-read server-side outside the window; a task/person/goal command never invents a company line |
| request-intent vs execution-evidence | V59-2B: intent derives only from the model's `requestIntent`, its action arrays, confirmation shapes and the request lexicon; `result.summary`, tense, the belt and `pendingAction` are never consulted; 18,720×4 corpus: 0 false negatives when the model classifies |
| no pendingAction bypass | V59-2B + vacuity mutant "`!result.pendingAction` restored" killed by final_claim and run8 |
| no unresolved P0/P1 | none. P2 items: V59-S1 (QA suite integrity — repaired, off the deploy surface); V59-D1 (`bring back Gamma` with the model emitting nothing and no such company ships the model's prose — model-emits-nothing tier; fix prepared, not applied). Verifier's call: hardening, not blockers. Stated here for the founder's own judgement. |
| no source drift during verification | sha asserted before/after every mutant; `git status` clean on index.ts at the end; deploy surface unchanged since |
| deno by class | run by this session on these exact bytes: TS7006×10, TS2322×6, TS7034, TS7005, TS2339 — zero TS2448/TS2454/TS2304/TS2552/TS2551 (the verifier could not run deno; disclosed) |

## 4. What this build changes (all six Work-PC bugs)

| Bug | Change on the Edge surface | Report |
|---|---|---|
| BUG-010 (P1) | ledger persisted every turn with `turnVerdict`; UNVERIFIED history marker; durable channel state first; precedence stated as a binding prompt rule | `qa/home-pc-handoff/fixes/BUG-010.json` |
| BUG-014 (P1) | server-side company lifecycle resolution across every status (ids, model names, `requestIntent.targetName`, imperative command); exact executes, fuzzy asks; never silent; `archivedCompanies` envelope; (web) `Archived (N)` affordance and `callLifecycleRpc` | `BUG-014.json` |
| BUG-002 (P1 reconfirmed) | structured `requestIntent` + request lexicon; never-silent receipt; no pendingAction exemption; belt as defence-in-depth | `BUG-002.json` |
| BUG-012 (P2) | person-assignment receipt rendered from the executed diff (manager vs company) | `BUG-012.json` |
| BUG-013 (P2) | (web) archived-parent policy on People controls; Edge mirror | `BUG-013.json` |
| BUG-011 (P3) | (web) manager picker semantics | `BUG-011.json` |
| Also | V55-D1 possessive fix; task/goal lifecycle ids server-side + `archivedTasks` in the pack (#131); `ExecutionResultEnvelope` on every execution site; `CollectionEnvelope` on every pack collection | ledger #120–#132 |

## 5. Governance / architecture changes in the same branch (not on the Edge surface)

`CLAUDE.md` (Development Constitution), `governance/OPERATING_TRUTH_MODEL.md`, `governance/CANONICAL_WORK_CONTRACT.md`,
`docs/architecture/FEATURE_COMPLETENESS_CONTRACT.md` + template + `CAPABILITY_IMPACT_REGISTRY.yaml`, PR template;
shared primitives `web/lib/contracts/*`, `web/lib/policy/archived-parent.ts`, `web/lib/data/org-scope.ts`,
`supabase/functions/_shared/*`; 8 `architecture_*` contracts + product-invariant suites; ledger #119–#132.

## 6. Known deliberate gaps (registered next work, not part of this deployment claim)

- Lifecycle-dependent controls on child surfaces other than People (projects, departments, goals, tasks, documents).
- Archive-instead-of-delete for projects, departments, documents, leads, approvals.
- Verifier #59 hardening patch (`qa/verification/proposed/v59_hardening.patch`, closes V59-D1..D4 in the
  model-emits-nothing tier) — NOT applied, so #59's certification stands; next candidate.
- V59-D5 lexicon false positives with no model classification; V59-R2 durable pending-action source-freshness;
  V59-R3 idioms outside any lexicon; Mongolian command fallback without the model tier; `_shared` ↔ `web/lib`
  mirror drift guard (AUTHORITY_NOT_ENFORCED, off the deploy surface).
- `v59_regression_additions.mjs` stays in `proposed/` (12 DEFECT pins red by design until the hardening patch lands).

## 7. Risk

- Behaviour change vs v92: mutation-intent turns with no verified execution now end in a deterministic receipt;
  read-shaped turns are never rewritten on response text (v92 corrected some fabrications on text shape — an
  intended departure under the contract; the belt still runs behind intent). Every P2/P3 residual is confined to
  the tier where the model emits neither `requestIntent` nor an action field; its live compliance rate is
  unmeasured (no browser/AI-chat turn was possible in any verifier session).
- Not measured live by anyone: deployed UI, live AI chat, live persona/RLS matrix. The Work PC measures these on
  the deployed build.
- Deploy mechanism: pushing `supabase/functions/**` to `master` auto-deploys ALL Edge Functions (only
  `sem-ai-command` differs from `master`; the other five are byte-identical to their last verified deploy — to be
  re-confirmed by `verify-deployed-bytes.sh` after deploy).

## 8. Rollback target

`sem-ai-command` version 92 == git `c9dfab5bd433` (`ezbr 33255b31…`). Rollback = redeploy that commit's
`index.ts` through the same protected path (or Supabase's function version history), then
`scripts/factory-runner/verify-deployed-bytes.sh sem-ai-command c9dfab5bd433`. No migration to reverse.

## 9. Post-deploy acceptance plan

1. **Home PC, immediately:** `scripts/factory-runner/verify-deployed-bytes.sh sem-ai-command 821f530` — deployed
   bytes must equal sha256 715246f3…; record version + `ezbr_sha256` in the six fix reports and in
   `CURRENT_CAMPAIGN.json`; confirm the other five functions unchanged.
2. **Home PC:** restore `QA-SWARM-TEST-CO-VIA-CHAT` (7ba01ff2-…) through the corrected chat path in a fresh
   channel; record the work_order id and the RPC jsonb in BUG-014.json; then set `ready_for_retest: true` on all six
   reports and push `qa/home-pc-handoff`.
3. **Work PC (final authority):** rerun BUG-010 A/B (contaminated vs fresh channel), BUG-014 (both channels, UI
   Restore, misspelled name), BUG-002 phrasing matrix incl. trailing questions, BUG-012 receipt, BUG-013/011 on
   `/people` after the web PR merges; a 30-turn drafting/conversational session counting receipts on non-mutation
   turns (live `requestIntent` compliance — every P2 residual leans on it); close or reopen each bug.
4. **Web:** merge the PR into protected `master` (Vercel auto-deploys); confirm the GitHub "Vercel" status and
   deployment id; then the People/Companies acceptance above.
5. Release state stays FAILED until the Work PC says otherwise.
