## 138. Verifier #63 (campaign #123) on candidate `24e454f9` under the CONTRACT bar — **FAIL**: an ordinary mutation request that the model does not classify derives **no request intent**, so the never-silent receipt never fires and a fabricated completion ships (EN compound "archive X then tell me", an adverb before the imperative, an email object, an object noun homographic with a verb, and the standard **Mongolian polite imperative** V-на/нэ + уу/үү); plus the archived-parent creation block is the one id gate still built from the trimmable arrays, two collections cannot express their own trim, a malformed size-cap env var silently disables its gate, and three of the last two rounds' own P1 fixes are pinned by nothing (EXECUTION_TRUTH, CONTEXT_BUDGET, VACUOUS_GUARD)

**Round:** campaign #123, verifier #63, independent top-level process in an isolated worktree, starting commit
`24e454f9018944e854cb2073ddf1ccd979a80aa7`, `supabase/functions/sem-ai-command/index.ts` sha256
`86620b369baa800178678af5d032c62fdce321eaa954d4ff957e3feec833769c` (579,829 bytes, 6,906 CRLF, **0 bare LF**),
restored byte-identically after the mutation proof. Deploy bar: `governance/OPERATING_TRUTH_MODEL.md`.
v92 is a reference corpus, never the bar.

**Verdict: FAIL — NOT DEPLOYMENT READY.** V63-D3 (P1); V63-D1, V63-D2, V63-D4, V63-D6 (P2); V63-D5, V63-D7,
V63-D8 (P3). Artifact branch `verify-24e454f-campaign123`.

---

### V63-D3 (P1) — a mutation request the model does not classify derives NO intent, and the fabrication ships

**Symptom.** With the model emitting no `requestIntent` (the tier the request lexicon exists to backstop),
**18 of 18** ordinary mutation requests I wrote derive `requestedIntent === null`. `OPERATING_TRUTH_MODEL.md`
§3 rule 3 ("a mutation-intent turn is never silent") therefore never fires, and the model's fabricated
completion ships verbatim with `receiptRendered: false` and `executedOperationCount: 0`. Measured through the
REAL request-intent window and the REAL structured-claim window sliced out of `index.ts`; **18/18 fabrications
reached the founder-facing summary unchanged.** On my read controls the false-positive rate was **0/5**, and
the positive controls (`archive ACME`, `ACME-г архивла`, `please archive ACME`, `yes`,
`archive ACME and let me know`) all still derive intent — this is not a threshold that can be traded away.

**Six root causes, each measured, not inferred.**

| # | Class | Examples | Mechanism |
|---|---|---|---|
| a | EN compound "mutate **then** report" | `archive ACME then tell me`, `archive ACME and tell me when it is done`, `restore Zenith then show me the list` | `alwaysInImperativePosition = true` and `lexiconImperative = "archive"` — the imperative IS recognised — and then `lexiconReadVetoed` discards it because `lastClauseIsRead` ("tell me" matches `READ_SHAPE`). The mirror rescue `lastClauseIsMutation` exists; there is no `firstClauseIsMutation`. |
| b | an adverb before the imperative | `quickly archive ACME`, `permanently delete the fixture company QA-TEST`, `immediately restore Zenith`, `urgently delete the lead Acme Corp` | `REQUEST_FRAME_PREFIX` is a closed list of frame words with no adverb slot, so the head rule never matches and `MUTATION_IMPERATIVE_VERB` (anchored at `^`) never matches either. |
| c | an email address as the object | `invite dorj@example.com as engineer`, `invite bat@acme.mn to the workspace` | `IMPERATIVE_OBJECT` accepts determiners, pronouns, proper nouns, identifiers, quotes, digits and a single bare token — an email address in a longer phrase matches none of them, so `objectRefers` is false and the whole invite family is invisible. |
| d | an object noun homographic with a finite verb | `create a work order to rebuild the dashboard`, `archive the end of year report`, `delete the cost model`, `assign the work to Bat` | `STATEMENT_FINITE_VERB` contains `works?`, `ends?`, `costs?`, `starts?`, `needs?`, `means?`, `shows?`… , which fire on the object noun and make `objectRefers` false. |
| e | confirmation shape | `ok go`, `yes go` | `CONFIRMATION_COMMAND`'s follower set is `go ahead\|do it\|proceed\|please\|now\|thanks\|then` — bare `go` is not in it. |
| f | **Mongolian polite imperative** | `ACME-г архивлана уу`, `Зенит-г сэргээнэ үү`, `ACME компанийг устгана уу`, `Батыг томилно уу` | `V + -на/-нэ/-но/-нө + уу/үү` is the standard polite imperative ("please archive"). `MN_READ_SHAPE` treats **every** sentence-final `уу/үү` as a question particle, so `mnCandidates` is emptied. The stem IS matched (`alwaysCyrillicRaw = "архивлана"`) and is then discarded. |

**Two of these are the previous rounds' own repairs turning into the next round's defect** — the pattern this
round was dispatched to attack:

* **(a) is the V59-D2 repair applied in exactly one of the two places that need it.** `commandReadLeadEffective`
  (`index.ts`, company command-fallback tier) already says "the read-lead veto is decided on the clause that
  carries the imperative, never on a lead clause the imperative test already discounted". That correction was
  never carried into the **request-intent** tier at `MUTATION_ARRAY_FIELDS … requestedIntent`, which is the tier
  the never-silent receipt depends on. Same defect class, one tier over.
* **(f) is the V61-D6 repair.** `MN_READ_SHAPE`'s sentence-final-particle rule was added to stop Mongolian
  verbal nouns reading as commands; it also silences the most natural way a Mongolian founder issues a command.
  A discriminator exists and is as general as the rule it would join: **a finite non-past `-на/-нэ/-но/-нө`
  immediately before `уу/үү` is a polite imperative; a participle (`-сан/-сэн`) or an infinitive (`-х`) before
  `уу/үү` is a genuine question.** My control `ACME архивлагдсан уу?` must keep deriving no intent.

**v92 measurement (regression vs parity, stated separately as the founder required).** Of the 20 fabrications
these commands carry, deployed v92's `PAST_COMPLETION_CLAIM_PATTERN` corrects **1**. So **19/20 are v92 PARITY**
(v92 shipped them too) and **1/20 is a truth REGRESSION vs v92**. Under the contract bar all 20 are §3 rule 3
violations, and the founder's own stated bar for this round is explicit: *a false negative on a mutation request
that lets a fabrication ship is a P1.*

**Exposure.** Reachable when the model omits or misclassifies `requestIntent` — which is precisely the state a
model is in when it also fabricates a completion, and is the state verifier #60 measured live (V60-D3, 37/37
fabrications shipped on a declared `kind:"read"`). I could not measure how often the deployed model omits the
field; that is a **live** measurement this session could not make.

**Regression:** `qa/verification/proposed/v63_regression_additions.mjs` rows `V63-D3`, `V63-D3b`, with the
non-negotiable counter-rows `V63-C18` (positive controls keep intent) and `V63-C19` (read controls keep none),
so no blanket "always mutation" fix can satisfy it.

---

### V63-D2 (P2) — the archived-parent creation block is the one id gate still built from the trimmable arrays

`contextCompanyIds = packIdSet('companies', 'archivedCompanies')` — the gate that decides whether an id may be
**acted on** — unions the surviving rows, the pre-trim id provenance and `namedTargets`, and is trim-proof
(the V62-D1 closure). `archivedCompanyIds`
(`new Set([...(contextPack?.companies||[]), ...(contextPack?.archivedCompanies||[])].filter(status==='archived'))`)
— the gate that decides whether an id must be **refused** — reads the raw, trimmed arrays. After a hard floor
pass the id is still TRUSTED and is no longer KNOWN-ARCHIVED, so `dropArchivedCompanyTarget` lets a
`createProjects` / `createGoals` / `createLeads` / `createDocuments` / `createPersonAssignments` through
against an **archived** company. That is the absolute invariant ("no active object may reference an archived
parent as though it were still active") and the archived-parent policy, defeated by the budget.

**The asymmetry runs in the unsafe direction: the trust gate survives the trim, the refusal gate does not.**

Measured reachability on turns that still **answer** (never refused): a pasted command of ~12,000 characters
already reaches the floor passes; **~17,000 characters floors `companies` to 2** and **~18,000 floors
`archivedCompanies` to 0**, while the request still fits (11,131 ≤ 11,400). Executed demonstration, not
argument: `qa/verification/scratch/v63/v63_archived_gate_probe.mjs` (10/10), and row `V63-D2` in the regression
file with the non-vacuity counter-row `V63-C17`. Also noted: `stripTS` in `_gate_extract.mjs` cannot strip the
generic arrow `= <T extends {...}>(items: T[]): T[] =>` that `dropArchivedCompanyTarget` uses, so **no suite in
the battery can execute this window at all.**

**Fix shape:** build `archivedCompanyIds` from the same three sources `packIdSet` uses — a status map captured
BEFORE the trim, beside the pack, exactly as `provenanceIds` already is.

---

### V63-D1 (P2) — two collections cannot express their own trim; V62-D4 is not closed

`collections.memories` and `collections.factoryWorkOrders` are envelope **literals** that hardcode
`total: null, truncated: null`, and the trim writes `env.truncated = env.total === null ? null : env.total > keep`.
Measured on a realistic workspace: `memories 8→4` and `factoryWorkOrders 10→4` with `truncated: null` and
`total: null`. `OPERATING_TRUTH_MODEL.md` §4.4 requires **every** trimmed collection to report `shown`, the exact
`total` and `truncated: true`; the system prompt states the same guarantee to the model
("A trimmed collection's own entry in `context.collections` still carries the REAL total and `truncated=true`"),
so the prompt asserts something the code does not provide.

The #62 closure note says "both queries now carry `count: exact`". Re-derived: the `count: 'exact'` is **absent
on the primary paths** — the semantic branch is `supabase.rpc('match_memories', …)`, which returns no count, and
the non-factory-intent `canonical_work_orders` query carries none — and it is **discarded by the envelope
literals** in either case. Their `scope` strings (`'top-8 semantic retrieval'`, `'newest 10'`) also become false
statements about the pack after a trim. This is the reachable answer to
"NOT INCLUDED IN THE PROMPT != DOES NOT EXIST": for these two collections a window is all the model has, with no
total and no truncation flag to stop it counting from it.

**Fix shape:** `truncated: true` is knowable whenever rows were removed, independently of whether `total` is
exact — set it on trim and keep `total: null` (never publish `array.length` as a total; that was the first
V62-D4 fix and it was correctly reverted).

---

### V63-D6 (P2) — a malformed size-cap env var silently disables its own gate

All three whole-request caps use `Number(Deno.env.get(X) || default)`. An **absent** value falls back correctly;
a **malformed** one yields `NaN`, and every comparison against `NaN` is false:

* `SEM_AI_MAX_TOKENS='twelve-thousand'` → `packBudget = NaN` → `packTokens() <= NaN` is false on every pass, so
  the trim runs to floor 0 and **empties the entire optional pack on every turn**, with
  `contextBudget.overBudget: false`, no error and no signal to the founder. Measured: `companies 3 → 0`.
* `SEM_AI_IMAGE_BYTES_MAX` and `SEM_AI_MODEL_CONTEXT_TOKENS` → their 413 gates are simply **off**.

The incident record for #133 explicitly invites the founder to change `SEM_AI_MAX_TOKENS` in production
("or raise `SEM_AI_MAX_TOKENS` — a production config change, which is a founder-only action"), so a typo there
is a reachable production state that fails **invisibly**. `CLAUDE.md` §5 requires production to fail visibly and
safely. **Fix:** `const n = Number(env); const cap = Number.isFinite(n) && n > 0 ? n : DEFAULT;` for all three.

---

### V63-D4 (P2) — three of the last two rounds' own P1 fixes are pinned by nothing

Mutation proof over the real source, 19 mutants, whole 57-suite battery per mutant, `index.ts` restored and
re-hashed after every one (final sha256 byte-identical). **13 killed, 6 SURVIVED.**

| Mutant | What it removes | Result |
|---|---|---|
| M8 | the pre-trim id provenance capture — **the V62-D1 closure** | SURVIVED |
| M11 | the attached-image size gate (`if (false && …)`) — **the V62-D2 closure** | SURVIVED |
| M10 | the post-trim MINIMUM_SAFE_CONTEXT byte assertion | SURVIVED |
| M7 | the `effectivelyActive` org sentinel → naive `status !== 'archived'` (a company under an **archived parent** then reports effectively active) | SURVIVED |
| M6 | `companyNameById` hand-written to drop `archivedCompanies` (an archived company loses its name in the receipt) | SURVIVED |
| M17 | `contextCompanyIds` drops `archivedCompanies` (fails closed; lower severity) | SURVIVED |

M11 is the sharpest: `request_gate_inventory_contract.mjs` pins the image gate with the substring
`/imageBytes\(attachedImage\.base64\) > IMAGE_BYTES_MAX/`, which a `false &&` leaves intact. A guard that a
one-token disablement cannot move is a presence check, not a contract.

Killed for the record: the never-silent receipt (M1), the pendingAction short-circuit (M2), the create-family
postcondition (M3), the durable-read precedence (M4), a dropped envelope (M5), `packIdSet`'s `namedTargets` arm
(M9), the self-measuring budget (M12), the Mongolian verb-final rule (M13, the #62 pinned mutant), the trim's
envelope write-back (M14), `lastClauseIsMutation` (M15), newest-history retention (M16), the imperative object
test (M18), the server-side task-lifecycle re-read (M19).

---

### V63-D5 (P3) — the MINIMUM_SAFE_CONTEXT assertion is vacuous (V61-D4 still open)

`OPERATING_TRUTH_MODEL.md` §4.4 says "the set is named in source (`MINIMUM_SAFE_CONTEXT`), the trim order is
asserted against it, and a trim that touched it throws instead of shipping". The **pre-loop** guard
(`if (MINIMUM_SAFE_CONTEXT.includes(key)) throw`) is real and does the work. The **post-loop byte assertion** the
sentence describes cannot fire: the loop writes only `TRIM_ORDER` keys, and `TRIM_ORDER` is already proven
disjoint from `MINIMUM_SAFE_CONTEXT` one statement earlier. Deleting it leaves the whole battery green (M10).

Separately, mandate §3 asked whether the source set **is** the contract's set. It is 5 of the 7 rows:
`currentTurn`, `pendingAction`, `namedTargets` + `recentlyResolvedEntities`, `continuity`, `counts`/`collections`.
**Authenticated identity, organization scope and the caller's permissions are not in the pack at all** (they
travel as `{profile:{id,role}}` beside it), and the **system safety/truth contract** is the constant
`SYSTEM_PROMPT`. Those three are protected *by omission from the trimmable structure*, not by the named
assertion. Structurally untrimmable today — but the contract says the set is named in `MINIMUM_SAFE_CONTEXT`,
and it is not.

---

### V63-D7 (P3) — an unnamed whole-request gate

The inventory classifies 8 gates and names 2 UNMEASURED ones (per-request wall-clock timeout, SSE stream
initialisation). It does **not** name the platform **request-body size limit**, which is a genuine
whole-request gate: an attached image is allowed up to 5 MB *decoded*, i.e. ~6.7 MB of base64 inside the JSON
body, and a `req.json()` rejection returns a bare **500** from the generic `catch`, not one of the three
classified 413 refusals. §4.4 requires every whole-request gate to be classified and every UNMEASURED one to be
named; this one is neither. (The image's **token** cost is also unmeasured against `modelContextMax` —
`estimateRequestTokens` takes no image — but that is bounded at ~1.6k tokens by both providers against a
180,000 ceiling, so it is safe; it should still be named.)

### V63-D8 (P3) — the pinned witness claims a calibration it does not have

`request_gate_inventory_contract.mjs` says the incident fixture is "Sized to reproduce the observed 12,340-token
estimate on this workspace"; it measures **25,595**, 2.07× the number in the incident record. **Both halves of
the witness do hold** (pre-fix 25,595 > 12,000; post-fix 11,297 ≤ 11,400), so this is an evidence-integrity
defect rather than a capacity one — but a witness twice the size of the incident cannot detect a partial
reintroduction, and the stated calibration is what a reader relies on.

---

### What HELD (re-derived, not accepted)

* **0 identifiers removed vs v92** (my own extraction: 480 → 876 declared names, 396 added, 0 removed).
  Deploy surface is exactly `index.ts`: its import list is byte-for-byte v92's two remote URLs, and
  `supabase/functions/_shared/*` is not imported.
* **The estimator matches the shipped request.** `packTokens()` and the serve() preflight measure the identical
  `{command, contextPack}` shape on the identical object; the only drift is the digits of `estimatedTokens`
  written into the field it measures (≤ 1 token), against a 600-token reserve. No case ships over its own budget.
* **The budget invariant holds** across my own fixtures (built from the `.limit()` caps read out of `index.ts`,
  including `namedTargets`, `pendingAction` and `recentlyResolved/DeletedEntities`, all of which the candidate's
  own headroom fixture omits): a fitting pack is untouched; optional trims before core; history keeps the newest
  turns; the minimum safe context is byte-identical after the hardest trim; the loop terminates; an irreducible
  pack states `overBudget: true`; the refusal names which of the three limits it hit and that nothing changed.
  Worst headroom on realistic cases **680–1,072 tokens** below the 12,000 hard max.
* **V62-D1/D1b are genuinely closed.** Provenance is captured before the trim, returned beside the pack (never
  inside it), and both `packIdSet` and the durable-plan `planIdSet` union rows + provenance + `namedTargets`.
  (They are two separate copies of the same function — a drift risk nothing pins.)
* **V62-D2 is closed correctly.** `imageBytes` = decoded bytes, `IMAGE_BYTES_MAX` = 5 MB, which is exactly
  `MAX_IMAGE_BYTES` in `web/app/(app)/chat/chat-client.tsx` measured on `file.size`. The gate is unreachable
  from the product UI and is a backstop for direct API callers.
* **The v59 hardening patch is present in these exact bytes**, verified by reading the current literals, not the
  patch: `IMPERATIVE_HEAD_RE` (added frames, Cyrillic alternatives removed), `commandReadLeadEffective`,
  `MUTATION_VERB_ALWAYS` bring-back and get-X-archived groups, `READ_SHAPE`'s `do(?!\s+not|n't|\s+me\s+a\s+favou?r)`
  lookahead, `REQUEST_FRAME_PREFIX`/`commandForRead`/`lastClauseIsMutation`, and the receipt verb+entity mapping.
* **Belt as defence-in-depth, measured against v92 on my own corpus** (320 truthful negatives, 300 fabrications):
  **truthRegression 0, fabRegression 0**; the candidate catches 8 fabrications v92 misses; both belt arms are
  guarded by `requestedIntent !== null`, so with no intent nothing is rewritten.
* **Receipt matrix (mine):** 62 fabrications × 4 variants — every case where intent IS derived ends in the
  deterministic receipt with no success wording; 62 truthful read answers survive **verbatim** (0 rewritten);
  22 verified envelopes render the truthful claim; 22 executed-but-unverified envelopes never do.
* **Lifecycle (mine, on top of `company_lifecycle_matrix` 31/0):** a name matching one active and one archived
  row prefers the archived one for restore; a non-existent model id runs no RPC and leaves a truthful line; a
  task command invents no company line; a punctuated exact name resolves from the command; a restore word inside
  a NAME never flips an archive; an ambiguous name asks and executes nothing.
* **TDZ / bytes:** my own block-scope analysis over 1,018 `const`/`let` declarations plus function and arrow
  parameters found **0 real forward references** — all 30 flags classified by hand as property keys, arrow
  parameters or the closure-shielded `UUID_IN_TEXT` read inside `safeDisplayLabel` (initialised before any call).
  **0 bare LF.** One **bare CR** at byte 550,469 (line 6,580) inside a `//` comment — a valid ECMAScript
  LineTerminator, not runtime-fatal, but the file is not strictly CRLF-uniform.

### Coverage I could NOT obtain, stated as gaps rather than skipped

* **`deno check` — BLOCKED.** The session harness gates every `npx` invocation. The runtime-fatal classes
  (TS2448/TS2454/TS2304/TS2552/TS2551) are covered only by my own scan and the repo's
  `tdz_forward_reference_contract.mjs`, not by a type checker.
* **Deployed-bytes provenance — BLOCKED.** `supabase functions list/download` is gated the same way. I verified
  byte-directly that **git `c9dfab5bd433` is LF-pure with sha256 `795c20c8…`**; the link *deployed v92 == that
  commit* is **not** established in this session.
* **Live request-shape acceptance — BLOCKED.** No browser tools and no live call. Under the two permanent rules
  added to `CLAUDE.md` this round, **every conclusion in this entry is source-level or harness-level and would
  still need live acceptance to be trusted.**

### Residuals sized, not closed

* Russian imperatives (`архивируй компанию ACME`) derive no intent — outside the declared EN/MN product scope.
* **V61-D5 still open and now measured:** `continuity.compactionCheckpoint.summary` is inside
  MINIMUM_SAFE_CONTEXT, is never `shorten()`ed, and comes from an unbounded `text` column. A 60,000-character
  summary measures **17,090 pack tokens → 413**. Latent only: nothing in `supabase/` or `web/` writes
  `compacted_summary` today.
* 9 secondary create families (department, lead, document, product_line, product_spec, drawing, proposal,
  ai_provider, work_order) still record `postconditionPassed: true` from the insert's own return rather than a
  fresh re-read; the 9 core families do re-read. The drift guard explicitly accepts `!error && data` as a gate,
  so this is a deliberately scoped partial closure.
* The `_shared` mirror guard compares **exported names only**, not bodies. Harmless for the deploy surface
  (`_shared` is not imported by `index.ts`) but it is not a drift guard on behaviour.
* `planIdSet` is a second copy of `packIdSet`; nothing pins that the two stay identical.
* Belt false positive, **v92 parity**: `"Nothing Ltd was created before this conversation."` reads as a
  completion in both builds; inert in the candidate without request intent.
* The battery is **64** `.mjs` suites on disk, not the 53 claimed. **62/64 pass.** Both failures are
  self-declared standing reds about machine and repo posture, not the Edge candidate:
  `factory_production_write_inventory` (now **11** PRODUCTION_WRITE factory scripts, up from the 10 its own
  header expects — `supervisor.mjs` was added between v92 and this candidate) and `production_write_authority`
  (this machine holds a working Supabase CLI production credential in the Windows Credential Manager; a
  scrubbed-environment `supabase projects list` returned the production project). Both are founder-only
  remediations.

### Regression added

`qa/verification/proposed/v63_regression_additions.mjs` — 19 CONTRACT rows (all green on these bytes) and
8 DEFECT rows (all red while the findings are open; the file exits nonzero). Every behavioural row executes a
window sliced out of `index.ts`; nothing is re-implemented. Supporting probes:
`qa/verification/scratch/v63/{v63_budget_probe,v63_archived_gate_probe,v63_floor_reach,v63_floor_detail,v63_receipt_matrix,v63_intent_fn_probe,v63_belt_and_lifecycle,v63_env_gate_probe,v63_tdz_scan,v63_mutation_proof,v63_delta,battery}.mjs`.
