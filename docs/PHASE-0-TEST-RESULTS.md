# SEM Brain v1 Phase 0 Test Results

Date: 2026-08-24

Branch: `codex/sem-brain-v1`

This report covers Phase 0 only. No production database mutation or Vercel deployment was performed.

## Scope

Affected modules:

- Next.js test and type-generation tooling under `web/`
- Supabase Edge Function contract tests
- isolated Supabase RLS test foundation
- branch-only GitHub Actions workflow
- review-only v1 data-model draft and architecture documentation

Affected database tables:

- No live tables changed
- The review draft proposes additive execution, policy, idempotency, QA, outcome, memory-candidate, and audit structures

Affected APIs:

- No deployed API changed
- The existing `sem-ai-command` function is covered by static contract tests

Permission changes:

- No live permissions changed
- The review draft contains proposed RLS and data-driven approval authority

Migration required:

- No Phase 0 migration was applied
- The SQL remains under `supabase/drafts/`, outside the migration chain

## Local results

All runnable tests were executed from a disposable local copy outside Google Drive to avoid synchronized-folder file-lock corruption.

| Check                                           | Result    | Notes                                                     |
| ----------------------------------------------- | --------- | --------------------------------------------------------- |
| Dependency install/audit                        | PASS      | `npm ci`; zero reported vulnerabilities                   |
| Lint                                            | PASS      | `npm run lint`                                            |
| Next.js type generation + TypeScript            | PASS      | `next typegen && tsc --noEmit`                            |
| Unit tests                                      | PASS      | 2 files, 11 tests                                         |
| Edge Function contract tests                    | PASS      | 4 Deno tests                                              |
| Integration harness without test DB credentials | PASS/SKIP | Runner passes; one database test is intentionally skipped |
| Browser/E2E suite                               | PASS      | 7 Playwright tests using an isolated local auth stub      |

## Test isolation

- Automated database-write tests accept only `TEST_SUPABASE_URL` and `TEST_SUPABASE_ANON_KEY`.
- The committed example points to `127.0.0.1`.
- The branch CI starts a disposable local Supabase stack and does not consume production credentials.
- Browser tests use the local Supabase stack when available and otherwise use a local auth stub.
- No service-role key is supplied to browser or application tests.

## Blocked acceptance checks

Commit `f082917` already regenerated canonical `web/types/database.ts` from the live project for the applied Goals/Departments schema. These independent acceptance checks remain blocked until a fresh Supabase CLI login or access token is available:

1. Read-only live schema dump and repository-versus-live classification.
2. Independent regeneration of canonical `web/types/database.ts` from live project `pvphxgrtdfrudejjhzjk`.
3. Full-catalog comparison confirming the generated type file still exactly reflects live.

## Branch CI result

[GitHub Actions run 32686967796](https://github.com/Steppe-AI-Inc/brain-os/actions/runs/32686967796) passed on commit `1d91b0d`.

| Isolated gate                        | Result              |
| ------------------------------------ | ------------------- |
| Current migration-chain reset        | PASS                |
| Founder/employee pgTAP RLS           | PASS - 6 assertions |
| Local Supabase API integration       | PASS                |
| Chromium critical-route smoke        | PASS - 7 tests      |
| Review-draft SQL disposable reset    | PASS                |
| Static/lint/type/unit/Edge contracts | PASS                |

The first CI attempts correctly exposed missing fixture grants, an overly narrow anonymous-read assertion, and non-immutable generated hash expressions. Each was corrected without changing production data, deployed APIs, or the production migration chain.

## Security impact

- Positive: adds regression coverage for authentication routing, RLS role separation, forced approval controls, transactional persistence expectations, and absence of service-role usage in the Edge Function.
- Positive: keeps the proposed SQL outside the executable migration chain.
- No production security boundary changed in Phase 0.
- Remaining risk: the draft SQL now passes disposable database validation but remains review-only until the full live drift audit and human security review pass.

## Token and context impact

- Runtime token use is unchanged.
- Phase 0 adds bounded documentation and generated-type workflow so future agents can retrieve targeted context instead of re-auditing the full repository.

## Rollback

Before merge, revert the Phase 0 commit on `codex/sem-brain-v1`.

After a future merge, revert the documentation/tooling commit. No database rollback is required because the review SQL was not applied.
