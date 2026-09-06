# v42 PROMOTION NOTE — candidate `4f35700` is NOT fit to deploy over v92

**VERDICT: FAIL. EDGE STATUS = NOT DEPLOYMENT READY.**
**DO NOT PROMOTE `4f35700127b271d3e8cf68afb3ac0d5f772c4c5f` OVER DEPLOYED v92.**

Verifier #42, campaign #102. Independent worktree, no implementation context.
Candidate index.ts sha256 `ed3983dfb367a4adfd98fc8b160fa7a29ef733e3a4c1d0f44979bc40e66d33b8`,
preserved byte-identically for the whole run.

---

## Why, in one line

The candidate **destroys truthful answers deployed v92 preserves**, in two classes — one of which
(V42-D1) the campaign has never looked at, and which is **larger than the blocker the campaign is
currently building for**.

| | destroyed by candidate | preserved by v92 |
|---|---|---|
| V42-D1 imminent-arm guidance (generated, realistic) | **98 of 140** — 49 proper-name, 49 lowercase | 140 of 140 |
| V42-D2 participle-initial entity names | **48 of 48** | 48 of 48 |
| whole own corpus (669 truthful / 259 fabrications) | **135 truth regressions** | — |
| fabrication regressions | **0** | — |

Zero fabrication regressions is the good news: nothing v92 corrects is shipped. Every failure is the
product replacing a **true** sentence with a canned refusal that is itself false, and persisting it
to `work_orders.output`.

---

## What to fix, in order

1. **V42-D1 first, not the entity signal.** The imminent alternations at index.ts:5453-5457 have no
   subject guard of any kind — the three guards on `EXECUTION_IN_PROGRESS` are all anchored at
   `^<gerund>` or require `<Subject> is <gerund>`, so none can fire on an imminent match. Suggested
   direction: require a **first-person subject** (`I` / `I'm` / `I am` / `Let me`) on those
   alternations, keeping the subjectless clause-initial fragment (`Starting the archive of X.`,
   `Kicking off the archive of X.`) as a fabrication. `V42-C1` in
   `v42_regression_additions.mjs` pins the seven fabrications that must stay caught.
2. **Then the entity signal for V42-D2**, per the ruling in the ledger entry: **option 1 with an
   injected-empty-default**, and **#37's pinned list is not to be edited**. One member of that
   class — `"Confirmed - Archive <Name>?"` — is a **question** and can be closed lexically without
   the entity signal at all.
3. **Make `v92_open_regression_contract` CONTRACT 5's second coverage assertion fail-loud.** It is
   currently `mutated === TEXT || …`, so it passes vacuously if its `let n = -1;` anchor moves. Its
   sibling is already fail-loud; make them match.
4. **Restate V41-F1's load-bearing number against the shipped build.** Ledger #104 says reverting it
   re-opens 144 truths; on these bytes it re-opens 8 of 3,200 in a space engineered to isolate it and
   0 of 17,475 in a general one, because the older object-shaped guard it was said to *replace* is
   still present beside it. Do not remove F1 on this evidence — restate the claim.

## What NOT to do

- Do not record V42-D1 or V42-D2 as a "disclosed residual". Ledger #102 exists because that sentence
  kept a blocker red through four verifiers.
- Do not validate the V42-D1 fix on a corpus of first-person sentences. The defect *is* the
  non-first-person half. Report the proper-name and lowercase halves **separately** — a blended
  number is what hid the gerund class for three rounds.

---

## The one thing a deploy decision still needs that this run could not supply

**Byte-direct provenance.** `supabase functions download` and `supabase link` are both refused by
this session's command classifier, so the deployed v92 **bundle** was never decoded to source here.
`functions list` confirms version 92 / `ezbr_sha256 33255b3172…` / `updated_at 1788239725518`, and
git `c9dfab5bd433` hashes to `795c20c82301aba1…` as expected — but the link between them is
**integration-level, not byte-direct**. Not refuted; not proven. Close it with one
`supabase functions download sem-ai-command --project-ref pvphxgrtdfrudejjhzjk` from an unrestricted
shell before any promote/rollback decision is executed.

## Rollback target

Exact and available **at source level**: git `c9dfab5bd433`,
`supabase/functions/sem-ai-command/index.ts`, sha256
`795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc`, verified in this repo by
`git cat-file`. The deployed bundle was built by GitHub Actions (entrypoint
`file:///home/runner/work/brain-os/brain-os/...`), so a rollback is a revert commit plus a CI deploy,
not a local `functions deploy`. **Nothing was deployed, pushed, or written to production in this
run**, and no migration was prepared or applied.

## Deploy surface

Exactly **one** file differs under `supabase/functions/`: `sem-ai-command/index.ts`.
203 identifiers added, **0 removed** — nothing v92 declared was dropped or reintroduced.
No `.sql`, no migration, no other function touched.

## Gate to run before the next promotion attempt

```
node qa/verification/proposed/v42_regression_additions.mjs
```
8 CONTRACT assertions currently pass; 5 DEFECT assertions currently fail. It exits nonzero on any
failure, resolves `index.ts` from `SEM_INDEX_SRC` or by walking up from its own location (correct
from any cwd), and pins the deployed-v92 reference **by content hash** so it refuses to run against
an unknown baseline. It must read **13 passed, 0 failed** before this candidate is promoted.
