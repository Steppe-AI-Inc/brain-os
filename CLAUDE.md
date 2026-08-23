# SEM Brain

> **Read `MASTER_CONTEXT.md` first** — this repo now has 3 parallel tracks (this branch's
> old app + the Next.js rewrite under `/web`, the `blankcollar` branch, and a pending
> third track). This file covers the old vanilla-JS app specifically; `/web`'s own
> conventions belong in a `web/CLAUDE.md` if one is added later.

AI-native operating system for a founder managing multiple companies (SEM Technologies parent + subsidiaries: OpenSpot/Steppe AI, SEM Global Robotics, SEM Mongolia, Fuelmetrix, EVM, Tradebook, IQParking). Chat-first: the founder gives outcomes ("fix this", "close this customer"), AI decomposes into tasks, assigns agents/humans, executes safe repetitive work, and escalates only exceptions/decisions/blockers. Menus are for inspection/audit/approval, not primary interaction.

**Status as of 2026-08-24**: the founder has since commissioned a full Next.js rewrite (`/web`, live at the URL in `MASTER_CONTEXT.md`) specifically to add real authentication, which this old app never had. The rewrite is now the primary path for new feature work; this old app stays deployed but in maintenance mode. The "recommended architecture / do-not-touch" guidance below was written *before* that decision and applies to this old app's own codebase only — it does not mean don't touch `/web`.

## Product philosophy (do not violate)

- **Chat first, AI first.** The AI Native Chat is the primary interface, not dashboards.
- **Human approval for risk.** Salary, payment, legal, contracts, external messaging, production, publishing, deletion, discounts, financing — all require human approval. This must be enforced server-side, never trusted from a prompt alone.
- **Database as source of truth.** Supabase/Postgres, not browser localStorage, is where production data should live.
- **Modular patch development.** Never regenerate the whole app for one feature. See Patch-only protocol below.
- **Token efficiency.** Deterministic code first, AI second. Don't call AI for counts, filters, threshold checks, or status transitions.
- **Automated QA, auditability, least privilege.** Every AI-driven write should be traceable and permission-scoped.

## Current architecture reality (as of the engineering audit, 2026-08-23)

The frontend and the Supabase backend are **largely disconnected**. Know this before assuming any code path is "live":

- The shipped app persists everything to browser `localStorage` (`js/core/store.js`, key `semBrain.v070.productionCore`). Almost every `js/modules/*.js` file reads/writes this directly — no repository/service boundary exists yet.
- `js/core/permissions.js` is **UI redaction only** — it strips fields before rendering, it is not a security boundary. RLS in Supabase is the only real enforcement layer, and most of the app doesn't use it yet.
- Three AI backends exist: `api/ai-command.js` (Vercel), `netlify/functions/ai-command.mjs` (Netlify), and `supabase/functions/sem-ai-command/index.ts` (Supabase Edge Function). The frontend calls the Vercel one by default (`settings.aiEndpoint`). Only the Supabase Edge Function does real RLS-scoped context retrieval and DB persistence — the other two are stateless OpenAI proxies.
- `js/ai/chatOpsOrchestrator.js` (the flagship AI Native Chat) is currently a **local deterministic template engine** — it does not call any AI backend. (Its missing `index.html` script include, which crashed the page, was fixed 2026-08-23.)

Full findings, verified against source, are in the audit that produced the current commit history — see `git log` for the detailed per-ticket commit messages (each follows the patch-only format below and explains what was found and why it was changed).

## Do-not-touch list

Until the core production loop (chat → work order → task → approval → completion → audit, all in Supabase) is proven stable, do not:
- Change `js/core/store.js`'s local-first data shape or remove the seeded demo data — needed for local dev.
- Redesign the chat-first UX paradigm or `index.html`/`main.js` navigation shell.
- Change `styles.css` / the liquid-glass visual design without being asked.
- Change the patch-only protocol process itself (only add tooling around it).
- Modify the RLS helper functions (`is_founder_or_admin`, `has_company_access`, `is_company_manager`, etc. in the Supabase migrations) — they're correctly implemented (`SECURITY DEFINER`, explicit `search_path`, no recursion risk). Only the *policies calling them* should change, not the functions.
- ~~Do a framework migration (React/Next.js) as a default move~~ — **superseded**: the founder explicitly requested and approved exactly this (see `MASTER_CONTEXT.md` and the `/web` directory). Left here so the history of the decision isn't lost, not as current guidance.

## Recommended architecture direction

Superseded by the Next.js rewrite (`/web`) for new work — see `MASTER_CONTEXT.md`. This old app's own vanilla-JS module pattern below is accurate for *this* codebase and worth knowing if you're doing maintenance here, but isn't the direction for new features anymore.

## Patch-only protocol

Every change must be a scoped patch, never a full regeneration. Full protocol: `docs/PATCH-ONLY-UPDATE-PROTOCOL.md`. Before editing, state: affected modules, affected DB tables, affected APIs, permission changes, migration required (y/n), tests required. After every change, report:

```
FILES CHANGED:
WHY:
TEST RESULTS:
SECURITY IMPACT:
TOKEN IMPACT:
DB MIGRATION: yes/no
ROLLBACK:
```

(See recent commits for the format in practice.)

## Key files

- `js/core/store.js` — local state (localStorage), still the primary data layer for most modules.
- `js/core/permissions.js` — UI-only role redaction, not a security boundary.
- `js/core/dataService.js` — hand-rolled Supabase REST client (no `@supabase/supabase-js` dependency yet); only used by `js/modules/productionCore.js`.
- `js/ai/chatOpsOrchestrator.js` — AI Native Chat engine (currently local-only, not AI-backed).
- `js/ai/pipeline.js` + `js/ai/aiBackendClient.js` — legacy command pipeline with a real `/api/ai-command` path, gated by `settings.aiMode`.
- `supabase/schema-v0.7-production-core.sql` — full bootstrap schema + RLS reference for a **fresh** project (already includes the 2026-08-23 hardening fixes).
- `supabase/migrations/` — applied migration history for an **existing** deployed project. Never edit an already-applied migration file in place; add a new one.
- `supabase/functions/sem-ai-command/index.ts` — the canonical, most-complete AI backend (auth-checked, RLS-scoped, DB-persisting).
- `tests/RLS-SMOKE-TEST.sql` — manual RLS verification runbook (not yet automated).
- `docs/PATCH-ONLY-UPDATE-PROTOCOL.md` — the full patch protocol this file summarizes.

## Environment / secrets

Never expose in frontend or repo: Postgres password, Supabase `service_role` key, OpenAI/Anthropic keys, Slack token, Google OAuth secret, Meta/Facebook access tokens. Browser-safe: Supabase project URL, Supabase anon/publishable key. See `.env.example` for the full list, including `AI_COMMAND_SHARED_SECRET` (stop-gap auth for the two non-Supabase AI endpoints — see its comment in `.env.example`).

## Verifying changes in this environment

No live Supabase project, no browser, and no Docker/psql are available by default in a Claude Code session here — verification is limited to `node --check` (syntax) and `npx -p typescript tsc --noEmit` (type-check the Edge Function; ignore the pre-existing Deno-global/remote-import errors, they're not real issues). Static frontend can be smoke-tested with a local static server. Anything requiring a real Supabase project or browser must be flagged as unverified in the commit's TEST RESULTS section, not silently assumed to work.
