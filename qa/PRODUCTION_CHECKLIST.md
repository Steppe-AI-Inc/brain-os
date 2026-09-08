# Production Checklist

Run before calling anything `VERIFIED IN PRODUCTION` or `PRODUCTION ACCEPTED`
(`CLAUDE.md` §7). This is a checklist to run, not a record. Every production write is a
founder-only action (`CLAUDE.md` §8); this checklist describes what happens around that
boundary, never a way through it.

## Database change (schema / RLS / RPC / trigger / auth / billing / salary / approvals)

- [ ] Migration written; tested in a rolled-back transaction against real data
      (`frictionless-secure-crud` matrix where a lifecycle is involved).
- [ ] `migration-validation` CI green for the exact commit (real PostgreSQL job).
- [ ] Authorization manifest under `governance/authorizations/` names the entire pending
      set with hashes; the release broker (`scripts/release-broker/`, PR #8) refuses any
      extra pending migration. `supabase db push` from a session is never the path.
- [ ] Founder applies through the authorized path; the session records
      `BLOCKED — DB PUSH` until then.
- [ ] After apply: live re-query of the objects (`pg_proc`, `pg_policy`, `pg_get_expr`),
      never the push exit status; `schema-v0.7-production-core.sql` and
      `web/types/database.ts` updated to match.
- [ ] RLS verified by real impersonation for an authorized and an unauthorized persona;
      positive control re-checked.

## Edge Function change (`sem-ai-command` and siblings)

- [ ] Candidate SHA independently verified (separate verifier process from committed
      state; verdict read from its output text).
- [ ] Deploy bar: conformance to `governance/OPERATING_TRUTH_MODEL.md`; the deployed
      build is a reference corpus for truth-regression measurement, not the bar.
- [ ] `deno check` gated by error class; `index.ts` CRLF-pure.
- [ ] Ask exactly once: `ALLOW_FUNCTIONS_DEPLOY=1?`. Deploy only on that answer, only
      through the protected path (`.github/workflows/supabase-functions.yml`).
- [ ] After deploy: `scripts/factory-runner/verify-deployed-bytes.sh` (download + diff);
      record function version and sha256. A successful deploy command is not proof.

## Web change (`/web`)

- [ ] `tsc --noEmit`, `eslint`, `next build` clean; `qa/scenarios-runner/architecture_*`
      contracts pass.
- [ ] Pull request into protected `master` with the PR template's definition of done;
      never a direct push, never `vercel --prod`.
- [ ] After merge: GitHub commit status "Vercel" = `success` and its deployment ID matches
      `vercel inspect brain.open-spot.ai`.

## Before reporting anything as fixed

- [ ] Reproduced the original report on production first.
- [ ] Defect class named; same-class search done (`FEATURE_COMPLETENESS_CONTRACT.md` §4).
- [ ] Regression test for the class added; `qa/KNOWN_FAILURE_MODES.md` entry written.
- [ ] Fix report on `qa/home-pc-handoff` with `ready_for_retest`; never CLOSED (Work PC
      closes).
- [ ] Real release state used; test data cleaned up or registered as a fixture.
