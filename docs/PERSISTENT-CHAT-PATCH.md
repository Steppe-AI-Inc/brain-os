# SEM Brain v1 — Persistent Chat Foundation

Date: 2026-08-24

Branch: codex/sem-brain-v1

Status: branch implementation; migration requires explicit shared-Supabase application after green CI.

## Before-edit scope

Affected modules:

- AI Native Chat page, stream route, conversation data service
- Supabase RLS and founder/employee regression tests

Affected database tables:

- New: chat_threads, chat_messages
- Existing reference boundary: profiles, companies, audit_logs

Affected APIs:

- POST /chat/stream now accepts an optional RLS-owned thread ID and persists user/assistant messages.

Permission changes:

- Chat history is private to the authenticated profile that created it.
- Company membership, manager status, and founder status do not expose another person's conversations.
- Messages are immutable through the API; deleting an owned thread cascades its messages and writes a metadata-only audit event.

Migration required: yes, additive only.

Tests required:

- lint, TypeScript, unit, production build
- isolated database reset and pgTAP founder/employee chat isolation
- browser login/protected route smoke

## Files changed

- supabase/migrations/202608290001_chat_history.sql
- supabase/tests/database/rls_founder_employee.test.sql
- web/lib/data/chat.ts
- web/lib/chat-stream.ts
- web/app/(app)/chat/page.tsx
- web/app/(app)/chat/chat-client.tsx
- web/app/(app)/chat/stream/route.ts
- web/tests/unit/chat-persistence.test.ts
- docs/PERSISTENT-CHAT-PATCH.md

## Reason

The previous chat lived only in React component state. Navigating away destroyed every message. This patch introduces private cloud-backed threads, restores them on any device, adds new/rename/delete conversation controls, and saves deterministic and Edge Function responses through the same RLS boundary.

## Security impact

Positive:

- no localStorage or browser-only production chat state
- owner-only RLS on threads and messages
- immutable message rows
- no conversation content copied into audit logs
- server resolves the authenticated profile and thread ownership

## Token/context impact

History persistence itself uses no model tokens. Deterministic board commands remain zero-token. Only open-ended commands reach the configured AI provider.

## Database migration

Yes: 202608290001_chat_history.sql. Apply only after branch CI is green.

## Rollback

Disable the history sidebar and revert the frontend commit. If database removal is required, first export founder-owned chat history, then use a separately reviewed rollback migration to drop the trigger, function, messages table, and threads table.