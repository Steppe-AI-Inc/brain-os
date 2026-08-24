@AGENTS.md

# Brain OS — `/web` (the base foundation)

Product name as of 2026-08-24: **Brain OS** ("the company brain"), formerly "SEM Brain" —
renamed at the founder's request. Same product, same codebase; only the user-facing name
changed (UI copy, page titles, the AI's own system-prompt persona). Internal identifiers
(`sem-ai-command` Edge Function slug, `sem_execute_ai_command` RPC, `ai_command_v0.7`
source tags, the `SEM Technologies LLC` company itself) intentionally were not renamed —
those are either infrastructure names irrelevant to the rename, or the founder's actual
legal entity name, not the product's.

This is the **confirmed base foundation** for Brain OS as of 2026-08-24 — the founder
compared it directly against the old vanilla-JS app (repo root) in production and chose
this to build on going forward. The old app's Vercel deployment has since been deleted
(source kept in the repo for history only); see the repo-root `CLAUDE.md` and
`MASTER_CONTEXT.md` for the full multi-track picture.

## Stack

Next.js 16 App Router, TypeScript, Tailwind v4, shadcn/ui (Base UI primitives, not
Radix), `@supabase/ssr` for auth, Geist Sans/Mono. Deployed to Vercel, live at
`brain.open-spot.ai` (project `steppe-ai/brain-os` — the only Vercel project under
`steppe-ai`; see "Deploying" below).

## Security model — RLS is the only boundary

There is **no client-side permission redaction anywhere** in this app, on purpose.
Postgres RLS on the shared Supabase project (`pvphxgrtdfrudejjhzjk`) is the sole
enforcement layer — every `lib/data/*.ts` query runs as the signed-in user's real
session and simply returns whatever RLS allows. Never add a client-side "hide this from
non-managers" check as a substitute for a real RLS policy; UI-only conditionals (e.g.
hiding a button) are a UX affordance on top of RLS, never instead of it.

RLS policies follow one consistent shape across every company-scoped table (see
`supabase/schema-v0.7-production-core.sql`): `public.has_company_access(company_id)`
gates reads, `public.is_company_manager(company_id)` gates writes, `public.is_founder_or_admin()`
overrides both. Reuse these helper functions for any new table — don't invent a new
pattern, and don't modify the helper functions themselves (they're intentionally
`SECURITY DEFINER` with an explicit `search_path`; only add new policies that call them).

## Data layer pattern

One file per domain in `lib/data/<domain>.ts`, always `"use server"`:
- Plain `async function get<Thing>()` for reads — `throw error` on failure (Server
  Components render an error boundary; don't swallow read errors).
- `async function create<Thing>(_prevState, formData)` for `useActionState`-driven
  creates — return a string error message on failure, `null`/`redirect()` on success,
  `revalidatePath(...)` before returning.
- A plain exported async function (not React-Action-shaped) for one-off imperative
  mutations driven by a button + `useTransition`, e.g. `updateGoal(id, patch)`,
  `decideApproval(id, decision)`.

See `lib/data/goals.ts` for the fullest example (all three shapes in one file) and
`lib/data/companies.ts` for the minimal case.

## Shared UI

`components/page-header.tsx` and `components/stat-card.tsx` are the only two shared
chrome components — every page composes from these plus shadcn primitives
(`components/ui/*`) rather than one-off styling. Design tokens live entirely in
`app/globals.css`; change the look by changing tokens, not by scattering ad-hoc classes.

## Design system — calm, Apple-inspired (not the old app's look)

As of 2026-08-24 the palette is deliberately calm and light-by-default: Apple's own
system blue/green/orange/purple/gray, near-white ground, `0.625rem` base radius, flat
surfaces (no gradient fills, no `backdrop-blur`). This replaced an earlier amber/coral
gradient-blur "liquid glass" identity — don't reintroduce that without being asked. Two
real bugs already found and fixed once by an actual human checking the site in Chrome,
worth knowing so they don't recur:
- `--font-sans` must point at `--font-geist-sans` (the variable `layout.tsx` actually
  loads) — a self-reference here silently falls back to the browser's default serif font.
- Don't hardcode a `dark` class on `<html>` in `layout.tsx` — the `dark:` variant here is
  class-gated (`@custom-variant dark (&:is(.dark *))`), not media-query-gated, so a
  hardcoded class forces dark mode unconditionally regardless of the calm-light intent.

## AI providers, MCP connectors, token usage — `/settings`

`app/(app)/settings/` (Providers / MCP Connectors / Usage tabs) — the AI-native-OS
control surface. Key architectural decisions, worth knowing before touching this area:

- **`ai_providers` has no key column, deliberately** — the founder chose to keep the
  real LLM provider key out of the database entirely. The row only carries
  `provider`/`model`/`is_active`; the actual key stays a Supabase Edge Function secret
  (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY`). `supabase/functions/sem-ai-command/index.ts`
  reads the active row to decide provider+model, and falls back to legacy hardcoded
  OpenAI behavior if no row is active — never breaks existing chat.
- **MCP connector tokens use Supabase Vault**, not a table column — per-connector
  credentials don't fit a single env var the way one LLM key does, so this is the one
  place a real secret is database-adjacent, via `vault.create_secret()` /
  `vault.decrypted_secrets`, wrapped in three `SECURITY DEFINER` functions
  (`create_mcp_connector_secret`, `get_mcp_connector_token`,
  `delete_mcp_connector_secret` — see migration `202608260002`) since PostgREST doesn't
  expose the `vault` schema directly. Each wrapper does its own `is_founder_or_admin()`
  check rather than relying on RLS (there's no RLS on `vault.secrets` to rely on).
- **MCP connectors are remote-only (`http`/`sse`)** — a serverless app can't spawn
  local `stdio` MCP server processes the way blankcollar's Fastify backend does.
  `lib/data/mcp-connectors.ts`'s `testMcpConnector()` does a real one-shot MCP handshake
  (`initialize` + `tools/list`) over HTTP, not a persistent connection.
- **Wiring the chat page to actually *call* MCP tools mid-conversation is still
  unbuilt** — this pass only covers connector management + a reachability/tool-listing
  test. That integration would live in `sem-ai-command/index.ts`'s LLM loop.
- **`model_usage` cost was always `0`** until this pass — `lib/usage/pricing.ts`'s
  `estimateCost()` is a small hardcoded $/1M-token map (mirrored in the Edge Function,
  which doesn't share a package with `/web`) — deterministic, no LLM call needed to
  price an LLM call. Update both copies together if pricing changes.

## AI Native Chat streaming — `/chat`

`sem-ai-command/index.ts` streams SSE (`delta`/`usage`/`done`/`error` events) instead of
returning one blocking JSON blob. Context building, provider resolution, and the
forced-approval-scan + transactional `sem_execute_ai_command` RPC persistence are NOT
streamed — only the raw LLM generation is; persistence needs the full parsed JSON and can
only run once the stream ends. `web/app/(app)/chat/stream/route.ts` is a thin
auth-forwarding Route Handler proxy (deliberately not a Server Action, so a long
generation can't read as the whole app freezing — no `useTransition` involved anywhere in
this path). `web/lib/chat-stream.ts` has the shared client-side SSE frame parser
(`consumeChatStream`), used by both `chat/page.tsx` (live "watch it type" bubble) and
`workflows/workflow-grid.tsx` (drains to a final result, no live display). There is no
`chat/actions.ts` anymore — it was removed when this replaced the old blocking
Server Action.

One real TS gotcha hit while writing the Edge Function's streaming handler: `let usage:
Usage | null = null` reassigned via `usage = { ...usage, ...u }` inside a callback closure
made TypeScript infer `never` at every later read site (a self-referential-spread +
closure-capture narrowing bug, reproduced in isolation, not fixed by `??`-guarding the
spread). Fixed by switching to a `{ current: Usage | null }` ref-object instead of a bare
`let` — property reads aren't subject to the same narrowing. If a similar "does not exist
on type never" error shows up elsewhere on a `let` mutated inside a closure, reach for the
same ref-object pattern first.

**2026-08-24 follow-up — human-readable streaming, dual usage bars, in-chat provider
picker, task deletion.** Founder feedback after using the stream live: the raw-JSON
"watch it type" display read as too programmatic, and the token badge (only inside the
scrolling message bubble) disappeared once you scrolled past it. `chat-client.tsx` now
shows a plain "Brain OS is thinking…" indicator instead of the raw delta text (the delta
stream is still consumed for the live token/cost numbers, just not rendered verbatim), and
a live usage bar (`UsageBar`, tokens + `estimateCost()`-derived USD) renders both above the
message list and next to the input — same numbers, always visible regardless of scroll
position. `page.tsx` is now a thin server component (`getAiProviders()` → `ChatClient`) so
the page can also carry an in-chat provider/model picker that calls the same
`setActiveProvider()` used by `/settings` (now revalidates `/chat` too) instead of forcing
a trip to Settings to switch models. **Real Base UI gotcha caught by live-testing, not by
`npm run build`**: `<SelectValue>` renders the raw controlled `value` verbatim (here, a
provider's uuid) unless given a render-prop child — `<SelectValue>{() => label}</SelectValue>`
— Radix's automatic child-label lookup doesn't apply here.

Also: chat could create tasks but nothing could delete them — `tasks` had no DELETE RLS
policy at all (migration 202608260003 added `tasks_delete_scope`, manager+/admin only, plus
`ON DELETE SET NULL` on the two incoming FKs — `tasks.parent_task_id` self-ref and
`model_usage.task_id` — so a delete can't fail on an unrelated referencing row). Manual
delete is a trash icon on each Tasks board card (`task-card.tsx` → `deleteTask()`). AI-driven
delete is a `deleteTaskIds` field in the model's JSON schema — the model may only reference
ids that are literally present in the request's own `context.tasks` (cross-checked
server-side in `sem-ai-command/index.ts`, not just trusted), and any non-empty
`deleteTaskIds` always forces a review approval, same server-side-forced pattern as other
high-risk actions. `sem_execute_ai_command`'s signature gained a trailing
`p_deleted_task_ids uuid[] default '{}'` — note a new Postgres function parameter is a new
overload, not a replacement, so the migration explicitly `drop function`s the old signature
first and qualifies `revoke`/`grant` with the full arg list to avoid an ambiguous-name error
(hit this for real applying the migration — caught immediately by re-querying
`pg_proc`/`pg_constraint` afterward, same verification discipline as every other migration
this session).

## i18n

`lib/i18n/{dictionary,i18n-context}.tsx`, `useT()` hook, same `t(key, fallback)` pattern
as the old app. EN/MN only, shell + nav scope — not yet extended to the Goals/Board/
Departments pages added 2026-08-24.

## Deploying

**Git auto-deploy genuinely works** — `git push` to `master` is enough. This project
(`brain-os`) was created fresh via Vercel's dashboard Git-import flow with Root Directory
set to `web` from the start, unlike the original `web` project (deleted 2026-08-24) whose
Root Directory was misconfigured with no CLI/API fix available.

Manual deploy, if ever needed:

```
cd C:\Users\Dell\dev\brain-os        # repo ROOT, not /web — see why below
vercel link --project brain-os --yes   # only needed once per machine
vercel --prod --yes
```

**Must run from the repo root, not from inside `/web`.** `brain-os`'s Root Directory is
set to `web`, so a CLI deploy needs to upload the whole repo and let Vercel descend into
`web/` itself. Running the CLI already inside `/web` uploads that directory as the root
and then Vercel tries to descend into `web/` again looking for a `web/web/` that doesn't
exist — fails with `"Root Directory web does not exist"`.

`brain.open-spot.ai` is bound to this project at the **project level**
(`vercel domains add brain.open-spot.ai brain-os --force`) — it automatically follows
whatever this project's latest successful production deployment is. Check current state
any time with `vercel alias ls | grep brain.open-spot`.

**NEXT_PUBLIC_\* env vars must be added as non-sensitive** (`vercel env add NAME
production --no-sensitive --value "..." --yes`). Sensitive-type vars aren't available to
Next.js at *build* time, only at runtime — since `NEXT_PUBLIC_*` vars get inlined into
the client bundle during the build step, a Sensitive-typed one silently becomes
`undefined` in the shipped bundle. This exact mistake 500'd every page on this project
once already (fixed 2026-08-24) — don't repeat it when adding new public env vars.

## Verifying changes in this environment

No live browser in a Claude Code session here. `npm run build` (typechecks + builds)
and `npx eslint <files>` are the available verification — treat anything requiring
actual visual inspection as unverified and say so, rather than assuming it looks right.
`WebFetch` against the deployed URL can confirm a page renders content (not an error),
but converts to markdown/text and cannot confirm fonts, colors, or layout.
