# SEM Brain / Steppe AI — Master Context

**Read this first in any new session (any machine).** This file is the continuity anchor across devices — it's committed to `master` so it's readable straight from GitHub. Last updated: 2026-08-24 (**`/web` is now the confirmed base foundation** — the founder compared it directly against the old app in production and explicitly designated it: "much better version than a original master... i want this become the base foundation now." The `codex/sem-brain-v1` branch was fast-forwarded to match `master` so it starts from this same foundation rather than a stale earlier snapshot. Track 1 detail: Goals module + Organization Board + Apple-style redesign shipped, DB migration applied and verified live, deployed to Vercel, `brain.open-spot.ai` bound at the project level to `web`, two real bugs the founder caught in Chrome — broken font fallback, forced dark mode — fixed and redeployed. Git auto-deploy is disconnected for the `web` project until Root Directory is fixed; deploy manually. Track 2 pivoted from the Hostinger VPS plan to serverless — Vercel + the shared Supabase project; Slice 1 code is written, tested locally, committed, and pushed, but **not yet deployed** — see "Deployment plan — serverless" below for exactly what's left and who does it).

## Who / where

- **Company**: Steppe AI, Inc. (GitHub org `Steppe-AI-Inc`, GitHub account `TreyOpenSpot`)
- **Founder login**: `trey@open-spot.ai` — password known to you already; **not** stored in this file or anywhere in git on purpose. If you've lost it, reset via the Supabase dashboard (Authentication → Users) rather than asking an AI session to recover/store it.
- **Repo**: https://github.com/Steppe-AI-Inc/brain-os (private) — **three branches, three parallel tracks**:

| Branch | What it is | Status |
|---|---|---|
| `master` | Original vanilla-JS SEM Brain app (repo root, now legacy) **+** the Next.js rewrite (`/web`) | `/web` is **the base foundation** as of 2026-08-24 (founder's explicit call); old app stays deployed for continuity only |
| `blankcollar` | Full history import of `The-Blank-Collar/blankcollar-agentic-os` (MIT) | Slice 1 (serverless Telegram→Hermes→gbrain) code done + pushed; not yet deployed |
| `codex/sem-brain-v1` | Third track (OpenAI Codex/ChatGPT), now connected to GitHub | Fast-forwarded to match `master` 2026-08-24 (had zero unique commits of its own — was a stale snapshot from before the Goals/redesign work) |

**Important — local dev location**: don't clone/work inside a Google Drive– or OneDrive–synced folder. This session started in `E:\My Drive\...` and hit real, reproducible corruption: `npm install` failed repeatedly with `EPERM`/`ENOTEMPTY` errors because Drive's sync client holds file locks during `node_modules` churn, and the same class of risk applies to a live `.git` directory. All work was relocated to a local, non-synced path (`C:\Users\Dell\dev\brain-os` on this machine). **On a new machine, clone fresh to a plain local path** (e.g. `~/dev/brain-os` or `C:\dev\brain-os`), not into a cloud-sync folder.

```bash
git clone https://github.com/Steppe-AI-Inc/brain-os.git
cd brain-os
git checkout master        # old app + Next.js rewrite
git checkout blankcollar    # the Blank Collar import
```

Git identity on this machine is set to `Trey OpenSpot <info@evqparking.com>` globally — reconfigure on a new machine if you want commits attributed the same way (`git config --global user.name/user.email`).

## Track 1 — `master`: old vanilla-JS app + Next.js rewrite

### Old app (repo root: `index.html`, `js/`, `api/`, `netlify/`)
- Live: https://sem-brain-mvp-v071-auto-deploy.vercel.app (Vercel project `steppe-ai/sem-brain-mvp-v0.7.1-auto-deploy`) — **no longer on the `brain.open-spot.ai` custom domain**, see below.
- This was the original handoff prototype. An engineering audit (this session) found and fixed 8 P0 security issues (leaky `safe_*` views, prompt-only approval bypass, over-broad RLS, unauthenticated AI proxy endpoints, a broken flagship chat page) plus several P1 items (transactional persistence via a Postgres RPC, real Edge Function wiring, an EN/MN i18n layer). Full detail is in the git log — every commit follows a strict "files changed / why / test results / security impact / rollback" format, so `git log --oneline` plus reading individual commit bodies is the fastest way to understand what changed and why.
- Still deployed and functional, but **superseded** by the Next.js rewrite below for anything new.

### Next.js rewrite (`/web`)
- Live: **https://brain.open-spot.ai** (custom domain, repointed here 2026-08-24) and https://web-eight-alpha-87.vercel.app (Vercel project `steppe-ai/web`) — both serve the same deployment.
- **Why it exists**: the old app had no real login gate at all — anyone with the URL was treated as the founder via a hardcoded local `currentUserId`. The founder explicitly asked for a full rewrite with real authentication, closing that gap.
- Stack: Next.js 16 App Router, TypeScript, Tailwind v4, shadcn/ui (Base UI primitives, not Radix — picked automatically by `shadcn init -d`), `@supabase/ssr` for auth.
- **Real auth is live**: `proxy.ts` (Next.js 16 renamed `middleware.ts` → `proxy.ts`) redirects any unauthenticated request to `/login`. Verified end-to-end against the real Supabase project, not mocked.
- **Phases 0–3 all shipped** (19 authenticated routes + login): dashboard, companies, people, projects, tasks (kanban), approvals (domain-gated approve/reject), AI Native Chat (calls the real `sem-ai-command` Edge Function, no local simulation), mindmap (ported radial-ring layout from the old app), sales, proposals (consolidated risk-scoring engine, ported and unit-tested against the original thresholds), inventory (+ reorder-task generator), product factory, KPI (+ check-in generator), memory, documents, software factory (+ new `product_specs` table), user access (real admin panel), integrations (read-only `integration_queue` view), workflow factory (re-pointed at the real Edge Function).
- **Known gap (still open) — Git auto-deploy is now DISCONNECTED for this project**: Vercel's Root Directory setting for the `web` project is not yet fixed to `web` (dashboard-only setting, no CLI/API path found). This was silently breaking things: every push to `master` triggered a broken auto-deploy (wrong root, no Next.js app found) that became the project's "latest production deployment," which in turn made `vercel domains add` refuse to (re)assign `brain.open-spot.ai` to this project — the exact bug the founder hit ("brain.open-spot.ai is an old master version"). Fixed by running `vercel git disconnect` (from `/web`, confirmed working) — pushes to GitHub no longer trigger any deploy for this project until you either fix Root Directory and re-run `vercel git connect`, or keep deploying manually. **Deploy manually**: `cd web && vercel link --project web --yes && vercel --prod --yes` (confirmed working from a fresh clone). The custom domain is now bound at the **project** level (via `vercel domains add brain.open-spot.ai web --force`, not a fragile one-off `vercel alias set`) — it automatically follows whatever the `web` project's latest successful production deploy is, so a plain `vercel --prod --yes` from `/web` is now sufficient to update what `brain.open-spot.ai` serves; no separate alias step needed.
- **2026-08-24 — Goals module + Organization Board + Apple-style redesign** (commit `8531b20`): the founder asked to copy blankcollar.ai's Goals/Board/Dashboard UX (three research agents audited its actual `apps/website` source, a Vite+React SPA — this was a re-implementation in `/web`'s own idioms, not a code lift) into this app rather than developing on the `blankcollar` branch directly. Shipped: `/goals` (list + capture-first composer + detail page with key results/goal-context/per-kind actions), `/board` (drag-and-drop Kanban over goal status), `/departments` (new real concept, nested under companies — the founder's explicit choice over reusing companies-as-departments), and a rewritten `/dashboard` (attention feed, active goals, live agents panel, company-brain links). Design system replaced: the amber/coral gradient-blur palette is gone, replaced with a calm Apple.com-style look (Apple's own system blue/green/orange/purple/gray, near-white/near-black grounds, flat surfaces — no blur/gradient, no zero-radius brutalism either) per the founder's explicit "i do not want that users fear us and got overwhelmed" direction.
  - **DB migration applied and live** (commit `f082917`): `202608250001_goals_departments.sql` is now applied to the shared Supabase project (`pvphxgrtdfrudejjhzjk`) — verified via direct SQL query (all 4 tables, all 10 RLS policies, both enums, RLS-enabled all confirmed present). `web/types/database.ts` was regenerated for real via `supabase gen types typescript` — the previous commit's hand-written types matched the live schema exactly, no fixes needed.
  - **Founder checked it in Chrome 2026-08-24 and found two real bugs, both fixed** (commit `5f4609f`): (1) `globals.css` had `--font-sans: var(--font-sans)` — a circular self-reference that never resolves, silently falling back to the browser default serif font (rendered as Times New Roman) instead of the Geist Sans `layout.tsx` actually loads. Pre-existing bug, not introduced by the redesign — this session was the first real visual QA the app has ever gotten. Fixed to point at `--font-geist-sans`. (2) `layout.tsx` hardcoded a `dark` class on `<html>`, forcing pure-black dark mode always — directly undermining the calm/light Apple-style intent. Removed; light is now the actual default. Both fixes deployed and the domain move above happened in the same pass. **Still not visually re-verified** — no browser in this Claude Code session; check `brain.open-spot.ai` yourself again.
- Design system: `components/page-header.tsx`, `components/stat-card.tsx`; palette lives in `app/globals.css` (Apple-inspired as of 2026-08-24, see above — supersedes the earlier amber/coral "liquid glass" description that used to be here).
- i18n: `lib/i18n/{dictionary,i18n-context}.tsx`, same `t(key, fallback)` pattern as the old app's `js/core/i18n.js`, EN/MN only, shell + nav scope. Not yet extended to the new Goals/Board/Departments pages.

## Track 2 — `blankcollar` branch

Full-history import of https://github.com/The-Blank-Collar/blankcollar-agentic-os (MIT license, 9★, actively real — not a toy). Product pitch overlaps heavily with SEM Brain's own vision ("goal-first agentic OS for running a company"), and it's materially more mature in several dimensions than what's been rebuilt so far: Postgres 18 + TS6 + React 19 + Vite, goal-first orchestrator (Paperclip), memory/RAG (Qdrant + Graphiti temporal graph), agent workforce (Hermes reasoning + OpenClaw tools/web + LangGraph dispatcher), a policy engine gating every agent action (`allow | approve | deny`), Stripe billing, Telegram channel, 437 passing tests, Docker Compose for local/personal/prod. It has its own `CLAUDE.md` (it was built with Claude Code too).

### Decisions made this session
- **Same Supabase project as Track 1, not a separate one** (founder's explicit instruction — don't duplicate data/accounts across projects). This is architecturally safe: blankcollar uses Supabase **only for auth** (JWT verification — its README says JWKS/ES256, matching this project's modern key setup, no legacy shared secret needed). Its actual data lives in its own Postgres, namespaced under `core` / `ops` / `brain` / `billing` schemas — confirmed by reading `infra/docker/postgres/init.sql` and grepping for `CREATE SCHEMA`. Zero collision with SEM Brain's `public`-schema tables. Each service bootstraps its own schema idempotently on startup (`CREATE SCHEMA/TABLE IF NOT EXISTS`) rather than using a dedicated migrations folder — there isn't one, by design.
- Supabase project to point it at: **ref `pvphxgrtdfrudejjhzjk`, URL `https://pvphxgrtdfrudejjhzjk.supabase.co`**, org "Steppe AI, Inc." (Supabase org slug `nnebdgdbrcveeissvgqe`). Same project as everything in Track 1.

### Open / blocked items for this track
1. **LLM/tool provider API keys** — founder said these will be supplied later. Don't block other setup on them; blankcollar's own `.env.example` documents exactly which keys gate which features (e.g. `GRAPHITI_LLM_MODEL` config — without a key, memory `/add` calls return `{skipped: true, reason: "no_llm_configured"}` rather than failing hard). Hermes needs `PORTKEY_API_KEY` + `PORTKEY_VIRTUAL_KEY_ANTHROPIC` to give real replies instead of the deterministic FakeLLM stub.
2. **E2B sandboxes, OpenClaw, Slack/Messenger**: explicitly out of scope for now. Founder said "exclude openclaw part... no need for openclaw" and to focus on Telegram (Slack/Facebook Messenger are allowed later, but neither exists in the codebase yet — only Telegram's webhook is implemented; a Slack/Messenger channel would follow the same pattern as `apps/paperclip/src/routes/webhooks.ts`'s Telegram handler). E2B was never started (zero code in the repo) and isn't needed for the Slice 1 path either.
3. **Mobile app — RESOLVED, no native app needed**: Telegram is the frontend (send a message, get a reply) — no native/PWA build.
4. **"Full cloud, no VPS" — RESOLVED, this is now the plan**: founder reversed the just-agreed Hostinger VPS plan (*"integrate to our already working infrastructure, and rewrite the code for cloud, not vps. i dont want to manage vps"*) in favor of the same serverless stack already proven for Track 1: Vercel Functions + Vercel Cron + the shared Supabase project. See the deployment plan below.

### Deployment plan — serverless (Vercel + Supabase, current)

Three parallel research agents audited blankcollar's actual source (not just its docs) before any redesign — full findings are in the `blankcollar` branch's commit `a45757d`'s message, but the short version: the real blocker in Hermes/OpenClaw/LangGraph wasn't "serverless is hard," it was one specific anti-pattern — a `POST /run` (202) + in-memory run registry + `GET /run/{id}` poll loop, which breaks across stateless/ephemeral function instances. Every real Hermes call is bounded (one recall + one LLM completion + one remember), so the fix was converting the contract to synchronous request/response, not building infrastructure to fake statefulness. Paperclip's queue worker/scheduler used `setTimeout` tick loops for a different but related reason (those don't survive between invocations at all) — replaced with a Cron-triggered drain endpoint. gbrain's Qdrant dependency (the one real stateful-service blocker) was swapped for Supabase pgvector, since gbrain's actual usage (single dense vector, plain filters) maps to it directly.

**Rollout order (founder-approved, smallest working slice first)**: Slice 1 = Telegram → Hermes → gbrain, no OpenClaw/LangGraph/Graphiti. **Slice 1's code is done, locally tested, committed, and pushed to `blankcollar` (commit `a45757d`) — but nothing has been deployed yet.** What's left, split by who does it:

**Claude Code can do once the founder provides the inputs below** — this is genuinely the remaining work, not busywork:
1. Apply the schema migration to the shared Supabase project (`pvphxgrtdfrudejjhzjk`) — adds `brain.memory.embedding` (pgvector) + an HNSW index, drops the now-unused `vector_ref` column, everything else is additive/idempotent. Two ways, either works:
   - `cd apps/paperclip && DATABASE_URL=<pooled connection string> npm run migrate`, or
   - paste `apps/paperclip/src/bootstrap.ts`'s `ADDITIVE_MIGRATIONS` array (now exported) into the Supabase SQL editor.
   *(This session tried to run it directly via the Management API and was correctly blocked by the safety classifier as a live credential-bearing/schema-changing action — it needs to happen from a session where you're present, or you can just run the SQL yourself.)*
2. Create 3 new Vercel projects in the same `steppe-ai` team, same GitHub repo, different Root Directories — same pattern already proven for Track 1's `/web` project:
   - `apps/hermes` (Python/FastAPI, `vercel.json` already configures the catch-all rewrite + `maxDuration: 60`)
   - `packages/gbrain` (Python/FastAPI, same pattern, `maxDuration: 30`)
   - `apps/paperclip` (Node/Fastify, `buildCommand: npm run build`, `maxDuration: 60`, declares the `worker-tick` Cron job)
3. Set env vars per project (values the founder supplies — see list below), then deploy each (`vercel --prod` from that directory, or connect the GitHub integration with the Root Directory set).
4. Register the Telegram webhook against paperclip's deployed URL and send a real message to confirm the full loop (Telegram → capture/goal/run rows → Cron drains the queue → Hermes replies → message lands back in Telegram).

**Founder must do (accounts/secrets — can't be done by an AI session):**
1. Create a Telegram bot via **@BotFather** (`/newbot`), save the token. Pick a random `TELEGRAM_WEBHOOK_SECRET` (`openssl rand -hex 32`).
2. Get a Portkey API key + an Anthropic virtual key (`PORTKEY_API_KEY`, `PORTKEY_VIRTUAL_KEY_ANTHROPIC`) — without these Hermes replies with a deterministic FakeLLM stub, not real Claude.
3. Get an OpenAI API key for `text-embedding-3-small` (`OPENAI_API_KEY` in gbrain's env) — without it, gbrain falls back to a deterministic fake embedder and recall quality is meaningless (still runs, just not usefully).
4. Get the shared Supabase project's **pooled** (Supavisor, transaction-mode) connection string — Project Settings → Database → Connection pooling — for `DATABASE_URL` on both `paperclip` and `gbrain`. (Not the direct connection string — serverless functions need the pooler.)
5. Generate a `CRON_SECRET` (`openssl rand -hex 32`) and set it on the `paperclip` Vercel project — Vercel automatically sends it as the Cron job's bearer token once the env var exists, no extra wiring.
6. Env vars to set per project (see `.env.example` for the full annotated list):
   - **hermes**: `PORTKEY_API_KEY`, `PORTKEY_VIRTUAL_KEY_ANTHROPIC`, `GBRAIN_URL` (the gbrain Vercel project's URL)
   - **gbrain**: `DATABASE_URL` (pooled), `OPENAI_API_KEY`
   - **paperclip**: `DATABASE_URL` (pooled), `PORTKEY_API_KEY`, `PORTKEY_VIRTUAL_KEY_ANTHROPIC`, `HERMES_URL` (hermes's Vercel URL), `GBRAIN_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `CRON_SECRET`, `PAPERCLIP_SKIP_BOOT_TASKS=true`, `PAPERCLIP_WORKER_ENABLED=false`, `PAPERCLIP_SCHEDULER_ENABLED=false`
7. **Cron frequency caveat**: `apps/paperclip/vercel.json` declares the worker-tick Cron at once-per-minute. Vercel's **Hobby plan only allows daily-granularity Cron** — if the project is on Hobby, either upgrade to Pro, or point a free external pinger (e.g. cron-job.org) at `GET https://<paperclip-url>/api/cron/worker-tick` with header `Authorization: Bearer <CRON_SECRET>` every minute instead.

**Deferred to a later slice (not needed for "Telegram bot replies"):** OpenClaw (needs Browserbase for its `web.browse` skill — founder's choice, not yet signed up), LangGraph (only matters once OpenClaw is back in the picture), Graphiti (needs Neo4j Aura), Paperclip's other 39 REST routes / Stripe billing / dashboard (not exercised by the Telegram path at all).

## Track 3 — Codex/ChatGPT (pending)

Founder is building a third parallel version using OpenAI Codex/ChatGPT, not yet connected to GitHub. Nothing to do here until it's connected — when it is, the natural move is either a fourth branch in this same repo (matching the `blankcollar` pattern) or a standalone comparison, founder's call once it exists.

## Supabase project reference (all tracks)

- Project: **Brain OS**, ref `pvphxgrtdfrudejjhzjk`, region `ap-northeast-2` (Seoul), Postgres 17→ (Track 1) / potentially 18 (Track 2's own containers use PG18, but they'd be hitting this same project's actual server version once pointed here — worth confirming compatibility when that happens)
- URL: `https://pvphxgrtdfrudejjhzjk.supabase.co`
- Anon key: safe-to-expose, already baked into `web/lib/supabase/{server,client}.ts` defaults and `web/.env.local` — regenerate via dashboard if ever needed, not a secret worth protecting
- **Personal access token used for Management API calls (schema pushes, Edge Function deploys, type generation) was pasted into chat in plaintext — rotate it** at https://supabase.com/dashboard/account/tokens if that hasn't been done yet. Still confirmed live/working as of the 2026-08-24 Goals migration (reused successfully, not re-pasted) — rotating it doesn't require re-doing any of that work, just swapping the token for future sessions.
- Founder auth user already exists (`trey@open-spot.ai`), profile row seeded with `role='founder'`, 6 companies seeded (SEM Technologies LLC parent + OpenSpot/Steppe AI, SEM Global Robotics, SEM Mongolia, Fuelmetrix, Trade-book.ai).

## GitHub / Vercel reference

- GitHub: org `Steppe-AI-Inc`, repo `brain-os` (private), account `TreyOpenSpot`
- Vercel: team `steppe-ai`, two projects — `sem-brain-mvp-v0.7.1-auto-deploy` (old app, repo root) and `web` (Next.js rewrite, needs the Root Directory fix noted above; git auto-deploy is currently disconnected — see Track 1 notes). `brain.open-spot.ai` is bound to `web` at the project level as of 2026-08-24 — `vercel alias ls` is the fastest way to check current domain→deployment mapping if this is ever in doubt.
- Both `gh` and `vercel` CLIs are installed and authenticated on this machine (`C:\Program Files\GitHub CLI\gh.exe`, global `vercel`) — on a new machine, `gh auth login` and `vercel login` again (both support device-code browser flows that work fine over a non-interactive shell).

## How to resume on a new machine

1. `git clone` to a plain local path (not cloud-synced — see above).
2. For Track 1: `cd web && npm install && npm run dev` for local dev, or just use the live Vercel URLs. `.env.local` isn't committed (gitignored, correctly) — recreate it from `web/.env.example` with the Supabase URL/anon key above.
3. For Track 2: `git checkout blankcollar`, read its own `CLAUDE.md` and `docs/STATUS.md` for its internal conventions, then pick up the serverless deployment plan above — Slice 1's code is done (commit `a45757d`), what's left is applying the DB migration and standing up the 3 Vercel projects with real secrets.
4. Re-authenticate `gh`/`vercel`/`supabase` CLIs as needed (all device-code flows, all worked fine non-interactively this session).
5. This file won't perfectly track every future change — treat it as the anchor for *why* things are the way they are, and `git log` on each branch as the anchor for *what* changed and *when*. Update this file when a major decision or track status changes, not for every commit.
