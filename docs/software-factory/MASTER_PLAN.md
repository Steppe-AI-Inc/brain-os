# Brain OS Software Factory — Commercial-Ready Agent Platform

> This file is a repo-committed copy of the Claude Code plan file
> (`C:\Users\Dell\.claude\plans\quiet-wiggling-biscuit.md` on the machine that authored
> it), kept in sync here specifically so it travels across machines via `git pull` —
> Claude Code plan files are otherwise local-only. If you're picking this work up on a
> different machine, this file plus `qa/KNOWN_FAILURE_MODES.md` (#37-#41) is your full
> context; nothing essential lives only in the original local plan file.

## Progress log (updated 2026-08-31)

- **Phase 0 (audit)**: DONE. `docs/software-factory/OPEN_SOURCE_STACK.md` committed.
- **Phase 1 (plugin registry)**: CORE MECHANISM LIVE-VERIFIED. Migrations
  `202608300004`-`06` pushed (founder-authorized) and confirmed live. Real attach→dispatch→
  raw-log-proof→detach→reattach cycle performed against production (obra/superpowers'
  `verification-before-completion` skill, attached to `brain-os-verifier`). One real
  concurrency bug found and fixed (`sync-agents.mjs`'s unconditional `main()` firing as an
  import side effect). Details: `qa/KNOWN_FAILURE_MODES.md` #37.
- **Phase 2 (capability scheduler)**: LIVE-VERIFIED. `scripts/factory-runner/scheduler.mjs`
  (new). Real 3-task DAG proof (2 parallel + 1 dependent) against a synthetic Work Order —
  parallel dispatch, capability routing (including a correct *refusal* to dispatch to a
  design-only agent), dependency blocking, and heartbeat-driven staleness all confirmed live.
  One real bug found and fixed (`selectTasksToDispatch` couldn't see already-`done`
  dependencies because the SQL excluded terminal tasks from its own status map). While
  reconciling an orphaned run this surfaced, found and disclosed (not worked around) a real
  `complete_work_order()` design question — a `rejected` run still blocks completion even
  after its task is archived. Details: `qa/KNOWN_FAILURE_MODES.md` #38.
- **Phase 3 (realtime control center)**: LIVE, migration `202608300007` pushed
  (founder-authorized) and independently re-verified against the live schema — the
  `CREATE OR REPLACE VIEW` in the original migration file failed live (column-position
  shift from `agents.capabilities`), fixed via `DROP`+`CREATE`, migration file corrected
  to match what actually had to run. `agents_with_live_status` confirmed deriving `STALE`
  from heartbeat age. `factory_realtime_rls_truth.sql` proves cross-company isolation and
  founder-only notification access hold identically under Realtime's own authorization
  (same RLS policies). Details: `qa/KNOWN_FAILURE_MODES.md` #39-#40. **Still blocked on**:
  no browser automation tool available this session — actual authenticated rendering and
  live-update behavior in a real browser not visually confirmed (mechanism-level proof
  only).
- **Phase 4 (notification event model)**: LIVE, migration `202608310001` pushed
  (founder-authorized), fully acceptance-tested end to end against real production data.
  **Four real bugs found and fixed in this phase** (one a genuine security gap — a
  non-admin could originally call `create_founder_notification` directly and inject an
  arbitrary notification; fixed by revoking a privilege grant that should never have been
  broad). Full real chain proven live: blocker → notification → mark-read → resolve →
  Work Order completion → completion notification (exactly once); stale agent → real
  `notifyStaleAgents()` → notification (exactly once, including under 3 repeated polls) →
  heartbeat recovery → `RUNNING` again → resolved. Details:
  `qa/KNOWN_FAILURE_MODES.md` #41.
- **Independent verification (Phase 3+4)**: a genuinely separate `brain-os-verifier`
  dispatch is in flight as of this update — do not report
  `E2E VERIFIED — REALTIME FACTORY + FOUNDER NOTIFICATIONS` until it returns clean. Check
  `qa/KNOWN_FAILURE_MODES.md` for a new entry after #41 or `git log` for a commit from
  that session before assuming it passed.
- **Phase 5 (real multi-agent/beehive utilization)**: next, explicitly gated on the
  Phase 3+4 verifier result landing clean first — not started.
- **Phases 6-11**: NOT STARTED.

Full session reports (commit-by-commit, with evidence) sent to the founder as files
during this session — see chat history around 2026-08-30/31 for the delivered reports.


## Context

The Software Factory works today but is a proof-of-concept, not a commercial platform: it
serially runs Factory Director + one Implementation Engineer, has no real plugin/GitHub
ecosystem visible in the product, no capability-based multi-agent scheduling, no crash-safe
durable execution, a static (non-realtime) dashboard, and no founder-notification mechanism —
so blockers are only noticed via terminal/Claude notifications, not Brain OS itself. This plan
turns it into a real engineering-organization-like factory: Brain Chat → Goal → Work Order →
typed task DAG → capability-routed specialist dispatch (parallel where independent, blocked
where dependent) → real execution providers → isolated sandbox → commit → tests → independent
verification → release gate → `complete_work_order()` → concise founder report, all watchable
live in an upgraded Workflow Factory console, with Brain OS itself notifying the founder when it
needs them.

**Core product principle (non-negotiable, drives every phase — corrected and reaffirmed by the
founder after initial plan review)**: **Brain OS itself remains the single production
orchestration authority.** The Factory Director *is* the orchestrator — not Temporal, not
LangGraph, not Google ADK, not any external framework. Brain OS's Postgres tables — Company/
Goal/Work Order/Task/Agent/Agent Run/Approval/Artifact/Verification/Release state — remain the
exclusive canonical business truth. External frameworks/plugins/providers are capabilities the
Factory Director invokes; none of them may become a competing source of truth or a competing
orchestrator:
- **Temporal**, if the spike proves value, becomes an *optional durable workflow/runtime engine
  underneath* Brain OS — it may persist workflow checkpoints and retries, but Work Order status,
  Task status, agent authority, approval state, verification state, and release state stay
  exclusively Brain OS state, always. Temporal never decides what happens next in business
  terms; it only makes the Factory Director's own dispatch crash-safe.
- **Claude Code / OpenHands / mini-swe-agent / Google ADK** are execution providers — they run
  work the Factory Director assigns them, nothing more.
- **MCP** is a tool protocol, not an authority.
- **LangGraph and Microsoft Agent Framework** are reference material or bounded, contained
  provider experiments only, unless one demonstrates measurable, specific unique value — neither
  is a path to becoming a second orchestration authority alongside the Factory Director.

No fake ONLINE/RUNNING badges: every status shown must trace to a real provider run + heartbeat,
never optimism.

Grounded in the live repo (`C:\Users\Dell\dev\brain-os`) and this session's own research:
`scripts/factory-runner/provider.mjs` already implements a real `AgentExecutionProvider`
(`startRun/getRunStatus/getLogs/cancelRun/getArtifacts/healthCheck`, one concrete backend today —
`claude_code_background`, hardcoded-checked at line 243); the Agent Registry
(`202608290003_factory_agent_registry.sql`) already has `execution_provider`, `provenance jsonb`,
`has_production_authority`, `definition_hash`; `complete_work_order()`
(`202608300002_complete_work_order.sql`) already has real anti-vacuous-completion and
cross-row-verification-binding guards; `docs/software-factory/THIRD_PARTY_COMPONENTS.md` already
has real, evidence-backed audit rows for 3 of 11 newly-audited repos and a proven
`mcp_connectors` table (name/endpoint_url/transport/vault_secret_id/last_checked_at/
last_status/enabled) that is the direct template for the new plugin-source registry — confirmed
live, no `plugin_sources`/`skills`/`capabilities` tables exist yet, so nothing here duplicates
existing schema. Today's `/software-factory` page (`web/app/(app)/software-factory/page.tsx`) is
confirmed a static server-rendered summary (StatCards + a list), exactly the "mostly a static
summary" gap the founder flagged — no realtime, no drill-down, no logs.

Standing rules unchanged throughout: any real production DB migration or Edge Function deploy
needs explicit founder authorization before push; no phase is ever self-certified — independent
`brain-os-verifier` dispatch (starting from committed state only, never this session's own
narration) is mandatory before any phase or the final "E2E VERIFIED" claim.

---

## Phase 0 — Finish open-source integration audit (NOT GATED, do first, fast)

Already researched live this session (11 repos, see prior audit). Write
`docs/software-factory/OPEN_SOURCE_STACK.md` with the richer column set now required: repository
/ exact upstream URL / license / version-tag-commit / purpose / decision / installed? / local
location / security review / permissions / integration boundary / update strategy / rollback
strategy — one row per repo:

| # | Repo | Decision |
|---|---|---|
| 1 | temporalio/sdk-typescript | ADOPT AS PROVIDER — optional durable workflow/runtime *engine underneath* the Factory Director, only if the Phase 2 spike proves value; Event History is execution-replay state only, Brain OS Postgres stays canonical |
| 2 | google/adk-js | REFERENCE — bounded, contained execution-provider experiment only if it demonstrates measurable unique value; never a second orchestrator |
| 3 | modelcontextprotocol/typescript-sdk | ADOPT AS PROVIDER — tool protocol; host RLS is always the real enforcement, protocol auth is optional by spec; pin ≥1.26.0 (CVE-2026-25536) |
| 4 | a2aproject/A2A | REFERENCE — future distributed-agent interop; real SSRF risk via attacker webhooks, metadata-prep only |
| 5 | All-Hands-AI/OpenHands | ADOPT SKILLS ONLY (optional secondary provider prototype, contained) — HIGH replacement risk, owns its own conversation/task state |
| 6 | SWE-agent/mini-swe-agent | ADOPT AS PROVIDER — benchmark/alternative provider, no state model of its own, cleanest to sandbox |
| 7 | obra/superpowers | ADOPT SKILLS ONLY — already partially adopted, cross-ref `THIRD_PARTY_COMPONENTS.md` |
| 8 | wshobson/agents | ADOPT SKILLS ONLY — selection deferred pending overlap check |
| 9 | VoltAgent/awesome-claude-code-subagents | ADOPT SKILLS ONLY — lowest priority, repo's own "we do not audit" disclaimer |
| 10 | microsoft/agent-framework | REFERENCE — no JS/TS SDK (hard blocker), CVE lineage in Semantic Kernel predecessor; reference only unless it demonstrates measurable unique value |
| 11 | langchain-ai/langgraphjs | REFERENCE / bounded provider experiment only — more TS-mature than ADK, but this does **not** make it a candidate to orchestrate the factory; at most a contained execution-provider prototype for one bounded multi-agent task, invoked by the Factory Director like any other provider |

AutoGen: REJECT (maintenance mode), no further work. **Explicit in the doc (corrected)**: Brain
OS's own Factory Director is the single production orchestration authority, full stop — Temporal,
LangGraph, Google ADK, and Microsoft Agent Framework never become a second orchestrator; Temporal
is the only one of the four with a plausible role at all, and only as an optional durable-runtime
layer *underneath* the Factory Director, never deciding business outcomes itself.

---

## Target architecture

```
Founder Brain Chat
   ↓
Goal
   ↓
Canonical Work Order
   ↓
Execution Plan / Task DAG   ← NEW: typed, persisted, replaces ad-hoc single-task dispatch
   ↓
Factory Director            ← existing orchestrator role, now DAG-aware
   ↓
Capability / Agent Scheduler ← NEW: routes by real capability metadata, not display name
   ↓
┌───────────────────────────────────────────────┐
│ Product Architect · Frontend/Impl Engineers    │
│ Backend Engineer · DB/Security Engineer        │
│ Integration Engineer · QA/Independent Verifier │
│ Release Operator · dynamically installed       │
│ specialist agents (from the plugin registry)   │
└───────────────────────────────────────────────┘
   ↓
Execution Providers (AgentExecutionProvider — contract unchanged)
   ↓
Claude Code / selected open-source providers (mini-swe-agent, etc.)
   ↓
isolated worktree / sandbox
   ↓
real repository mutation → tests → independent verification → release gate
   ↓
complete_work_order()
   ↓
Brain OS reports canonical result to founder
```

---

## New data model (additive only — reuses existing tables where they already represent the concept)

**`plugin_sources`** (new table, modeled directly on the proven `mcp_connectors` shape):
`id, source_type ('github'|'npm'|...), github_owner, github_repo, repository_url,
default_branch, pinned_ref, pinned_commit_sha, license, trust_status
('unreviewed'|'quarantined'|'approved'|'rejected'), last_checked_at, latest_upstream_sha,
update_available boolean, created_at`.

**`plugin_components`** (new table): `id, source_id → plugin_sources, slug, component_type
('agent'|'skill'|'plugin'|'mcp_server'|'execution_provider'|'workflow'|'testing_tool'|
'library'|'template'), manifest jsonb, installed_version, definition_path, definition_hash,
capability_metadata jsonb, permission_profile jsonb, install_status
('discovered'|'quarantined'|'smoke_tested'|'registered'|'enabled'|'disabled'), enabled boolean`.

**Reused, not duplicated**: `public.agents.provenance jsonb` (already designed for exactly this
— `{external_capabilities:[{skill, origin, pinned_ref}]}`) is how a `plugin_components` row
becomes attached to an agent; a new **join table `agent_plugin_attachments`** (`agent_id,
plugin_component_id, attached_at, attached_by`) is the many-to-many, with `sync-agents.mjs`
already-existing UPSERT extended to also write the resolved `provenance.external_capabilities`
from it — the acceptance bar (attach → launch → runtime actually contains it → Agent Run records
exact hash) depends on this write actually happening at dispatch time, not just existing as
inert metadata.

**Agent Run telemetry** (new nullable columns on `agent_runs`, GATED migration):
`provider_run_id` (already exists), `worker_id, last_heartbeat_at, current_step, current_task_id,
worktree_path, token_usage jsonb, estimated_cost_usd, last_event text, blocked_reason`. A
`status` value `stale` is added to the existing check constraint — computed by a heartbeat-age
rule (e.g. no heartbeat in N minutes while `status='running'` → `stale`), never left showing
`RUNNING` indefinitely. This directly extends the existing `agents_with_live_status` view logic
rather than replacing it.

**Notifications** (new table `founder_notifications`): `id, event_type, severity, title, body,
work_order_id, agent_run_id, read_at, created_at`. Delivered in-app first (Supabase Realtime
subscription in the web app), Web Push (PWA) as a stretch add-on once in-app is proven — no new
delivery channel invented if an existing one (e.g. the messaging-transport work already deferred
to the post-factory roadmap) would later duplicate it.

---

## Phase 1 — GitHub / Plugin Control Center (GATED: `plugin_sources`/`plugin_components`/
`agent_plugin_attachments` migration; NOT GATED: UI, sync scripts)

New `/software-factory/plugins` section inside Workflow Factory. Table columns: Repository /
Owner / Component name / Type / Installed version / Pinned commit SHA / Latest upstream version
/ Update available / License / Trust status / Installed date / Last sync / Definition hash /
Health / Used by agents / Capabilities / Permissions required.

**GitHub sync** (`scripts/factory-runner/plugin-sync.mjs`, new): uses the existing GitHub
integration/API (`gh` CLI, already used throughout this project's own tooling — never scraping
HTML pages) to read repo metadata, detect latest upstream SHA vs. `pinned_commit_sha`, and flag
`update_available`.

**Installation pipeline** (strict, matches the founder's stated stage list exactly): DISCOVER →
FETCH METADATA → LICENSE CHECK → STATIC SECURITY INSPECTION → CAPABILITY/PERMISSION INSPECTION →
QUARANTINE → SANDBOX SMOKE TEST → REGISTER → ENABLE → ATTACH TO AGENT → HEALTH CHECK. Pasting a
GitHub URL never executes arbitrary code immediately — a component sits in `quarantined` until
it passes static inspection + a real sandboxed smoke test. Permission vocabulary (least
privilege, explicit per component): `READ_REPOSITORY, WRITE_REPOSITORY, RUN_TESTS,
CREATE_WORKTREE, NETWORK_ACCESS, DATABASE_READ, DATABASE_WRITE, DEPLOY_PRODUCTION` — any
component requesting a sensitive permission (`WRITE_REPOSITORY`, `DATABASE_WRITE`,
`DEPLOY_PRODUCTION`) requires explicit founder/admin approval before `install_status` can reach
`registered`.

**Plugin manifest** (`brain-plugin.yaml`/`.json`, new, documented format): name, slug, type,
version, source, entrypoint, skills, capabilities, tools, supported_agents, required_permissions,
execution_provider_compatibility, dependencies, health_check, license. External repos are never
required to natively understand Brain OS — adapters/importers translate: Claude agent
definitions, Claude skills, MCP server configs, and selected open-source agent definitions each
get their own thin importer that produces this manifest shape.

**Skill attachment UI**: on an Agent's detail page, an "Attached" list (checkbox-style, matching
the founder's mockup) with Attach/Detach/Update actions, backed by `agent_plugin_attachments`.

---

## Phase 2 — Real capability-based scheduler (NOT GATED for the scheduler logic; GATED for any
new `tasks`/`agent_runs` columns it needs)

**Typed task DAG**: Work Orders produce Tasks with `depends_on jsonb (task ids)`, `parallel_group`,
risk, `required_capabilities text[]`, required verification, expected artifacts, acceptance
criteria — extending the existing `tasks` table rather than a parallel structure. Independent
tasks (no shared dependency edge) execute concurrently; a task with unmet dependencies stays
`waiting_dependency` and is never dispatched early.

**Capability-based routing**: every registered agent already has (or gains) a `capabilities
text[]` column (e.g. `brain-os-db-security-engineer: [postgres, supabase, rls, migrations,
security, multi_tenancy]`). The scheduler dispatches by matching a task's `required_capabilities`
against real registry rows — never by display name string-matching. Routing considers task type,
risk, affected files, DB impact, external integrations, FE/BE scope, security/verification needs,
current load, and provider availability — the explicit goal is proportionate dispatch (a doc
typo only needs Implementation Engineer → Verifier; a DB migration needs DB/Security Engineer +
Verifier + Release Operator; a full feature fans out Architect → parallel FE/BE/DB/Integration →
Verifier → Release), not making every agent attend every task.

**Concurrency**: a configurable cap (default 3–5 concurrent coding agents, derived from real
machine/provider limits, never unbounded spawning). Task states: `queued, starting, running,
waiting_dependency, waiting_approval, verifying, done, failed, cancelled, stale`.

**Agent lease/heartbeat**: every active Agent Run writes real telemetry (see data model above) on
a real interval; a stale heartbeat while `status='running'` flips the row to `stale` — the UI
must never show `RUNNING` on optimism.

**Crash/restart recovery**: if Phase 0's Temporal audit and a scoped spike (kill worker
mid-Activity, restart, confirm exactly one `agent_runs` row via real SQL, no duplicate
commit/completion) prove out, Temporal becomes an optional durable-runtime layer *invoked by* the
Factory Director for crash-safety only — it never decides what happens next, and canonical Work
Order/Task/approval/verification/release state is read and written exclusively through Brain OS's
existing RPCs the whole time, never through Temporal's own state. If not adopted, an equivalent
durable-job mechanism is built directly in the existing runner (a persisted "resume point" per
Work Order plus an idempotency-key check-then-act pattern). Either way, the acceptance bar is
identical: Work Order begins → worker killed → worker restarts → the same canonical Work Order
resumes under the Factory Director's own orchestration → no duplicate task/Agent Run/commit →
verification and completion each run exactly once.

**Retry policy** (explicit, not blanket): provider/network failure → retry; compiler/test failure
→ return to implementation/fix; verification failure → reopen the relevant implementation task;
security failure → block release; high-risk action → wait for approval. Never blindly retry a
destructive action.

**Phase 2 acceptance test**: a real synthetic Work Order requiring multiple roles —
`"Build QA Software Factory Health Dashboard"` (product architecture + a DB read model + backend
+ frontend + live status integration + security) — dispatched through the real scheduler,
confirming parallel fan-out, dependency blocking, and capability-correct routing, not simulated.

---

## Phase 3 — Software Factory Live Control Center (NOT GATED)

Upgrades `web/app/(app)/software-factory/page.tsx` from static summary to a real-time console.

**Header**: System health (Healthy/Degraded/Down), Runner/GitHub/Database/Verifier connection
dots, Active/Queued Work Orders, Running/Blocked Agents, Failed Runs — every value computed live,
never cached optimism.

**Agent drill-down**: click an agent → current Agent Run, recent runs, logs, artifacts, worktree,
commits, attached skills (with hash), provider, cost, failures.

**Realtime**: Supabase Realtime (the existing, already-proven infra) drives UI updates on
heartbeat change, task completion, verifier start, Work Order completion — no page refresh
required.

**Structured live log/events view**: a safe, bounded event stream (`14:02 Architect started`,
`14:05 DB migration requires founder approval`, etc.), not an unlimited terminal dump; detailed
provider logs available as an expandable drill-down only.

---

## Phase 4 — Blocker / mobile notifications (NOT GATED for in-app; separately scoped for push)

`founder_notifications` table (above) + a Realtime-subscribed in-app notification center in the
web app. Triggers: approval required, destructive-operation confirmation, DB push required,
production deploy required, agent failure, agent gone stale, security-verifier failure, Work
Order blocked/completed, release completed, provider unavailable. Web Push (PWA) is a second,
explicitly separate slice built only after in-app notifications are proven live — not bundled
into the same acceptance bar.

---

## Phase 5 — Scheduler proof (multi-role synthetic Work Order)

Concretely run `"Build QA Software Factory Health Dashboard"` (or an equivalent real, non-trivial
feature) end-to-end through Phases 1–4's machinery: real architecture task, real DB read model,
real backend, real frontend, real live-status integration, real security review — observed live
in the new console, not asserted from logs alone.

---

## Phase 6 — Plugin lifecycle verification (full chain, real)

For one real installed skill/component: confirm it reaches the execution runtime (attach → launch
agent → execution environment genuinely contains it → Agent Run records the exact
definition/hash used) → detach → prove it is genuinely no longer available → reattach. Then
prove update/rollback for real: simulate an upstream version bump (N → N+1) → `update_available`
flips true → sandbox verification of N+1 → install N+1 → rollback to N, confirmed by a real
before/after check, not a claimed one. Do not report the plugin system complete unless this
sequence is independently observed working.

---

## Phase 7 — Commercial security

Enforced, not aspirational: no arbitrary shell from an untrusted GitHub repo; no arbitrary
`definition_path`; no provider self-escalation; no agent modifying its own authority; no plugin
modifying Brain OS approval policy; no cross-company data access; no service-role broad reads in
user contexts; no unauthorized production deployments; no agent bypassing independent
verification. Sensitive permissions (`WRITE_REPOSITORY, DATABASE_WRITE, DEPLOY_PRODUCTION`, etc.
— see Phase 1) are always explicit and least-privilege.

---

## Phase 8 — Release gate (Release Operator made real)

Activates when a Work Order is ready for release. Before release: required tasks complete, tests
pass, security checks pass, independent verifier passes, required approvals satisfied, expected
commit exists, working tree/repo state valid. Then: deploy per the existing
`PRODUCTION_DEPLOYMENT_PATHS.md` governance (unchanged, reused) → smoke test → postcondition →
release evidence recorded → `complete_work_order()`. Release Operator must stop being a
decorative registry row — it needs a real Agent Run history like every other specialist.

---

## Phase 9 — Real-time factory health

Health checks: runner, provider(s), GitHub connectivity, Supabase connectivity, MCP health,
Temporal health (if adopted), agent/plugin definition drift (hash mismatch), stale Agent Runs,
stuck Work Orders, unverified commits, failed releases, context-budget state (reusing this
session's own token-diagnostic work). Dashboard shows HEALTHY/DEGRADED/BLOCKED with the exact
reason, never a vague status.

---

## Phase 10 — Clean up old Factory fixtures

Audit every Work Order currently stuck `Queued`/`In Progress`/`QA Review` from prior QA/bootstrap
work. Classify each: completed historically, failed, abandoned, superseded, or still active — no
blanket "mark done." Close/update through canonical lifecycle operations only
(`complete_work_order()`/existing archive RPCs), never a raw status UPDATE. Add stale-run/
stale-work-order detection so the dashboard can't look permanently broken because of old test
jobs.

---

## Phase 11 — Acceptance: the factory builds something real

After Phases 0–10 pass independently, do **not** hand-build the next commercial feature through a
bootstrap session. Instead, from real Brain OS Chat: *"Build the OpenSpot Partner Revenue
Dashboard."* Watch it flow, live, in the upgraded console: Brain Chat → Goal → Work Order →
Product Architect → task DAG → specialist assignment → parallel Agent Runs → real repository
changes → tests → DB/Security verification → independent Verifier → Release Operator →
deployment (if approved) → `complete_work_order()` → concise founder result. This run is the
final proof, not a simulation.

---

## Explicit non-goals / guardrails (binding throughout)

Do NOT: create a second competing Agent-orchestration authority — Brain OS's Factory Director is
the only orchestrator, always; make Temporal, LangGraph, Google ADK, OpenHands, or any external
framework authoritative for Work Order status, Task status, agent authority, approval state,
verification state, or release state; install every candidate framework wholesale; show fake ONLINE/RUNNING statuses; run every agent on every trivial task; expose
arbitrary plugin code directly to production; let a plugin bypass Brain OS governance; let an
implementation agent self-verify; claim an agent is RUNNING without a real provider run +
heartbeat; leave Release Operator/Architect/Integration Engineer as decorative unused registry
rows; solve slowness by spawning unlimited agents; start messaging/Telegram/WhatsApp/Messenger
work before this acceptance gate passes.

---

## Permanent regressions (new, added alongside the workstream that introduces each invariant)

`FACTORY_CAPABILITY_ROUTER_SELECTS_RELEVANT_AGENT`,
`FACTORY_INDEPENDENT_TASKS_EXECUTE_IN_PARALLEL`,
`FACTORY_DEPENDENT_TASK_WAITS_FOR_PREREQUISITE`,
`FACTORY_AGENT_STATUS_DERIVED_FROM_REAL_HEARTBEAT`,
`FACTORY_STALE_AGENT_NOT_REPORTED_RUNNING`,
`FACTORY_AGENT_RUN_RECORDS_PROVIDER_AND_SKILLS`,
`FACTORY_PLUGIN_INSTALL_PINNED_TO_SOURCE_COMMIT`,
`FACTORY_PLUGIN_INSTALL_REQUIRES_SECURITY_REVIEW`,
`FACTORY_PLUGIN_CAN_BE_ATTACHED_TO_AGENT`,
`FACTORY_ATTACHED_PLUGIN_IS_PRESENT_DURING_REAL_RUN`,
`FACTORY_PLUGIN_UPDATE_DETECTED`,
`FACTORY_PLUGIN_ROLLBACK_WORKS`,
`FACTORY_UNTRUSTED_PLUGIN_CANNOT_EXECUTE_DIRECTLY`,
`FACTORY_RUNTIME_RECOVERS_AFTER_WORKER_RESTART`,
`FACTORY_RUN_RECOVERY_DOES_NOT_DUPLICATE_AGENT_RUN`,
`FACTORY_VERIFIER_IS_INDEPENDENT`,
`FACTORY_RELEASE_OPERATOR_ACTUALLY_EXECUTES_RELEASE_GATE`,
`FACTORY_REALTIME_STATUS_MATCHES_PROVIDER_STATE`,
`FACTORY_BLOCKER_CREATES_FOUNDER_NOTIFICATION`,
`FACTORY_OLD_FIXTURE_RUN_NOT_SHOWN_AS_CURRENT_RUNNING`,
`FACTORY_COMPLETE_WORK_ORDER_REQUIRES_REAL_RELEASE_STATE_WHEN_REQUIRED`.

---

## Gating summary

| Phase | Gated (founder auth + push) | Not gated |
|---|---|---|
| 0 | — | `OPEN_SOURCE_STACK.md` |
| 1 | `plugin_sources`/`plugin_components`/`agent_plugin_attachments` migration | sync script, UI, manifest format, importers |
| 2 | any new `tasks`/`agent_runs` DAG/telemetry columns | scheduler logic, capability routing, retry policy |
| 3 | — | UI, Realtime wiring |
| 4 | — (in-app) | notification center; Web Push scoped separately |
| 5–6 | — | test execution only |
| 7 | — (enforcement is app-code + existing RLS) | permission model, guardrail checks |
| 8 | — (reuses existing deployment governance) | Release Operator wiring |
| 9 | — | health-check aggregation |
| 10 | — | lifecycle cleanup via existing RPCs |
| 11 | — (production deploy inside this run follows Phase 8's existing gated path) | orchestration |

## Sequencing

Phase 0 first (fast, unblocks nothing else but is overdue). Phase 1 (plugin registry) and Phase 2
(scheduler) can proceed in parallel — different files/tables, no shared dependency. Phase 3
(console) depends on Phase 2's telemetry columns existing to be meaningful, and Phase 4
(notifications) depends on Phase 3's Realtime wiring pattern. Phase 5/6 are proof passes for
Phases 1/2 respectively, done once those phases' code lands. Phase 7 is cross-cutting and should
be checked against every phase as it lands, not deferred to the end. Phase 8 depends on Phase 2's
task DAG existing (release gate is the DAG's terminal node). Phase 9 aggregates health signals
from every other phase — build last among the "always-on" phases. Phase 10 is independent
cleanup, safe any time. Phase 11 is the final gate, strictly after 0–10 each independently pass.

## Verification

No phase, and never the whole project, is self-certified. Each phase's acceptance bar is checked
by a separate, independently dispatched `brain-os-verifier` session starting from committed
repository state only — inspecting the real DB, Agent Registry, plugin registry, GitHub source/
provenance, actual provider sessions and heartbeats, task DAG execution, commits, worktrees,
tests, UI realtime state, permissions, notifications, and release evidence, with a fresh reload —
no simulated evidence accepted. Final target phrase, only after all 20 Definition-of-Done items
are independently true: **`E2E VERIFIED — COMMERCIAL-READY BRAIN OS SOFTWARE FACTORY`**.

## After this — explicitly not started yet

Once genuinely E2E verified: fix/complete the ChatGPT/OpenAI provider integration, then messaging
transport architecture (Telegram → WhatsApp → Messenger → Instagram → Viber), feeding customer
message → Brain OS contact → conversation → sales/support intent → company → employee/AI
assignment → governed reply → outbound provider → customer response. Do not divert into any of
this until Phase 11's acceptance gate passes.
