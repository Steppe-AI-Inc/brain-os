# Migration review record — 202609020001_chat_channel_state_durable_conversation.sql

Status: **FIX PREPARED / REVIEW REQUIRED — NOT a db-push candidate until both
independent verifiers pass.** Committed as source in `3527244`. Production untouched.

## What it is
Durable structured channel state for GitHub issue #5 Classes A/C/D/E — the schema-level
home for: channel/session identity (PK = channel_id), whole-or-nothing pending action
(structured payload + explicit vocabulary-constrained action type + canonical target ids
+ source work-order id + expected confirmation type + created/expires), focus stack,
resolved entities, last successful mutation, compaction checkpoint (summary + canonical
ids + through-work-order + count), optimistic `version` for CAS.

## Static review (implementing session — NOT independent)
- **Dependencies**: chat_channels (202608260008), work_orders / is_founder_or_admin /
  current_profile_id / is_company_manager (202606190001). All strictly precede
  202609020001 in lexical apply order. Verified by grep against the migrations tree.
- **Ordering**: newest timestamp in the tree; nothing after it depends on it.
- **Fresh-database compatibility**: purely additive `create table if not exists` + RLS
  + grants; no data migration, no alteration of existing objects, no assumptions about
  row contents. A fresh `db reset` replay applies it after all dependencies by
  timestamp. NOTE: no local Docker/supabase stack exists on this machine, so an actual
  fresh-DB replay was NOT executed — static analysis only; the independent DB verifier
  should treat that as an open item, and rolled-back DDL against production was
  deliberately NOT attempted (direct DDL is inside the founder's authorization gate).
- **Tenant model**: no new authority. SELECT delegates to chat_channels under the
  caller's own RLS (EXISTS subquery — can never be more visible than the channel).
  WRITE spells out the channel WRITE tier (creator / company manager / founder-admin)
  rather than delegating, because chat_channels row-visibility is the weaker SELECT
  tier and delegating it would give every reader write access. AUTH USER != PERSON !=
  ORG MEMBERSHIP: all predicates route through profiles (current_profile_id) and the
  channel's company_id; people rows are never consulted.
- **anon**: explicit `revoke all ... from anon, public`; only `authenticated` granted.
- **Class-B lesson enforced in schema**: `chat_channel_state_pending_action_whole`
  CHECK refuses a pending action without explicit action type, expected confirmation,
  created and expiry; `pending_action_action_type` CHECK refuses unknown vocabulary.
  A NULL action type is only legal when there is no pending action at all.
- **Deletion behavior**: channel delete cascades the state row; work_order FKs are
  `on delete set null` — the READER must treat a pending action with a null source as
  expired (documented in the migration header; enforce in the Edge integration).
- **updated_at / version**: writer-driven on purpose; a trigger bumping `version`
  would break the compare-and-set it exists for. Reviewers should confirm the Edge
  integration always writes `version = version_read + 1 ... where version = version_read`.
- **Indexes**: PK + partial index on pending_action_expires_at (sweep support).
- **Same-defect sweep (anon/grant class, 202608310004 discipline)**: no function is
  created here, so no privileged-RPC surface is added; the only grants are
  table-level to authenticated.

## Rollback
`drop table public.chat_channel_state;` — zero effect on any existing feature. The
application integration MUST be feature-gated on the table's existence (treat absence
as "no durable state") so rollback never requires an application rollback. That gate is
a REQUIRED review item for the Edge integration PR, which is sequenced AFTER verifier
#8 finishes its campaign on e8678ec (the integration edits the same index.ts under
verification, so touching it now would invalidate that campaign's baseline).

## Post-apply tests (prepared, cannot run pre-apply by design)
- `qa/scenarios-runner/chat_channel_state_rls_personas.sql` — real persona
  impersonation, self-cleaning begin/rollback: creator lifecycle + version CAS
  (stale=0 rows, fresh=1), half-written pending action refused, unknown action type
  refused, authenticated-but-uninvited sees nothing / updates nothing / cannot plant a
  state row (WITH CHECK), founder visibility, anon hard permission error.

## Remaining before db-push candidacy (founder's own checklist)
1. Independent DB/security verifier review (brain-os-db-security-engineer) — QUEUED,
   deliberately serialized behind verifier #8 (provider capacity is the currently
   constrained resource; attempt 1 of #8 was PROVIDER_CAPACITY_BLOCKED).
2. Independent general verifier review.
3. Only then: report READY / VERIFIED / MIGRATION / RISK / ROLLBACK / POST-APPLY TESTS
   and ask exactly once: "Approve production DB migration?"
