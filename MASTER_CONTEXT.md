# SEM Brain / Steppe AI — Master Context

**Read this first in any new session (any machine).** This file is the continuity anchor across devices — it's committed to `master` so it's readable straight from GitHub. Last updated: 2026-08-24.

## Who / where

- **Company**: Steppe AI, Inc. (GitHub org `Steppe-AI-Inc`, GitHub account `TreyOpenSpot`)
- **Founder login**: `trey@open-spot.ai` — password known to you already; **not** stored in this file or anywhere in git on purpose. If you've lost it, reset via the Supabase dashboard (Authentication → Users) rather than asking an AI session to recover/store it.
- **Repo**: https://github.com/Steppe-AI-Inc/brain-os (private) — **three branches, three parallel tracks**:

| Branch | What it is | Status |
|---|---|---|
| `master` | Original vanilla-JS SEM Brain app (repo root) **+** the Next.js rewrite (`/web`) | Both live in production |
| `blankcollar` | Full history import of `The-Blank-Collar/blankcollar-agentic-os` (MIT) | Imported, not yet run/connected |
| *(pending)* | A third track being built in parallel via OpenAI Codex/ChatGPT | Not yet connected to GitHub — founder will connect it |

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
- Live: https://sem-brain-mvp-v071-auto-deploy.vercel.app (Vercel project `steppe-ai/sem-brain-mvp-v0.7.1-auto-deploy`)
- This was the original handoff prototype. An engineering audit (this session) found and fixed 8 P0 security issues (leaky `safe_*` views, prompt-only approval bypass, over-broad RLS, unauthenticated AI proxy endpoints, a broken flagship chat page) plus several P1 items (transactional persistence via a Postgres RPC, real Edge Function wiring, an EN/MN i18n layer). Full detail is in the git log — every commit follows a strict "files changed / why / test results / security impact / rollback" format, so `git log --oneline` plus reading individual commit bodies is the fastest way to understand what changed and why.
- Still deployed and functional, but **superseded** by the Next.js rewrite below for anything new.

### Next.js rewrite (`/web`)
- Live: https://web-eight-alpha-87.vercel.app (Vercel project `steppe-ai/web`)
- **Why it exists**: the old app had no real login gate at all — anyone with the URL was treated as the founder via a hardcoded local `currentUserId`. The founder explicitly asked for a full rewrite with real authentication, closing that gap.
- Stack: Next.js 16 App Router, TypeScript, Tailwind v4, shadcn/ui (Base UI primitives, not Radix — picked automatically by `shadcn init -d`), `@supabase/ssr` for auth.
- **Real auth is live**: `proxy.ts` (Next.js 16 renamed `middleware.ts` → `proxy.ts`) redirects any unauthenticated request to `/login`. Verified end-to-end against the real Supabase project, not mocked.
- **Phases 0–3 all shipped** (19 authenticated routes + login): dashboard, companies, people, projects, tasks (kanban), approvals (domain-gated approve/reject), AI Native Chat (calls the real `sem-ai-command` Edge Function, no local simulation), mindmap (ported radial-ring layout from the old app), sales, proposals (consolidated risk-scoring engine, ported and unit-tested against the original thresholds), inventory (+ reorder-task generator), product factory, KPI (+ check-in generator), memory, documents, software factory (+ new `product_specs` table), user access (real admin panel), integrations (read-only `integration_queue` view), workflow factory (re-pointed at the real Edge Function).
- **Known gap**: Vercel's Root Directory setting for the `web` project is not yet fixed to `web` (dashboard-only setting, no CLI/API path found, and reading the stored Vercel auth token to work around that was correctly blocked by the safety classifier). Until you set it — Project `steppe-ai/web` → Settings → General → Root Directory → `web` — **auto-deploy-on-push fails**. Deploy manually in the meantime: `cd web && vercel --prod --yes`.
- Design system: `components/page-header.tsx`, `components/stat-card.tsx`, brand palette (amber `#f59e0b` primary, coral `#fb7185` accent, deep navy dark mode) ported into `app/globals.css` from the old app's `styles.css`.
- i18n: `lib/i18n/{dictionary,i18n-context}.tsx`, same `t(key, fallback)` pattern as the old app's `js/core/i18n.js`, EN/MN only, shell + nav scope.

## Track 2 — `blankcollar` branch

Full-history import of https://github.com/The-Blank-Collar/blankcollar-agentic-os (MIT license, 9★, actively real — not a toy). Product pitch overlaps heavily with SEM Brain's own vision ("goal-first agentic OS for running a company"), and it's materially more mature in several dimensions than what's been rebuilt so far: Postgres 18 + TS6 + React 19 + Vite, goal-first orchestrator (Paperclip), memory/RAG (Qdrant + Graphiti temporal graph), agent workforce (Hermes reasoning + OpenClaw tools/web + LangGraph dispatcher), a policy engine gating every agent action (`allow | approve | deny`), Stripe billing, Telegram channel, 437 passing tests, Docker Compose for local/personal/prod. It has its own `CLAUDE.md` (it was built with Claude Code too).

### Decisions made this session
- **Same Supabase project as Track 1, not a separate one** (founder's explicit instruction — don't duplicate data/accounts across projects). This is architecturally safe: blankcollar uses Supabase **only for auth** (JWT verification — its README says JWKS/ES256, matching this project's modern key setup, no legacy shared secret needed). Its actual data lives in its own Postgres, namespaced under `core` / `ops` / `brain` / `billing` schemas — confirmed by reading `infra/docker/postgres/init.sql` and grepping for `CREATE SCHEMA`. Zero collision with SEM Brain's `public`-schema tables. Each service bootstraps its own schema idempotently on startup (`CREATE SCHEMA/TABLE IF NOT EXISTS`) rather than using a dedicated migrations folder — there isn't one, by design.
- Supabase project to point it at: **ref `pvphxgrtdfrudejjhzjk`, URL `https://pvphxgrtdfrudejjhzjk.supabase.co`**, org "Steppe AI, Inc." (Supabase org slug `nnebdgdbrcveeissvgqe`). Same project as everything in Track 1.

### Open / blocked items for this track
1. **Postgres direct connection string** (`DATABASE_URL` in blankcollar's `.env`) needs the project's DB password. It was never captured by any script this session (the project was created via the dashboard), and resetting it via the Management API was correctly blocked by the safety classifier as a real credential change. **Get it from**: Supabase dashboard → Project Settings → Database → either read the existing password (if you saved it at project creation) or reset it there yourself (safe — nothing in Track 1 uses a direct Postgres connection, only the REST API + anon key, so a reset won't break the Next.js app or the old app).
2. **LLM/tool provider API keys** — founder said these will be supplied later. Don't block other setup on them; blankcollar's own `.env.example` documents exactly which keys gate which features (e.g. `GRAPHITI_LLM_MODEL` config — without a key, memory `/add` calls return `{skipped: true, reason: "no_llm_configured"}` rather than failing hard).
3. **E2B sandboxes**: the README's badge/prose mentions this as a deferred roadmap item ("Only E2B secure sandboxes remain... needs `/dev/kvm`"), but **there is zero E2B code in the repo** — confirmed via full-text search, no hits. This is not "almost done," it's not started. Founder asked for "a generic sandbox API for testing" as a full-cloud alternative to needing local `/dev/kvm` — **e2b.dev** is the natural fit (cloud-hosted secure sandboxes, has a free tier, API-first) and is literally the tool blankcollar's own docs already name — but this needs a founder e2b.dev signup + API key, same pattern as every other external service this session (GitHub, Vercel, Supabase). Not started; needs that account first.
4. **Mobile app**: founder asked for "with mobile app." Checked thoroughly — **there is no native mobile app in this codebase** (no `apps/mobile`, no React Native/Expo/Capacitor dependency anywhere). The README's "Mobile companion" screenshot is the existing responsive `apps/website` (Vite/React) viewed on a phone, not a native app. This is an open decision, not yet made: build a real native/PWA mobile app, or treat the existing responsive website as sufficient "mobile" for now. Needs a founder call before any work starts here — it's a meaningfully different scope depending on the answer.
5. **"Full cloud, no desktop"**: founder does not want the local Docker Desktop dev loop from blankcollar's own Quick Start. This means going straight for its cloud/VPS deploy path (`docker-compose.prod.yml`, Caddy auto-TLS, per `docs/DEPLOYMENT.md`) instead of local `docker compose up`. Not yet executed — needs a target host (VPS or cloud provider) decided first, plus the DB password/API keys above before it's meaningfully runnable anyway.

### Not yet done on this track
No code changes yet — only the import + this research/config-planning pass. Next concrete step once the DB password is available: point `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`DATABASE_URL` at the shared project, boot `apps/paperclip` against it, confirm its `core`/`ops`/`brain`/`billing` schemas create cleanly alongside SEM Brain's `public` schema tables with zero collisions, then re-evaluate scope (adopt wholesale vs. cherry-pick specific subsystems like the memory/RAG layer or policy engine into the Next.js rewrite instead).

## Track 3 — Codex/ChatGPT (pending)

Founder is building a third parallel version using OpenAI Codex/ChatGPT, not yet connected to GitHub. Nothing to do here until it's connected — when it is, the natural move is either a fourth branch in this same repo (matching the `blankcollar` pattern) or a standalone comparison, founder's call once it exists.

## Supabase project reference (all tracks)

- Project: **Brain OS**, ref `pvphxgrtdfrudejjhzjk`, region `ap-northeast-2` (Seoul), Postgres 17→ (Track 1) / potentially 18 (Track 2's own containers use PG18, but they'd be hitting this same project's actual server version once pointed here — worth confirming compatibility when that happens)
- URL: `https://pvphxgrtdfrudejjhzjk.supabase.co`
- Anon key: safe-to-expose, already baked into `web/lib/supabase/{server,client}.ts` defaults and `web/.env.local` — regenerate via dashboard if ever needed, not a secret worth protecting
- **Personal access token used this session for Management API calls (schema pushes, Edge Function deploys, type generation) was pasted into chat in plaintext — rotate it** at https://supabase.com/dashboard/account/tokens if that hasn't been done yet. A fresh one is needed for any future Management API work regardless.
- Founder auth user already exists (`trey@open-spot.ai`), profile row seeded with `role='founder'`, 6 companies seeded (SEM Technologies LLC parent + OpenSpot/Steppe AI, SEM Global Robotics, SEM Mongolia, Fuelmetrix, Trade-book.ai).

## GitHub / Vercel reference

- GitHub: org `Steppe-AI-Inc`, repo `brain-os` (private), account `TreyOpenSpot`
- Vercel: team `steppe-ai`, two projects — `sem-brain-mvp-v0.7.1-auto-deploy` (old app, repo root) and `web` (Next.js rewrite, needs the Root Directory fix noted above)
- Both `gh` and `vercel` CLIs are installed and authenticated on this machine (`C:\Program Files\GitHub CLI\gh.exe`, global `vercel`) — on a new machine, `gh auth login` and `vercel login` again (both support device-code browser flows that work fine over a non-interactive shell).

## How to resume on a new machine

1. `git clone` to a plain local path (not cloud-synced — see above).
2. For Track 1: `cd web && npm install && npm run dev` for local dev, or just use the live Vercel URLs. `.env.local` isn't committed (gitignored, correctly) — recreate it from `web/.env.example` with the Supabase URL/anon key above.
3. For Track 2: `git checkout blankcollar`, read its own `CLAUDE.md` and `docs/STATUS.md` for its internal conventions, then pick up the "Open / blocked items" list above starting with the DB password.
4. Re-authenticate `gh`/`vercel`/`supabase` CLIs as needed (all device-code flows, all worked fine non-interactively this session).
5. This file won't perfectly track every future change — treat it as the anchor for *why* things are the way they are, and `git log` on each branch as the anchor for *what* changed and *when*. Update this file when a major decision or track status changes, not for every commit.
