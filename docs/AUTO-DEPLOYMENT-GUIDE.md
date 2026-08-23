# SEM Brain v0.7.1 Auto Deployment Guide

This guide makes SEM Brain update automatically after the project is connected to GitHub + Vercel.

## Goal

Current manual flow:

1. Download ZIP.
2. Open local `index.html`.
3. Re-enter setup.

Target flow:

1. Update code in GitHub.
2. Vercel auto-deploys the frontend/API.
3. Supabase stores all company data.
4. Supabase migrations/functions are applied intentionally.
5. You always open one permanent SEM Brain URL.

## Part A — Supabase first

### A1. Run the fixed schema

Use:

```text
supabase/migrations/202606190001_sem_brain_v071_production_core.sql
```

In Supabase:

```text
SQL Editor → New Query → paste migration SQL → Run
```

This is the fixed schema where tables are created before helper functions and RLS policies.

### A2. Create Founder user

Go to:

```text
Authentication → Users → Add user
```

Create the founder login.

### A3. Seed founder profile and companies

Use:

```text
supabase/seed/001_founder_and_companies_template.sql
```

Replace:

```text
PASTE-FOUNDER-AUTH-USER-UUID-HERE
PASTE-FOUNDER-EMAIL-HERE
```

Then run it in SQL Editor.

## Part B — GitHub

1. Create a private GitHub repo named `sem-brain`.
2. Upload the full v0.7.1 folder.
3. Commit to the `main` branch.

Recommended commit message:

```text
SEM Brain v0.7.1 auto deploy pack
```

## Part C — Vercel

1. Open Vercel.
2. Add New Project.
3. Import the GitHub repo.
4. Keep framework as Other/Static if Vercel does not auto-detect.
5. Add environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL=https://gyqlkgnyyzpwaswhshlw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_publishable_anon_key
SEM_BRAIN_APP_VERSION=0.7.1
OPENAI_MODEL=gpt-4.1-mini
```

Do not add service role or OpenAI key to frontend code.

For backend functions, add these only in Vercel/Supabase backend environment:

```text
OPENAI_API_KEY=your_openai_api_key
SUPABASE_SERVICE_ROLE_KEY=backend_only_if_needed
```

## Part D — Supabase Edge Function

To deploy later using CLI:

```bash
supabase login
supabase link --project-ref gyqlkgnyyzpwaswhshlw
supabase functions deploy sem-ai-command
```

Then set secrets:

```bash
supabase secrets set OPENAI_API_KEY=your_key OPENAI_MODEL=gpt-4.1-mini
```

## Part E — Update workflow

For frontend/UI updates:

```text
Patch module → commit to GitHub → Vercel auto-deploys
```

For database updates:

```text
Create migration → review → run through Supabase SQL Editor or Supabase CLI
```

For AI backend updates:

```text
Patch function → deploy Supabase Edge Function
```

## Safety Rules

Never expose:

- database password
- service_role key
- OpenAI API key
- Slack token
- Google OAuth secret

Browser-safe:

- Supabase project URL
- Supabase publishable/anon key, only with RLS enabled

## First Success Test

1. Open deployed Vercel URL.
2. Go to Deployment Center.
3. Confirm Supabase URL is correct.
4. Go to Production Core.
5. Test database connection.
6. Sign in as founder.
7. Run AI Native Chat fallback command.
8. Confirm task/approval creation.
