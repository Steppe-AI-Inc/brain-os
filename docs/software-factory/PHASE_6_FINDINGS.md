# Phase 6 — Factory Agent Registry

## What this delivers

Register all 7 real, smoke-tested Software Factory agents into Brain OS's own
`public.agents` table as canonical, synchronizable, real registry rows — not a second
editable definition (`.claude/agents/*.md` remains authoritative), not fake/static
status, not a parallel categorization system.

## Schema (purely additive, same discipline as Phase 5)

`supabase/migrations/202608290003_factory_agent_registry.sql`: 8 new nullable columns on
the existing `public.agents` table (`display_name`, `category`, `definition_path`,
`definition_hash`, `execution_provider`, `permission_mode`, `has_production_authority`,
`provenance`) + a `UNIQUE` constraint on `name` (the stable slug — the same string used
for `claude --agent <name>`, so identity never depends on a mutable display name) + one
new view, `public.agents_with_live_status`, computing real-time
`RUNNING`/`IDLE`/`FAILED`/`UNKNOWN` from actual `public.agent_runs` rows. Zero renames,
zero drops, zero change to `agents_write_admin` (already founder/admin-only for all
writes, already covers the new columns with no new RLS policy needed).

`supabase/migrations/202608290004_agent_runs_insert_scope_tighten.sql`: tightens the
already-live `agent_runs_insert_scope` policy (from Phase 5's migration) to
founder/admin-only for INSERT — see "What the independent reviews found" below.

## Stable identity vs. mutable display name

`agents.name` (e.g. `brain-os-implementation-engineer`) is the canonical slug — real,
`UNIQUE`-enforced, and identical to the CLI dispatch identifier, so there's no separate
"synced" copy that could drift from what actually gets executed. `display_name` (e.g.
"Implementation Engineer") is separate and mutable. A definition rename requires an
explicit registry update, not automatic magic — documented honestly rather than
overclaiming a rename-detection mechanism that doesn't exist.

## Sync mechanism

`scripts/factory-runner/sync-agents.mjs`: reads an **explicit allowlist** of 7 agents
(never `.claude/agents/*.md` blindly — `qa-director.md` exists too and is deliberately
out of scope), parses real frontmatter, computes a real SHA-256 of the full file content,
and `UPSERT`s by `name` (`on conflict (name) do update`) — idempotent by construction, no
duplicate rows possible (enforced by the `UNIQUE` constraint, not just script discipline).
An allowlisted agent missing from disk is reported, not silently skipped.
`deactivateMissing()` sets `active = false` for any previously-categorized agent no
longer in the allowlist, so a removed definition is flagged, not left as a phantom
"active" row.

## Agent vs. Agent Run

`public.agents` = persistent definition. `public.agent_runs` = one actual execution.
`agents_with_live_status.live_status` is **never** a stored column: `UNKNOWN` when
`execution_provider` is null (a design-only agent like `brain-os-product-architect` or
`brain-os-release-operator`, never dispatched by the Runner at all); `RUNNING` only if a
real `agent_runs` row is genuinely `queued`/`in_progress` right now; `FAILED` only if the
most recent real run's status is `rejected`; `IDLE` otherwise. No fake online indicators.

## Categories

`SOFTWARE_FACTORY` (Factory Director, Product Architect, Implementation Engineer),
`SECURITY` (DB/Security Engineer), `INTEGRATION` (Integration Engineer), `VERIFICATION`
(Verifier), `RELEASE` (Release Operator) — a `check` constraint on the new `category`
column, reusing the existing `agents` table rather than a parallel categorization store.

## Provenance

All 7 are `{"source": "brain_os_custom"}` — real, honest accounting: none of the 7 agent
definitions currently hardcodes an external skill/tool invocation strongly enough to
claim joint authorship. Playwright MCP is installed and load-tested (per
`docs/software-factory/THIRD_PARTY_COMPONENTS.md`) but **not yet wired into
`brain-os-verifier`'s own body** — recorded honestly as "available, not yet used," not
claimed as an active capability of any registered agent.

## Registry-driven execution (the Phase 6 acceptance test)

`scripts/factory-runner/provider.mjs` gains `resolveAgentFromRegistry(agentId)` and
`startRunByAgentId(agentId, task)`. The caller supplies only a canonical Brain OS Agent
ID — never a raw agent name, file path, or CLI flag. Every actual dispatch parameter
(name, execution provider, whether it's even allowed to run) comes from a real registry
read. `startRunByAgentId` refuses to dispatch when: the ID doesn't resolve to a real row
(`FACTORY_UNKNOWN_AGENT_CANNOT_EXECUTE`); the row is `active = false`; `execution_provider`
is null (a design-only agent); `execution_provider` isn't `claude_code_background`;
`has_production_authority` is false; or — the fix from the second independent review
below — the live on-disk file's real SHA-256 no longer matches the registry's stored
`definition_hash` (drift detection actually wired in, not just a column that exists).

## What the independent reviews found (two real, substantive findings — not rubber-stamped)

**Review 1** (`brain-os-db-security-engineer`, dispatched as a genuinely separate
background process): found that `agent_runs_insert_scope` — already live in production
from Phase 5's migration — only constrained `company_id`/`created_by_profile_id`, never
`agent_id` itself. Any authenticated user could fabricate an **unattributed**
(`created_by_profile_id` left null) `agent_runs` row against any real Software Factory
agent, with `company_id` left null. Phase 6's own `agents_with_live_status` view would
then surface that fabricated row as a genuine-looking `RUNNING`/`FAILED` status to
founder/admin — a real escalation in consequence of a pre-existing, previously
low-impact gap. My own header comment's claim ("never... a fake 'RUNNING'/'online'
value") was live-verified false as originally written. Also flagged: `startRunByAgentId`
accepted an unvalidated `cwd` and never actually re-checked `definition_hash` at dispatch
time (the column existed, but nothing consumed it).

**Both fixed**: `202608290004_agent_runs_insert_scope_tighten.sql` restricts
`agent_runs` INSERT to founder/admin only — the only real insert path today is the
trusted service-role Runner, which bypasses RLS entirely and is completely unaffected.
`provider.mjs`'s `startRunByAgentId` no longer accepts a `cwd` parameter at all (always
dispatches against the real repo root) and now re-computes the live file's real hash
before every dispatch, refusing on mismatch. Both fixes rollback-tested against real
production, including a real adversarial re-test proving the exact exploited path
(spoofed unattributed `agent_runs` row, `company_id` null, against a real registered
agent) is now genuinely rejected.

## Permanent regression

`qa/scenarios-runner/factory_agent_registry_adversarial.sql` — 8 named, SQL-testable
assertions, all passing (`all_pass: true`, rollback-tested against real production,
combined with both migrations): `FACTORY_AGENT_SYNC_NO_DUPLICATE_SLUG`,
`FACTORY_AGENT_DEFINITION_HASH_DETECTS_CHANGE`, `FACTORY_UNKNOWN_AGENT_CANNOT_EXECUTE`,
`FACTORY_AGENT_CANNOT_SELF_ESCALATE_AUTHORITY`, `FACTORY_AGENT_RUN_REFERENCES_
CANONICAL_AGENT`, `FACTORY_STATUS_DERIVED_FROM_REAL_RUN` (tested across all three real
states: no runs -> `IDLE`, an active run -> `RUNNING`, most recent run rejected ->
`FAILED`), and `FACTORY_STATUS_CANNOT_BE_SPOOFED_VIA_FAKE_AGENT_RUN` (the fix
re-verified). Two of the spec's nine named checks —
`FACTORY_AGENT_SYNC_IDEMPOTENT` and `FACTORY_AGENT_REGISTRY_DRIVES_EXECUTION` — are
process-level guarantees that can't be proven by SQL alone; their evidence is the real,
live post-push run recorded below once authorized.

## Data-layer prep for Phase 7 (not building the UI yet)

`agents_with_live_status` already returns everything Phase 7's control-center needs per
agent: Agent (name/display_name), Category, Capabilities (`allowed_tools`), Skills
(`skills` jsonb), Provider (`execution_provider`), Current Run (`live_status`,
`last_run_id`), Last Run/Last Result (`last_run_status`, `last_run_summary`,
`last_run_head_commit`), Definition status (`definition_path`, `definition_hash`) — all
from real persisted/computed state, nothing mocked.

## Pending founder authorization

Both migrations are prepared, rollback-tested individually and combined, and reviewed
twice independently (one real defect found and fixed, re-verified). Not yet pushed.
Once authorized: `supabase db push` (both migrations), run `sync-agents.mjs` for real
against the live schema (proving `FACTORY_AGENT_SYNC_IDEMPOTENT` by running it twice),
run a real registry-driven dispatch via `startRunByAgentId` (proving
`FACTORY_AGENT_REGISTRY_DRIVES_EXECUTION`), independent verification of that live run,
and this document will be updated with the real evidence before Phase 6 is tagged
`E2E VERIFIED — FACTORY AGENT REGISTRY`.
