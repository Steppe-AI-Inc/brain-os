## 137. Verifier #62 (campaign #122) — FAIL on c30a0cc: the budget degrades the pack correctly and then disables the gates that need it, and the new image ceiling refuses turns v92 served (2026-09-08)

Independent gate on candidate `c30a0cc09d37d985fa50ff14fc0335a48e342f6f`, `supabase/functions/sem-ai-command/index.ts`
sha256 `0af353b5267fafa6d4ed3b80c61d9a62838cbf3d43c0f3746eeed8d8b465648f` (CRLF-pure: 6,810 CRLF, 0 bare LF),
against `governance/OPERATING_TRUTH_MODEL.md` §4.4 as promoted this round. Deployed v92 = git `c9dfab5bd433`,
index.ts sha256 `795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc` — re-derived from the repo, not
taken from a report. `_shared/*` is not imported by `index.ts`; the deploy surface is exactly `index.ts`.

**VERDICT: FAIL — NOT DEPLOYMENT READY.** V62-D1/D1b/D2 are P1. V62-D3/D4/D9 are P2. V62-D5/D6/D7/D8 are
residuals with measured sizes. Everything below was measured by executing the real source out of these exact
bytes against fixtures built from the `.limit()` caps read out of `buildContext()` — never the candidate's own
fixtures, never a re-implementation.

### What is genuinely right, and should not be lost in a re-fix

The degradation itself works. On my own full-cap fixtures the **untrimmed** pack measures 21,965–62,728 tokens
against the 12,000 cap — i.e. v92 hard-stops on essentially every full workspace, which is exactly the
2026-09-08 incident, and the pre-fix half of the pinned witness is real, not a fixture too small to have failed.
After the trim the same packs land at 10,431–11,270 with 730–1,569 tokens of headroom. The loop terminates
(a 500,000-character untrimmable input halted in 69 ms), is deterministic, keeps the **newest** history turns,
writes the exact `total` and `truncated: true` back into every envelope that has a real count, and reports its
own size **within one token** of the bytes actually shipped (the residual is the digit-width of
`estimatedTokens` writing itself, documented in source and absorbed by the 600-token margin). `currentTurn`,
`namedTargets`, `counts`, `collections`, `pendingAction`, `activeChannelId` and `continuity` came out
byte-identical. Company, task and goal lifecycle targets are re-read **server-side** and survive a full gut —
the founder's headline scope is safe. My own matrices through the real window: **252 fabricated completions on
mutation-intent requests, 0 shipped; 486 truthful read answers, 0 rewritten; 600 generated fabrications,
0 shipped; 20 verified envelopes, 0 suppressed; 20 executed-but-unverified, 0 unsupported claims.**
61/61 committed `.mjs` suites exit 0.

### V62-D1 (P1) — the trim empties the collections the id-provenance gates are built from

`buildContext()` may reduce `companies`, `people`, `tasks` and `goals` to **zero rows** and still ship the turn.
`namedTargets` is protected from the trim so the *model* still sees the row the founder named — but **no
server-side gate consults `namedTargets`**. Every non-lifecycle mutation validates the model's ids against the
*trimmed* arrays: `contextCompanyIds` (`index.ts:3492`), `contextPersonIds` (`:3512`), `contextTaskIds`
(`:3259`), `contextGoalIds` (`:4058`), plus the channel/approval/department/lead/product/spec/drawing/
provider/connector/proposal sets. So after a gut, `updateCompanies` (rename), the company binding on
`createPeople`/`createTasks`/`createGoals`/`createDepartments`/`createLeads`/`createDocuments`/
`createProposals`/`createMemories`, `createPersonAssignments` (manager and employer), `endEmploymentPersonIds`,
`restoreEmploymentPersonIds` and every `delete*` family **silently drop the founder's own target**.

The turn is not silent and is not a fabrication — the never-silent receipt fires — but it is
`OPERATING_TRUTH_MODEL.md` §5 row 5 ("refused because it was outside the context window") generalised from
restore to every gated family, and §4.4's invariant read on its intent.

Measured reachability (the command is serialised **twice**: top level and `currentTurn.command`):

| pasted command | companies / people / tasks / goals left |
|---|---|
| 0–10,000 chars | 8 / 10 / 8 / 8 |
| 12,000 chars | 8 / 2 / 2 / 2 |
| 14,000–16,000 chars | 2 / 2 / 2 / 2 |
| 20,000+ chars | **0 / 0 / 0 / 0** (still ships) |

Also reachable without any command at all: a `continuity.compactionCheckpoint.summary` of ~40,000 characters
guts all four; a durable `pendingAction.executionPlan` of ~120 actions drops tasks and goals to 2.

### V62-D1b (P1) — the durable pending action is protected as a key and unexecutable in practice

`index.ts:3141-3144` builds `planCompanyIds`/`planPersonIds`/`planTaskIds`/`planGoalIds` from
`contextPack.companies/people/tasks/goals` — the four arrays the trim can empty — to validate the **stored**
execution plan of a `multi_action_plan`. §4.4 names the durable pending action as minimum-safe precisely
because "trimming it breaks a confirmation already in flight". Trimming it does exactly that, and the turn
then answers **"Couldn't execute that plan — one or more of its stored targets no longer resolves to a real
record. Please ask again."** The rows resolve perfectly well; they were trimmed from a display window. That is
an AI↔DB contradiction stated as canonical fact, not a capacity limit.

### V62-D2 (P1) — the new model-context gate refuses images the deployed build serves

The V61-D10 closure added a second 413 (`SEM_AI_MODEL_CONTEXT_TOKENS`, default 180,000) measured by
`estimateRequestTokens`, which counts an attached image as `base64.length / 4` and compares it against a
**token** window. Two different units. Measured on these bytes, with the pack already trimmed:

| attached image | estimated request | outcome |
|---|---|---|
| 64 KB | 55,734 | ships |
| 256 KB | 121,270 | ships |
| **512 KB** | **208,651** | **413 "the attached image is too large to send with this turn"** |
| 1 MB | 383,414 | 413 |
| 4 MB | 1,431,990 | 413 |

The threshold lands at roughly **430 KB of image bytes**. `web/app/(app)/chat/chat-client.tsx` sets
`MAX_IMAGE_BYTES = 5 * 1024 * 1024` and does no downscaling, so the UI accepts, previews and uploads exactly
the files the function then refuses — every ordinary phone photo and most screenshots. Both providers would
have accepted them and would have billed the image at roughly 1,500 tokens. **v92 has no such gate** (v92
`index.ts:2316` is the pack check only) and serves these turns today. This is the founder's forbidden shape:
`VALID FOUNDER TURN → HARD STOP`, newly introduced, on a measurement in the wrong unit.

Note the corollary: without an image, `requestTokens` measured 30,370–34,469 across every fixture, so **the
180,000 gate can only ever fire because of an image.** It is not a general request-size gate, and it is not
model-specific — `ai_providers.model` is free-form while the ceiling is one global env var.

### V62-D3 (P2) — the pack tells the model something that is true for four collections out of nineteen

`contextBudget.note`, shipped inside the pack, says: *"any entity named in a command is still resolved
server-side across every status"*. §4.4 says the same. A targeted lookup exists only for **companies, people,
tasks and goals** (`NAMED_LOOKUP_ROW_CAP`). `projects`, `departments`, `leads`, `documents`, `approvals`,
`channels`, `proposals`, `productSpecs`, `engineeringDrawings`, `products`, `inventory`, `agents`,
`financialReports`, `memories` and `factoryWorkOrders` have none, and all fifteen are trimmable. The pinned
2026-09-08 witness question is itself about a **project**: post-trim its fixture keeps 8 of 20 projects.

### V62-D4 (P2) — two collections cannot express "trimmed" at all

`memories` and `factoryWorkOrders` carry `total: null, truncated: null` (v92 parity), and the trim writes
`truncated = total === null ? null : …`, so after being emptied they report `shown: 0, total: null,
truncated: null`. `contextTrimmed` is capped at 12 lines, and `factoryWorkOrders` sits at position 17 in
`TRIM_ORDER`, so on a heavily trimmed turn it is not in the trim report either. For those two, **truncation
does become non-existence** — the §4.3 defect and the one thing §4.4 forbids by name.

### V62-D5 (P3) — the 413 blames the workspace for an oversized command

The reason ternary compares `commandTokens > hardMax/2`, but the command is serialised twice, so the pack
crosses 12,000 at about `commandTokens = 5,500`. Measured band: a command of **22,000–23,999 characters**
(5,507–6,006 tokens) is refused with *"this workspace has grown past what one turn can carry even after
reducing optional context — ask about one company or one area at a time"*, an action that cannot help.

### V62-D6 / V62-D7 (P2) — the Mongolian tier, both directions, sized

My own corpora, model emitting **nothing** (the hardest tier). Broad corpus: 99 must-be-null → 3 false
positives (one intended: a negated imperative, whose receipt is honest — *"you asked me not to, so nothing was
executed"*); 61 must-carry-intent → 2 false negatives. Adversarial Mongolian corpus: **7/37 FP** (6 unintended)
and **3/21 FN**.

* **V62-D6, false positives.** `MN_NOT_A_COMMAND` rejects `-лт/-лга/-лгэ` participles and verbal nouns but not
  the `-л` / `-гоо` forms, and a two-token phrase lies entirely inside `mnFinalWindow`, so verb-final position
  cannot save it. `Устгалын бүртгэл`, `Устгалын журам`, `Устгалын тайлан`, `Томилгооны жагсаалт`,
  `Томилгооны тушаал`, `Томилгооны хугацаа` all read as commands. Measured through the real window, the
  truthful Mongolian answer is replaced by an English *"No change was made — that request did not resolve to
  an operation I can execute from chat."* v92 has no Cyrillic tier and answers all six: **a truth regression
  vs v92, inside an otherwise intended departure.**
* **V62-D7, false negatives.** The stem list carries `өөрчл\S*` and `нэмэ\S*`; the actual imperatives are
  `өөрчил` and `нэм`, neither of which contains its own stem. `Энэ компанийн нэрийг өөрчил`,
  `Компанийн нэрийг өөрчилье` and `Багт Батыг нэм` carry no intent, so a fabricated Mongolian completion ships
  verbatim with `receiptRendered: false`. v92 parity (v92 has no tier at all), so not a regression — but it is
  a fabrication on a mutation-intent turn under §3 rule 3, on two of the most common verbs in the product.

### V62-D8 — V61-D11 confirmed and sized

`commandNameTokens = command.match(/[A-Za-z][A-Za-z0-9'&.-]{3,}/g)`. Measured: `Эрдэнэт ХХК-г архивла` → **0
tokens**; `Батбаярыг менежерээр томил` → **0 tokens**. So for a Cyrillic-named entity: `namedTargets` stays
empty, the row is **not** merged to the head of its pack array (so V60-D2's head-merge protection does not
apply and the trim drops it first), and the uncapped targeted lookup that exists to stop the 2026-08-30
fabrication class never runs. Identical in v92 — parity, not a regression — but it means the entire
named-entity protection is absent in the workspace's own language, and it compounds V62-D1.

### V62-D9 (P2) — three of this round's closures are guarded by substring presence, not behaviour

24 mutants, run out-of-place through the 30 committed suites that honour `SEM_INDEX_SRC`; `index.ts`
byte-identical before and after. **19 killed, 5 survived**, and the survivors are the point:

| mutant | survived because |
|---|---|
| `HISTORY_FIELD_CAP` **use** deleted (declaration left) | `architecture_context_budget_contract` and `grounding_precedence_canonical_over_history` both assert only `/const HISTORY_FIELD_CAP = \d+;/` plus the marker string. The V61-D1 P1 fix can be disconnected and both stay green. |
| model-context 413 made unreachable (`if (false && …)`) | `request_gate_inventory_contract` counts `, 413)` occurrences (still 2) and tests `/SEM_AI_MODEL_CONTEXT_TOKENS/` as a substring. |
| model context ceiling raised 100× | nothing pins the 180,000. |
| pack 413 made unreachable | same shape (the *constant* is pinned, so `hardMax × 100` **is** killed; reachability is not). |
| `MN_READ_SHAPE` veto removed | no suite in the battery references it. Verified as a real behaviour change: 5/5 Mongolian wh-questions (`Хэн ACME-г архивла`, `Юу устга`, …) become false positives without it. |

Killed, and worth recording as genuinely load-bearing: receipt block deleted; `pendingAction` re-added as a
receipt exemption; floor-0 pass removed; the 600-token margin removed; `namedTargets` dropped from
`MINIMUM_SAFE_CONTEXT`; the `TRIM_ORDER`∩`MINIMUM_SAFE_CONTEXT` guard removed; the byte assertion removed;
`truncated` forced false; an envelope dropped; the imperative object test removed; the Mongolian morphology
filter removed; verb-final position removed; the read-shape veto removed; server-side lifecycle resolution
reverted to the window; the model allowed to veto the lexicon again; `contextBudget` attached after the loop;
named rows merged at the tail again; `conversationHistory` pinned at 1 again.

### The founder's seven questions, answered

1. **Is the two-gate split right?** Yes in principle and it is the finding underneath V61-D10 — `SYSTEM_PROMPT`
   is 18,824 tokens, 57% larger than the whole 12,000 "hard max", so one number was never possible. But
   **180,000 is the wrong number in practice**: no image-free request came near 35,000, so the gate is an
   image gate wearing a context-window label, and it is measured in the wrong unit (V62-D2). It is also not
   model-specific while `ai_providers.model` is free-form.
2. **Whole-request gate inventory.** SAFE DEGRADATION: per-collection `.limit()` caps, the history window, the
   named-lookup cap, the pack trim. DETERMINISTIC REFUSAL: auth, missing command, pack 413, model-reply JSON
   parse failure, provider/stream error, output `max_tokens` truncation. **UNSAFE HARD STOP: the image branch
   of the model-context 413 (V62-D2).** UNMEASURED and honestly named by the candidate: per-request wall-clock
   timeout, SSE stream initialisation. **UNMEASURED and NOT named — the fifth place:** model-specific context
   limits, serialized request-body size against the provider's HTTP limit, and image *token* accounting. All
   three are named in the founder's own §2 list.
3. **Is `MINIMUM_SAFE_CONTEXT` actually the promoted set?** Partly. `currentTurn`, `pendingAction`,
   `namedTargets`, `continuity`, `counts`, `collections`, `activeChannelId`, `recentlyResolvedEntities`,
   `recentlyDeletedEntities` are members and are byte-stable. Identity, organization scope, permissions and the
   safety/truth contract are **not** members — they are siblings of `contextPack` in the payload
   (`{profile, command, contextPack}` and `SYSTEM_PROMPT`), safe by construction rather than by assertion.
   Execution evidence is produced after the pack, so it is out of reach too. The byte assertion is not vacuous
   but is unreachable given the current `TRIM_ORDER` (the disjointness loop throws first, and assignment is by
   key so aliasing cannot propagate) — legitimate defence-in-depth against a future non-`TRIM_ORDER` edit,
   which is what killing the mutant showed. V61-D4 stands as filed.
4. **NOT INCLUDED ≠ DOES NOT EXIST.** Holds for every collection with a real count. Fails for `memories` and
   `factoryWorkOrders` (V62-D4), and the pack's own note overclaims for fifteen collections (V62-D3).
5. **Estimator accuracy and headroom, my fixtures.** Reported vs shipped: **+1 token** in every case. Headroom
   below the hard cap: 730–1,569 tokens (6.1%–13.1%) across empty/short/50/100/200-turn channels, many
   companies, many archived companies, many archived tasks, 80/120/200/400-character names, and long free
   text. The margin is structural (`packBudget = hardMax − 600`), so it is real — but the committed headroom
   table cannot fail, because the trim drives every case to `≤ packBudget` by construction and the suite never
   varies the command length, which is the one lever that actually breaks the budget.
6. **v59 hardening, on these bytes.** D1 (bring-back lexicon) and D2 (imperative frames) re-derived
   behaviourally: 20/20 imperatives and 10/10 polite frames carry intent with the model silent. D4 (receipt
   entity) present and exercised. D3 (Cyrillic alternatives) present but incomplete — V62-D7 is its residual.
7. **The pinned witness, both halves.** Pre-fix genuinely exceeds the cap on **my** fixtures (21,965–62,728 vs
   12,000), so the failing half is not a too-small-fixture artefact. Post-fix fits with a real margin. The
   three live v93 successes ("no company by that name", archive by name, fresh-channel restore of a company
   outside the window) are covered by `company_lifecycle_matrix` (31/0) and are the mutants that die when
   server-side resolution is reverted. **The post-fix half is still weaker than it reads**: it asserts
   `estimate <= budget`, which is guaranteed whenever trimming succeeds, and it never checks that the witness
   pack can still *answer* — the witness question is about a project, and projects trim 20 → 8 with no
   targeted lookup behind them.

### Coverage that does not exist in this report

No live request was made. **deno check, live database queries, live UI and live AI chat were all BLOCKED**
(`npx` and the Supabase CLI are gated in this session type and no browser tool is available). Every conclusion
above is source-level and harness-level, executed against the real bytes; none of it substitutes for the
post-deploy live acceptance gate that `CLAUDE.md` §6 now makes mandatory — which is the gate that caught the
2026-09-08 incident in the first place. The v92 belt comparison on my own corpus could not be run: the
prose-era v92 window is structurally incompatible with the extraction, so the v92 deltas above are derived
structurally and from the committed `v92_parity_contract` (46/0) and `v92_open_regression_contract` (28/0).

### Artifacts

`qa/verification/proposed/v62_regression_additions.mjs` (16 CONTRACT rows pass, 9 DEFECT rows reproduce, exits
1), `v62_PROMOTION_NOTE.md`, working laboratories under `qa/verification/scratch/v62/`. Branch
`verify-c30a0cc-campaign122`. `index.ts` sha256 unchanged at
`0af353b5267fafa6d4ed3b80c61d9a62838cbf3d43c0f3746eeed8d8b465648f`.
