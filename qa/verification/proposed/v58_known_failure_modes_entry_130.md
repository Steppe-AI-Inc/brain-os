## 130. Verifier #58 (campaign #118) — candidate `5ebc6953` under the CONTRACT bar: a chat **task restore can never execute** (the pack never carries `context.archivedTasks`, so the restore filter has nothing to match; task archive and goal archive/restore are filtered by the capped window — BUG-014's class, one entity type over, identical in deployed v92); the "imperative-only" company fallback is a deny-list of leads and executes on 27/56 declaratives when the model emits nothing — FAIL, FIX PREPARED (scratch copy, measured), regression suite red by design

**Verdict.** **FAIL** on `5ebc6953ca6665ccc22c54bee6c8573d8ee2ed62` (index.ts sha256
`0fd05a92b3a088bca59b22ce41b74dcd826c7b1b46c3f9e229255aa390fe317b`, preserved byte-for-byte; asserted before and
after every scratch mutant). The bar is conformance to `governance/OPERATING_TRUTH_MODEL.md` (founder ruling
2026-09-07); deployed v92 is a reference corpus only. The #57 closure (ledger #129) is real and measured clean on
every shape #57 failed: `other` vetoes the lexicon (0/51 truthful reads replaced with a classification present), the
company fallback honours `requestIntent.entityType` (8/8 other types withhold), the D4 crowd-out is closed (70
fillers), the polite lifecycle question executes. The machinery re-derives clean for the third round running:
envelopes, never-silent receipt, precedence, persistence, server-side **company** resolution, belt vs v92 with
**0 truth regressions on both packs**. What fails is outside the layer the last two closures touched — and inside the
scope the founder named for this round (company, **task**, goal archive-restore).

**Found by** verifier #58, an independent process in an isolated worktree, executing windows sliced from the real
`index.ts` through the repository's own detyper (`_gate_extract.mjs`), never a re-implementation. Every number below is
my own run; the record's counts were treated as pointers. `npx` (deno, supabase CLI) was gated in this session for bare
and compound forms; no browser tools — the gaps are stated as gaps.

### The defects

**V58-D2 (P1, contract; parity with deployed v92; in the founder's stated scope) — a task restore from Brain Chat can
never execute, and task/goal lifecycle targets are gated by the capped context window.** `buildContext` queries the 15
most-recently archived tasks (`index.ts:2304`, comment at :2300: "restoreTaskIds would have nothing to resolve from
without this separate query"), envelopes them in `context.collections.archivedTasks` (:2635), and the prompt tells the
model four times to resolve restores from `context.archivedTasks` (:971-:984) — **but the pack literal (:2639) never
sets `archivedTasks`.** `contextArchivedTaskIds` (:3053) is therefore always empty and `restoreTaskIds` (:3106) always
`[]`: executed through the real slice, a model-emitted id of an archived task the caller can see yields
`restoreTaskIds: [] / 0 RPC calls / report null`, even when the same task is inside `context.tasks`. `archiveTaskIds`
(:3104) and `archiveGoalIds`/`restoreGoalIds` (:3803/:3805) are filtered by membership in the 15-/20-row window: an id
the model carried from history for a row outside the window is silently dropped. The founder then reads the
never-silent receipt with the **wrong entity**: "No change was made — I could not resolve which **company** you meant
(searched the active and archived **companies** you can access)" on a task request. This is OTM §5 row 5 ("restore of a
known entity refused because it was outside the context window") and CWC §2 ("chat never resolves a lifecycle target by
filtering to what happens to be in the context pack") — the exact class ledger #121 (BUG-014, CONTEXT_WINDOW_AS_UNIVERSE)
closed for companies. The same code is byte-identical in deployed v92 (:2597-:2606 there; no `archivedTasks` pack key),
so this is **not a regression** — it is a class the P1 package fixed for one entity type while the constitution's §6
same-class search would have found it for tasks and goals in the same file. Under the founder's FAIL list ("any lifecycle
request that ends silent or gated by the context window") it blocks; the founder may explicitly waive it as parity.

**V58-D1 (P2, conditional on the model emitting no `requestIntent`) — the "imperative-only" gate is a deny-list of
leads.** Ledger #129 says "non-imperative leads never execute". On my 56-sentence corpus with the model emitting
nothing, **27 execute** an archive/restore RPC on an exact-named company: "the board recommended we archive Alpha",
"Bob suggested we archive Alpha", "legal recommends that we archive Alpha", "my view is we archive Alpha", "I'm
wondering if I should archive Alpha", "I am thinking we could archive Alpha", "I'm considering archiving Alpha",
"we're thinking about archiving Alpha", "I might archive Alpha", "we could archive Alpha", "I guess we could archive
Alpha", "we were about to archive Alpha", "I nearly archived Alpha", "I almost restored Beta", "once the audit is done
we archive Alpha", "only if Bob agrees, archive Alpha", "Bob will archive Alpha", "we discussed archiving Alpha", "the
meeting was about archiving Alpha". The promoted v57 suite pins only the 10 shapes #57 found. With `kind = read/other`
the gate withholds (verified); the receipt is truthful ("Alpha: archived.") and reversible; v92 had no command-name
execution at all, so this is a new-direction departure from v92 that is **not** intended. P2 because it needs a
schema-non-compliant model turn — but the closure text is overstated and the shape (a list of forbidden leads instead
of a test of imperative position) is the entity-specific-patch pattern the constitution names.

### Sized residuals (not blockers under the bar; stated with size)

* **Lexicon tier with the model omitting `requestIntent`** (V57-D5 class, both directions): own generator 25 verbs × 47
  wrappers = 1 175 — FN 143 (12.2 %): "Do me a favour and …" 25/25 (the `do` read-lead), "When you get a moment, …"
  25/25, "archive X?" 25/25, "get X archived" 23/25, quantifiers *all / both / every one of / those: / the following:*
  8-9/25 on object-guarded verbs; other languages 5/12 (de/ru/es/fr/ja), slang 17/20; FP 13/51 on my read corpus (the
  #57-D1 shapes recur when no classification is given). With `kind = mutation`: FN **0/1 207**; with `kind = read/other`:
  FP **0/51**. Live compliance of the structured tier is unmeasured here (no browser / API).
* **Contradicted state claim on a mutation-intent turn**: 64/64 rows end in the truthful "Actually, X's status is …"
  correction with the fabricated prose dropped but without the literal "No change was made" line (§3 rule 3 wording; no
  success wording ships).
* **Four `recordExecution(…, true)` literals** iterate `DELETE … RETURNING id` rows (channels, approvals) or the
  permanent-delete RPC's `reason === 'deleted'` — backend results, no inverse re-read (P3). The other 28 are gated on
  `changed === true && postconditionPassed`; the create family is re-read under RLS.
* Legacy `context.counts` keeps 11 `?? array.length` fallbacks (only when the exact count is null); the `_shared` ↔
  `web/lib` mirror drift guard OTM §4 cites still does not exist (off the deploy surface); read-shaped fabrications ship
  by design (694/694 on my corpus; v92 caught 406 by tense) — the INTENDED departure under §3 rule 2, sized 58.5 %.

### What is clean — re-derived, not restated

* **Provenance / delta:** git `c9dfab5bd433` index.ts sha256 `795c20c8…` (321 370 B) == the in-tree live download;
  integration-level (no CLI). LF-normalised v92 4 313 lines / 555 declared identifiers → candidate 6 433 / 898: **343
  added, 0 removed**; imports identical; 0 non-comment `_shared` mentions — deploy surface is exactly `index.ts`. Raw
  candidate 6 432 CRLF, 0 bare LF.
* **Receipt / final-claim rule (own matrix):** 64 fabricated completions × 6 variants = 384 cases — 0 fabrications ship
  with intent derived; 217 read cases verbatim; 44 verified envelopes render; 66 unverified / denied / wrong-id never
  claim; a verified create beside a fabricated archive renders only the create.
* **Intent purity:** derivation reads only `requestIntent`, the action arrays and `activateAiProviderId`; same command ×
  6 replies → one intent (5/5); `pendingAction` never changes it (5/5).
* **Company lifecycle (own attack 161/161 with the composed receipt):** model kind read/other/confirmation withhold;
  entityType task/person/goal/project/department/lead/document/approval withhold, null/company/other allow; other-entity
  fields withhold 13/13; punctuated / Unicode / quoted / lowercase / punctuation-stripped names via command,
  `*CompanyNames` and `targetName` 24/24; fuzzy command asks even with one option; model-name fuzzy executes only when
  unique; lifecycle words inside names never flip; nonexistent / malformed ids leave a line; twins prefer the wanted
  status, two archived twins ask; disambiguation replaces a model-armed pendingAction with typed options; RPC error /
  denied / not_found / postcondition-false / foreign_org / empty / changed-without-key never yield success; idempotency
  truthful; restore outside the window by name and by id.
* **Envelopes / persistence / precedence / receipt==ledger / postconditions:** 27 pack arrays enveloped; capped queries
  carry `count: 'exact'`; total never from array length; companies split active/archived newest first; persist
  unconditional after `turnVerdict` + `verifiedResponse`; history window executed (UNVERIFIED marker, receipt kept,
  `verified: null` when unknown); precedence executed (valid durable > stored; expired / untyped / unsourced / no-expiry /
  null durable yields; expired durable + 31-min stored → nothing; legacy pendingConfirmation 45 min → nothing); durable
  write 30-min TTL, typed-only, CAS on version. A stale durable row binds only inside its TTL.
* **Belt vs v92 (own 1 550-row corpus, 856 truthful / 694 fabrications, 12 negator-initial names, possessives incl. bare
  apostrophe):** three-arm prose path TRUTH_REGRESSION **0** on both packs; FAB_REGRESSION 90 empty pack only (all
  possessives of negator-initial names, 0 populated); FAB_RESCUE 40/142; TRUTH_RESCUE 106. e2e intent + empty ledger:
  receipt 1 550/1 550, 0 fabrications ship. e2e no intent: 0/4 650 rewritten.
* **Battery / gates / TDZ / bytes:** 57 suites on disk, 55 exit 0, 2 machine-posture reds, 5 SUPERSEDED stubs; gates
  v48–v52, v54–v57 green, v46 33/3 and v53 33/1 the recorded standing reds (v47 file absent). Own block-scope scanner: 0
  SYNC use-before-declaration, 1 deferred (`UUID_IN_TEXT` :5166 → :5201, first invocation :5675 — safe); the same scanner
  reproduces exactly the V54-P0 pair on `8eb8cbd` (non-vacuous). 197/197 regex literals construct. **`deno check`
  BLOCKED** (npx gated; no compiler on disk); a whole-file V8 parse of the detyped source was not achieved (the generic
  detyper leaves TS constructs after six extensions) — every changed block executes in V8 through the windows instead.
* **Suite integrity (Step 3):** `_gate_extract` request-side defaults are faithful (a no-intent turn is untouched by
  construction; suites that assert correction set a command); run8/D59, run11 livePrecedence, lifecycle_evidence S/P6,
  v49–v53 SUPERSEDED pins all follow the contract. **Vacuity: 24 faithful mutants on scratch copies × 27
  `SEM_INDEX_SRC` suites — 24 killed** (receipt block deleted; pendingAction exempts again in both consumers;
  create-family literal true; durable read last; a real pack envelope dropped; envelope total from length; persist
  gated; UNVERIFIED marker dropped; verified=true when unknown; other/read veto removed; entityType / question /
  other-target gates removed; fuzzy command executes; intent from `result.summary`; turnVerdict intent null; stored TTL
  removed; evidence on already_archived; whole-name query dropped; direction by last verb; postcondition-false supports
  a claim; receipt appends the model prose). One unfaithful mutant (dropping the `archivedTasks` envelope) survives
  because `archivedTasks` is not a pack array — which is V58-D2 seen from the other side.

### Root cause (one class)

BUG-014's closure resolved **company** lifecycle targets server-side and left the task and goal paths on the pre-fix
shape (window-membership filters), while the pack never carried the very collection the prompt and the filter depend on.
The imperative gate was written as a list of leads to refuse instead of a test of where the verb sits. Both are the
entity-specific / shape-specific patch the constitution (§1, §10) exists to prevent.

### Fix — PREPARED, not applied (no write authority on `index.ts`)

`qa/verification/scratch/v58/v58_fix.mjs` → `index.fixed.ts` (CRLF-pure): **F1** the command fallback additionally
requires the lifecycle verb in imperative position (head of the command after politeness / adverb / connective /
polite-frame words, or head of the last clause after a non-conditional lead) — 27/56 → 1/56 ("would you archive Alpha",
a polite request), imperative controls unchanged, #56 `lifecycle_harness` 56/1 = candidate; **F2** the pack carries
`archivedTasks`; task and goal ids the model emits are re-read from `tasks` / `goals` under the caller's RLS across
every status (the RPCs re-derive authorization) and unresolved ids leave a truthful line — a chat restore of an archived
task by id now executes, an archive outside the window executes, an id the caller cannot see leaves "could not be
found"; **F3** the receipt reason names the entity the request was about. Measured on the fixed bytes: all 27
`SEM_INDEX_SRC` battery suites green (collection_envelope 57/0 with the new key), `company_lifecycle_matrix` 31/0, v56
129/0, v57 306/0, own lifecycle attack 161/0, task-restore trace all green, TDZ 0 SYNC, 0 bare LF;
`v58_regression_additions` 48/0 (29 CONTRACT + 19 DEFECT rows red on the candidate by design).

**Status.** FAIL — deploy blocked on V58-D2 (P1, contract, v92 parity, founder may waive) with V58-D1 (P2) carried;
FIX PREPARED for both, measured, not applied. Gaps: no `deno check`, no live CLI download, no browser / AI-chat turn in
this session type.
