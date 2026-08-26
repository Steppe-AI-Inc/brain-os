# Production Checklist

Use before calling anything PRODUCTION ACCEPTED (CLAUDE.md §16). This is a checklist to
run, not a record of "everything is fine" — check every box for real before relying on it.

## Before any schema/RLS/auth/billing/salary/approval change

- [ ] Migration written and applied via `supabase db push` (not `db query --file` —
      that path doesn't track migration history and caused one duplicate-insert
      incident; see KNOWN_FAILURE_MODES.md and git history around 2026-08-25).
- [ ] `schema-v0.7-production-core.sql` updated to match (it's meant to bootstrap a
      fresh project — letting it drift from applied migrations defeats that purpose).
- [ ] `web/types/database.ts` regenerated (`supabase gen types typescript --linked`).
- [ ] RLS change verified via real impersonation (`set_config('request.jwt.claims',
      ...)` against a real non-privileged test account), not just read from the policy
      definition.
- [ ] Positive control re-checked (founder/admin still has full access — a fix that
      breaks legitimate access is as bad as a leak).

## Before deploying an Edge Function

- [ ] `supabase functions deploy <slug> --project-ref pvphxgrtdfrudejjhzjk`
- [ ] Immediately after: `supabase functions download <slug>` + `git diff` to confirm
      deployed content actually matches what was just pushed — a successful deploy
      command is not proof the function updated (see CLAUDE.md §2). This has caught
      real drift before; do it every time, not only when something seems wrong.
- [ ] There is currently **no CI/CD** for Edge Functions (KNOWN_FAILURE_MODES.md #3) —
      this manual verification step is the only safety net until that's fixed.

## Before pushing to master (web app changes)

- [ ] `tsc --noEmit` clean
- [ ] `eslint` clean (pre-existing `PAGE_WIDTH` unused-var warning in
      `lib/pdf/simple-pdf.ts` is known and not a regression)
- [ ] `next build` succeeds
- [ ] After push: confirm the GitHub commit status check for "Vercel" reads `success`
      and its `target_url` deployment ID matches what `vercel inspect
      brain.open-spot.ai` shows as the current production deployment — don't assume a
      push auto-deploys correctly without checking.

## Before telling the founder something is "done"

- [ ] Actually reproduced the original report on production, not just read the code
      and reasoned about it.
- [ ] Searched for the same failure class elsewhere (CLAUDE.md §12/§13) — don't fix
      one instance and stop.
- [ ] Wrote down what was found in KNOWN_FAILURE_MODES.md, updated
      SECURITY_MATRIX.md/ACCEPTANCE_TESTS.md if relevant.
- [ ] Used one of the real release states (BLOCKED/FAILED/PARTIALLY VERIFIED/VERIFIED
      IN PREVIEW/VERIFIED IN PRODUCTION/PRODUCTION ACCEPTED) — never "done"/"everything
      works" as a substitute.
- [ ] Cleaned up any test data created for verification (or explicitly noted it's
      being kept as reusable fixture).
