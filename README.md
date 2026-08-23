# SEM Brain v0.7.1 Auto Deploy Pack

SEM Brain is an AI-native, chat-first operating brain for SEM Technologies LLC and its companies.

This version adds the deployment foundation so future updates can be pushed to GitHub and deployed automatically by Vercel.

## What is included

- AI-first SEM Brain frontend
- Production Core page
- Deployment Center page
- Fixed Supabase schema migration
- Supabase seed template
- Supabase Edge Function template
- Vercel config
- GitHub workflow template for Supabase functions
- Non-programmer deployment checklist
- Patch-only update protocol

## First thing to do

Run this SQL in Supabase SQL Editor:

```text
supabase/migrations/202606190001_sem_brain_v071_production_core.sql
```

Then create Founder user and run:

```text
supabase/seed/001_founder_and_companies_template.sql
```

## Deploy automatically

1. Create private GitHub repo.
2. Upload this folder.
3. Connect GitHub repo to Vercel.
4. Add environment variables in Vercel.
5. Every GitHub push deploys the frontend automatically.

Read:

```text
docs/AUTO-DEPLOYMENT-GUIDE.md
docs/NON-PROGRAMMER-DEPLOYMENT-CHECKLIST.md
docs/PATCH-ONLY-UPDATE-PROTOCOL.md
```

## Security

Never expose:

- database password
- service_role key
- OpenAI API key
- Slack token
- Google OAuth secret

Browser-safe only with RLS enabled:

- Supabase project URL
- Supabase publishable/anon key
