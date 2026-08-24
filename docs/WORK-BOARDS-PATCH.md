# SEM Brain v1 — Work Boards Vertical Slice

Date: 2026-08-24

Branch: `codex/sem-brain-v1`

Status: implemented and locally verified; not applied to production Supabase yet.

## Before-edit scope

Affected modules:

- Work Boards, canonical tasks, AI Native Chat, audit trail
- authenticated shell/navigation and mobile layout
- branch test coverage and continuity documentation

Affected database tables:

- New: `boards`, `board_columns`, `board_items`
- Existing: `tasks`, `people`, `companies`, `company_memberships`, `audit_logs`

Affected APIs:

- New PostgreSQL RPCs: `create_board_with_defaults`, `create_board_task`, `move_board_item`
- Existing Next.js `POST /chat/stream` now handles validated board commands before forwarding other commands to `sem-ai-command`

Permission changes:

- Board discovery follows company membership.
- Board cards inherit canonical task RLS; company membership alone does not expose every card.
- Board/column configuration is founder/admin/company-manager only.
- Employees may create/assign board tasks only to themselves and move only their own cards.
- Database audit triggers are not executable by API roles.

Migration required: yes, additive only.

Tests required:

- lint, TypeScript, unit, production build
- disposable Supabase reset
- pgTAP founder/employee card visibility and own-card movement
- authenticated/unauthenticated browser critical paths

## Files changed

See the branch commit for the authoritative list. Primary implementation files:

- `supabase/migrations/202608280001_work_boards.sql`
- `supabase/tests/database/rls_founder_employee.test.sql`
- `web/lib/data/boards.ts`
- `web/lib/board-command-parser.ts`
- `web/lib/board-command.ts`
- `web/app/(app)/board/**`
- `web/app/(app)/chat/**`
- `web/lib/chat-stream.ts`
- `web/components/app-sidebar.tsx`
- `web/app/(app)/layout.tsx`
- `web/tests/**`
- `MASTER_CONTEXT.md`

## Why

The previous `/board` was a fixed visual projection of goal status. It could not create or rename boards, add workflow columns, edit cards, assign team members, or perform the same actions through chat. This slice establishes one real task model with two control surfaces: a visual board and AI Native Chat.

## Local verification

Run from a clean non-synced checkout:

- `npm run lint`: PASS
- `npm run typecheck`: PASS
- `npm run test:unit`: PASS — 20 tests
- `npm run build`: PASS — 30 routes
- `npm run test:e2e`: PASS — 8 Chromium login/protected-route tests, including `/board`

Database reset/RLS execution is delegated to branch CI because Docker is not installed on this workstation.

## Security impact

Positive:

- no localStorage production state
- no duplicated card/task authorization model
- RLS applies to board discovery, card visibility, and every mutation
- employees cannot assign tasks to colleagues through the board RPC
- manual and chat changes share transactional database audit triggers
- deterministic chat commands use server-side entity resolution and never accept model-supplied database IDs

Remaining:

- live schema drift must be recaptured after fresh Supabase authentication
- the migration must pass disposable branch CI before production approval
- open-ended AI orchestration still requires its existing policy/approval backend

## Token/context impact

Board CRUD chat commands consume zero model tokens. Only commands outside the validated board grammar are forwarded to the LLM orchestrator. The updated master context prevents repeat architecture discovery on another workstation.

## Database migration

Yes: `202608280001_work_boards.sql`.

Do not apply silently. After branch CI passes:

1. authenticate Supabase CLI with a fresh rotated token;
2. inspect live drift;
3. apply the additive migration to project `pvphxgrtdfrudejjhzjk` with founder approval;
4. regenerate `web/types/database.ts` from live schema;
5. run authenticated founder and employee browser acceptance tests.

## Rollback

Before production: revert the branch commit.

After production:

1. archive/disable the Work Boards UI and chat grammar;
2. preserve canonical tasks;
3. export any board membership needed for recovery;
4. drop board triggers/functions/policies/tables in a separate explicitly reviewed rollback migration.

Never delete `tasks` when rolling back boards; cards only reference those canonical task rows.
