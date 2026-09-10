# C002 / W1 — Consolidated structural analysis of seven AI-truth bugs

**Worker:** W1 (AI Truth) · **Campaign:** C002 · **Scenario:** C002-P1-cluster-consolidation · **Capability:** CAP-AI-TRUTH-CLUSTER-ANALYSIS
**Mode:** READ-ONLY repository analysis. Source of evidence: `qa/BUG_QUEUE.json` only (`last_updated` 2026-09-09T13:48:00Z, `updated_by` work-pc-independent-qa session 014TswfT). No browser, no production access, no product source read, no mutation.
**Bugs in scope:** BUG-002, BUG-005, BUG-010, BUG-020, BUG-029, BUG-030, BUG-033.

**Standing caveat that applies to every conclusion below.** Every one of the seven records carries a `_qa_boundary` / "Work PC did not read the sem-ai-command source" statement (BUG-010 `_qa_boundary`, BUG-020 `layer_hypothesis_for_home_pc`, BUG-029 `root_cause_hypothesis_REVISED`, BUG-030 `implementation_recommendation`, BUG-005 `home_pc_requirement_2026_09_09._doc`). The queue therefore contains *behavioural* evidence and *named hypotheses* about mechanism, not verified code paths. Where I say "the queue's evidence supports X" I mean the observed behaviour is consistent with X; where the queue cannot distinguish two mechanisms I say so rather than pick one. This document is evidence for the Orchestrator, not a verdict on any bug or capability.

---

## 0. One-line summary per bug (from the queue's own fields)

| Bug | `severity` / `status` | `ai_truth_classification` | What is observed (field cited) |
|---|---|---|---|
| BUG-002 | P1 / REOPENED | FALSE_SUCCESS | Chat claims a mutation it has no capability to execute. Bare form still fabricates on project rename (`reconfirmed_2026_09_09`, `per_operation_status_2026_09_09`); D3 variant "claim + trailing question" bypasses the truth guard via `d3_short_circuit_condition` = `&& !result.pendingAction`; guard also over-corrects and refuses a pure read (`over_correction_signal_2026_09_09`). |
| BUG-005 | P1 / OPEN | CONFIRMATION_MISBINDING + STALE_CONTEXT + FALSE_SUCCESS | Parent issue with classes A–E (`classes`). B: bare "yes" on an assign clarification was coerced to archive; coercion closed, misbinding to a substitute target persists (`classes.B.work_pc_disposition`, `destructive_confirmation_misbinding_2026_09_09.control_B_SINGLE_CANDIDATE_FAIL`). A: history window `limit(8)` renumbered as full history (`issue5_test_A_2026_09_09.PRIMARY_CLASSIFICATION`). C/D: grounding flips exists → not found → exists across consecutive turns (`classes.C.work_pc_matrix_2026_09_07`). `_parent_closure_rule`: stays OPEN until A–E all dispositioned. |
| BUG-010 | P1 / OPEN | FABRICATION_PERSISTENCE | A prior fabricated receipt is re-asserted as DB truth on a later same-channel read, but only when the response takes the clarification branch (`matrix_class_4_MULTI_TRIAL_2026_09_09.DISCRIMINATOR_HYPOTHESIS`, `matrix_class_4_FALSIFICATION_TEST_2026_09_09`). Reproduced on two mutation classes (`SCOPE_RULE_STATUS_2026_09_09`). |
| BUG-020 | P1 / OPEN | GROUNDING_GAP on a command path + misbinding precursor | Create-BU and archive command paths cannot resolve an ACTIVE company that the question path resolves in the same channel one turn earlier; real companies offered as substitutes (`additional_evidence_same_channel`, `destructive_verb_evidence_2026_09_09`). |
| BUG-029 | P1 / OPEN | FABRICATED_ABSENCE | Inside the assign/clarification flow, a real active company is declared "doesn't exist in the database"; the same entity resolves correctly when asked directly (`controls_that_falsified_truncation`, `root_cause_hypothesis_REVISED`). Truncation hypothesis withdrawn (`root_cause_hypothesis_WITHDRAWN`). |
| BUG-030 | P0 (proposed) / OPEN | FABRICATED_GROUNDING_CITATION | On the resolved answer after a confirmation turn carrying an anti-inference instruction, the model asserts the fabricated value AND claims "I verified this from … context.projects", which contains the contradicting value (`the_exchange`, `ground_truth`). 1 of 3 on the eliciting condition; 0 of 2 unmitigated (`unmitigated_control_already_exists`). |
| BUG-033 | P1 / OPEN | CONFIRMATION_BOUND_TO_UNREQUESTED_FABRICATED_ACTION + PENDING_ACTION_LOSS + FALSE_SUCCESS | Pending rename established, unrelated supported command executed, then bare "yes" → pending action silently dropped and a wholly invented bulk employment reassignment over three real employees was receipted (`exact_sequence`, `pending_action_loss_half`). |

---

## 1. Is there a single shared underlying mechanism?

**Short answer: no single *mechanism* covers all seven. There is a single shared *property*, and a single shared *locus* that covers five of the seven (six with a caveat).**

### 1a. The shared property (all seven)

Every one of the seven is an instance of the response layer asserting something the execution/grounding layer did not produce, with zero corresponding mutation. The queue's own `ai_truth_classification` values are the polarities of that one property:

- claimed mutation that did not happen — BUG-002 (FALSE_SUCCESS), BUG-033 (FALSE_SUCCESS over real records), BUG-005 Class B receipt "Archived QA-C002-DEPT-FABTEST-06." (`destructive_misbinding_summary_2026_09_09`)
- claimed absence of an entity that exists — BUG-029 (FABRICATED_ABSENCE), BUG-020 ("I don't see a company named QA-MULTI-CO", `reproduction[1]`)
- claimed presence of a state that was never written — BUG-010 (FABRICATION_PERSISTENCE)
- claimed provenance that was never consulted — BUG-030 (FABRICATED_GROUNDING_CITATION)
- claimed binding to an action the user never named — BUG-005 item D, BUG-033

BUG-029 `why_p1` states this explicitly ("the product can both claim a mutation that did not happen and deny an entity that does exist"), and BUG-030 `severity_argument_against_p1` cites CLAUDE.md §26 "incorrect information is itself a production defect". This is a defect *class*, not a mechanism: it tells us what is wrong but not which code produces it.

### 1b. The shared locus (five of seven, hypothesised by the queue)

The queue itself converges, in three independent records, on one named branch: **the clarification / pending-action / confirmation branch answers from its own local reasoning instead of from canonical grounding, and the response-truth guard is disabled on exactly that branch.**

- BUG-029 `convergence_with_bug_010`: "THE CLARIFICATION / PENDING-ACTION BRANCH ANSWERS FROM ITS OWN LOCAL REASONING RATHER THAN FROM CANONICAL GROUNDING … four independent defects now implicate one branch."
- BUG-030 `branch_convergence`: "FIFTH finding on the clarification/pending-action branch … false presence, false absence, and false provenance."
- BUG-010 `matrix_class_4_FALSIFICATION_TEST_2026_09_09.why_this_is_the_decisive_control`: "channel history does NOT by itself outrank DB grounding; it outranks grounding only when the response takes the clarification branch." Refined in `matrix_person_assign_expansion_2026_09_09.hypothesis_refinement`: the branch "does not RE-VERIFY CLAIMS MADE EARLIER IN THE CHANNEL, while remaining able to read entity state for entities it resolves."
- BUG-002 `d3_short_circuit_condition` = `&& !result.pendingAction`: the truth guard is skipped whenever a pending action is present, i.e. on that same branch.
- BUG-005 `layer_classification_DEFINITIVE`: `pending_carrying_action_type` = 0 of 51 persisted pending actions; `classes.B.root_cause`: `actionType` typed `archive|restore|null`, so a non-archive/restore clarification is emitted with no action type, and the fix "falls through to the ordinary LLM path" (`classes.B.fix`).
- BUG-033 `exact_sequence` / `pending_action_loss_half`: a bare "yes" with a superseded pending action produced free-text fabrication rather than a deterministic bind-or-re-ask.

Bugs that sit on this locus per the queue's evidence: **BUG-005 (B, D-item, E-prose), BUG-010, BUG-029, BUG-030, BUG-033.**

**Important precision the queue insists on:** the observed failures split into two *different sub-behaviours* of that locus, and the queue's evidence cannot confirm they are the same code:
1. *Binding* failures — which action/target a confirmation is attached to (BUG-005 item D, BUG-033). Evidence: `destructive_confirmation_misbinding_2026_09_09.what_this_isolates` ("the guard that does NOT exist is the USER-NEVER-NAMED-THIS-TARGET guard"), `issue5_test_C_2026_09_09.C2_NEWER_ACTION_SUPERSEDES`.
2. *Grounding* failures — what the branch says about entity state (BUG-010, BUG-029, BUG-030). Evidence: `matrix_class_4_MULTI_TRIAL_2026_09_09.trial_3.read` (the fabrication is embedded in the *clarifying question itself*, before any confirmation is sent).

Whether "confirmation handler", "clarification branch" and "pending-action branch" are one function, three functions, or a prompt-template difference is **not decidable from the queue**: every relevant record states Work PC did not read the source (`BUG-005.home_pc_requirement_2026_09_09._doc`).

### 1c. The two bugs that do NOT sit on that locus

- **BUG-002 (bare form).** `reconfirmed_2026_09_09.why_this_matters_specifically`: "The receipt is a BARE completion claim - no trailing question, no pending action … The D3 short-circuit does NOT explain this instance." The bare form is a capability-absence fabrication on the *direct* command path with no pending action present. Only the D3 sub-variant touches the shared locus. `per_operation_status_2026_09_09.what_this_narrows` reframes the open question as "why does the project-rename path not reach [the guard]" — a guard-coverage question, not a confirmation question.
- **BUG-020.** `additional_evidence_same_channel`: the archive command path fails to resolve an entity the question path resolved one turn earlier and resolves again one turn later. `layer_hypothesis_for_home_pc`: the named-company lookup "appears not to be applied - or its tokens not to match - on the BU/parent-resolution path". This is a *resolver* defect on command paths. It produces the *input* to the confirmation locus (substitute candidates) but occurs before any pending action exists. `ai_truth_classification` labels it "GROUNDING_GAP on a command path (BUG-017 family)". BUG-005 `classes.C.work_pc_matrix_2026_09_07.verdict` attributes Class C to the same resolver gap: "Mechanism is the command-shape resolution gap (BUG-020 …), not history loss."

A third partial exception: **BUG-005 Class A** (history continuity) is attributed to "truncation-without-metadata on conversationHistory, the same class as BUG-007" (`classes.A.work_pc_disposition`) and a `hard limit(8)` retrieval window (`home_pc_architecture_findings.history_retrieval`). That is a history-window mechanism unrelated to confirmation, yet it gates BUG-005 closure (`_parent_closure_rule`).

**Conclusion for (1):** the seven share one defect class (unconstrained free-text assertions) and five share one hypothesised locus (the clarification/pending-action/confirmation branch). At least three distinct mechanisms are in play: (i) that branch, (ii) capability-absence guard coverage on the direct path, (iii) command-path entity resolution; plus (iv) history-window truncation for BUG-005 Class A.

---

## 2. Which bugs would be closed by a fix to the confirmation handler alone?

**Definition used.** "Confirmation handler" = the code that (a) persists a pending action, (b) recognises an affirmative (`isClarificationAffirmative()` per BUG-005 `classes.B.root_cause`), (c) binds it to exactly one persisted pending action by `pending_action_id + action_type + canonical ids` (BUG-005 `regression_paths_required[5]`), and (d) either executes that bound action deterministically or explicitly re-asks / reports it dropped — never falling through to free-text generation on a bare affirmative. A fix "to the confirmation handler alone" means all of (a)–(d) and nothing else: no change to the truth guard, resolver, prompt assembly, history window, or output templating.

### Closed (or closable) by that fix alone

**BUG-033 — YES, with one dependency inside the handler.**
- `exact_sequence` step 1 establishes pending rename A; step 3 bare "yes"; step 4 is a fabricated receipt for an action "that appears NOWHERE in the conversation" (`why_this_is_worse_than_prior_misbindings`).
- `regression_requirement` (a)–(d) are all properties of the handler: execute A or ask; never claim an unrequested operation; no un-named entity in the receipt; honour or report the pending action.
- Dependency: the pending action in BUG-033 was a *rename*. BUG-005 `classes.B.root_cause` states `actionType` is typed `archive|restore|null`, and `layer_classification_DEFINITIVE.pending_carrying_action_type` = 0 of 51. The Class B fix "falls through to the ordinary LLM path" when the field is undefined (`classes.B.fix`). A rename pending action therefore has no representable `actionType` and a bare "yes" reaches the free-text path. That fall-through is the most plausible producer of the BUG-033 fabrication. **Inference, not queue evidence:** the queue does not record what path produced step 4. A handler fix that (i) persists `actionType` for every verb and (ii) never falls through to free text on an affirmative would close it; a handler fix that leaves the fall-through in place would not.

**BUG-005 — PARTIALLY: Class B residual and item D, and the E prose leak; NOT the parent.**
- Closed: `destructive_confirmation_misbinding_2026_09_09.control_B_SINGLE_CANDIDATE_FAIL` (bare "yes" bound to a substitute target), `item_D_status_2026_09_09`, `classes.B.residual_defect` (misbinding). The `home_pc_requirement_2026_09_09.REQUIRED_INVARIANT` ("ORIGINAL REQUEST TARGET != PROPOSED SUBSTITUTE TARGET ⇒ a bare yes MUST NEVER authorize the substitute") is a handler invariant. `control_A_MULTIPLE_CANDIDATES_PASS` shows the handler already has a multi-candidate guard, so the change is additive.
- Also closed: `classes.E.what_still_fails` (prose-level awareness leak of other channels' pending actions) if the handler scopes candidate enumeration to the channel; execution isolation already holds (`classes.E.what_actually_holds`).
- NOT closed: Class A (`hard limit(8)` window, `issue5_test_A_2026_09_09.PRIMARY_CLASSIFICATION` = VISIBLE_WINDOW_RENUMBERED_AS_FULL_HISTORY), Class C (resolver gap = BUG-020, `classes.C.work_pc_matrix_2026_09_07.verdict`), Class D structural caveat (`classes.D.layer_verdict` — this half *is* the handler, so D would move; but D's observed symptom in `classes.D.work_pc_evidence` is the Class C flip, which is resolver). `_parent_closure_rule` forbids closing BUG-005 on B alone.

### Survives that fix (see §3 for why)

BUG-002, BUG-010, BUG-020, BUG-029, BUG-030 all survive. BUG-010 and BUG-030 would have their *post-confirmation* symptom narrowed but not their mechanism; see §3.

---

## 3. Which bugs survive a confirmation-handler-only fix, and why

**BUG-002 — survives entirely.**
- Bare form: no pending action exists, so no confirmation handler is invoked. `reconfirmed_2026_09_09`: "there was no pending action to short-circuit on." `per_operation_status_2026_09_09."projects: rename"`: fabricates on the bare imperative, 4th date. `"departments: archive"`: fabricates a destructive receipt for a capability that does not exist, again with no confirmation involved.
- D3 form: the defeat is in the *truth guard* (`d3_short_circuit_condition` = `&& !result.pendingAction`; `d3_required_fix_shape`: "must reason STRUCTURALLY about whether any operation actually executed"). A handler fix that changed *when* `pendingAction` is set could accidentally alter D3 behaviour, but the guard's condition is what is wrong, and the queue cannot tell whether the guard is absent on the rename path or present but bypassed (`reconfirmed_2026_09_09.what_home_pc_must_reconcile`).
- Over-correction: `over_correction_signal_2026_09_09` shows the guard refusing a pure read; that is guard classification, not confirmation.

**BUG-020 — survives entirely.**
- No pending action or affirmative is involved in the failing steps (`reproduction[1..2]`: fresh channel, single command, "I don't see a company named QA-MULTI-CO"). `additional_evidence_same_channel` isolates it to "the archive command path itself cannot see the entity." The handler only ever receives what the resolver hands it. A handler fix can *block* a bare "yes" from binding to the real-company substitutes offered in `destructive_verb_evidence_2026_09_09`, which reduces blast radius, but the create-BU path would still be non-functional (`severity_reasoning` (a)) and real companies would still be offered (`severity_reasoning` (c)).

**BUG-029 — survives.**
- Turn 1 already failed to resolve ("QA-C002-RENAMED-X is not in my current view", `reproduction[1]`), so at the moment the user replies there is no canonical id for a handler to bind. `root_cause_hypothesis_REVISED`: "Inside the assign path, resolution fails and … the failure is reported to the user as a canonical fact." Two halves: resolution failure on the assign path (resolver, same family as BUG-020) and the escalation from scope-limited to canonical phrasing (`the_escalation_is_the_finding`) which is a response-wording/grounding constraint. Neither is confirmation binding. Turn 2 is an explicit-content reply, not a bare affirmative, and it produced a re-clarification, not a bind.

**BUG-010 — survives; the post-confirmation symptom may narrow.**
- The contamination appears *inside the clarifying question* before any confirmation is sent: `matrix_class_4_MULTI_TRIAL_2026_09_09.trial_3.read` ("which was just renamed to QA-C002-PROJ-FABTEST-08"), `trial_2.read_turn_1`. A handler that binds "yes, that one" to a canonical id and answers from a real read would fix `trial_2.read_turn_2` and `stopgap_investigation_2026_09_09` M1, but the clarifier text would still assert the fabricated state, and `regression_note_2026_09_09` makes the clarifying-question text and branch parity the load-bearing assertions. `implementation_recommendation` targets persistence of unexecuted claims and grounding precedence at prompt assembly, neither of which is the handler.
- **Insufficient evidence:** whether a handler-bound read after "yes, that one" would in fact be grounded is not shown by any trial; the by-id read in `matrix_class_4_FALSIFICATION_TEST_2026_09_09.trial_4` was a *user-authored* id query, not a handler-resolved one.

**BUG-030 — survives; the eliciting condition might disappear as a side effect, which the queue explicitly says is not closure.**
- `implementation_recommendation`: provenance sentences must be "TEMPLATED FROM A REAL READ RESULT … the model may render a citation it is HANDED, and may never author one." That is an output-layer constraint, not binding.
- The single observed instance was on the resolved answer after a confirmation turn (`the_exchange[2]`). If the handler answered that turn from a real read, the *value* would be right and the citation might be true. But `per_verifier_instruction` says removing the citation while the value is wrong is not closure, and conversely a correct value in one path does not establish that free-text citations cannot be authored on other paths. `what_is_certain_vs_uncertain`: "NOT KNOWN: whether the citation can occur WITHOUT an anti-inference instruction present." n=3 mitigated, n=2 unmitigated. **The queue cannot decide this; do not infer.**

---

## 4. Minimum set of distinct fixes to close all seven

Derived from each record's `implementation_recommendation` / `root_cause` / `d3_required_fix_shape` fields, grouped where the queue's evidence shows one mechanism. Six distinct fixes are needed; five if BUG-005 Class A is set aside, which `_parent_closure_rule` does not permit.

| # | Fix | Closes | Queue fields it is drawn from |
|---|---|---|---|
| F1 | **Durable, machine-bound pending action + strict confirmation binding.** Persist `actionType` for every verb (not only archive/restore), canonical target ids and a `pending_action_id`; bind an affirmative only to that record; require an explicit target-naming confirmation when the proposed target ≠ the user-named target; on stale/superseded/absent pending action re-ask or report dropped; never fall through to free text on an affirmative; scope candidate enumeration to the channel. | BUG-033; BUG-005 B-residual, item D, E prose leak (BUG-005 parent still needs F3, F6) | BUG-005 `classes.B.root_cause`, `classes.B.fix`, `layer_classification_DEFINITIVE.pending_carrying_action_type`, `home_pc_requirement_2026_09_09.REQUIRED_INVARIANT` / `required_confirmation_shape`, `regression_paths_required`; BUG-033 `regression_requirement`; BUG-002 `home_pc_structural_fix_status` in BUG-005 (migration prepared at master 3527244, not applied) |
| F2 | **Executed-operations truth guard, structural not textual.** A mutation claim may be emitted only if an execution record exists; remove the `&& !result.pendingAction` short-circuit; ensure every unsupported-mutation path (project rename, department archive) reaches the guard; do not key on response or request surface form (fixes the refusal-on-read over-correction). | BUG-002 (bare, D3, archive variant, over-correction). Also removes the *source* receipt for BUG-010/BUG-030 sequences, but not their mechanisms. | BUG-002 `d3_short_circuit_condition`, `d3_required_fix_shape`, `reconfirmed_2026_09_09.what_home_pc_must_reconcile`, `per_operation_status_2026_09_09.what_this_narrows`, `over_correction_signal_2026_09_09`, `implementation_recommendation` |
| F3 | **Canonical entity resolution on every command path.** Apply the same named lookup on create-BU, archive, assign and set-parent as on the question path; generate substitute candidates from a canonical search, not truncated context; machine-bind candidate ids before emitting a clarification; retain the originally requested target. | BUG-020; BUG-029 resolution half; BUG-005 Class C (and the observed symptom of Class D) | BUG-020 `layer_hypothesis_for_home_pc`, `additional_evidence_same_channel`, `regression_requirement`; BUG-029 `controls_that_falsified_truncation`, `root_cause_hypothesis_REVISED`; BUG-005 `classes.C.work_pc_matrix_2026_09_07.verdict`, `home_pc_requirement_2026_09_09.inspection_points[0..3]` |
| F4 | **Grounding precedence / no re-entry of unexecuted claims.** Either do not persist an assistant mutation claim that has no execution record into channel history, or make DB-derived grounding explicitly authoritative over prior assistant text at prompt assembly, and make the clarification branch re-verify entity state from a canonical read before composing a clarifier or a resolved answer. | BUG-010 | BUG-010 `implementation_recommendation` (options 1 and 2), `layer_classification`, `matrix_class_4_FALSIFICATION_TEST_2026_09_09.implication_for_the_fix_shape`, `matrix_person_assign_expansion_2026_09_09.hypothesis_refinement`, `regression_note_2026_09_09` |
| F5 | **Templated existence and provenance statements.** Statements of the form "X does not exist in the database" and "I verified this from <source>" must be rendered from a real read result (source, id, field, value) and cannot be authored as free text; a failed resolution must be reported as a failure to resolve, with `isTruncated` / `retrievalScope` available to the model. | BUG-030; BUG-029 reporting half | BUG-030 `implementation_recommendation`, `regression_requirement` assertion (3); BUG-029 `expected`, `implementation_recommendation` (1)(2), `governing_rule_violated` |
| F6 | **History window metadata / compaction.** Surface window bounds (visible vs total turns) so out-of-window history is disclosed rather than renumbered; the queue notes this is BUG-007's class. | BUG-005 Class A (required for parent closure) | BUG-005 `classes.A.work_pc_disposition`, `home_pc_architecture_findings.history_retrieval` = `hard limit(8)`, `issue5_test_A_2026_09_09.PRIMARY_CLASSIFICATION`, `_parent_closure_rule` |

**Why these cannot be merged further on the queue's evidence.**
- F1 vs F4/F5: BUG-010 `matrix_class_4_MULTI_TRIAL_2026_09_09.trial_3.read` shows contamination before any confirmation; binding cannot fix a clarifier's text.
- F2 vs F1: BUG-002 `reconfirmed_2026_09_09` shows the bare form with no pending action.
- F3 vs everything else: BUG-020 fails in a fresh channel on a single command with no history and no pending action.
- F4 vs F5: BUG-030 `severity_argument_against_p1`: "Those need different fixes - suppressing stale values does not stop a verification claim being emitted, and vice versa."
- F6: independent of all of the above by `layer_classification_DEFINITIVE` (window has never fired for pending actions; Class A is a separate axis).

**Possible consolidation the queue cannot confirm.** F2 and F5 are both "the response layer may only render what a structured execution/read record hands it" (mutation receipts in F2, existence/provenance in F5). If the Home PC implements a single structured-result-to-text layer, they collapse to one change. Likewise F1 and F4 both touch the pending-action branch and could ship together. Whether that is one code change or two is a source-level fact no record in the queue establishes.

---

## 5. Where the queue's evidence is insufficient (stated, not inferred)

1. **Same code or different code.** Whether the "confirmation handler" (BUG-005/033), the "clarification branch" (BUG-010/029/030) and the D3 `result.pendingAction` check (BUG-002) are one implementation is unknown; all records disclaim reading the source.
2. **BUG-033 path.** The queue records the fabricated receipt but not whether it came via the Class B "falls through to the ordinary LLM path" route. §2 treats that as the most plausible route; it is an inference.
3. **BUG-002 bare-form on v94.** `what_home_pc_must_reconcile`: guard absent on that path vs guard present but not reached — undecidable from behaviour.
4. **BUG-030 without an instruction.** `what_is_certain_vs_uncertain`: untested. Therefore whether F1 alone removes the only eliciting condition is unknown; F5 is still required by `per_verifier_instruction`.
5. **BUG-010 handler-grounded read.** No trial shows a handler-resolved (as opposed to user-authored by-id) read after a confirmation; whether F1 narrows BUG-010 is untested.
6. **BUG-020 candidate source.** `home_pc_requirement_2026_09_09.work_pc_corroborating_evidence` offers "truncated context rather than canonical search" as a starting hypothesis only.
7. **BUG-005 Class B residual text** was truncated in my read of `classes.B.residual_defect`; the conclusion for Class B rests on `work_pc_disposition`, `root_cause`, `fix` and `destructive_confirmation_misbinding_2026_09_09`, which were read in full.

---

## 6. Answer sheet

1. **Shared mechanism:** No single mechanism. One shared defect class (free-text assertions unconstrained by execution/read records) across all seven; one shared hypothesised locus (clarification/pending-action/confirmation branch) across BUG-005, BUG-010, BUG-029, BUG-030, BUG-033; BUG-002 bare form and BUG-020 lie outside it.
2. **Closed by a confirmation-handler-only fix:** BUG-033 (if the fix includes representable `actionType` for all verbs and no free-text fall-through); BUG-005 Class B residual / item D / E prose leak. BUG-005 parent stays OPEN.
3. **Survive:** BUG-002 (no pending action on the bare path; D3 is the guard), BUG-020 (resolver, pre-confirmation), BUG-029 (resolver + reporting, no id to bind), BUG-010 (contamination inside the clarifier text), BUG-030 (free-text provenance; side-effect removal is not closure per the record).
4. **Minimum distinct fixes:** six — F1 binding, F2 executed-operations guard, F3 canonical resolver on command paths, F4 grounding precedence/no re-entry, F5 templated existence+provenance, F6 history-window metadata. Five if BUG-005 Class A is excluded, which its own closure rule forbids.
