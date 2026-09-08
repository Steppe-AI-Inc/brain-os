# Proposed additions from verifier #8 (campaign verify-e8678ec-run7-defect-closure)

Written under `qa/verification/proposed/` because this run's safety rule forbade writing
outside `qa/verification/**`. Move the first section into `qa/KNOWN_FAILURE_MODES.md` as
entry **#68** (next free number after #67) and the second into
`qa/scenarios-runner/lifecycle_evidence_and_output_persistence_contract.mjs` Section S,
in the same commit that acts on them.

---

## #68 — e8678ec (run7 D50-D54 closure) verified: DO NOT DEPLOY — the truth gate is still model-controlled, and the D3 short-circuit regressed on the D3 branch

Independent verifier #8, 2026-09-02, branch
`pending/d3-past-completion-gate-pendingaction-shortcircuit` @ `e8678ec`. Production
remains on sem-ai-command **v92**, untouched (no Supabase command was executed this
session). Full record: `qa/verification/CURRENT_CAMPAIGN.json` (campaign #68).

**Evidence level for everything below: CODE INSPECTED.** The session's permission layer
refused every script-execution form (`node <file>`, `node -e`, `node --test`, `npx …`,
`sh`), so the regression battery and the v92 read-only check are BLOCKED, and every attack
is a hand trace of the extracted window. The window is pure (no I/O) so the traces are
exact if the reading is right; `qa/verification/proposed/v8_attack_cases.mjs` encodes each
traced output so the next session with execution can falsify them in one run.

### What e8678ec genuinely closed
* **D50 coverage** — `recordExecution` is now at every ad-hoc write site, success-gated
  (the person-lifecycle sites key on the RPC's real `reason` strings, verified against
  migration 202608290008). Residual P3 gaps: `executeOneAction` (plan path), spec ticket
  tasks/approvals, pricing approval, provider deactivation.
* **D50 rejectedLines wording** — non-denial. ✔
* **D51 rewrite** — `summaryIsFullyDeterministic`/`deterministicPrefix` classify every
  `result.summary` branch above the window correctly; both harnesses inject them
  faithfully. ✔
* **D52 claimed shape** — one supported create no longer carries unrelated fabrications. ✔
* **D53 splice** — questions/options/prompt are gated where they are spliced. ✔
* **D54 uuids** — all four fields, upper/lower case. ✔ Envelope `reason` strings ruled
  **not founder-facing** (only `output.summary` is rendered — `chat-client.tsx:758`,
  `chat-history.ts`; `buildContext` reads summary/pendingAction/resolvedEntities only).

### D58 (P0) — backend mutation evidence never feeds the gate; a prompt-compliant create turn is denied or unguarded
`groundedOutcomeThisTurn` (4283), `legacyProseFallback` (4608) and `rewriteFromStructure`
(4624) never look at `claimExecutionEvidence`. The system prompt (1297-1299) forbids a
`mutation_result` without the canonical id, and a create has no id when the model writes —
so the *default* create turn has `claims: null`. Then:
* (a) task/project/department/lead/document/product/spec/drawing/provider/proposal/memory
  creates set **no** grounding flag → "The task was created." → legacy gate → **"I can’t
  actually do that from chat — nothing was changed."**, persisted. A real create, durably
  denied. (v92 parity — but the architecture makes it the default path.)
* (b) on a grounded turn (company/person/goal create or lifecycle, resolved entity) the
  same `claims: null` + any fabrication ships raw: the D52 rewrite trigger is
  `hasMutationShapedClaim` — the model's own choice.
* (c) `deterministic-confirmation && !groundedOutcomeThisTurn` (4714) denies a confirmed
  create the same way.
Fix spec: `qa/verification/proposed/v8_prepared_fix_index.patch` hunks 1-2.

### D59 (P1) — D3 regressed on the branch named for it
`legacyProseFallback` carries `&& !result.pendingAction` (4610). 606cfa8 removed this
(see #62, line 5169); c0b6fc0's structured-claim rewrite re-added it inside the new legacy
gate (run6 recorded the gate as "byte-equivalent to v92" — i.e. D3 came back as parity).
Trace: "The approval has been approved. Should I also archive ACME?" + `pendingAction`
open_question + `claims: null` → ships and persists. Every `claims*Deleted` corrector is
also suppressed by `modelProposedPendingAction`.

### D60 (P1) — D53 not closed for the persisted/replayed channel
`result.verifiedResponse.pendingAction = result.pendingAction || null` (4728) and
`output: result` (4765) persist the **raw** pendingAction; `buildContext` reads it back
(2092-2101) and the confirm path renders `Confirmed — ${pendingAction.summary}` /
`.question` / option label verbatim (2421/2446/2469). After a factLines-type confirmation
(delete tasks/channels/approvals) the raw text ships behind the fact line; a deterministic
turn has no claims so nothing rewrites it.

### D61 (P1) — `safeProseFragment` is a one-tense regex
`PAST_COMPLETION_CLAIM_PATTERN` needs `has been|have been|was|were … <verb>` or
`<verb> successfully`. "The company is now archived.", "I archived ACME.", "Done — ACME
deleted.", "Successfully archived ACME.", "**ACME deleted.**", Mongolian, and future
promises all pass through `questions[]`/`pendingAction` into the corrected summary. This is
the intrinsic prose ceiling (#62/#64/#65) reintroduced on the one channel the rewrite
still splices.

### D62 (P1) — a new free-text laundering channel through the contradicted correction
`Actually, ${subject}’s ${predicate} is not ${safeValueText(c.expectedValue)} …` (4656).
`expectedValue` is unbounded model text (only uuids scrubbed) and `predicate` is 40 free
alnum chars; `row[garbage]` is `undefined` so a garbage predicate is *always* contradicted
and *always* rendered. Trace: predicate `status`, expectedValue
`archived. The approval has been approved and all 12 tasks were deleted` → founder reads
"Actually, ACME’s status is not archived. The approval has been approved and all 12 tasks
were deleted in the current records." Fix: render the canonical actual value, never the
expected one; unknown predicate → `unknown`.

### D63 (P2) — Section S is satisfiable by a commented-out site
`src.includes(literal)` on raw source; a `//`-commented site passes; the success guards
(`r.reason === 'employment_ended'`, `changed === true`, the `deleted` branch) are never
asserted; the ten pre-existing sites are not covered at source level at all.

### D64 (P2, parity) / D65 (P2) / D66 (P3) / D67 (P3)
Mixed-intent turns lose factLines (4277 overwrites 4170) and unclaimed creates on
fully-deterministic turns; an id-less create claim renders "the task: created. I can’t confirm … the task
was created."; "EVERY mutating path" is overstated; created rows are
nameless ("the task: created.").

### Verdict
**DO NOT DEPLOY** — D58 (P0), D59/D60/D61/D62 (P1) open; battery and v92 check BLOCKED.

---

## Section S rewrite (D63) — assert LIVE code and the success guard together

```js
// SECTION S — EVIDENCE SITES EXIST IN LIVE SOURCE, WITH THEIR SUCCESS GUARDS.
// run8/D63: the previous form used src.includes(literal) on RAW source, which a
// commented-out site still satisfied, and it never asserted the guard that keeps a
// denied/not_found/no-op result from recording evidence. Live code only, guard + call.
const liveSrc = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const SITES = [
  ['person end_employment (guarded)', "if (r.reason === 'employment_ended') recordExecution('person', 'end_employment', id, true)"],
  ['person restore_employment (guarded)', "if (r.reason === 'restored') recordExecution('person', 'restore_employment', id, true)"],
  ['company archive (guarded)', "if (r.changed === true && r.postconditionPassed === true) recordExecution('company', 'archive', id, true)"],
  ['company restore (guarded)', "if (r.changed === true && r.postconditionPassed === true) recordExecution('company', 'restore', id, true)"],
  ['task archive (guarded)', "if (r.changed === true && r.postconditionPassed !== false) recordExecution('task', 'archive', id, true)"],
  ['task restore (guarded)', "if (r.changed === true && r.postconditionPassed !== false) recordExecution('task', 'restore', id, true)"],
  ['goal archive (guarded)', "if (r.changed === true && r.postconditionPassed !== false) recordExecution('goal', 'archive', id, true)"],
  ['goal restore (guarded)', "if (r.changed === true && r.postconditionPassed !== false) recordExecution('goal', 'restore', id, true)"],
  ['company update (row-gated)', "if (data && data.length > 0) { updatedCompanyCount++; recordExecution('company', 'update', c.id, true); }"],
  ['ai_provider activate (row-gated)', "if (activatedAiProvider) recordExecution('ai_provider', 'activate', activateAiProviderId, true)"],
  ['RPC task create', "for (const t of createdTasks) recordExecution('task', 'create', (t || {}).id, true)"],
  ['RPC approval create', "for (const a of createdApprovals) recordExecution('approval', 'create', (a || {}).id, true)"],
  ['RPC company create', "for (const c of createdCompanies) recordExecution('company', 'create', (c || {}).id, true)"],
  ['RPC person create', "for (const pp of createdPeople) recordExecution('person', 'create', (pp || {}).id, true)"],
  ['RPC project create', "for (const pr of createdProjects) recordExecution('project', 'create', (pr || {}).id, true)"],
  ['RPC goal create', "for (const g of createdGoals) recordExecution('goal', 'create', (g || {}).id, true)"],
  ['RPC task delete', "for (const id of deletedTaskIds) recordExecution('task', 'delete', id, true)"],
  // …plus every literal already in the e8678ec list, unchanged.
];
for (const [label, literal] of SITES) {
  check('S live evidence site + guard: ' + label, liveSrc.includes(literal),
    'Site missing, commented out, or its success guard changed — a denied/no-op result could record evidence, or a real one could record none (run7/D50, run8/D63).');
}
// Negative control: the permanent-delete sites must be INSIDE the reason==='deleted' branch.
{
  const i = liveSrc.indexOf("recordExecution('company', 'permanent_delete', id, true)");
  const j = liveSrc.lastIndexOf("r.reason === 'deleted'", i);
  check('S permanent_delete evidence is inside the deleted branch', i > 0 && j > 0 && i - j < 1200);
}
```
