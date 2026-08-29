# Acceptance Tests

Status against the 18 required tests in CLAUDE.md §15, as of 2026-08-27. `✅` = actually
verified this session or a prior one with real evidence. `⬜` = not yet tested. `➖` = not
applicable to this product's current scope (noted why).

1. Unauthenticated visitor redirects to login. ✅ — verified live against real production
   (2026-08-27), not just the middleware source: `curl` with no session cookie against
   `brain.open-spot.ai/dashboard`, `/approvals`, `/finance`, `/tasks` all returned a real
   `307` redirect to `/login`; `/login` itself returned `200` (not redirect-looped).
2. Founder command mentions a real company/device/employee; correct entities resolve
   without invented IDs. ✅ — confirmed repeatedly across tonight's chat tests (e.g. the
   onboarding-plan generation correctly referenced real tasks/goals/teammates by name).
3. Goal + work order created; atomic tasks + acceptance criteria persisted. ✅ — verified
   via the same live RPC read done for #15 (`pg_get_functiondef` on the deployed
   `sem_execute_ai_command`): the work_order row, every task (with
   `acceptance_criteria`/`test_method` populated from the model's output), and any goal
   the model requests all insert inside one plpgsql function body, so they commit or
   roll back together — genuinely atomic, not just sequential inserts that happen to
   usually succeed. One real caveat found while verifying this: a task's link to its
   goal is a free-text `parent_goal` column (copied from `result.strategicGoal`), not a
   foreign key to `goals.id` — tasks and goals created by the same command share a
   label, not a real relational link. Worth knowing if a future feature needs to query
   "tasks under goal X" reliably.
4. An employee sees only assigned work. ✅ **CORRECTION of an earlier entry in this same
   file** (2026-08-27): originally marked "false by design, not a bug" after finding a
   plain employee saw all 30 of a company's tasks. That was wrong — it was a real,
   reproduced bug, not a design choice, discovered while reproducing a separate issue
   (`qa/KNOWN_FAILURE_MODES.md` #11). Root cause: `tasks_select_scope` was supposed to
   be narrowed to founder/company-manager/task-creator/task-owner by migration
   `202608230001` (its own comment literally says "tasks_select_scope let any company
   member see every task," describing this exact bug as something already fixed) — that
   narrowing never took effect live, the same GitHub↔production drift class as #8/#11.
   **Fixed and re-verified live**: migration `202608270004` re-applied the narrowed
   policy; the same plain-employee test account (not a creator or owner of any of CLIX
   GPS's tasks) now sees 0 tasks there (real total: 7), down from seeing the full
   company total before the fix. One caveat carried over from the original
   investigation, still real: the "owner" branch of this policy
   (`pe.profile_id = current_profile_id()`) is still effectively unreachable — 0 of the
   6 real tasks with `owner_person_id` set have a `profile_id` link on that `people`
   row — so today this policy's real behavior is "founder, company manager, or whoever
   created the task," not yet "or whoever it's assigned to." Not a security issue
   (narrower than intended, not broader), but worth knowing before relying on assignee-
   based visibility.
5. Low-risk task executes without founder interruption; high-risk/external action
   waits for approval. ✅ (partially) — confirmed high-risk channel deletion always
   creates a forced approval record regardless of outcome; low-risk task creation
   confirmed not blocked.
6. Unauthorized manager cannot approve finance/salary/legal. ✅ **Found broken, fixed,
   and re-verified live in production** (2026-08-27). Originally found via real
   impersonation: a test company-manager account (not founder/hr_finance) successfully
   approved finance, salary_hr, AND legal domain approvals — root cause was
   GitHub↔production drift (migration ledger said the domain-gated policy from
   `202608230001` was applied; the live policy didn't match it). Fix migration
   `202608270001_restore_approvals_domain_gating.sql` was pushed to production with the
   founder's explicit authorization, then re-verified with a fresh live impersonation
   test (new temp manager account, new temp approvals, one per domain): `finance`/
   `salary_hr`/`legal` all correctly stayed `pending`, `production` correctly became
   `approved`. See KNOWN_FAILURE_MODES.md #8 for full before/after evidence.
7. Authorized approver approves an immutable payload; correct work-order step resumes
   exactly once. ✅ **FIXED and VERIFIED LIVE, 2026-08-28**
   (`supabase/migrations/202608270005_approval_decision_resumes_work.sql` — the
   `decide_approval()` SECURITY DEFINER RPC). Re-checks the same domain-gated approver
   authority as `approvals_update_approver` RLS, only transitions a still-`pending`
   approval (idempotent by construction — deciding twice is a safe no-op), resumes a
   linked task (`needs_approval` → `queued`/`rejected`), and executes a deferred
   deletion captured in `approval_payload.execute` (built server-side in
   `sem-ai-command/index.ts` from `pendingDeleteTaskIds`/`pendingDeleteChannelIds`,
   cross-checked against real context ids, never trusted from the model's own JSON —
   see KNOWN_FAILURE_MODES.md #16 for the deployment story, which was not the clean
   authorized-push path this session otherwise used). `web/lib/data/approvals.ts`'s
   `decideApproval()` now calls this RPC instead of a bare status update. Confirmed live
   directly against production: `pg_get_functiondef` matches the reviewed migration
   byte-for-byte, and a rolled-back live transaction test (deletion targets deleted
   exactly, control task untouched, idempotent re-run) passed —
   `qa/scenarios-runner/sc059b_live_decide_approval.sql`. The payload-immutability half
   (below) is still real and separately tracked as SC-060/KNOWN_FAILURE_MODES.md #15 —
   `approval_payload` still has no write-protection after creation; only decide_approval
   reading `.execute` from it exists now, not a guarantee nothing else can rewrite it
   first.
   **Original bug, now fixed:** the founder asked to "approve the 68-task deletion" for
   a real pending approval whose `approval_payload` had no task IDs at all (`task_id`
   was also `null`) — the model had recorded *that* deletion was needed but never
   *which* tasks, so there was nothing an approval-driven executor could have acted on
   even if one had existed. Clicking Approve would have flipped the status and deleted
   nothing. At the time this was resolved by executing the actual intent directly (the
   real per-column "Clear all" UI action); going forward, the fix above is the real
   mechanism.
8. QA verifies acceptance criteria; failed QA reopens/escalates. ➖ no formal QA-agent
   step exists in the current pipeline yet — task/approval creation is the closest
   equivalent.
9. Successful work updates outcome/memory; founder receives only the requested
   exception/final result. ✅ (partially) — memory RAG pipeline confirmed working in an
   earlier session (financial report summary retrievable via chat).
10. All transitions appear in the audit timeline. ❌ **FAILED for manual UI actions,
    confirmed by code search** (2026-08-27): `grep`ing every file under `web/lib/data/`
    for `audit_logs` found exactly one match (`chat-history.ts`, and that's a *read*, not
    a write). No write to `audit_logs` exists anywhere outside the AI-command path
    (`sem_execute_ai_command`, which does log `ai_command_executed`/
    `ai_command_json_parse_failed`/`ai_command_request_completed`). Concretely: approving
    or rejecting an approval through the Approvals page (`web/lib/data/approvals.ts`,
    the `.update({status: decision, decided_at: ...})` call) creates **zero** audit
    trail — same for manual task status changes, KPI/salary edits, document uploads, and
    proposal edits done through their respective forms. Only actions routed through AI
    chat are auditable today. Real gap, not a leak — worth the founder knowing before
    relying on the audit timeline as a complete record of who-did-what.
11. Employee cannot read ownership/cash/salaries/margins/founder memory. ✅ — extensively
    verified this session and the prior one (see SECURITY_MATRIX.md).
12. Cross-company access returns zero rows. ✅ — tested live: a test account with
    `manager` role at CLIX GPS correctly saw 0 rows for `financial_reports`/`proposals`
    belonging to a different company, while correctly retaining full access to its own
    company's data (1/1 and company-scoped data respectively).
13. Duplicate submissions do not duplicate work. ✅ (found broken, now fixed) — see
    KNOWN_FAILURE_MODES.md #5.
14. Missing AI credentials cannot silently create real production work. ⚠️ **Verified
    against the actual deployed source (2026-08-27) — partially true, not fully.** When
    no provider key is available, `sem-ai-command` calls `fallbackPlan()` (index.ts:566),
    a deterministic rule-based planner that DOES create real tasks/approvals through the
    exact same transactional persistence path (`sem_execute_ai_command`) as a genuine LLM
    response — it is not blocked or refused. It is not fully silent, though: the reply
    sent to the user always includes `summary: 'Fallback planner created tasks because AI
    provider is not configured or failed.'`, so a human reading the chat reply is told no
    real AI was involved. Whether "creates real work with a disclosure message" satisfies
    the founder's intent behind this acceptance criterion, or whether missing credentials
    should instead hard-block, is a product decision — flagging for the founder rather
    than unilaterally judging pass/fail. Currently low real-world risk since production
    has a working key today (this path isn't firing), but it would activate silently the
    moment the key is deleted/expires with no other alarm.
15. Out-of-schema model output rejected without partial persistence. ✅ — verified against
    the actual live RPC definition (`pg_get_functiondef` on the deployed
    `sem_execute_ai_command`, not the migration file). All task/approval/company/person/
    project/goal/relationship/assignment/memory inserts for one command happen inside a
    single plpgsql function body with no internal savepoints, so any single bad value
    (confirmed concretely: `tasks.title` is `not null` in the schema and the RPC passes
    the model's `title` through with no fallback/default — a task missing a title raises
    a real constraint violation) aborts and rolls back the entire function invocation.
    The TypeScript caller's `if(rpcError)` branch (index.ts:1060) then marks the pending
    work_order 'failed' and sends an `error` event — confirmed this is the same pattern
    already used for the malformed-JSON case, not new/untested code.
16. Strategic Control Map shows only authorized data. ✅ (mapped to the closest real
    page) — no page named "Strategic Control Map" exists; `web/app/(app)/mindmap/page.tsx`
    ("Operating Mindmap") is the actual equivalent. Read in full: `buildGraph()` uses
    `createClient()` (the caller's own cookie-based, RLS-scoped Supabase client, not a
    service-role client) for every query, and selects only fields already established
    elsewhere this session as non-sensitive (id/name/status/risk_score — no unit_cost,
    salary, or revenue columns). Authorization here rides entirely on the same RLS
    policies already verified live in SECURITY_MATRIX.md, not a separate/parallel check
    that could drift out of sync — no additional live test needed beyond confirming the
    query shape, which was done here.
17. Mobile login/command/task/approval works; EN/MN navigation works. ⚠️ **Tested live
    against real production at ~500px viewport width (2026-08-27) — mixed result, one
    real bug found.** The main app sidebar's mobile drawer works correctly (hamburger
    opens a proper slide-in overlay, dashboard content reflows into a readable 2-column
    layout, cards truncate cleanly). EN/MN toggle works and translates most nav labels
    (confirmed: "AI FIRST"→"АЙ ЭХЭНД", "Speak with Brain OS"→"Brain OS-той ярих", etc.)
    — minor, lower-priority gap: some section headers ("GOALS", "Board") stay in
    English while sibling sections translate. **Real bug: the `/chat` page (the core
    "Speak with Brain OS" interaction) is unusable on first load at mobile width** — the
    message composer collapses to ~30px wide (placeholder text renders one character per
    line, confirmed via zoomed screenshot) because `chat-client.tsx:440`'s
    `<div className="flex flex-1 gap-4 ...">` places the channel-thread sidebar
    (`ChannelSidebar`) and the chat column side-by-side with no responsive
    stacking/hiding breakpoint — unlike the main app sidebar, which does have one. A
    manual collapse toggle on the channel sidebar exists and fixes it once found (verified:
    collapsing it restores a normal, fully usable composer), but nothing collapses it
    automatically for a narrow viewport, so a first-time mobile user hits the broken
    composer by default. Did not test login itself (already-authenticated session was
    reused) or task/approval actions at mobile width — flagged as remaining.
18. Vercel production passes build/lint/unit/RLS/critical browser tests. ✅ (partially)
    — build+lint clean as of the last web/ app code change; no dedicated unit test
    suite exists in this repo yet (flagged as a gap, not silently assumed passing).

## Honest summary

All 18 now have real evidence behind them (up from 7 at the start of this pass). 13
passing (#1, #2, #3, #4, #5, #6, #9, #11, #12, #13, #15, #16, #18 — several partial), 2
confirmed failing with root cause identified (#7 not implemented, #10 no audit trail for
manual UI actions), 1 flagged as a product-intent question rather than pass/fail (#14),
1 mixed pass/fail with a concrete bug found (#17 — mobile nav/EN-MN mostly works,
`/chat` composer broken by default), 1 not applicable (#8). **Two of the 18 moved from
failing to passing within this sweep, both real production bugs, both fixed and
re-verified live with the founder's explicit authorization to push:** #6
(`approvals_update_approver` domain gating) and #4 (`tasks_select_scope` — note #4 was
*first marked passing-by-design in this same file*, then corrected to failing, then
fixed and re-verified, all within this one sweep — see its entry above for why, and
treat any "X is fine by design" conclusion in this project with appropriate suspicion
until it's actually been tried to fail). Every "passing" mark above is backed by either
a live production test (curl against real `brain.open-spot.ai`, real RLS impersonation,
or a real browser session) or a read of the actual deployed source
(`pg_get_functiondef`/`pg_get_expr` against the live database, not the migration file)
— none are assumed from intent alone.

## PR A — Chat pagination/scroll/history correctness (Workstream 6a-6d, 2026-08-29)

Root cause and DB-observable half (ordering + channel-scoping) are fixed and
live-verified — see `qa/scenarios-runner/chat_history_ordering.sql` and its
`qa/REGRESSION_CATALOG.md` entry (`all_pass: true`, live, fixtures rolled back). The
chat/UI-level regressions below have no environment with a live browser available in this
implementation session (`web/CLAUDE.md`: "No live browser in a Claude Code session here"
— `npm run build`/`npx tsc --noEmit`/`npx eslint` are clean, confirmed) — each is `⬜`
until actually walked through against a real deployed `/chat` page, by a human or a
browser-automation agent (e.g. `mcp__claude-in-chrome__*`). Steps below are written to be
followed literally, one channel/message at a time, so no interpretation is needed.

1. **CHAT_HISTORY_FULL_HISTORY_PAGEABLE** ⬜
   - Open a chat channel with more than 30 turns (or send enough test messages to exceed
     30 in a scratch channel — each send is one turn).
   - Confirm a "Load older messages" control appears above the message list.
   - Click it once. Confirm older turns appear prepended above the previously-oldest
     visible message, in correct chronological order (oldest of the newly-loaded batch at
     the very top), and no message flashes/disappears.
   - Keep clicking until the control disappears. Confirm the very first turn ever sent in
     that channel is now visible at the top — full history is reachable, not capped at 30.
2. **CHAT_HISTORY_PAGINATION_MERGES** ⬜
   - In the same long channel, after loading one "older" page, send a brand-new message.
   - Confirm the new message appears once at the bottom (not duplicated), and every
     previously-loaded older message is still present (not silently dropped by the new
     send) — this is the merge-by-`workOrderId`/dedupe behavior, not a replace.
   - Optional stronger check: open browser devtools → Application → Session Storage, and
     confirm no `brainos.chat.*` key was ever wiped by this sequence.
3. **CHAT_HISTORY_STALE_REQUEST_CANNOT_TRUNCATE** ⬜
   - Send a message, then immediately navigate away (e.g. click "Tasks" in the nav) before
     it finishes generating, then navigate back to the same chat channel within a few
     seconds (while the reconnect poll would still be running).
   - Confirm the in-flight message is still shown (as "thinking…" or its final result, not
     missing), and confirm no other, already-loaded message in that channel vanished
     during the several seconds the poll was ticking.
   - Repeat once sending two messages back-to-back in different channels to confirm one
     channel's poll never truncates a different channel's just-sent message.
4. **CHAT_HISTORY_UI_LIMIT_SEPARATE_FROM_AI_CONTEXT** ⬜ (code-reading check, no browser
   needed — confirms the two mechanisms never got accidentally unified)
   - Read `web/lib/data/chat-history.ts`'s `getChatHistory` default `limit = 30` and
     `supabase/functions/sem-ai-command/index.ts`'s `conversationHistoryQuery` `.limit(8)`.
   - Confirm these remain two independent numbers in two independent files/queries — the
     UI history page size must never be read from or written to influence the AI's
     short-term-continuity window, and vice versa.
5. **CHAT_SCROLL_RESTORES_PER_CHANNEL** ⬜
   - Open a long channel, scroll up to roughly the middle of the history (not the very
     bottom), wait ~1 second (past the debounce window) for the position to persist.
   - Navigate to a different page (e.g. "Approvals"), then back to `/chat` on the same
     channel. Confirm the view restores to approximately the same scrolled position, not
     jumped back to the bottom or the top.
   - Switch to a *different* chat channel, scroll it to a different position, then switch
     back to the first channel. Confirm each channel independently restores its own last
     scroll position (not the other channel's).
6. **CHAT_SCROLL_STATE_SESSION_SCOPED** ⬜
   - Repeat step 5's scroll-and-navigate-away/back check, then close the browser tab
     entirely and open a genuinely new tab (new session) to the same chat channel.
     Confirm the view does NOT restore the previous tab's scroll position (falls back to
     the bottom, the default for a fresh session) — scroll position is `sessionStorage`,
     same as `ACTIVE_CHANNEL_KEY`, not `localStorage`.
   - Separately confirm a genuinely new send still scrolls to the bottom even if the
     reader had scrolled up to read older history first (send a message after scrolling
     up in step 5 above; confirm the view jumps to the bottom to show it).
7. **CHAT_HISTORY_NEWEST_SURVIVES_NAVIGATION — UI-wiring half** ⬜ (the ordering-query half
   is already SQL-verified live; this confirms the real page actually calls the fixed
   query end-to-end)
   - In a channel with more than 30 turns, send one more new message so the total newest
     turn is fresh. Navigate away and back (or hard-reload). Confirm the newest message
     (the one you just sent) is visible at the bottom — not silently missing because an
     old ascending-order bug re-truncated it to the oldest 30 again.

Every ⬜ above should flip to ✅/❌ with a real timestamp and evidence (screenshot or
console/network trace) the first time this page is actually exercised in a browser —
per CLAUDE.md §2, a passing `npm run build` is not itself proof any of this works.

## Manual regression checklist — conversation state machine + entity resolution + response formatting

Added 2026-08-29 alongside PR B (branch `pr-b-conversation-state-and-response-formatting`,
`supabase/functions/sem-ai-command/index.ts` only — generalizes `pendingConfirmation`
into `pendingAction` with 4 kinds (`bulk_confirmation`/`single_entity_clarification`/
`disambiguation`/`open_question`), adds `context.recentlyResolvedEntities`, expands
entity-name-matching guidance, and fixes the factory-work-order response-duplication +
internal-detail-leak bug). Direct source: the master plan's Workstream 3/4/5 and its
"Required real end-to-end chat test" scenarios A-C.

**⬜ NOT YET RUN against a live deployment** — this Edge Function change has not been
deployed (deploying `supabase/functions/**` is a founder-authorization-gated action per
`.githooks/pre-push`; this implementation session stopped at a committed branch, per
instruction). Each entry below is the exact live-chat script the `brain-os-verifier` (or
the founder) should run through the real `/chat` UI once deployed — a script to execute,
not a simulated/self-certified result. Use a disposable test company/employee (e.g.
`QA-CONTINUITY-*`, matching the master plan's own fixture naming) so a failed run is easy
to spot and clean up.

`pendingAction` is never founder-visible directly in the chat bubble — its presence and
resolution are checked here via the real, persisted `work_orders.output` row (readable
via `getChatHistory`/a direct `work_orders` query), not via the model's own prose. A
`model` value of `deterministic-confirmation`/`deterministic-clarification`/
`deterministic-disambiguation` in that row is the real, checkable evidence that a turn
resolved without an LLM call at all — the strongest possible evidence for
CHAT_PENDING_ACTION_SURVIVES_CLARIFICATION-class scenarios, since it proves the
resolution isn't just the LLM "getting lucky" from conversationHistory.

### CHAT_PENDING_ACTION_SURVIVES_CLARIFICATION

1. Turn 1: `Delete that employee.` (deliberately vague — no employee named, no prior
   context in this channel). Expect: Brain OS asks a clarifying question in `summary`,
   and the persisted `work_orders.output.pendingAction` is non-null — one of
   `single_entity_clarification`/`disambiguation`/`open_question` depending on how many
   real candidates exist in context. Never null while `summary` ends in a question mark
   (the system prompt's own `open_question` requirement is itself part of what this
   scenario is checking).
2. Turn 2 (same channel): reply with something that is NOT a bare "yes" — e.g. `Yes,
   that one, go ahead and delete them.` PASS: Brain OS resolves the SAME entity the
   clarifying question named (not a fresh guess, not "I don't understand, please
   clarify"). FAIL (the original bug): turn 2 is treated as a brand-new, unrelated
   message and Brain OS either re-asks the same question or invents a different
   referent.
3. Turn 3: send an unrelated new command. PASS (idempotency): the resolved
   `pendingAction` from turn 1 does not leak into turn 3 — a later "yes" with no pending
   question falls through to the ordinary LLM call rather than re-triggering turn 2's
   resolution.

### CHAT_CONFIRMATION_RESOLVES_PREVIOUS_ENTITY

1. Turn 1: `Archive the wrong task — I mean the QA-CONTINUITY deploy task.` where the
   exact task title is close-but-not-exact to a real fixture task's title. Expect
   `work_orders.output.pendingAction` = `{"kind": "single_entity_clarification",
   "candidateIds": [<the real task id>], "entityType": "task", "question": ...}`.
2. Turn 2: `yes, delete that task` (note: deliberately uses "delete," ordinary language,
   not "archive," to also confirm the ordinary-language-means-archive convention still
   applies on the deterministic path). PASS: the reply is recognized as an affirming
   clarification response (`isClarificationAffirmative` — a trailing-text reply, not
   just a bare "yes," is what the original narrow `isShortAffirmative` regex could never
   match), `work_orders.output.model === "deterministic-clarification"` for turn 2, and
   the real task named in turn 1 is actually archived (verify via a direct `tasks` table
   read, not the chat reply text). Re-run the same two-turn script substituting
   "company"/"goal"/"channel"/"approval" for "task" to cover every currently-mapped
   `CLARIFICATION_ENTITY_ACTION_FIELD` entity type.
3. Negative-scope note (not a PR B failure): a `single_entity_clarification` about a
   *person* ("delete that employee") correctly asks the clarifying question and targets
   the real person id, but does not yet resolve deterministically on turn 2 — there is no
   `person → endEmploymentPersonIds` mapping until Workstream 1 ships in a later PR. Turn
   2 for a person clarification should fall through to the ordinary LLM call (still
   correct behavior, just not the zero-LLM-call fast path) rather than silently doing
   nothing or archiving the wrong thing.

### CHAT_COMPOUND_COMMAND_PRESERVES_RESOLVED_COMPANY

1. Turn 1: `Create a company called QA-CONTINUITY-CO under SEM LLC and add a new
   employee there.` Expect Brain OS to create `QA-CONTINUITY-CO` (a real
   `createCompanies` entry) and ask ONLY for the missing employee fields (name/role) in
   `summary` — not re-ask which company. Confirm
   `work_orders.output.resolvedEntities.companies` contains `{id, name:
   "QA-CONTINUITY-CO"}` for this turn (real, persisted — not just visible in the one-time
   SSE stream).
2. Turn 2: `Her name is Jane Doe, she's the ops lead.` PASS: the new person is created
   under `QA-CONTINUITY-CO`'s real id — verify both via this turn's own
   `context.recentlyResolvedEntities.companies` (present in the request the Edge
   Function received) and via the actual `people.company_id` row in the database. FAIL
   (the original bug): Brain OS asks again which company Jane Doe belongs to, or creates
   her with no company / the wrong company.

### CHAT_SHORT_REPLY_DOES_NOT_TRIGGER_GENERIC_FALLBACK

1. Turn 1: ask something genuinely open-ended with no clean single answer available from
   context (e.g. in a fresh channel with more than one real company in context: `Which
   company should I use for this?`). Expect `summary` ends in a question mark AND
   `work_orders.output.pendingAction` is `{"kind": "open_question", "question": ...}` —
   never null.
2. Turn 2: reply with a short, low-signal message, e.g. `test3` or `not sure`. PASS: the
   reply engages with the actual open question from turn 1 (using
   `context.pendingAction.question` as real context) rather than free-associating into
   describing its own system prompt or capabilities — the original reported defect
   ("test3" produced a description of Brain OS itself, not a question about the pending
   topic). FAIL: the reply is generic/self-referential with no connection to what was
   actually asked in turn 1.

### CHAT_NATURAL_ENTITY_REFERENCE_RESOLVES

1. Set up a company literally named `Test Business Unit` (organizationType
   `business_unit`, under any real parent).
2. Turn 1: `Show me tasks for test business unit.` (lowercase, unquoted, phrased exactly
   like a type description rather than a proper name). PASS: Brain OS resolves it to the
   real `Test Business Unit` company by its literal name (case-insensitive,
   quote-agnostic) rather than misreading "test business unit" as a description of the
   `business_unit` organizationType and asking "which business unit did you mean?" or
   silently ignoring the reference. FAIL: Brain OS asks a clarifying question that
   reveals it never matched the literal company name, or answers about the wrong/no
   company.
3. Re-run addressing the same company as `"Test Business Unit"` (quoted, exact case) and
   `TEST BUSINESS UNIT` (all caps) — all three phrasings must resolve identically to
   step 2.
4. Negative/disambiguation case: create a SECOND company whose name also plausibly
   matches (e.g. `Test Business Unit 2`), then repeat turn 1's phrasing. PASS: Brain OS
   sets `pendingAction: {"kind": "disambiguation", "options": [...]}` naming both real
   companies by name rather than silently guessing one. Confirm turn 2 (`the second one`
   or naming one option's exact label) resolves deterministically
   (`work_orders.output.model === "deterministic-disambiguation"`).

### BRAIN_CHAT_RESPONSE_NO_DUPLICATE_RESULT

1. Turn: `Build a new page that shows partner revenue by month.` against a real company
   (a genuine `createFactoryWorkOrders` request). PASS: `summary` is exactly the
   three-line deterministic report — `Work Order created: <title>.` / `Status: Queued.`
   / `I'll track build and independent verification in the Agent Control Center.` — and
   does NOT ALSO contain a second, model-written restatement of the same fact below it
   (no separate "I've created a Work Order to..." paragraph duplicating the
   deterministic line). FAIL (the original bug): the deterministic line is followed by
   the model's own near-duplicate prose, so the founder reads the same fact twice in
   different words.

### BRAIN_CHAT_RESPONSE_HIDES_INTERNAL_IDS

1. Same turn as above. PASS: `summary` (what the founder actually reads in the chat
   bubble) contains no UUID (pattern `[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-
   [0-9a-f]{12}`) and no full git commit SHA. The real id is present ONLY in the
   structured `result.executionEvidence.factoryWorkOrders[].id` field (and the existing
   SSE `done` event's own `createdFactoryWorkOrders` array, unchanged) — confirm both by
   inspecting the persisted `work_orders.output` row directly, not by trusting the chat
   bubble text alone.
2. Follow-up turn: `What happened with that work?` against a Work Order that has a real
   `lastRunHeadCommit`. PASS: `summary` does not quote the full SHA unless the founder
   explicitly asks "which commit" — and even then, only the first 7 characters.

### BRAIN_CHAT_RESPONSE_HIDES_INTERNAL_EXECUTION_NOISE

1. Same Work Order status follow-up as above (`What happened with that work?` / `Is it
   done yet?`). PASS: `summary` uses only the founder-facing status vocabulary —
   "Created" / "Queued" / "Running" / "Waiting for approval" / "Verifying" / "Completed"
   / "Failed" — and never a raw enum value (`e2e_verified`, `in_progress`, `qa_review`,
   `needs_approval` verbatim, etc.) or the word "Runner". Confirm by checking the real
   `agent_runs.status`/`verification_status` values in the database for that Work Order
   and verifying the reply's wording maps correctly (e.g. a real `lastRunStatus: "done"`
   with no `lastRunVerificationStatus` set must read as "Verifying," never "done" or
   "e2e_verified").
2. Negative/regression check: confirm the destination named in `summary` is "Agent
   Control Center" (the real sidebar entry that actually shows this Work Order —
   `web/components/app-sidebar.tsx`, href `/software-factory`, verified against
   `web/lib/data/factory.ts` querying `canonical_work_orders` directly) — not "Workflow
   Factory" (a different feature at `/workflows`, unrelated to this Work Order's own
   build/verification tracking) and not any raw internal path.
