## 132. Verifier #59 (campaign #119) on candidate `821f530` under the contract bar — PASS; the model-emits-nothing fallback tier has a restore idiom the executor knows but the request lexicon does not, two dead allowances in the imperative head test, a read-veto that kills negated and frame-led requests, and a receipt that names "company" for task/goal/person requests; one committed suite cannot load (VACUOUS_GUARD, EXECUTION_TRUTH fallback tier, SUITE_INTEGRITY)

**Verdict.** PASS — EDGE STATUS = DEPLOYMENT READY (contract bar) for `821f5308a0ce9c9d624c6139ee65e25b37c4b35f`,
`supabase/functions/sem-ai-command/index.ts` sha256 `715246f3be9710b74193529ce9c07d44a6f3ad3739f132b6216ac04e8f519aa9`
(539,535 B, CRLF-pure, 0 bare LF), preserved byte-for-byte through the run (asserted before/after every in-place
swap). Verifier #59 is a separate process in an isolated worktree; nothing below was taken from the implementing
session's ledger (#119–#131) or its counts without re-derivation.

**What was measured (all through the REAL windows sliced from index.ts by the repository detyper, never a
re-implementation).**
- Never-silent receipt / final-claim rule (OTM §3 rules 1–3): own matrix of 340 fabricated completions (68
  mutation-intent commands × claims:null / [] / state-only / historical / pendingAction+question): 335 deterministic
  receipts, 0 structural rewrites, 4 shipped — all one command, `bring back the company Beta` (V59-D1 below). 128 read
  requests: 0 rewritten when the model classifies the request (read/other); 8 rewritten only when the model emits no
  classification (V59-D5). 22/22 verified envelopes render the claim; 88/88 executed-but-unverified / denied / wrong-id
  envelopes never do. A pendingAction or trailing question never exempts a claim (run8/D59 re-reversal confirmed).
- Request-intent derivation (the #56 closure): `requestedIntent` is built from the model's `requestIntent`, the model's
  action arrays, the confirmation shape and the request lexicon only (index.ts :5503–5551; `result.summary`, tense,
  the belt and `pendingAction` are never consulted). Own generator, 18,720 mutation requests × 4 model states: with
  the model classifying `mutation`, 0 false negatives; with the model emitting NOTHING, 12.2 % carry no intent
  (6.7 pp is the READ_SHAPE veto firing on the head of a frame — "when you get a chance, archive X", "do me a favour
  and archive X", "list …, then archive X" — the rest is lowercase object-less "assign acme"); with the model saying
  `read`/`other` 100 % carry no intent BY DESIGN (V57-D1 veto). 800 verb-headed reads: 0 replaced when the model
  classifies; 111 (13.9 %) replaced when it emits nothing.
- Server-side lifecycle resolution (CWC §1–§2): 0/76 non-imperatives execute; fuzzy command hits ask and execute
  nothing; punctuated names resolve by command, `restoreCompanyNames` and `requestIntent.targetName`; restore
  prefers the archived twin; a nonexistent model id leaves "could not be found"; a task/person/goal command never
  invents a company line; task and goal ids are re-read server-side across every status (no context-window gate
  remains on a lifecycle field; `deleteTaskIds`/`pendingDeleteTaskIds` stay window-gated by design). Executor →
  window chain in production order: every imperative executes exactly once WITH the model's `requestIntent`,
  Mongolian included (`Alpha-г архивла`, `Beta сэргээ`).
- Collection envelopes (§4.3): 24 pack arrays, all enveloped (archivedTasks now included); `total` from the exact
  count, never `length`; companies split active/archived, `updated_at desc`.
- Persistence / precedence (§3 rule 6, §2): `work_orders.output` persisted unconditionally every turn with
  `turnVerdict`; history marks `[UNVERIFIED …]`; the typed, sourced, unexpired durable row outranks the previous
  turn's stored `pendingAction`; expired / untyped / unsourced rows and stored actions older than 30 min yield.
- Receipt == ledger, postconditions (§4.1–§4.2): create family re-reads ids (`verifyRowsExist`, `recordCreate`
  `ok = seen.has(id)`); all 34 `recordExecution(…, true)` literals are gated on a backend result; a
  `postconditionPassed=false` envelope never supports a claim.
- Belt as defence-in-depth vs deployed v92 (`c9dfab5b`, 795c20c8…): own corpus 332 truthful negatives (5
  negator-initial names, possessives incl. bare apostrophe) + 244 fabrications: belt truth regressions 0, fab
  regressions 0, truth improvements 74, fab improvements 49. End-to-end: with intent 0 fabrications ship and every
  truthful sentence on an empty ledger is replaced by the receipt (§3 rule 3 — intended; the belt is moot on that
  path); with no intent 0 rewrites (intended departure: v92 corrected 126/244 of those fabrications on text shape).
- Vacuity: 16/16 mutants killed by at least one baseline-green suite (56 suites), including the seven the campaign
  named (receipt block deleted; `!result.pendingAction` restored; create postcondition literal; durable read last;
  envelope dropped; hand-written `companies(name, status)` join under web/; hand-written org sentinel ternary).
- TDZ / bytes: shadow-aware block-scope scan over 945 declarations (787 unique names): 0 same-block
  use-before-declaration; all 21 new declaration sites have no earlier read; windows W1–W6 execute in V8. `deno
  check` could not be run in this session (BLOCKED, tooling) — decomposed by class it is unchanged from #58's
  record; this is disclosed, not assumed.

**Found (all confined to the tier where the model emits NOTHING structured — no `requestIntent`, no action array —
and still writes completion prose; the primary tier is verified clean).**
- V59-D1 (P2). `bring back` is a restore verb in `RESTORE_VERB_PATTERN` (:259) and in `IMPERATIVE_HEAD_RE` (:3417)
  but not in the request lexicon `MUTATION_VERB_ALWAYS` (:5515). `bring back Gamma` (no such company, no company noun
  → no unresolved line) has `requestedIntent === null`, so "Gamma is back — restored." ships. With a company noun or
  an existing target the executor speaks first; with the model's classification the receipt is truthful. The causative
  passive `get Alpha archived` is the same gap.
- V59-D2 (P3, VACUOUS_GUARD). `IMPERATIVE_HEAD_RE` admits the frame `do me a favou?r and` and an imperative last
  clause after a non-conditional lead (`list the tasks, then archive Alpha`), but `commandReadLead` (:3411) vetoes any
  command whose HEAD is `do`/`list`/`show`…, so both allowances are dead (`commandImperativePosition=true`,
  `commandFallbackAllowed=false`, 0 calls). Because `READ_SHAPE` (:5525) vetoes the lexicon at the same head, these
  commands also carry no intent → the fabrication ships. Same class for `do not archive Alpha`: the executor fails
  closed (`commandNegatedLead`) but the bare `do` alternative in `READ_SHAPE` kills the intent that owes the "you
  asked me not to" receipt. Same shape as ledger #101/#105 (an alternative added from intuition that the guard next
  to it can never let through).
- V59-D3 (P3, VACUOUS_GUARD). The Cyrillic alternatives `архивла|сэргээ|устга` in `IMPERATIVE_HEAD_RE` are followed
  by `\b`, which is ASCII-only under `/u`, and Mongolian is verb-final: `архивла Alpha`, `Alpha-г архивла`, `Beta
  сэргээ` all give `commandImperativePosition=false`. The lexicon does fire (Unicode lookarounds), so the founder
  gets "No change was made — that request did not resolve to an operation I can execute from chat" — not silent,
  not executed, and the reason is wrong (it is an operation Brain executes). With the model's classification all
  three execute once.
- V59-D4 (P3, wording). The receipt's entity falls back to "company" when the model emitted neither
  `requestIntent.entityType` nor a typed field: `restore task QA-7` / `archive the goal Growth` / `restore the person
  Bob` → "I could not resolve which company you meant". The command noun is never consulted (:6329–6331).
- V59-D5 (P3, residual, sized). Lexicon false positives with no model classification: `the fire drill is at 3pm`
  (fire), `draft an email about the merge`, `the revenue split is 60/40`, `I approve of this plan`, `write a memo on
  archiving policy` → a truthful answer replaced by a receipt. 8/64 ordinary reads, 111/800 verb-headed reads; 0 when
  the model classifies. Not the contract's "text shape alone" (that is the response text).
- V59-S1 (P2, SUITE_INTEGRITY). `qa/scenarios-runner/architecture_lifecycle_rpc_only_contract.mjs` as committed in
  `02220b9` cannot load: line 86's `.replace(/\r\n/g, '\n')` was written with REAL CR/LF bytes inside the regex
  literal (SyntaxError: Invalid regular expression: missing /). Entry #131's "matrix 31/31" was never observed on
  the committed bytes (the session's own battery9.log records 27, the pre-patch count). A byte copy with only that
  literal repaired prints 31/0 on the candidate: the pinned invariants hold; the pin itself is dead. Nothing is
  hidden today only because `v58_lifecycle_window_and_imperative_contract` pins the same class executably (mutant
  m11 was killed by both).
- V59-R2 (residual, sized). The durable pending-action reader (:2411–2424) never compares
  `pending_action_source_work_order_id` with the last turn's work order, so a row left behind by a swallowed write
  error (:6448) or a lost CAS race binds a later bare "yes" for up to 30 min. v92 read the stored output first and
  was less exposed; the contract (§2 tier 3 > 4) mandates the candidate's order. Fix shape: require the source to be
  the last turn's work order, or the row to be newer than the last turn.

**Why PASS and not FAIL.** The contract's INTENT is the structured classification (CWC §1 "as a structured
request"); the request lexicon is the last of three request-side tiers and is labelled defence-in-depth in the
code and in #56's closure. Every FAIL condition of this gate was tested on the designed chain and holds: no
mutation-intent fabrication ships when the model classifies; no truthful read is rewritten on response-text shape;
no lifecycle request ends silent or window-gated; no success claim renders without a verified envelope; no
runtime-fatal construct; no harness default hides a class (the request-side defaults are shadowed by every consumer
window; the mutation-intent default in run8/10–14 is faithful; the SUPERSEDED pins and the run11/run8/P6/E
inversions follow OTM §2/§3/§4.1 literally). D1–D4 need the model to violate its output contract in two or three
independent ways at once (omit `requestIntent`, omit the action array, fabricate a completion) — the exact residual
class #57 named as V57-D5 and the founder handed to this campaign to judge. Judged P2/P3 hardening, not a deploy
blocker; the prepared patch below closes them and is measured.

**Fix PREPARED (not applied; index.ts untouched).** `qa/verification/proposed/v59_hardening.patch` (25 changed
lines, 6 anchors): the lexicon learns `bring … back` and the causative `get X <participle>` (as CAPTURE groups —
`lexiconAlways` reads the first non-empty group; the first draft without a group matched and yielded nothing, which
only the measurement caught); the three dead Cyrillic alternatives are removed and a Cyrillic lexicon verb maps to
archive/restore/delete in the receipt; `commandReadLeadEffective` applies the read-lead veto to the clause the
imperative test looked at; the lexicon's READ_SHAPE veto is decided after stripping the executor's own frames
(plus "when you get a chance"-type frames, admitted in `IMPERATIVE_HEAD_RE` too) and never on an imperative last
clause; `do(?!\s+not|n't|\s+me a favour)`; the receipt entity comes from the command noun when the model gave
nothing. Measured on the patched bytes: 340/340 receipts (0 ship); model-absent no-intent 12.2 % → 6.7 %; hand
idioms 19 → 18 ship (the remaining are idioms outside any lexicon: shelve/retire/bin/scrap/"back to active");
battery 56/56; gates v48–v58 green (v46/v53 the recorded standing reds); `v59_regression_additions` 72/12 on the
candidate → 83/1 on the patch (the 1 is V59-S1, a QA file).

**Not measured here (BLOCKED, disclosed).** Live database, live Edge Function bytes, deployed UI and live AI chat:
the Supabase CLI (`npx`) and browser tools were gated in this session. The v92 provenance link is
integration-level (recorded download 795c20c8… == git `c9dfab5bd433`), not a fresh byte-direct fetch. `deno check`
not run.

**Status.** Candidate PASS at the contract bar; deploy authorisation requested for the exact SHA. Hardening patch
FIX PREPARED (measured, not applied — applying it yields a new candidate for verifier #60). Suite repair required
at promotion: replace the crashed suite with the byte-repaired copy. Entry #131's "31/31" corrected by this entry.
