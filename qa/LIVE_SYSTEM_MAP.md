# Live System Map

Last verified: 2026-08-27, via the chain in CLAUDE.md §1. Re-verify before trusting any
number here more than a few hours old — this file records a point-in-time snapshot, not
a live dashboard.

| Layer | Value | Verified by |
|---|---|---|
| GitHub repo | `Steppe-AI-Inc/brain-os`, default branch `master` | `gh repo view` |
| GitHub master SHA (last known) | `efe9cb8` | `git log origin/master` |
| Vercel project | `steppe-ai/brain-os` (the only project under `steppe-ai`) | `web/CLAUDE.md`, `vercel inspect` |
| Vercel production domain | `brain.open-spot.ai` | `vercel inspect` aliases |
| GitHub → Vercel link | Commit status check `Vercel` = `success`, `target_url` deployment ID matches the live production deployment | `gh api repos/.../commits/<sha>/status` cross-checked against `vercel inspect` |
| Supabase project ref | `pvphxgrtdfrudejjhzjk` | `web/.env.production.local` (`NEXT_PUBLIC_SUPABASE_URL`), matches every migration/query run against production |
| Edge Functions deployed | `sem-ai-command` (confirmed byte-identical to git HEAD via download+diff), `embed-text`, `analyze-financial-document`, `sem-artifact-analyze`, `generate-technical-drawing` (v2), `generate-onboarding-plan` | `supabase functions list` + `supabase functions download` + `git diff` |
| Edge Function deployment mechanism | **Manual CLI only** (`supabase functions deploy`) — see KNOWN_FAILURE_MODES.md #3 | GitHub Actions run history |
| Migrations | Applied via `supabase db push` (proper migration-history tracking; `supabase db query --file` was used earlier in the project and caused one duplicate-insert incident — now avoided) | `supabase_migrations.schema_migrations` |

## Not yet re-verified this pass

- `sem-artifact-analyze` and `generate-technical-drawing` (v2) — provenance/content not
  reviewed by this session. Unknown whether they match any tracked git source, since
  no `supabase/functions/sem-artifact-analyze` or similarly-named directory was found in
  the working tree at time of writing. **Flag: possible orphaned/undocumented function —
  investigate before next release.**
- Full persona × table RLS matrix (see SECURITY_MATRIX.md) — only 2 personas
  (founder, one non-manager test employee) have been used for real impersonation testing
  so far, not the full 11-persona list in CLAUDE.md §4.
