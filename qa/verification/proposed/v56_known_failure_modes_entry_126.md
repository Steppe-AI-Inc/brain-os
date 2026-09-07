## 126. Verifier #56 (campaign #116) — candidate `e79eb658` under the CONTRACT bar: the request-intent gate is a head-verb regex, so ordinary mutation phrasing ships fabrications and verb-headed read questions are rewritten; the company-lifecycle command-name fallback executes archive/restore RPCs on questions and on explicit negatives ("do not archive Alpha") — FAIL, FIX NOT PREPARED (no write authority on `index.ts`), regression suite red by design

**Verdict.** **FAIL** on `e79eb658db6b5298f02977a8ce77719da16d4218` (index.ts sha256
`4f5c85a920b77aa4d7ed9d04b19b16c00f0a78623eb937319f983e140994c01e`, preserved byte-for-byte; asserted
before and after every temporary in-place mutation, all restored). The bar for this round is conformance to
`governance/OPERATING_TRUTH_MODEL.md` (founder ruling 2026-09-07); deployed v92 is a reference corpus only.
The candidate implements the contract's *machinery* correctly (envelopes, receipt, precedence, persistence,
server-side resolution — all re-derived clean below), but the two places where the machinery is *switched on*
are text-shape regexes on the founder's command, and they are wrong in both directions on ordinary language.
Every class below is EXECUTION_TRUTH or its inverse (an execution nobody asked for); none is a wording issue.

**Found by** verifier #56, an independent process in an isolated worktree, executing windows sliced from the
real `index.ts` through the repository's own detyper (`_gate_extract.mjs`), never a re-implementation. A first
pass of the same verifier was interrupted mid-campaign; its checkpoint was treated as a pointer and every number
here was re-run in the second pass.

### The defects

**V56-D1 (P1) — request-intent FALSE NEGATIVES ship fabrications verbatim.** `requestedIntent` is derived at
`index.ts:5387-5403` from two anchored regexes (`MUTATION_INTENT_ALWAYS`, `MUTATION_INTENT_WITH_ENTITY` — a
head verb, optionally behind `please|pls|can you|could you|would you|now|ok|okay`), the model's action arrays,
and a closed list of bare confirmations. Anything else is a read turn: the never-silent receipt never fires, and
both belt consumers are gated on `requestedIntent !== null`, so with `claims:null` and no model action field
the model's completion prose ships untouched. Sized through the real window: **9,712 of 11,880** generated
mutation requests (27 verbs × 11 objects × 40 wrappers) derive no intent and ship the fabrication (81.8 %);
**68 of 71** hand-written phrasings; on the bare `verb object` form itself **122/297** (assign/create/update/
add/end/set with no entity noun). Live shapes: "Could you please archive ACME", "Let’s archive ACME", "Go ahead
and archive ACME", "I need ACME archived", "can you please rename project Alpha to Beta" (BUG-002 behind a
polite prefix), "Mark task QA-1 as done", "close/complete/cancel/reopen task QA-1", "yes, archive it",
"Yes — do it", "option two", "the second option", "B", "fire/terminate/dismiss Bob", "Polite Co needs to be
restored", every Mongolian form ("ACME-г архивла", "Beta компанийг сэргээ"). Deployed v92 corrected the same
prose through its PAST arm, so this is also a fabrication regression vs v92 — but the verdict rests on OTM §3
rules 1 and 3, not on parity. **Compounding (BUG-010 re-opens):** such a turn persists with
`turnVerdict.mutationIntent = null`, so the narrative tier carries the fabrication as `verified: true` and its
prose re-enters the next prompt as fact (`index.ts:2338-2343`, executed: `"Done. Project renamed to Beta."` →
`{verified: true, executedOperationCount: 0}`).

**V56-D2 (P1) — request-intent FALSE POSITIVES replace truthful read answers.** A read request whose head word
is a listed verb followed by any entity noun derives intent, and the truthful answer is replaced by "No change
was made — that request did not resolve to an operation I can execute from chat". **310 of 310** verb-headed
read requests (31 heads × 10 tails); **21 of 24** hand-written; control with plain read heads 0/100. Live shapes:
"make a list of all companies", "update me on the project status", "create a report of archived companies",
"set out the plan for the project Alpha", "add up the hours logged on the tasks this week", "end date of the
project Alpha?", "restore my memory: who is Bob?", "move on — what’s next for the project?". This is the
"truthful READ answer rewritten on text shape alone" FAIL criterion, moved from the reply to the command.

**V56-D3 (P1) — the command-name fallback archives an UNRELATED company.** `resolveCompanyLifecycleTargets`
(`index.ts:3344-3396`) runs `fromCommand` whenever the model emitted no company ids/names for that action —
including when the model resolved the command to a task, person or goal — and its fuzzy stage is
every-token-substring. Real executor slice, model field present: "delete Alpha" (+`deleteTaskIds`) archives
**Alpha Holdings**; "remove Bob" (+`endEmploymentPersonIds`) archives **Bobcat Machinery**; "remove Bob Smith"
archives **Bob Smith Consulting**; "archive Q3 revenue" (+`archiveGoalIds`) archives **Q3 Revenue Partners**;
"archive the task Alpha" archives **Alpha Task Force** — each with a truthful-looking receipt "X: archived."
(5/5 with the model field, 5/5 with the model emitting nothing).

**V56-D3b (P1, worst shape) — non-imperative sentences execute lifecycle RPCs.** The fallback keys on
`ARCHIVE_VERB_PATTERN` / `RESTORE_VERB_PATTERN` matching anywhere in the raw command, independent of
`requestedIntent`, of question shape, and of negation: **15 of 19** probes executed a real RPC — "**do not
archive Alpha**", "**never delete Alpha**", "**I decided not to archive Alpha**", "did you archive Alpha?",
"Did we already archive Alpha?", "why did we archive Alpha?", "is it safe to delete Alpha?", "what happens if I
archive Alpha", "who asked to archive Alpha", "before we archive Alpha, list its tasks", "explain how to archive
Alpha", "tell me why we should not delete Alpha", "should I restore Beta?", "how do I restore Beta", "when did
we end Bob" (archives **Bob Trucking**). Because line 4885 then replaces the summary with the lifecycle report,
the founder who typed "do not archive Alpha" reads "Alpha Holdings: archived." The archive is reversible, but
CANONICAL_WORK_CONTRACT §1 starts at "INTENT — what the caller asked for"; this executes what the caller did
not ask for.

**V56-D4 (P1, narrow) — a restore-family word INSIDE a company name turns an archive into a restore.** "archive
Restored Furniture Co" / "archive Reactivate Solutions": the archive guess is suppressed when the command
contains a restore word (`:3394`), but the restore guess is not suppressed by an archive word (`:3396`). With the
model id: archive executes, then the restore guess restores it (receipt "X: archived. X: restored.", final
state active). Name only: a restore is attempted instead ("was already active").

**V56-D5 (P2) — punctuated company names are refused.** `[%_,()]` are replaced by spaces in the `ilike`
pattern but not in the row, and the fuzzy tokens keep the punctuation: "Acme (Mongolia) LLC", "A_B Holdings",
"100% Natural Foods" via the command and via `restoreCompanyNames`, "Acme, Inc." via `restoreCompanyNames` →
"no company by that name" (OTM §5: restore of a known entity refused).

### Root cause (one class)

The contract's first two steps — *structured intent* and *canonical entity resolution* — are implemented as
regexes over the raw command (`MUTATION_INTENT_*`, `CONFIRMATION_COMMAND`, `lifecycleCommandName`,
`ARCHIVE/RESTORE_VERB_PATTERN`) instead of as structured output the model must emit and the server validates.
A head-verb regex cannot see a polite prefix, a subordinate clause, a question, a negation or another language;
a verb-anywhere regex cannot tell a request from a mention. Both switches were then tested only on the shapes
they were written for (`architecture_final_claim_contract.mjs`: head-verb commands; `company_lifecycle_matrix.mjs`:
imperative commands), and the six belt suites (`run8/10-14`) were given a default command `'archive ACME
Holdings'` — intent for free — so no battery member could observe that production would not reach the belt
for the case's real phrasing (V56-H1, a coverage gap, not a false pass).

### What is clean — re-derived, not restated

* **Provenance:** git `c9dfab5bd433` index.ts sha256 `795c20c8…` (321,370 B) == both in-tree v92 copies;
  integration-level (CLI gated in this session, no live download).
* **Deploy surface:** exactly `index.ts` (imports: deno std http, supabase-js; 0 non-comment mentions of
  `_shared`). Delta v92 → candidate: 108 hunks, +2,097/−99 lines, 273 declared identifiers added, **0 removed**.
* **CRLF:** 6,310 CRLF, 0 bare LF, 1 bare CR (inside a comment).
* **Receipt / final-claim rule on the shapes the regex covers:** 68 head-verb commands × {claims:null, [],
  state-only} + pendingAction variant = 272 cases, 0 failures; 100 read cases verbatim; verified envelopes render
  the claim (22), unverified/denied never do (66).
* **Collection envelopes:** 23 capped queries all carry `count: 'exact'`; `envelope()` total from `res.count`
  only; 23 pack arrays, 0 without an envelope; companies split active/archived, newest first.
* **Persistence / precedence:** `work_orders.output` persisted every turn with `turnVerdict`; durable row read
  first; expired/untyped durable rows do not bind (`resolveClarificationField` fails closed). Residual: the
  `lastTurnOutput.pendingAction` fallback is not TTL-guarded, so an expired durable row's twin in the last turn
  still binds (P3, pre-existing shape).
* **Receipt == ledger** 14/0; **lifecycle matrix** 19/0; **grounding precedence** 16/0; **battery** 55 suites,
  53 exit 0, 2 machine-posture reds; **historical gates** v48–v52, v54, v55 exit 0; v46 33/3 and v53 33/1 are
  the recorded standing reds (stale CRLF pin, growth exponent, withdrawn D5; V53-C1 needs the CLI).
* **Postconditions:** 34 literal-true `recordExecution` sites, 0 ungated; create family via `recordCreate` with a
  fresh RLS re-read; `postcondition_verified` mirrors `postconditionPassed`.
* **TDZ:** own block-scope scanner — 1 "P0" at `:2388` is a type-literal key inside an `as {…}` annotation
  (false positive); 1 deferred read (`UUID_IN_TEXT` `:5093`, declared `:5128`, earliest invocation `:5558`) is
  safe. `deno check` **BLOCKED** (npx gated; no TypeScript compiler on disk).
* **Mutation testing (16 mutants, whole battery each):** 12 killed by the committed battery; survivors m10
  (receipt keyed on attempted instead of verified), m12 (silent nonexistent id), m13 (no status preference) are
  killed by the CONTRACT rows of `v56_regression_additions.mjs`; the original m6 was an unfaithful mutant (the
  canonical literal), the faithful bare `companies(name)` join is killed by the join guard.
* **Belt vs v92 (840-row own corpus, negator-initial names both directions, possessives incl. bare apostrophe):**
  with NO intent the belt rewrites nothing (candidate destroys only via LIFECYCLE 100 / FUTURE 15). With
  intent and an empty ledger the receipt fires before the belt on every row (725 RECEIPT), so 320 "truth
  regressions" in that shape are the contract's own never-silent rule and mostly an artefact of an empty
  `lifecycleReports` (production carries the report). The 140 read-shape fabrications v92 caught by tense are
  an INTENDED departure — conditional on D1 being fixed, because D1 is what turns a real request into a
  "read" turn.
* **Mirrors (AUTHORITY_NOT_ENFORCED, not on the deploy surface):** `_shared/{execution,collection,lifecycle,
  parent-policy}.ts` are not byte-identical to `web/lib/contracts` + `web/lib/policy` (93/33/98/51 differing
  lines); both headers and OTM §4 cite `architecture_shared_contracts_mirror_contract.mjs`, which does not exist.

### Search performed for the same class

Every consumer of the raw command as an execution or rewrite switch: `MUTATION_INTENT_ALWAYS` /
`MUTATION_INTENT_WITH_ENTITY` / `CONFIRMATION_COMMAND` (D1/D2), `lifecycleCommandName` + the verb patterns
(D3/D3b/D4), `commandContradictsActionType` (defensive, refuses only — fine), `matchDisambiguationOption`
(binds to a pending option only — fine). Task/goal/person lifecycles keep the context-window gate and have no
command-name fallback, so D3/D3b are company-only today; the registered next lifecycle-completeness item
(`CAPABILITY_IMPACT_REGISTRY.yaml`) would inherit the class if built the same way.

### Regression

`qa/verification/proposed/v56_regression_additions.mjs` — 73 CONTRACT rows green on the candidate (and kill
m1/m2b/m10/m12/m13), 56 DEFECT rows red by design (D1 22/22, D2 9/10 — "add up the hours logged on the tasks
this week" derives no intent because `tasks` misses the singular noun list, D3 5/5, D3b 10/10, D4 3/3, D5 7/8 —
"Acme, Inc." via the command resolves because the comma splits the name); outcome-asserted, any fix shape turns them green; exits
non-zero on any failure; resolves `index.ts` via `SEM_INDEX_SRC` or by walking up (run from `qa/verification/`
to prove it). Probes: `qa/verification/scratch/v56/{contract_harness,lifecycle_harness,intent_corpus,
question_probe,differential,misc_checks,mutate,mutant_check_v56}.mjs`.

**Status.** FAIL — deploy blocked. FIX NOT PREPARED: the verifier has no write authority on `index.ts` and the
fix is a design change (structured intent from the model's schema, validated server-side; the command-name
fallback gated on resolved intent + imperative shape or removed in favour of `archiveCompanyNames` /
`restoreCompanyNames`), not a regex edit. Directions in `v56_PROMOTION_NOTE.md`. Gaps: no `deno check`, no
live CLI download, no browser/AI-chat turn in this session type.
