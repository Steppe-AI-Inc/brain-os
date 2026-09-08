# Live System Map — how to query it

This file used to hold a point-in-time snapshot of SHAs, deployment IDs and function
versions. Snapshots are never truth (`governance/OPERATING_TRUTH_MODEL.md` §1), and the
old table drifted the same day it was written. It now records only the *stable
identifiers* and the *commands* that return the live value. Query, then act.

## Stable identifiers

| Layer | Value |
|---|---|
| GitHub repo | `Steppe-AI-Inc/brain-os`, default branch `master` (protected; PR-only) |
| Vercel project | `steppe-ai/brain-os`, root directory `web` |
| Production domain | `brain.open-spot.ai` |
| Supabase project ref | `pvphxgrtdfrudejjhzjk` |
| Edge Functions | `sem-ai-command`, `embed-text`, `analyze-financial-document`, `sem-artifact-analyze`, `generate-technical-drawing`, `generate-onboarding-plan` |

## Live queries (read-only)

```
# master head
git fetch origin && git rev-parse origin/master

# production web deployment and the commit it was built from
vercel inspect brain.open-spot.ai
gh api repos/Steppe-AI-Inc/brain-os/commits/<sha>/status --jq '.statuses[] | select(.context=="Vercel")'

# deployed Edge Function version / status
npx supabase functions list --project-ref pvphxgrtdfrudejjhzjk

# deployed bytes vs git (the only proof a deploy landed)
scripts/factory-runner/verify-deployed-bytes.sh sem-ai-command

# applied migration head (read-only connection; see qa/dbtest/db.mjs openReadOnlyDb)
select version from supabase_migrations.schema_migrations order by version desc limit 5;

# live RLS policy text
select polname, pg_get_expr(polqual, polrelid) from pg_policy where polrelid = 'public.<table>'::regclass;
```

Deployment *mechanisms* and who may operate them: `CLAUDE.md` §8 and
`docs/FOUNDER_ACTION_RUNBOOK.md`. Deployment *paths* in detail:
`docs/software-factory/PRODUCTION_DEPLOYMENT_PATHS.md`.
