## 139. The frame list was repaired in one twin again, an adverb branch was unreachable, and the harness's own comment stripper deletes code after a bare CR — FOUND (2026-09-08)

**Found by** independent verifier #64 (campaign #124) on candidate `15480e3` / index.ts
`885fd290be10dcc98226e2df390fa7de5f62f21637c329a2a013ac99f8e1966c`, which returned **FAIL — NOT
DEPLOYABLE**. Artifacts on `verify-15480e3-campaign124`. Preflight EXECUTION_READY (HEAD matched, scratch
writable, `architecture_final_claim_contract` 51/0). Battery 63/65 from the filesystem, the two red suites
being the production-write-authority pair that is red by design. The candidate's own vacuity sweep
reproduced at 44 killed / 0 survived.

### V64-D1b (P1) — the same twin asymmetry ledger #138 closed, on the same pair, one round later

Ledger #138 closed V63-D3(a) with the standing rule *"a repair made in one of two twins is a repair that
will be re-found."* It was re-found in these bytes, in the same direction, on the same two tiers.

The **v59 hardening** added the frame `(?:i think )?(?:we|you) should` — but only to
`IMPERATIVE_HEAD_RE`, the company command-fallback tier. `REQUEST_FRAME_PREFIX`, the tier the
**never-silent receipt** depends on, still carries only `you should`. Measured behaviourally over 44
request frames, one command shape each:

| frame | executor tier (`IMPERATIVE_HEAD_RE`) | intent tier (`REQUEST_FRAME_PREFIX`) |
|---|---|---|
| `you should archive ACME` | imperative | intent derived |
| `we should archive ACME` | **imperative** | **no intent** |
| `i think we should archive ACME` | **imperative** | **no intent** |
| `i think you should archive ACME` | **imperative** | **no intent** |

The consequence is the #138 consequence verbatim: with the model emitting no `requestIntent` and no
mutation array, `requestedIntent` is `null`, the receipt cannot fire, and the model's fabricated
completion ships to the founder unaltered with `receiptRendered: false`. Executed end-to-end against the
real structured-claim window: `"we should archive ACME"` + `"Done — ACME has been archived."` returns
that sentence verbatim.

The asymmetry is worse than a missing string, because it points the wrong way. For the ONE verb family
that has an executor fallback (company archive/restore) the executor tier will still resolve and archive
— so the turn is saved by the tier that was repaired. For every other verb there is no fallback, so
`we should delete QA-1`, `we should rename ACME to Beta` and `I think we should approve the salary
request` all derive nothing and ship whatever the model wrote. The repair landed in the tier that did
not need it and was withheld from the tier that did.

### V64-D1 (P1) — 14 ordinary mutation requests still derive no intent

The same measurement over a corpus written from scratch for this round (121 mutation requests, 87 reads)
found 14 ordinary phrasings that derive no intent at all, in five mechanisms. Every one of them was
confirmed to ship its fabrication verbatim through the real receipt window.

| # | example | mechanism |
|---|---|---|
| a | `we should archive ACME`, `I think we should archive ACME`, `let us archive ACME`, `need to archive ACME` | `REQUEST_FRAME_PREFIX` is a closed list with arbitrary holes: it has `we need to`, `you need to`, `i need you to`, `you should`, `let's` — and not `we should`, `let us`, or bare `need to` |
| b | `right away archive ACME` | `REQUEST_FRAME_PREFIX`'s bare `right` runs FIRST inside `stripFrames` and consumes `right `, stranding `away`. `LEADING_ADVERB`'s own `right away` alternative can therefore never match — it is dead code. `straight away`, `at once` and `right now` all work |
| c | `may I ask you to archive ACME?`, `would you be able to…`, `any chance you could…`, `mind archiving…?`, `I would like you to…`, `it would be great if you could…`, `feel free to…` | `POLITE_REQUEST` recognises `may i ask you to` — but only to defeat `isQuestion`. `REQUEST_FRAME_PREFIX` does not strip it, so the imperative never reaches head position and nothing derives intent: that `POLITE_REQUEST` alternative buys exactly nothing. (`would you mind archiving ACME?` DOES work — `would you(?: please\| mind)?` is in the frame list — which is precisely the inconsistency) |
| d | `ACME needs archiving` | `MUTATION_PASSIVE_REQUEST` requires a past participle; a gerund complement of `needs` is not covered |
| e | `ACME-г archive хийнэ уу` | a mixed-script loan verb (`archive` + `хийх`) is outside both the English head rule and the Mongolian stem list |

False positives were measured in the same run and are clean: **0 of 87** genuine read/report/compose
requests had a truthful answer replaced, including the `assign a number to each company and list them`
row that the #138 first-clause rule regressed. `delete this chat history` and `archive this conversation`
do derive intent; that is the safe direction (the receipt is truthful) and is not counted as a defect.

### V64-D0 (P1, the one to be judged on) — the last three rounds' P1 fixes are still pinned by substring alone

Ledger #138b established the standing rule: *"A P1 fix is not pinned until a mutant that reverses it fails
a committed suite."* It was closed by widening the candidate's sweep to **named regex constants inside one
region**. That is not where the last three rounds' fixes live.

This round's sweep was rebuilt for the regions the founder named: every named regex **file-wide** (73
guards, 146 mutants) plus **39 structural mutants** — the executor id gates, the receipt renderer, the
budget block's numeric constants and loops, the minimum-safe-context set, the estimators — each run
against the **whole 63-suite battery**, not a 13-suite subset. Result: **150 killed, 35 survived** (of the
35, 13 are inconclusive because the mutator neutralised only the first regex literal of a multi-literal
declaration; 22 are genuine).

**Eight structural mutants survived the entire battery, and five of them are direct reverts of the last
three rounds' own P1/P2 fixes:**

| mutant | what it reverts | what still passes |
|---|---|---|
| `estimateRequestTokens` drops `SYSTEM_PROMPT_TOKENS` | V61-D10 (the model-context-window gate) | everything. Measured: an ordinary request goes from **19,138 → 314** estimated tokens, a 61× understatement of the only gate that bounds the real request. The single assertion is a substring on `systemPromptTokens: SYSTEM_PROMPT_TOKENS` in the 413 body, which the mutant leaves untouched |
| `estimateRequestTokens` measures the COMPACT form | V61-D10 (the other half) | everything (19,138 → 18,996) |
| `packIdSet` drops the `contextProvenance` line | **V62-D1** — id provenance surviving a trim | everything |
| `archivedCompanyIds` drops the `contextProvenance` line | **V63-D2** — the previous round's headline finding, the gate that REFUSES a create under an archived parent | everything |
| `archivedCompanyIds` drops `namedTargets` | V63-D2 (the other half) | everything |
| `deleteTaskIds` no longer filtered by `contextTaskIds` | the id gate on **permanent task deletion** | everything |
| `updateCompanies` no longer filtered by `contextCompanyIds` | the id gate on company updates | everything |
| `statusChangeIsLifecycleTransition` forced `false` | the raw-lifecycle-edit refusal | everything |

Every one of the eight is a real deletion (verified by byte diff against the candidate), not a no-op. So
the rule #138b wrote down is not yet in force: **V62-D1, V63-D2 and V61-D10 are all in exactly the state
V63-D4 described — defended by an assertion that would pass if the thing it names were deleted.**

Nine guards additionally survive in **both** directions, meaning the whole battery cannot distinguish the
guard from its absence *or* from its opposite. The most serious is `isShortAffirmative` (line 3088), the
gate that turns a founder's bare `"yes"` into real mutations — it gates both the `bulk_confirmation`
short-circuit (3091) and `multi_action_plan` execution (3224). Forcing it to **always** match means every
subsequent command, including `"what companies do I have?"`, executes the armed plan; forcing it to
**never** match means a confirmed plan can never run. Neither is noticed. Its only nominally dedicated
suite, `sem_ai_command_confirmation_truth.mjs`, states in its own header that its function bodies are
*"byte-for-byte copies of the shipped logic (kept in sync manually)"* — a reimplementation, which is the
vacuous-regression class this repository has logged repeatedly and which cannot see index.ts change at
all. The other both-direction survivors: `FACTORY_INTENT_PATTERN`, `commandReadLead`,
`FUTURE_PROMISE_PATTERN`, `NEGATION_AUX`; single-direction: `LIFECYCLE_UUID_RE` (always), `UUID_IN_TEXT`
(never), `abbreviation` (never), `NAME_CONNECTOR` (never).

### V64-D4 (P2) — the harness's comment stripper deletes real code after a bare CR

`qa/scenarios-runner/_gate_extract.mjs` normalises `\r\n` only, then drops whole-line `//` comments. A
**bare CR** is a JavaScript line terminator but is not normalised, so a comment line ending in a lone CR
swallows the code that follows it and the stripper deletes both. Demonstrated:

```
stripTS('// a comment\r\nconst x = 1;\r\n')  ->  'const x = 1;\n'
stripTS('// a comment\rconst x = 1;\r\n')    ->  ''
```

Every behavioural harness in this repository executes its window through `stripTS`. index.ts **already
contains one bare CR** (offset 554776, between two comment lines near 6651) — harmless today because it
joins comment to comment, and invisible to the project's own purity gate, which counts bare **LF** and
says nothing about bare **CR**. The failure mode is "the window silently loses a block and the suite
passes on code it never executed": the fail-open shape ledger #138 named for slice markers, one level
down, in the stripper every slice goes through. Fix: `s.replace(/\r\n?/g, '\n')`, plus a bare-CR count in
the purity gate.

### V64-D2 (P2) — `contextBudget.trimmedCount` is 0 on every ordinary trimmed turn

```
if (contextTrimmed.length > 12) { contextBudget.trimmedCount = contextTrimmed.length; contextTrimmed.splice(12, …); }
```

`trimmedCount` is initialised to `0` and assigned **only** when more than twelve trims occurred. A turn
that trimmed one collection ships `contextBudget: { trimmedCount: 0, trimmed: ["memories 900->4"] }` — a
report that contradicts itself in the same object the model reads, while the source comment above it says
*"the count is always exact."* `serve()`'s 413 body reports the same field as `contextReduced`, so a
refusal can tell the founder that no context was reduced when it was. The only committed assertion
(`v61_budget_intent_language_contract.mjs:272`) pins the **no-trim** case, so it cannot see this.

### V64-D3 (P3) — the third member of the V63-D2 pair is still unhardened

V63-D2 hardened `archivedCompanyIds` (the gate that REFUSES) to match `contextCompanyIds` (the gate that
TRUSTS). A third gate reads the same data and was not hardened:

```
const companyStatusById = new Map((contextPack?.companies || []).map((c) => [c.id, c.status]));
```

It decides `statusChangeIsLifecycleTransition` — whether an `updateCompanies` status patch is really an
archive/restore that must be refused and explained. Both gates beside it read `contextProvenance`; this one
reads the raw trimmable array. Once the budget's floor pass empties `companies`, the status is unknown, the
transition is not recognised, a raw `UPDATE` is attempted, the `companies_lifecycle_guard` trigger rejects
it, the `{ data }` destructure discards the error, and the founder gets the generic receipt instead of the
honest *"use restore"* explanation. Reachability measured: `companies` reaches the floor-2 pass at a
~10,000-character command and empties at ~20,000. Two smaller members of the same class:
`activeChannelCompanyId` and `earlyCompanyId` read the trimmed `channels`, so `work_orders.company_id` —
and therefore company-manager RLS visibility of that audit row — depends on whether the budget trimmed.

### V64-D5 (P3) — `namedTargets` is a capped collection with no `CollectionEnvelope`

`namedTargets` is built from six lookups each capped at `NAMED_LOOKUP_ROW_CAP = 5` and is handed to the
model, but carries no `shown/total/truncated`. `architecture_collection_envelope_contract.mjs` exempts it
by name on the grounds that it is minimum safe context and never trimmed — which explains why it needs no
place in `TRIM_ORDER`, not why it may omit `truncated`. A command naming a token that matches six
companies shows five with no indication a sixth exists (OTM §4.3).

### V64-D7 (P3) — §4.4's "any entity named in a command" is implemented for six of twenty-three collections

§4.4 promises: *"Any entity named in a command is still resolved server-side across every status, so a
trimmed window can never become an answer of non-existence."* The targeted lookups cover **companies,
people, tasks, goals, projects and departments**. For the other seventeen pack collections — documents,
leads, proposals, approvals, channels, memories, product specs, engineering drawings, providers,
connectors, financial reports, inventory, products, agents, relationships, assignments, factory work
orders — there is no lookup at all, and the trim takes them from thirty rows to eight, then two, then
zero. The only thing standing between an emptied `documents` array and *"there is no document called X"*
is the sentence in `contextBudget.note` telling the model not to conclude absence. OTM §1 lists prompt
text as **not truth** and §3 rule 2 permits text rules only as defence-in-depth. This is not a regression
against v92 (which caps the same collections without the note), but the promoted contract text claims more
than the code delivers, and the difference should be either narrowed in the code or narrowed in §4.4.

### V64-D6 (P3) — a latent forward reference, and an unmeasured gate the inventory does not name

`safeDisplayLabel` (declared ~5551) reads `UUID_IN_TEXT` (declared 5590) in the same block. No call site
sits between the two, so nothing throws today; any future call inserted there is a `ReferenceError`.
Separately, `SEM_AI_MODEL_CONTEXT_TOKENS` is a single environment constant (180,000) while the model in
use comes from an `ai_providers` row — so the "model context window" gate is not per-model. It is not
reachable at today's request sizes (~55k tokens), but it is a whole-request gate that
`request_gate_inventory_contract.mjs` neither classifies nor lists as UNMEASURED.

### What is NOT defective, measured rather than assumed

* The context budget is sound on every invariant §4.4 names, measured with fixtures built from the real
  `.limit()` caps and including `namedTargets` (which the candidate's own headroom fixture omits): a
  fitting pack is byte-identical apart from the added `contextBudget`; optional context trims before core;
  history keeps the newest turns; exact totals never change; `truncated` is true on every collection that
  lost rows and an unknown total stays `null`; `shown` always equals the surviving row count; the minimum
  safe context survives byte-identically through a 30,000-character command; the loop terminates in <10 ms
  on every shape; and the estimator under-reports the shipped pack by at most 1 token. Independent
  headroom against the 12,000 hard cap on saturated workspaces: **729–992 tokens** (the candidate's own
  suite reports 841–5,113 because its fixture has no `namedTargets` and no `pendingAction`).
* The irreducible minimum is ~3,141 tokens; below a ~3,700 cap the turn is refused **with the minimum
  intact and a stated reason**, which is the one refusal §4.4 permits.
* A 40,000-character command is refused as an oversized *command*, not blamed on the workspace.
* The malformed-cap parser is honest in both directions (`'twelve thousand'` and `'-5'` behave as unset).
* The embedding call is fail-soft, so the 8,191-token embedding input limit is not a hidden hard stop.
* The pinned production witness is honest on both halves: 25,595 pre-fix (genuinely over the cap) →
  11,297 post-fix with 12 trims. Its third assertion is weak — it checks one of eight protected keys and
  pins a `currentTurn.command` literal that is not the witness's own command — but it is not vacuous.
* 180/180 on an independently written final-claim matrix: 60 fabricated completions × claims:null / [] /
  state-only plus 20 pendingAction variants all end in the receipt; 60 truthful read answers survive
  verbatim; 20 verified envelopes render; 20 executed-but-unverified envelopes never support a claim.
* index.ts is bare-LF-free (0 of 6,977), and no runtime-fatal forward reference of the TS2448/TS2454
  class exists by an independent block-scope scan.

**Status.** FOUND, not fixed — this is a verifier finding on a candidate that was not deployed.
Production remains v92 source.
