# Production Deployment Paths — Real Inventory

Written as part of the Phase 8 security incident response (2026-08-29), per the
founder's explicit requirement to document actual current behavior before touching CI/CD.
Every row below is confirmed against real evidence (workflow files, `gh api`/`gh run
list` output, `qa/KNOWN_FAILURE_MODES.md`, real command-line testing) — not assumed.

| Path | Trigger | What changes in production | Automatic? | Founder approval required today? | Rollback method | Agent authority |
|---|---|---|---|---|---|---|
| Vercel (`web/`) | `git push` to `master`, any file | The live Next.js app at `brain.open-spot.ai` | **Yes, fully automatic** | No — this has always been the accepted, low-risk deploy path for this project (`CLAUDE.md` treats `web/` deploys as reversible/low-stakes) | `vercel rollback` to a prior deployment, or revert the commit and push | Any agent with `git push` access effectively controls what's live on `web/` |
| Supabase Edge Functions | `git push` to `master` **that touches `supabase/functions/**`** | **All 6** deployed Edge Functions (`sem-ai-command`, `embed-text`, `analyze-financial-document`, `sem-artifact-analyze`, `generate-technical-drawing`, `generate-onboarding-plan`) — the workflow deploys everything under `supabase/functions/`, not just the changed file | **Yes, fully automatic**, via `.github/workflows/supabase-functions.yml` (fixed and verified working 2026-08-28, see `qa/KNOWN_FAILURE_MODES.md` #3) | **No today — this is the real gap this incident exposed.** `sem-ai-command` handles all real founder chat traffic; a push here has the same real-world consequence as a manual `supabase functions deploy`, but was not being treated with that level of caution before this incident. | Re-deploy a prior commit's Edge Function source (revert + push, which re-triggers the same workflow), or `supabase functions deploy <slug>` manually pointed at old source | **Any agent with `git push` access to `master` that happens to touch `supabase/functions/**` triggers a real production deploy, whether or not that was the intent of the push.** This is exactly what happened in this incident. |
| Supabase migrations (`supabase db push`) | Manual CLI invocation only | The live Postgres schema (tables, RLS, functions, triggers) | **No** — confirmed no GitHub Actions workflow or other automation runs `db push`; every real migration this session was applied via an explicit, human-authorized `supabase db push` command | Yes — this has been the standing, correctly-enforced rule all session (`CLAUDE.md` §22, every agent definition's own hard-stop clause) | Prepare and push a new migration reversing the change; there is no automatic "undo" | Agents are expected to never run `db push` without explicit founder authorization — held correctly throughout this entire session with one apparent exception now under separate investigation (see `PHASE_8_SECURITY_INCIDENT.md` §"How the migration went live") |
| `supabase db query --file` against `--linked` production | Manual CLI invocation | Whatever SQL the file contains — intended for rollback-tested verification (`BEGIN; ...; ROLLBACK;`), **not** intended as a deploy mechanism | No | N/A (not a deploy path when used correctly) | N/A | **Real risk, not just theoretical**: this project's own `qa/LIVE_SYSTEM_MAP.md` and `qa/PRODUCTION_CHECKLIST.md` already documented, from *before* this session, "`db query --file` was used earlier in the project and caused one duplicate-insert incident — now avoided in favor of `db push`" for actually *applying* migrations. This session used it extensively for rollback-tested *verification* (always ending in `ROLLBACK`) and separately verified, every time, that state was untouched afterward — except once, during this incident, where the exact command combined `--linked` **and** `--project-ref <ref>` together (a flag combination not used anywhere else this session), and the migration ended up live despite the script itself correctly ending in `ROLLBACK`. See the incident doc for the full evidence trail. |
| Any other CI/CD | — | — | No other GitHub Actions workflows exist in this repo (`.github/workflows/` contains only `supabase-functions.yml`) | — | — | — |

## The real lesson (item 7 of the incident response)

`git push origin master` is not a uniformly low-risk action in this repository. Its real
consequence depends entirely on **which files changed**:

```text
git push master, touching only web/**              -> low-risk, accepted practice
git push master, touching supabase/functions/**     -> PRODUCTION-AFFECTING (auto-deploys
                                                        live Edge Functions)
git push master, touching supabase/migrations/**    -> safe by itself (migrations are
                                                        never auto-applied) — but the
                                                        `db query --file` verification
                                                        step around it needs the specific
                                                        safe invocation documented below
```

**Binding rule going forward, for this session and any future one working in this
repo**: before pushing any commit that touches `supabase/functions/**`, treat it with
the same deployment-safety rigor as a DB migration — prepare, verify locally as much as
possible, get independent review for anything non-trivial, and flag to the founder
explicitly that the push is itself the production deploy (not a separate, later step)
before pushing.

**Not left as a "remember to check" rule** — a purely-documented rule already failed
once (this session *knew* the workflow existed and still pushed without checking, the
exact failure mode `PHASE_8_SECURITY_INCIDENT.md` records). A real, structural
safeguard now exists instead: `.githooks/pre-push` blocks any push whose diff touches
`supabase/functions/**` unless `ALLOW_FUNCTIONS_DEPLOY=1` is explicitly set, and is
active for this working directory (`git config core.hooksPath .githooks`, already run).
**One-time setup required in any other clone/worktree of this repo**: run
`git config core.hooksPath .githooks` once — hooks are not tracked/activated by `git
clone` alone.

**Binding rule for `db query --file` against `--linked` production, going forward**:
use `--linked` alone, never combined with `--project-ref <ref>` in the same invocation
— every rollback-tested verification this session that used `--linked` alone was
independently confirmed safe (real "production untouched" checks passed every time);
the one exception that left real state live combined both flags. Until the CLI's exact
internal handling of that combination is understood with certainty, treat it as unsafe
for anything that isn't meant to actually apply.
