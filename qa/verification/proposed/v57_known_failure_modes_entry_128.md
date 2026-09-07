## 128. Verifier #57 (campaign #117) — candidate `712760dc` under the CONTRACT bar: the request lexicon overrides the model's explicit `other` classification, so drafting and conversational turns that merely contain a mutation word ("the fire drill is at 3pm", "draft an email about the merge") are replaced by the "No change was made" receipt; the company-lifecycle command fallback ignores `requestIntent.entityType`; the "imperative-only" gate still executes on declaratives and reported speech when the model emits nothing — FAIL, FIX PREPARED (scratch copy, mutation-measured), regression suite red by design

**Verdict.** **FAIL** on `712760dcb0d68b969b940d5175bbd76bf205ccb1` (index.ts sha256
`ccde932fa5b1aeca77cb91d730df89ea16c100432d83dd80782b4217b85fe871`, preserved byte-for-byte; asserted before and
after every in-place mutant, all restored). The bar is conformance to `governance/OPERATING_TRUTH_MODEL.md`
(founder ruling 2026-09-07); deployed v92 is a reference corpus only. The #56 closure (ledger #127) is real and
measured clean on every shape #56 failed: FP 0/310, FN 62/11 880 (all generator inflection artefacts), question
probe 0/19, the eight #56 mutants all killed, `v56_intent_lifecycle_contract` 129/0, `company_lifecycle_matrix`
28/0. The candidate's *machinery* (envelopes, receipt, precedence, persistence, server-side resolution) re-derives
clean again. What fails is one design decision inside the new intent tier and two gaps inside the new lifecycle
gate — all three in the layer the closure added, none in the layer #56 verified.

**Found by** verifier #57, an independent process in an isolated worktree, executing windows sliced from the real
`index.ts` through the repository's own detyper (`_gate_extract.mjs`), never a re-implementation. Every number
below is my own run; the record's counts were treated as pointers.

### The defects

**V57-D1 (P1) — the request lexicon overrides the model's explicit non-mutation classification.**
`requestedIntent` (`index.ts:5498-5510`) lets the model's `requestIntent.kind = 'read'` veto the lexicon, but
`kind = 'other'` — the class the prompt itself assigns to anything that is not a mutation, a confirmation, a
question or a list/summary/status (`index.ts:1503-1510`), i.e. every drafting and conversational turn — does
not. A lexicon verb *or verb-noun* anywhere in the command then derives intent, the ledger is empty, and the
never-silent receipt replaces the truthful reply. Measured through the real window with `kind: 'other'`:
**drafting 20/20** ("draft an email to Bob about the merge", "write a memo on fire safety at ACME", "brainstorm
names for the new hire", "help me word a message declining the offer", "translate \"delete\" into Mongolian",
"draft the agenda: 1. hire plan 2. archive policy"), **conversational statements 17/20** ("the fire drill is at
3pm", "I approve of this plan" → "No change was made — deciding an approval from chat is not available yet — use
the Approvals page", "we're planning a hire next quarter", "the revenue split is 60/40", "the store will reopen
Monday", "the client may reject the proposal"), **noun-phrase reads 7/15** ("history of the ACME archive", "ACME's
archive date", "the delete log for QA-1"), **negations/hypotheticals 8/12** with a misleading reason ("don't
archive ACME" → "…I could not resolve which company you meant"). With `kind: 'read'` all of these survive (0/67),
so the whole class rests on the lexicon outranking `other`. OTM §3 rule 2: a text-shape rule of the *request* is
the sole reason a truthful reply is rewritten, over the model's own structured classification. This is also a
truth regression versus deployed v92 (which shipped every one of these replies) that is **not** an intended
departure. Deployed v92 corrected none of these turns; the candidate destroys all of them.

**V57-D2 (P2) — the command-derived company fallback ignores `requestIntent.entityType`.** The gate's own
comment (`index.ts:3360-3363`) says the fallback runs only when "the command names a company noun or the model
classified the request's entity as a company"; `commandFallbackAllowed` (`:3395`) checks neither. "archive
Alpha" with the model emitting `{kind: mutation, entityType: task|person|goal|project, targetName: Alpha}` and no
action field (a task outside the capped window, a project — which has no chat archive at all) archives the
**company** Alpha (exact name) with the receipt "Alpha: archived." — which does not say *company*. Realistic
through the ordinary company/project name collision (a client project named after the client). 4/4 entity types.

**V57-D3 (P2, conditional on the model omitting `requestIntent`) — the "imperative-only" gate is a lead regex.**
With the model emitting nothing at all (no field, no classification) **10/40** non-imperative sentences with an
exact company name execute a lifecycle RPC: "I said not to archive Alpha", "we agreed not to archive Alpha"
(bare `not` is only recognised at the head), "suppose we restore Beta", "should we restore Beta" (`should i` is
listed, `should we` is not), "Someone removed Alpha", "I already restored Beta", "they ended Alpha", "Bob said to
archive Alpha", "Bob wants us to restore Beta", "thinking about whether to archive Alpha". With `kind: read` or
`other` the gate withholds (12/12), so the exposure is a schema-non-compliant model turn; reversible and visible,
but it is the #56 D3b class one layer down, and the closure text calls the gate imperative-only.

### Sized residuals (not defects under the bar; stated with size)

* **V57-D4 (P2, latent at scale)** — `resolveCompanyLifecycleTargets` fetches candidates by `ilike` on the
  *longest word* of the name with `limit(50)`. "restore AB Ltd" among 55 other "… Ltd" rows: 0 hits, the known
  archived company is refused as unresolved — the OTM §5 "outside the window" class, one query down. Unreachable
  at this workspace's size.
* **V57-D5 (P2, lexicon tier alone)** — with no model classification, my own 4 680-row generator derives no intent
  on 1 574 (33.6 %): "When you get a moment, please archive ACME" 180/180 (`READ_SHAPE` treats a `when` lead as a
  read), "archive ACME?" 180/180 (a bare `?` is read-shaped), "get ACME archived" 180/180, typos 161/180,
  German/Russian 360/360; hand-written slang 31/50 ("let Bob go", "get rid of task QA-1", "drop the goal G1",
  "Alice reports to Bob from now on"). With `kind: mutation`: **0/4 680 and 0/50** — the structured tier is
  load-bearing and could not be measured live in this session (no browser, no CLI).
* **V57-D6 (P3)** — the lifecycle `commandIsQuestion` lacks the `POLITE_REQUEST` exemption the intent tier has
  (a polite question with the model emitting nothing is refused, never executed); a compound command with the
  model emitting nothing executes the first clause and drops the second silently ("archive Alpha and restore
  Beta" → "Alpha: archived."); a model action field in the opposite direction to the command executes the model's
  direction; 1-character company names cannot be resolved by name; receipt lines carry no entity type
  (OTM §4.2 prescribes `<Action> <entity type> "<name>"`); legacy `context.counts` keeps 11 array-length
  fallbacks and the prompt still points the model at it for "how many" questions.

### Root cause (one class)

The closure made the structured `requestIntent` the first tier and the lexicon the second, but wired the veto
asymmetrically: `read` outranks the lexicon, `other` does not — so on exactly the turns the prompt tells the
model to label `other`, the lexicon is back to being the sole decider (D1). The lifecycle gate was written as a
list of lead words and model *fields*, not as a check of the model's *classification* (D2) or of sentence mood
(D3). Both are the same shape #56 named: a regex standing in for the structured intent the contract calls for.

### What is clean — re-derived, not restated

* **Provenance:** git `c9dfab5bd433` index.ts sha256 `795c20c8…` (321 370 B) == both in-tree v92 copies
  (raw and LF-normalised). Integration-level: the supabase CLI and `npx` are gated in this session; no live
  download by me.
* **Deploy surface / delta:** exactly `index.ts` (imports: deno std http, supabase-js; 0 non-comment `_shared`
  mentions). LF-normalised v92 → candidate: 111 hunks, +2 208/−101; declared identifiers 511 → 847, **336 added,
  0 removed**. Raw candidate 531 565 B, 6 419 CRLF, 0 bare LF, 1 bare CR (inside a comment at :6101).
* **Mirrors:** `_shared/{execution,collection,lifecycle,parent-policy}.ts` vs `web/lib`: exported names agree
  (lifecycle differs by design: `lifecycleVerdict` vs `callLifecycleRpc`), bytes differ (6/13, 3/8, 11/76,
  20/31 lines); the drift guard OTM §4 cites still does not exist (AUTHORITY_NOT_ENFORCED; not on the surface).
* **Receipt / final-claim rule:** own matrix 691/0 — 68 mutation-intent commands × {claims null, [], state-only
  supported, historical_event, current_state contradicted, mutation_result nonexistent id} + pendingAction +
  question + questions[] kept = 544 cases, 0 fabrications ship; 660 read cases (30 commands × 22 truthful answers
  incl. gerund prose) verbatim; 24 verified envelopes render (claimed and unclaimed); 96 executed-unverified /
  denied / postcondition-false envelopes never claim; a verified create beside a fabricated archive renders only
  the verified line.
* **Intent purity:** derivation reads only `requestIntent`, the action arrays and `activateAiProviderId`; same
  command × four different replies → identical intent (5/5); the final intent is the request-side derivation alone.
* **Lifecycle resolution:** 185/199 own cases on the candidate (the 14 = D3's 10, D4, and 1-char names ×3):
  imperatives execute once; 30/40 non-imperatives withhold; polite question + `targetName` executes; other-entity
  fields withhold (12/12); punctuated/Unicode names resolve via command, `restoreCompanyNames` and `targetName`
  (19/20 names × 3 sources; "X" fails); fuzzy command hits ask (even with one option), model-name fuzzy executes
  only when unique; lifecycle words inside names never flip direction (10/10); twins prefer the wanted status;
  nonexistent/malformed ids leave a line; disambiguation replaces a model-armed pendingAction; RPC error /
  denied / not_found / postcondition-false / foreign_org / empty data never yield success; idempotency truthful.
* **Persistence / precedence:** own suite 29/0 — UNVERIFIED marking, receipt kept, `verified: null` when
  unknown, durable > stored, expired / untyped / unsourced / no-expiry durable rows yield, stored pendingAction and
  legacy pendingConfirmation expire at 30 min, persist unconditional after the verdict, the resolver's
  disambiguation is typed (durable). A stale durable row can bind only inside its TTL and only if the intervening
  turn's clearing write was lost (P3).
* **Envelopes / postconditions:** helper executed (total from count, null never array length); 23 pack arrays all
  enveloped; 23 capped queries carry `count: 'exact'`; companies split active/archived newest first. 34
  literal-true `recordExecution` sites all gated on a backend result; the RPC create family is re-read under RLS;
  task/goal RPCs always return `postconditionPassed`. Non-RPC creates rely on insert-returning (P3).
* **Belt vs v92 (1 000-row own corpus, 548 truthful / 452 fabrications, negator-initial names both directions,
  possessives incl. bare apostrophe):** three-arm prose path (candidate LIFECYCLE‖FUTURE‖belt vs v92's three arms)
  **TRUTH_REGRESSION 0** on both packs; FAB_REGRESSION 60 on the empty pack only (possessives of negator-initial
  names — the disclosed empty-pack residual; 0 with the pack); FAB_RESCUE 34/96; TRUTH_RESCUE 92. NO intent: the
  window rewrote 0/1 000. Intent + empty ledger: RECEIPT on 1 000/1 000 (TRUTH_REGRESSION 376 = the never-silent
  rule itself, INTENDED). Read shape: FAB_REGRESSION 276/452 = fabrications v92 caught by tense that now ship on
  read-shaped requests — INTENDED under OTM §3 rule 2 (prose is never parsed for truth), 61 % of the corpus.
* **Battery / gates / TDZ:** 56 suites on disk, 54 exit 0, 2 machine-posture reds; gates v48–v52/v54–v56 green,
  v46 33/3 and v53 33/1 the recorded standing reds; #56 mutation proof 8/8. #55 block-scope scanner: 1 "P0" at
  :2404 is a type-literal key inside an `as {…}` annotation (false positive, same class as #55/#56), 1 deferred
  `UUID_IN_TEXT` read (use :5157 in `safeDisplayLabel`, decl :5192, earliest invocation :5666) — safe.
  **`deno check` BLOCKED** (npx gated; no deno binary or `tsc` on disk).

### Suite integrity (Step 3)

* `_gate_extract` request-side defaults (`command ''`, `requestedIntent null`): faithful for window suites — a
  no-intent turn is untouched by construction and the receipt cannot fire. run8/10–14 default to `archive ACME
  Holdings` (intent for free) and assert the belt's own flag (`corrected`), so they still measure the belt; their
  "preserved" cases pass `command ''`, where the belt is never consulted — those rows are now no-intent
  invariants, not belt measurements (a coverage note, not a hidden class). run8/D59 re-reversal, run11
  livePrecedence inversion, lifecycle_evidence S/P6 and the v49–v53 SUPERSEDED pins all follow the contract.
* **Vacuity mutants (21, whole battery each, in place, restored, sha-asserted): 15 killed.** Killed: receipt block
  deleted (final_claim, v56), `!result.pendingAction` restored (final_claim, run8), create re-read dropped
  (lifecycle_evidence — the only behavioural catch), create-family literal true (mutation_envelope), durable read
  last (grounding_precedence, run11), a real pack envelope dropped (collection_envelope), hand-written join in a
  file without COMPANY_REF (archived_parent_policy), hand-written org sentinel (org_scope_helper), receipt keyed
  on attempted (v56), history verified=true when unknown (grounding_precedence), persist gated again
  (mutation_envelope, lifecycle_evidence), envelope total from length (collection_envelope), fallback ignores the
  model kind / other-target gate dropped (company_lifecycle_matrix), fuzzy command executes (v56).
  **Survived the committed battery:** (a) a hand-written `companies(name, status)` literal in a file that already
  imports COMPANY_REF (the guard is per-file); (b) the model-`read` veto of the lexicon removed — the closure's
  central claim is unpinned; (c) the negated-lead gate removed — the matrix's only negative ("do not…") is already
  blocked by the read-lead `do`; (d) `turnVerdict.mutationIntent: null` — the narrative tier's input unpinned;
  (e) the stored-pendingAction 30-min TTL removed — `grounding_precedence` slices below it. (b)–(e) are killed by
  the CONTRACT rows of `v57_regression_additions.mjs` (4/4 on mutant copies).

### Regression

`qa/verification/proposed/v57_regression_additions.mjs` — **277 CONTRACT rows green** on the candidate (and kill
battery survivors b–e), **29 DEFECT rows red by design** (D1 15, D2 4, D3 10), 8 RESIDUAL rows measured and
printed but never counted; exits non-zero on any CONTRACT/DEFECT failure; resolves `index.ts` via `SEM_INDEX_SRC`
or by walking up (run from `qa/verification/` to prove it). On the prepared-fix bytes it is **306/0**.

### Fix — PREPARED, not applied (no write authority on `index.ts`)

`qa/verification/scratch/v57/v57_fix.mjs` writes `index.fixed.ts` (sha256 `5d28ba3a…`) from the candidate with
three narrow changes: **F1** `other` vetoes the lexicon exactly as `read` does (the lexicon acts only when the
model gave no classification); **F2** the command fallback is withheld when `requestIntent.entityType` is not
company/other/null; **F3** the imperative gate also refuses mid-sentence "not to <verb>", "suppose / should we /
thinking / wondering" leads, reported speech ("X said/wants/asked (us) to <verb>") and past-tense declaratives
with a non-verb subject. Measured on the fixed bytes: FP on `other` **0/20, 0/20, 0/15, 0/12**; FN with `kind:
mutation` still 0; FN with no classification unchanged (1 574/4 680); FN with `other` becomes 4 680/4 680 — the
same symmetry the design already accepts for `read`; own lifecycle attack 195/4 (only D4 and 1-char names
remain); receipt matrix 691/0; every battery member that honours `SEM_INDEX_SRC` (24) plus #56's four generators
and my two suites: 32/32 exit 0; `v57_regression_additions` 306/0. A first draft of F3 withheld "archive Restored
Furniture Co" — caught by my own C7 rows and narrowed; that is the row's purpose.

**Status.** FAIL — deploy blocked on V57-D1 (P1). FIX PREPARED (scratch copy, measured at zero truth cost on every
corpus in this campaign), NOT applied. Gaps: no `deno check`, no live CLI download, no browser / AI-chat turn in
this session type — the structured tier that every P2 residual leans on (the model reliably emitting
`requestIntent`) is unmeasured live.
