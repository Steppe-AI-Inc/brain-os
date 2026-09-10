# BRAIN OS — CANONICAL CHECKPOINT

Written 2026-09-08. A completely fresh session must be able to resume from this file alone.
Update it before every long wait. `qa/verification/CURRENT_CAMPAIGN.json` is the machine-readable twin.

## CAMPAIGN GOAL

Get the `sem-ai-command` Edge candidate through independent verification to a production deployment that
survives live acceptance, under the contract bar: **conformance to `governance/OPERATING_TRUTH_MODEL.md`,
never parity with the deployed build.** Then hand the six Work-PC defect classes to the Work PC for
independent live acceptance. The Work PC alone closes bugs.

## CURRENT MILESTONE

**Verifier #82 FAILED and IS CLOSED.** Its three P1s are fixed structurally from its own prepared patch;
its P2 is registered open with its numbers; its harness findings are carried forward with theirs.

Implementation worktree `C:/Users/Dell/dev/brain-os-wo-resolver` (branch `wo/clarification-resolver`),
HEAD **`ab3fb939`** — "verifier #82 closure: D1/D2/D3 fixed structurally, D4 registered open, H1 decided".
index.ts sha256 **`324230d9c9445709498b3a11e2892e5dd693651228971368a563d392c6594dda`**, **748 841 bytes**,
CRLF-pure, 0 bare LF, 0 bare CR, 0 x 0x08.
**The main repo `C:/Users/Dell/dev/brain-os` is NOT the candidate** — different, older file, other branch.

NEXT: gates re-running on the quiet tree, then a fresh restore-tested backup, then the freeze commit, then
verifier #83 on campaign 143.

### What #82 found, and what was done with it

* **V82-D1 (P1)** Mongolian puts its predicate NOUN last too. #81's positional closure said "a bare
  imperative is the command exactly when nothing but sentence-final particles follows it", which closed the
  clause-initial and clause-medial halves and opened the position Mongolian uses for a copular predicate.
  `Alpha-г битгий устга. Асуудал нь оноо.` stopped being a refusal, so every mutating field survived and
  **the delete the founder forbade executed**. 18 of 18. CLOSED: a stem after `нь`/`бол` is a predicate
  noun. 18 -> 0, 0 of 18 live imperatives lost.
* **V82-D2 (P1)** `typeNamedIn` stripped a trailing `s` while this file has owned `pluraliseEntity` since
  #72: "companies" -> "companie", "people" -> "people". A non-null WRONG type makes the type-agreement
  check conclude the denial is about something else, so **the fabrication ships on a turn that canonically
  READ the row it denies**. 6 of 21. CLOSED by consulting `pluraliseEntity`.
* **V82-D3 (P1)** a line break is a clause boundary nowhere in this file, so a two-line turn is one clause
  and all three consumers are wrong differently — the founder's request refused with a false receipt
  (90 of 90 EN, 6 of 6 MN), a TRUE denial about another entity rewritten (V74-D3 reopened by a newline),
  and the truthful half of an answer deleted. CLOSED, with the guard as the whole design: a line break is a
  boundary only where the line FINISHED its clause.
* **V82-D4 (P2) OPEN, RED, CLASSIFIED — 25 of 25**, a regression #81's closure introduced.
  `Beta-г архивла одоо` ("archive Beta, now") is answered "you asked me not to". The derived fix has been
  written and REVERTED TWICE: there is no Mongolian verb lexicon here, so it read an ordinary participle
  predication as a live command and 15 of 15 nominal predications went live — the expensive direction, and
  exactly the hole D1 had just closed. **A derived test needs something to derive from.** All 25 rows err
  in the cheap direction, so this is registered with its number rather than traded away.
* **V82-H1 DECIDED, not satisfied.** #81's V81-H2 and #82's V82-H1 assert opposite properties of the same
  digest. Decided in favour of exceptDeploy — normalise the inputs that vary by checkout, hash the deploy
  surface RAW — because `.gitattributes` guarantees its bytes everywhere and normalising them would leave
  the gate VALID after a conversion of index.ts to LF. The override is recorded in the source, not only
  here.
* **STILL OPEN, and the largest instrument finding of the campaign: V82-H5** — 14 of 102 suites cannot see
  any mutant (they read the repo copy, not `SEM_INDEX_SRC`), so every mutation-survival number here is
  about 88 suites. **V82-H6** — `_gate_extract` caches the source at module scope, so an in-process
  instrument that switches `SEM_INDEX_SRC` measures the FIRST source and reports "nothing changed".
  Both are in #83's prompt as its opening suspicion.

### Rounds #74-#82 all FAILED. What the last five were about

* **#78, #79, #80** — three consecutive rounds where the previous round's CLOSURE was the next round's P1,
  every time because the closing session measured its change on a corpus that could not exercise it.
  Ledger 166/167/168.
* **#81** — the first round in four whose P1s were PRE-EXISTING. Mongolian verb-final position had been
  asserted by a comment and enforced by nothing; `DENIAL_SUBJECT` was decided leftmost-first. Ledger 169.
* **#82** — the positional closure met the position Mongolian keeps its nouns in; a plural denial named a
  type that agreed with nothing; and a line break was a clause boundary nowhere. Ledger 171.
* **Ledger 170, and the thing to carry forward:** closing #81 exposed a CONTRACT row that reported a defect
  THAT DOES NOT EXIST — it chose which of two measurements to run by matching the decider's source text.
  **For every red, ask whether the row could be measuring something other than what it names.** #82 added
  the softer half: a row whose LABEL said the opposite of what it checked, passing green. **For every
  green, ask whether the row's name describes its assertion.**

### State at this checkpoint

* battery **103 suites — 91 GREEN, 5 GREEN-but-asserts-nothing, 2 BLOCKED-FOUNDER, 5 OPEN DEFECT-THIS PC,
  0 unclassified RED**, 4 010 assertion rows, 67 `.sql` suites named but not run
* `harness_rename_probe` is VALID_FAIL BY DECISION — derived rename set, 38 pins and 26 anchors, backlog in
  `qa/verification/RENAME_PIN_BACKLOG.md`. **Repair a suite; never shrink the set.**
* a finished report outranks the watchdog's text classifiers

## PRODUCTION (unchanged since the rollback)

| | |
|---|---|
| `sem-ai-command` | version **94**, ACTIVE, carrying **v92 source** (`795c20c8…`), byte-verified against git `c9dfab5bd433` |
| How | v93 (`821f530`) deployed 2026-09-08T01:50Z, P1 found by live acceptance, rolled back 02:10Z |
| Migrations | none pending from this campaign |
| Web | current `master` on Vercel; no web change in this package |
| Release state | **FAILED**, not Team-Ready, `ready_for_retest` false, **nothing CLOSED** |
| Rollback target | v92 source / function v94 / ezbr `22486cd751cac403` |

**Bytes `715246f3…` (commit `821f5308…`) are KNOWN BAD — never redeploy them.** The 2026-09-08
`ALLOW_FUNCTIONS_DEPLOY=1` was scoped to exactly those bytes and is VOID. Any deployment needs a fresh
founder authorization scoped to its own exact bytes.

## AUTHORIZATION STATE

None active. The next production action of any kind is a founder-only boundary.

## HISTORY — completed in rounds #60-#65 (kept for provenance, not current state)

Closed structurally, each pinned by a mutant: the context budget degrading instead of 413ing, with a named
minimum safe context; id provenance surviving a trim; the request lexicon no longer vetoable by the model;
imperative-position intent; Mongolian morphology and verb-final position; postconditions failing closed and
re-read from the field that changed; the image gate bounded by size rather than counted as text; three
duplicated concepts converged onto single canonical definitions.

Governance: `OPERATING_TRUTH_MODEL.md` §4.4 carries
`TOKEN_BUDGET_EXHAUSTION_MUST_DEGRADE_CONTEXT_NOT_PRODUCT_AVAILABILITY`; `CLAUDE.md` records that static
verification cannot substitute for live request-shape acceptance and that byte-identical deployment is not
product-safe deployment. Ledger entries #133-#141.

## EVIDENCE ON THE CURRENT CANDIDATE

Six gates, recorded with an INPUT DIGEST so a stale one cannot be quoted as current
(`node qa/verification/gate_evidence.mjs` prints the table; `run --force` re-takes them):

| gate | what it establishes |
|---|---|
| `battery` | 99 suites, every failure classified; 0 unclassified RED |
| `mutation_proof` | 19 mutants, each proved EFFECTIVE before its survival is read; 0 surviving, 0 ineffective, 0 harness failures |
| `harness_rename_probe` | no suite asserts a product property by naming a local identifier |
| `founder_acceptance_corpus` | the founder's own turns, replayed |
| `tdz_triage` | 0 eager forward references; nothing runtime-fatal |
| `backup_restore` | the newest bundle RESTORES, and the restored deploy bytes hash to the candidate |

**A gate goes STALE the moment any declared input changes**, which is the point: editing a battery suite
invalidates the battery and the mutation proof, and they say so rather than reporting yesterday's number.
Re-derive before quoting any of them.

`harness_rename_probe` was deliberately left FAILING at one point this campaign, naming exactly one suite
(`v78_regression_additions`, whose V78-C5 row lifts a window by six local identifiers). If it is red, read
the named suite before assuming a regression.

Token-budget incident conditions (founder §7): request-budget contract GREEN, fresh-channel 413 witness
GREEN on both halves, trimming semantics GREEN — **but the incident is NOT resolved**, because none of the
three is a live request and that is precisely the rule the incident produced.
## HISTORY — work alongside #69, 2026-09-09 (superseded by rounds #74-#79)

The Edge candidate was frozen throughout: `index.ts` in `brain-os` is `006a0c3f…` before and after all of it.

**Harness, on `p1/execution-truth-governance` (ledger #150).** A model-scoped provider limit ("You've reached
your Fable limit. Switch to another model") matched no capacity pattern, so the watchdog logged
`BLOCKED — OTHER` and scheduled a retry of the same exhausted model. `classifyProviderOutput` learns the
shape; `isModelScopedCapacity()` separates *wait for the reset* from *rotate the model*; the watchdog now
takes a MODEL LIST, passes `--model` explicitly, rotates instead of sleeping, and stops with exit 6 when the
list is exhausted. 18/18 regressions. **#150b**, same entry: `kill <pid>` left the watchdog's sleeping child
alive and it dispatched a SECOND concurrent verifier into the same worktree 600 s later — stop a process
GROUP, and never edit a running shell script in place.

**Two P1s, on branch `wo/embedding-observability` (based on `0ca756e`).** A SEPARATE source window; merging
it produces a new SHA needing its own verifier round.
- `EMBEDDING_DEGRADATION_MUST_NOT_BE_SILENT` (ledger #144): outcome-returning embedding calls, the retrieval
  MODE recorded, degradations in `contextErrors` + audit metadata + the `done` payload. **7/24 -> 24/24**,
  mutation proof **14/14**.
- `PROVIDER_FAILURE_MUST_BE_OBSERVABLE` + `REQUESTED_MODEL_ALWAYS_RECORDED`: `classifyProviderFailure()`,
  the requested model recorded BEFORE the call from one helper with two callers, and a classified
  `ai_command_provider_call_failed` on every failure. **5/22 -> 22/22**, mutation proof **15/15**.
- Battery in that worktree: **81 suites, 3 problems — the identical set the frozen candidate produces**.
  `deno check` 19 diagnostics in the same classes, zero runtime-fatal. CRLF-pure.
- Two `stripTS` gaps closed (generic constructor type arguments; typed catch bindings) — without them the
  real embedding window could not be executed at all.

**Audits (no code change).** `qa/PROMPT_CACHE_AUDIT_2026-09-09.md`: the cache-hit rate is not low, there is
no cache — `cache_control` appears nowhere, the counters are never read, and `model_usage` has no columns to
store them; `SYSTEM_PROMPT` is ~18,824 tokens re-sent uncached every turn and is not counted by
`estimateTokens`. `docs/FOUNDER_ACTION_RUNBOOK.md`: the production-write boundary re-measured — **5 of 7
routes still red, every one of them a founder-only credential or account action**; the eleven factory-runner
scripts that inherit ambient authority are the one non-founder item and are deliberately not started
(`provider.mjs` is load-bearing for the running watchdog — the #150b hazard).

**Backups.** `E:/My Drive/17.4. R&D CLAUDE CODE/backups/` — `git bundle --all` (verified complete) at 10:22,
10:47 and 10:55, plus a verification tarball. `p1/execution-truth-governance` is ~59 commits ahead of
`origin` (`26c0f3e`); rounds #60-#69 and all of the above live on this disk and in those bundles only.

## OPEN WORK, BY PRIORITY

**P1** — verifier #69's verdict on the new candidate.
**P1 (from the provider audit) — FIX PREPARED AND MEASURED, LIVE OUTAGE STILL OPEN.**
`EMBEDDING_DEGRADATION_MUST_NOT_BE_SILENT`, `PROVIDER_FAILURE_MUST_BE_OBSERVABLE` and
`REQUESTED_MODEL_ALWAYS_RECORDED` all exist on `wo/embedding-observability` with contract suites and
mutation proofs (see the section above). What remains is **not implementable here**: the live cause needs
audit test T5 — one read-only `POST /v1/embeddings` with the **Edge** `OPENAI_API_KEY` — which is a
founder-only credential action, and 63 memories still carry no vector, so a backfill also waits on a working
key. See `qa/AI_LLM_PROVIDER_RELIABILITY_2026-09-08.md` and ledger #144.
**P2** — 23 registered duplicated-concept pairs (ledger #141), the largest a seven-list family describing
"words that claim something was done"; convergence is the first item of the next source window.
V61-D5: `compactionCheckpoint.summary` is untrimmable unbounded narrative.
**P3** — one bare CR in `index.ts` (~offset 554,776, harmless, awaiting a source window);
`sem_ai_command_confirmation_truth.mjs` re-implements product logic and has a drift guard rather than a real
fix; model-specific token limits still UNMEASURED; the platform request-body limit named but unmeasured.

**Registered deliberate gaps** (not part of any deployment claim): lifecycle controls on child surfaces
beyond People; archive-instead-of-delete for projects, departments, documents, leads and approvals.

## HISTORY — the #68 closure (NOT this round; see CURRENT MILESTONE)

**V68-D1 (P1).** `STRONG_OBJECT` was the EIGHTH re-spelling of the entity vocabulary — 25 hand-written
nouns against the canonical ~80 — and only a MULTI-CLAUSE command reaches it, so #67's corpora never
executed it. 198 of 207 fabrications shipped; the control with a listed noun shipped 0 of 72.
**V68-D2 (P1) — INTRODUCED BY THE #67 CLOSURE.** Its "a referring token counts wherever it sits" was
implemented POSITION-FREE, so "Transfer pricing for the business unit" became a mutation request and the
receipt DELETED the truthful answer: truthful reads acquiring intent 2/40 -> 31/40, answers destroyed
1/8 -> 8/8. The #67 session reverted one member of this class and kept another with the same disease.
**Fix, in the verifier's own words:** the vocabulary went to the tier that needed a POSITION rule and the
position rule to the tier that needed the VOCABULARY. `STRONG_OBJECT` now derives from the one definition;
`IMPERATIVE_OBJECT` matches an entity noun in the HEAD REGION (head, or behind at most one modifier).
**V68-D4a/b (P2).** A purchase order was reported as a work order; the receipt said "persons".
**V68-D3 (P2, harness).** `concept_duplication_ratchet_contract` never learned `ENTITY_NOUN_ALTERNATION`
when #67 converged onto it, so an eighth spelling was undetectable. It now carries every canonical
definition - **registering the name is part of converging a concept, not a follow-up.** Ledger #149.

**Evidence on the new candidate** (index.ts sha256 `006a0c3f...`, 607,490 bytes): battery
**74 green / 2 red by design** (76 suites); `v68_clause_and_vocabulary_contract` **13/0** (all 7 defect
assertions pass); `v67` 23/0; `v66` 71/0; `mutation_sweep_safety_contract` **52/0**;
**`v68_mutation_proof` 4/4 killed**, candidate byte-identical after each.
**`deno check` re-derived**: 19 diagnostics, **zero** runtime-fatal. CRLF-pure, 1 pre-existing bare CR.

## NEXT EXECUTABLE ACTION

**Dispatch verifier #83, campaign 143**, on the freeze commit made from `ab3fb939` in
`C:/Users/Dell/dev/brain-os-wo-resolver`. Nothing about it needs founder input.

Order, and every step before the dispatch is a durability step:

1. finish the six-gate run on the quiet tree (`node qa/verification/gate_evidence.mjs run`, in the
   wo-resolver worktree, and **touch no harness file while it runs**)
2. fresh bundle + **restore test** — V82-H7 found the frozen candidate missing from the newest bundle,
   which is a provenance gap in the commit being offered for deployment
3. freeze commit; re-derive the exact index.ts sha256 from the DEPLOY BYTES, not from `git show`
4. dispatch:

```
cd C:/Users/Dell/dev/brain-os
bash scripts/factory-runner/dispatch-isolated-verifier.sh <freeze-commit> 143 83 \
    qa/verification/scratch/verifier83_prompt_template.txt
```

The #83 template is WRITTEN (`qa/verification/scratch/verifier83_prompt_template.txt`). Its opening
suspicion is V82-H5/H6 — the suites that cannot see a mutant, and the module-scope source cache that makes
an in-process instrument report "nothing changed". The dispatcher REFUSES a prompt containing any
unsubstituted `__PLACEHOLDER__`.

Then act on the verdict automatically: FAIL → reproduce only genuinely new findings → root cause →
same-defect sweep → structural fix → regression → mutation proof → affected gates → global battery → new
SHA → backup → dispatch #84. PASS → inspect the real artifact, confirm it tested the exact frozen bytes,
classify every observation, confirm no unresolved candidate P0/P1, then the release package.

**Do NOT re-run a completed scenario** when its evidence is persisted, its provenance is valid, the
candidate SHA is unchanged, and the new change cannot affect it.

### Standing rules that have each cost a round

* **Never edit a harness file while a gate is running.** Every gate spawns one process per probe and
  re-reads the harness each time; it has no snapshot. The mutation proof now detects this, but the rule is
  cheaper than the detection.
* **Validate an instrument before believing it**, especially when it disagrees with the code.
* **A backslash typed through the tool transport is halved.** Build one with `String.fromCharCode(92)`, or
  write a pattern that needs none. `\b` inside a single-quoted string is a BACKSPACE, and a literal 0x08
  has reached these files three times.
* **Deploy identity comes from the deploy BYTES**, never from `git show` — the blob is LF, the surface is
  CRLF, and the two hashes must differ.
* **A row's NAME is part of its assertion.** A label that says the opposite of what the test checks passes
  green and misleads the next reader in the place they are most likely to look — the same class as a row
  that reports a defect that does not exist, one notch quieter.
* **A classification that keeps naming a green row is a standing excuse for a red that is not there.**
  Narrow it the moment the row goes green.
* **Prose describing an escaping defect crosses the same transport as the code.** Ledger 171's own
  escape-depth paragraph landed on disk saying a backslash is halved to a backslash — a sentence about two
  different strings, printing them identically, and therefore stating nothing. Build the characters with
  `chr(92)` / `String.fromCharCode` in the PROSE too, or write the note through a tool that does not
  re-escape.
* **When an exact-match patch fails against text you can see in the file, suspect the transport before the
  file.** Three replacements failed with "substring not found" this round for exactly that reason.

## WORK-PC HANDOFF STATE

Branch `qa/home-pc-handoff` at `7abc5a4`, pushed. Six fix reports carry
`ready_for_retest: false` and status "FIX PREPARED — DEPLOYED 2026-09-08 THEN ROLLED BACK THE SAME HOUR".
The README warns that the CURRENT production build can also hard-stop: a saturated workspace estimates
17,038 tokens against its own 12,000 cap, and the founder's real workspace sits roughly 1,430 below it.
**Home PC must never mark a Work-PC bug CLOSED.**
