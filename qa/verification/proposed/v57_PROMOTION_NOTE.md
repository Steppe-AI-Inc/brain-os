# Verifier #57 — promotion note (campaign #117, candidate `712760dcb0d68b969b940d5175bbd76bf205ccb1`)

Verdict: **FAIL** under the contract bar (V57-D1 P1; V57-D2 P2; V57-D3 P2 conditional). FIX PREPARED, not applied.
index.ts sha256 `ccde932fa5b1aeca77cb91d730df89ea16c100432d83dd80782b4217b85fe871` preserved.

## To promote once the fix lands (Home PC)

1. **Apply the prepared fix** — `qa/verification/scratch/v57/v57_fix.mjs` (F1 / F2 / F3) — or an equivalent that
   satisfies the DEFECT rows by outcome. The rows assert outcomes, not shapes:
   * F1: `requestIntent.kind === 'other'` vetoes the request lexicon exactly like `read` (the lexicon acts only
     when the model gave no classification). If the implementer prefers to keep a narrower defence-in-depth for
     `other` (e.g. only a head-positioned imperative verb), the DEFECT rows still decide.
   * F2: `commandFallbackAllowed` also requires `requestIntent.entityType ∈ {null, 'company', 'other'}` — the gate
     comment already claims it.
   * F3: tightened non-imperative leads (mid-sentence `not to`, `suppose`, `should/shall we`, `thinking/wondering`,
     reported speech, past-tense declaratives with a non-verb subject). Keep my C7 rows green — the first draft of
     F3 withheld "archive Restored Furniture Co".
2. **Promote `qa/verification/proposed/v57_regression_additions.mjs`** into the battery as
   `qa/scenarios-runner/v57_intent_other_veto_contract.mjs` (any name; keep the CONTRACT/DEFECT/RESIDUAL kinds).
   It must read 306/0 on the fixed bytes. It pins four things the committed battery does not: the model-`read`
   veto, the negated-lead gate, `turnVerdict.mutationIntent`, and the stored-pendingAction TTL (all four survived
   the whole battery as mutants; killed 4/4 by this file — `scratch/v57/v57_kill_check.mjs`).
3. **Ledger:** `qa/verification/proposed/v57_known_failure_modes_entry_128.md` → `qa/KNOWN_FAILURE_MODES.md` #128.
4. **Re-dispatch a fresh verifier on the exact new SHA.** A PASS on those bytes is the deploy certification; ask
   `ALLOW_FUNCTIONS_DEPLOY=1` exactly once after it.

## Residuals to register (not deploy blockers; each sized in the ledger entry)

* V57-D4 — anchor-word candidate cap (`ilike` on the longest word, `limit(50)`): add a second candidate query on
  the full normalised name (or `.or()` over every word ≥ 3 chars) before declaring "no company by that name".
* V57-D5 — lexicon tier: `READ_SHAPE` treats a `when/where/which` *subordinate-clause lead* as a read
  ("When you get a moment, please archive ACME"); a bare trailing `?` on an imperative ("archive ACME?"); "get X
  archived"; slang ("let Bob go"). All caught when the model classifies `mutation`; measure that live.
* V57-D6 — polite-question exemption missing from the lifecycle `commandIsQuestion`; compound commands with the
  model emitting nothing drop the second clause silently; a model field in the opposite direction to the command
  executes the model's direction (a cheap server-side cross-check); 1-char names; receipt lines without the
  entity type OTM §4.2 prescribes; legacy `context.counts` array-length fallbacks still referenced by the prompt.
* Guard granularity: `company_ref_no_bare_name_join` / `archived_parent_policy` accept a hand-written
  `companies(name, status)` literal inside a file that already imports COMPANY_REF (mutant m6 survived).
* OTM §4's "drift guard" for `_shared` ↔ `web/lib` mirrors still does not exist (AUTHORITY_NOT_ENFORCED).

## Coverage gaps of this session (state them, do not paper over them)

* `deno check` — BLOCKED (npx gated; no deno binary or tsc on disk). Substitutes: #55 block-scope scanner
  (0 synchronous TDZ; 1 type-literal false positive; 1 safe deferred read), identifier delta (0 removed), CRLF census.
* Live provenance — supabase CLI gated; v92 == c9dfab5bd433 rests on git + the two in-tree copies.
* No browser / AI-chat turn: the model's `requestIntent` compliance rate — which every P2 residual leans on — is
  unmeasured live. The Work PC should run a 30-turn drafting/conversational session on the fixed build and count
  receipts on non-mutation turns; before the fix, expect the D1 class on any turn containing hire/fire/merge/
  split/approve/reject/archive/remove/invite/enable/promote/reopen as a noun or verb.
