## 136. The context budget can still hard-stop an ordinary turn, and the imperative tier reads statements as commands in both languages — FOUND (2026-09-08), NOT FIXED

**Found by** independent verifier #61 (campaign #121) on candidate `4f44544ede88aaeb974d92089a79c1793442d54a`
/ index.ts sha256 `3d1baeaae994fdd767ada797a20476556458731047f6e5061bec057f72ca6d01`, which returned FAIL and
NOT DEPLOYMENT READY under the contract bar. Artifacts on `verify-4f44544-campaign121`. Every number below
was produced by executing the REAL sliced source out of `index.ts` — the budget block between
`const packBudget =` and `contextBudget.overBudget =`, the intent block between `const MUTATION_ARRAY_FIELDS`
and `void lexiconReadVetoed;`, and the structured-claim/receipt window — against fixtures built from the real
`.limit()` caps in that same file. No fixture was reused from the candidate's own suites. Regression suite:
`qa/verification/proposed/v61_regression_additions.mjs` (14 CONTRACT green, 8 DEFECT red by design).

**V61-D1 (P1) — `conversationHistory` has a floor of ONE and that row is unbounded free text, so one
accepted turn permanently hard-stops the channel.** `TRIM_ORDER` carries `['conversationHistory', 4, true]`
and both hard passes force `Math.max(1, floor)`. Every other optional collection can reach 0; conversation
history cannot. The surviving row carries the raw prior `work_orders.command` and the raw prior
`result.summary`, persisted verbatim with no truncation anywhere on the write path and bounded only by the
provider cap `max_tokens: 8192`. Measured on an all-caps workspace: turn N with a 21,000-character brief is
ACCEPTED at 11,327 tokens; at turn N+1 the command `hi` ships at **14,602** tokens against `hardMax` 12,000
and returns 413 — with every other array already at 0 rows and `contextBudget.overBudget === true`. The same
turn 413s for `what companies do I have?` (14,614) and `archive company Alpha` (14,612). Threshold by
bisection: the newest history row hard-stops the turn once `command + summary` reaches 44,593 characters.
This is `OPERATING_TRUTH_MODEL.md` §4.4's forbidden shape — `VALID FOUNDER TURN → HARD STOP because the pack
grew` — and conversation history is §2 tier-4 narrative, i.e. precisely the optional context that is required
to degrade. Gate classification: **UNSAFE HARD STOP**. The candidate's own headroom fixtures
(`request_gate_inventory_contract.mjs`) vary the NUMBER of turns (50/100/200) but cap a "long" history row at
about 70 characters, so the margin they report holds only because the fixture is unrealistically small in the
one dimension that breaks it.

**V61-D2 (P1) — the one §4.4 minimum-safe member that is not in `MINIMUM_SAFE_CONTEXT` is "the targets of
this turn", and the floor-0 pass removes them.** Source set:
`['currentTurn','continuity','counts','collections','pendingAction','recentlyResolvedEntities','recentlyDeletedEntities','activeChannelId']`.
The named-this-turn rows live inside `companies`/`people`/`tasks`/`goals`, all four of which are `TRIM_ORDER`
keys, and the second hard pass uses floor **0** (`arr.slice(0, 0)`). The V60-D2 head-first merge protects the
named row against the floor-4/5/8/10 and floor-2 passes only. Measured: with one heavy newest history row
(a 20,000-character prior command and a 20,000-character prior answer, both inside what the product accepts
and produces) and 400-character free text elsewhere, `companies` and `people` reach 0 rows, the named
`QA-VERIFY-NAMED-CO` and `QA-VERIFY-NAMED-PERSON` are gone, and **the turn still ships** at 10,868 tokens —
so the founder gets an answer built on a pack in which the company they just named is absent. Company and
task/goal archive/restore survive this (`resolveCompanyLifecycleTargets` re-reads by name across every
status; task/goal ids are re-read server-side by the V58-D2 closure). Everything that needs an id the MODEL
must read out of the pack does not: rename/retitle, assign/reassign, set manager, create-under-parent, field
updates, and every read answer about the named entity. §4.4 lists this member precisely because "trimming it
invents or loses a target".

**V61-D6 (P1) — every ordinary Mongolian read or statement is classified as a mutation request and its
truthful answer is destroyed.** `MUTATION_VERB_ALWAYS` group 4 matches Mongolian stems ANYWHERE, with no
imperative-position rule (deliberately: the source comment notes Mongolian is verb-final), and the stems are
`\S*`-suffixed so they also match derived NOUNS and PARTICIPLES — `нэмэлт` (additional), `болгон` (every),
`өөрчлөлт` (change, noun), `оноо` (score), `нэрийг` ("the name", accusative — never a verb),
`архивласан` (archived, attributive), and the exact-match stem `хаа`, which is also the ordinary word in
`хаа сайгүй` (everywhere). Every veto path — `READ_SHAPE`, `POLITE_REQUEST`, `COMPOSITION_REQUEST`,
`PHRASAL_READ`, `MUTATION_IMPERATIVE_HEAD`, `NEGATED_IMPERATIVE_HEAD` — is ASCII/English-only, and Mongolian
questions are commonly written with `уу/вэ/бэ` and no `?`, so there is no veto at all. Measured on 22
ordinary Mongolian read/statement turns: **22/22** asserted mutation intent and **22/22** had the truthful
answer replaced by `No change was made — that request did not resolve to an operation I can execute from
chat.` Every Mongolian case in the promoted v56/v57/v59 suites is a POSITIVE (a real Mongolian mutation
command); Mongolian read/statement negatives have never been measured. Deployed v92 answers all 22 correctly,
so this is a truth regression against production, not an intended departure. `CLAUDE.md` §5 requires EN/MN
coverage.

**V61-D7 (P1) — an English statement or noun phrase whose first word happens to be one of the 120
allow-listed verbs is read as a command.** `MUTATION_IMPERATIVE_HEAD` requires only `^verb\b\s+\S`; it never
tests that the head word is a VERB rather than the head NOUN of a noun phrase, and there is no
finite-main-verb or subject test. Measured: **29 of 30** ordinary business sentences asserted mutation intent
and had their truthful answer destroyed — `Fire drill is at 3pm`, `Mark from finance called about the
invoice`, `Change management is the hard part`, `Delete key on my keyboard is broken`, `Merge conflicts are
blocking the build`, `Set of KPIs we agreed last quarter still applies`, `Send rates are the same as last
month`, `Order confirmation arrived this morning`, `Share price fell after the announcement`, and twenty
more. This is the third defect of the class the V60-D4 imperative tier introduced (the first two —
"the store will reopen Monday" and "do not archive Alpha" — were caught before commit).

**V61-D3 (P2) — the pack carries two different "shown" numbers for the same collection.** `counts` is built
before the trim and is in `MINIMUM_SAFE_CONTEXT`, so a trim never updates it. Measured after a floor-2 trim:
`counts.tasksShown = 15` against `collections.tasks.shown = 2`; same for `channelsShown` (15 vs 2),
`departmentsShown` (30 vs 2), `documentsShown` (30 vs 2), `approvalsShown` (20 vs 2). The `*Total` fields stay
correct, so no total is fabricated — but which of the two "shown" numbers the model uses is not decidable from
source, and `OPERATING_TRUTH_MODEL.md` §5 lists "a collection reported as complete while `truncated` is true"
as a FAIL. The system prompt's trim-honesty paragraph binds counts to `context.collections` and never mentions
`context.counts`.

**V61-D8 (P2) — four `postconditionPassed` reads fail OPEN.** The company archive/restore loops use
`r.postconditionPassed === true` and refuse otherwise. The task and goal archive/restore loops use
`r.postconditionPassed !== false`, so a missing or `null` field records a VERIFIED envelope. The deployed
`archive_task`/`restore_task`/`archive_goal`/`restore_goal` RPCs are `security definer` and do return a real
boolean from a fresh re-read, so this is not exploitable against the current schema — but it is the opposite
of the "a branch that cannot establish it says false" rule the V60-D7 closure states in its own comment, and
the mutant that flips `rpcPostcondition` from `=== true` to `!== false` **survives the entire committed
battery** (measured, verifier #61 mutation proof).

**V61-D9 (P2) — two plan branches report `postconditionPassed` from the write's own return value.**
`reassign_person` sets it from "the RPC returned an assignment id"; `assign_task` sets it from
`.update({owner_person_id}).select('id')` returning a row. Both prove a row was touched; neither re-reads the
field that was supposed to change. §4.1 defines the postcondition as "state observed after executing (fresh
re-read)". A one-line fix (`.select('id, owner_person_id')` plus a comparison) closes `assign_task`.

**V61-D10 (P2, gate inventory) — the preflight measures 2.9× to 26× less than the request actually sent, and
an unnamed fifth whole-request gate exists.** `estimateTokens({ command, contextPack })` measures a COMPACT
serialization of the pack. What is sent is `SYSTEM_PROMPT` plus
`JSON.stringify({profile, command, contextPack}, null, 2)` — pretty-printed with two-space indent — plus, if
present, a base64 image. Measured: `SYSTEM_PROMPT` alone is 76,152 characters (~19,038 tokens at chars/4),
i.e. larger than the entire 12,000-token cap; the all-caps workspace preflights at 11,158 and actually sends
~34,414 (3.08×); an empty channel preflights at 771 and sends ~20,270 (26.3×). The candidate's inventory names
"system-prompt size drift (a constant template; no test pins its token cost)" as UNMEASURED, which
understates it — this is not drift, it is a permanent ~61% of the real request outside the budget. And
`imageBase64` is accepted with NO size limit (index.ts ~2785), never enters `estimateTokens`, and rides
straight into the provider request as a data URL: **that is the fifth whole-request gate, and it is not in
the inventory at all.** Classification: UNMEASURED, potentially UNSAFE HARD STOP; it cannot be settled without
a live request.

**V61-D11 (P2, residual) — the named-entity lookups are ASCII-only.** `commandNameTokens` extracts
`/[A-Za-z][A-Za-z0-9'&.-]{3,}/g`, so a Cyrillic-named company, person, task or goal named directly in the
command is never merged into the pack. Archive/restore still resolve server-side (`normaliseName` is
`\p{L}`-aware), but reads and every other mutation about a Cyrillic-named entity outside the capped window
have no data at all. Same defect class as the 2026-08-30 "test4" incident, in the other language.

**V61-D4 (P3) — the minimum-safe-context assertion is unreachable.** The guard at the top of the block throws
if `TRIM_ORDER` names a `MINIMUM_SAFE_CONTEXT` key; both are literal arrays in the same scope and the loops
write no other key, so the later byte-comparison assertion can only fire on object aliasing that does not
exist in the pack literal. §4.4 says "the trim order is asserted against it, and a trim that touched it
throws" — the code is real, the assertion is dead. Defence-in-depth, not evidence.

**V61-D5 (UNMEASURED, latent) — `continuity.compactionCheckpoint.summary` is untrimmable unbounded
narrative.** `continuity` is in `MINIMUM_SAFE_CONTEXT`; it carries `chat_channel_state.compacted_summary`
(`text`, no length constraint). Measured: 20,000 characters ships at 11,198; **60,000 characters → 15,929 →
413** with everything else already at 0. A stored summary is §2 tier-4 narrative, not a §4.4 minimum-safe
member. Currently latent — the only writer of `set_chat_channel_compaction` in this repository is
`qa/dbtest/acceptance.mjs`. Named so it is not assumed safe.

**V61-S1 (P2, suite integrity) — the promoted V60-D8 probe writes a TRACKED file on every run.**
`v60_budget_intent_and_plan_evidence_contract.mjs` writes
`qa/verification/scratch/p1/mutants/V60-D8-probe.ts`, which is committed. During this campaign's mutation
proof the probe captured a MUTATED `index.ts` into that tracked file and left the working tree dirty; a
verifier relying on `git status` for provenance would be reading a suite's side effect. The rewrite itself is
a net STRENGTHENING — it now asserts the property (a new pack array with no envelope must fail the committed
suite) rather than the previous suite's own regex, and it genuinely detects the mutant with the right message
("no envelope for pack collection salaryBands"), independently confirmed here by mutant M5. It should write
to a temp directory, or to a path that is `.gitignore`d.

**What the candidate got right, verified independently on these exact bytes.** 0 identifiers removed versus
v92 (re-derived; 397 added). `_shared/*` is not imported — the deploy surface is exactly `index.ts`, which is
CRLF-pure (6,674 CRLF pairs, 0 bare LF). 80 fabricated completions on mutation-intent requests across
claims-null / claims-empty / state-only-claims / trailing-question-plus-armed-pendingAction: 0 shipped. 65
read requests (including every composition and phrasal-read shape): 0 rewritten. 22 verified envelopes render
the truthful claim; 22 unverified postconditions support nothing. V60-D3 is genuinely closed — a model-declared
`read`/`other` cannot veto a lexicon hit on any of 12 probes, and the model can still ADD intent. V60-D2's
head-first merge holds through the floor-2 pass. The loop estimator and the serve() preflight are the same
object shape, read out of the source at both call sites, and diverge by 0 or 1 token across twelve workspace
shapes; the margin is structural (`packBudget = hardMax − 600`) with a minimum measured headroom of 753
tokens and is NOT tuned to 11,999. Every trimmed collection keeps its exact `total` and a correct `truncated`
flag; history trims oldest-first and keeps the newest turn; a fitting pack is not touched at all. The pinned
live-incident witness is sound on BOTH halves — the pre-fix pack genuinely exceeds the cap (25,595 > 12,000,
so it is not a fixture too small to have ever failed) and the post-fix pack genuinely answers (11,237 ≤
11,400) while keeping its minimum safe context. The V58-D2 closure holds: task lifecycle ids are re-read
server-side across every status. Battery: 60 of 62 suites exit 0 (the two reds are the standing
infrastructure findings — a repository-level `SUPABASE_ACCESS_TOKEN` Actions secret and the factory
production-write inventory — neither reads `index.ts`). 12 of 14 vacuity mutants killed, `index.ts` restored
byte-identically after every one.

**Status:** NOT FIXED. V61-D1, V61-D2, V61-D6 and V61-D7 are deploy blockers under the contract bar.
`deno check` and any live request were BLOCKED in this campaign (no approval for a network install, no
credentials for `supabase functions list`), so every conclusion here is source-level and window-execution
level; the two permanent rules added to `CLAUDE.md` this round mean none of it substitutes for live
request-shape acceptance.
