# Operating Truth Model

**Layer B of Brain OS governance.** This document defines what counts as *true* about the
operating state of Brain OS at any moment, and how the AI layer is allowed to speak about
it. It is the single authoritative home for the grounding-precedence rule, the AI
execution contract, and the three envelope shapes every mutation and every collection
must carry. `CLAUDE.md` (Layer A, the Development Constitution) and
`governance/CANONICAL_WORK_CONTRACT.md` (Layer C) point here; nothing else restates these
rules.

Sibling documents: `BRAIN_OS_CONSTITUTION.md` (security/authorization hierarchy),
`SECURITY_INVARIANTS.md`, `DATA_CLASSIFICATION.md`, `ACTION_RISK_LEVELS.md`.

---

## 1. Where operating truth lives

Operating truth is **canonical backend state only**: the rows in the production Postgres
database as returned under the caller's own authorization, and the structured return
value of a canonical operation that just executed.

Operating truth is **never** any of the following, no matter how recent or confident:

| Not truth | Why |
|---|---|
| `CLAUDE.md`, governance prose, agent files, skills | These describe how we build. They cannot know current row state. |
| The system prompt or any prompt text | Prompts shape reasoning; they do not observe the database. |
| Conversation history, channel history | A prior turn may have been wrong; a prior assistant claim is a claim, not a record. |
| A previous assistant statement | Same. "I archived X" in turn 3 does not make X archived in turn 9. |
| Model inference, plausible reasoning, memory | Interpretation, never observation. |
| UI-only state (React state, cache, toast, badge) | A render is a projection of data that may be stale or wrong. |
| Cached prose, summaries, `work_orders.output` text | Derived narrative; only the structured receipt inside it is evidence. |
| An RPC exit status alone, a 2xx alone | Success of a call is not the postcondition of the operation. |

A statement about current state that cannot be traced to a fresh canonical read or a
verified execution receipt is **unverified narrative** and must be presented as such or
not at all.

## 2. Grounding precedence (permanent ordering)

When sources disagree, the higher source wins and the disagreement is surfaced, never
averaged, never silently resolved in favour of the lower source:

```
1. AUTHORITATIVE EXECUTION RECEIPT   (this turn's ExecutionResultEnvelope, postcondition verified)
2. FRESH CANONICAL DB STATE          (a read performed for this request, under the caller's RLS)
3. DURABLE STRUCTURED CHANNEL STATE  (chat_channel_state: pending action, resolved targets, TTL-guarded)
4. CONVERSATIONAL HISTORY            (prior turns' commands and summaries, carried as narrative)
5. MODEL PROSE / INFERENCE           (the model's own draft)
```

Consequences that are not optional:

- A direct question about current state ("what is the exact current title in the
  database", "is X archived", "who is P's manager right now") is answered from tier 2 by
  a deterministic canonical read. History may say *what* to look up; it never supplies
  the *answer*.
- When tier 4 contradicts tier 2, the response acknowledges it explicitly: "An earlier
  message in this channel said X; the database currently shows Y." The old claim never
  survives as current truth.
- Tier 3 outranks tier 4. A durable pending action outranks a stale summary text stored
  on the previous work order. Reading the stale text first and the durable row last is a
  defect.
- Absence from a context window is never canonical non-existence. A context pack is
  context for reasoning and display; it is not the universe of entities. An explicit
  reference to an entity resolves by canonical lookup under the caller's authorization,
  spanning archived and active as the action requires.

## 3. The AI execution contract

Every Brain Chat turn that could describe a mutation flows through this chain, and the
prose the founder reads is the *last* step, never the source:

```
USER REQUEST
  → structured intent (what mutation, if any, was asked for)
  → canonical entity resolution (exact stable IDs, under the caller's authorization)
  → authorization (tenancy + role, re-derived at the operation, not assumed)
  → execution of the canonical operation
  → backend result (rows affected, RPC jsonb verbatim)
  → postcondition verification (fresh re-read proves the intended state)
  → persisted ExecutionResultEnvelope
MODEL RESPONSE
  → structured claims (what the draft asserts happened / is true)
  → claim ↔ evidence reconciliation (each mutation claim must reference a verified envelope)
  → verified response envelope (supported / unsupported / rejected claims)
  → founder-facing prose, rendered from the verified envelope
```

Rules:

1. **A current-turn mutation-success claim may exist only if a real operation executed
   and its postcondition was verified.** The only admissible evidence is an
   `ExecutionResultEnvelope` with `executed = true` and `postcondition_verified = true`
   whose canonical IDs cover the claimed target.
2. **Conversation text cannot self-certify execution.** Tense, question shape, trailing
   questions, keywords such as "done", pronouns, capitalization, word position, a
   pending action being armed: none of these decide whether execution happened. Text-shape
   rules may exist only as defence-in-depth on top of the receipt rule, and may never be
   the sole reason a response is accepted or rewritten.
3. **A mutation-intent turn is never silent.** If the request carried mutation intent and
   the ledger for the turn is empty, the response is the deterministic receipt "No change
   was made — <reason>" (target not resolved, already in the target state, denied,
   unsupported from chat, backend error). The model's own prose does not ship as the
   final answer for that turn.
4. **The receipt describes the operation, not the wish.** The founder-facing account of a
   mutation is rendered from the envelope: action, entity type, canonical names, what
   changed (from `backend_result` and the requested-vs-executed diff), rows affected,
   verified or failed, and the reason. A manager change renders as a manager change; a
   company change renders only if the company actually changed.
5. **Read questions ground before narrating.** Any state claim in a response is checked
   against fresh canonical state; contradictions are acknowledged (section 2).
6. **Persist every turn's ledger.** The turn's envelopes are written verbatim into the
   work order output on every turn, including an empty ledger, so that later grounding
   can tell a verified turn from an unverified one. History entries carry
   `executedOperationCount` and `rejectedClaimCount`; a prior turn that claimed a mutation
   with an empty ledger is carried as `[UNVERIFIED — no database change was executed on
   that turn]` and its prose never re-enters the prompt as fact.

## 4. Envelope shapes

These shapes are the shared primitives. TypeScript definitions live in
`web/lib/contracts/` and are mirrored for the Edge runtime in
`supabase/functions/_shared/`; the two copies are kept identical by a drift guard.

### 4.1 `ExecutionResultEnvelope` — one per executed operation

```
{
  request_id            string      the turn / request this belongs to
  channel_id            string|null
  turn                  number|null
  action_type           'archive'|'restore'|'create'|'update'|'rename'|'assign'|'reassign'|
                        'unassign'|'delete'|'approve'|'reject'|'invite'|'revoke'|...
  entity_type           'company'|'person'|'project'|'task'|'goal'|'department'|...
  canonical_entity_ids  string[]    the exact stable IDs the operation targeted
  requested_values      object      what was asked for (name, title, manager id, ...)
  executed              boolean     a real backend operation ran
  rows_affected         number|null
  backend_result        object|null the RPC jsonb / result verbatim
  precondition          object|null state observed before executing
  postcondition         object|null state observed after executing (fresh re-read)
  postcondition_verified boolean    postcondition matches the intended target state
  error                 string|null
  timestamp             ISO string
}
```

`executed && postcondition_verified` is the only combination that admits a success claim.
`executed && !postcondition_verified` is a FAILED operation and renders as such, even when
the backend returned success. A `postcondition_verified: true` literal that is not the
result of a fresh re-read is a defect (a drift guard rejects the literal in source).

### 4.2 `MutationReceipt` — the founder-facing account, rendered from envelopes

One renderer for every entity type. Input: the turn's envelopes plus the structured
request intent. Output: lines of the form
`<Action> <entity type> "<canonical name>" — <what changed> (<rows affected>) — <verified|failed: reason>`,
or, for a mutation-intent turn with no envelope, the never-silent line
`No change was made — <reason>`.

### 4.3 `CollectionEnvelope<T>` — every collection handed to the model or a page

```
{ items: T[], shown: number, total: number, truncated: boolean, order?: string, scope?: string }
```

`array.length` never means total. `total` comes from an authoritative count. A collection
placed into a context pack without `shown/total/truncated` is a defect (drift guard).
The model states "N of M shown" when `truncated` is true. Counts, sums and totals shown to
the founder come from aggregate queries, never from counting a window.

## 5. Truthful-receipt FAIL conditions

Any of these observed on any surface (UI, chat, notification, dashboard) is a product
defect of the class EXECUTION_TRUTH, not a wording issue:

| Observation | Verdict |
|---|---|
| Database unchanged, response says "Done" / "renamed" / "archived" | FAIL |
| Manager changed, response says the company changed (or vice versa) | FAIL |
| Archive succeeded in the database, UI or a selector still shows the entity as active | FAIL |
| RPC returned success, postcondition re-read shows the intended state was not reached, response says success | FAIL |
| Restore of a known entity refused because it was outside the context window | FAIL |
| Same question, same account, same build, different answers depending only on channel history | FAIL |
| A collection reported as complete while `truncated` is true | FAIL |
| A pending action or trailing question used to excuse an unsupported success claim | FAIL |

## 6. Idempotent and failed operations are truthful, not errors

`already_active`, `already_archived`, `not_found`, `denied`, `foreign_org`,
`stale_state`, `conflicting_update`, `partial_backend_failure` render as receipts with the
reason from the backend result. They never render as success, and they never disappear.

## 7. What this document does not decide

Which operations exist, their state machines, and who may execute them are defined per
feature under `docs/architecture/FEATURE_COMPLETENESS_CONTRACT.md` and enforced under
`BRAIN_OS_CONSTITUTION.md`. This document only fixes what *truth* means and how the AI
layer must relate to it.
