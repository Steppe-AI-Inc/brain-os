---
name: frictionless-secure-crud
description: The proven, copyable recipe for a lifecycle-managed resource (create/edit/archive/restore) that is both secure and frictionless - security decides whether an operation is allowed, it never makes an allowed ordinary operation difficult. Use when a Factory Work Order needs a new archivable/restorable resource, or when "delete" for an existing resource needs to become safe and reversible instead of a real destructive DELETE.
---

# Frictionless Secure CRUD

Copy this exact shape, proven live on `companies`/`tasks`/`goals`
(`supabase/migrations/202608280013_frictionless_company_delete.sql`,
`202608290001_task_goal_archive_restore.sql`) — do not redesign from scratch.

## The three pieces, always together

1. **A `BEFORE INSERT` trigger that unconditionally sets the creator column**
   (`created_by_profile_id := current_profile_id()`), `security definer`,
   `set search_path = ''`. A plain column `default` doesn't stop a client from
   explicitly supplying a different value — the trigger is the only real guarantee.

2. **`archive_<resource>`/`restore_<resource>` RPCs**, not a plain `UPDATE ... SET
   status = 'archived'`:
   - `security definer`, `set search_path = ''`, every reference fully
     schema-qualified.
   - Authorization re-derived *inside* the function (never trust RLS alone): founder/
     admin, OR resource-manager-tier, OR creator-with-still-active-membership. A
     `company_id IS NULL` resource's creator needs no membership check — there's no
     workspace to have been removed from.
   - Idempotent: archiving an already-archived row is a clean no-op
     (`reason: already_archived`), never an error, never a silent no-op with no
     signal either.
   - Structured `jsonb` return: `{operation, <id>, previousStatus, newStatus, changed,
     authorized, postconditionPassed, reason}`.
   - If the resource has no single "restore-to" target (e.g. tasks can be
     `queued`/`in_progress`/`blocked`/etc before archiving), add a `previous_status`
     column and restore to the *exact* prior value — never guess a fixed default.

3. **A DB-enforced single-path guarantee**, not developer convention: a session-local
   GUC flag (`set_config('app.<resource>_lifecycle_rpc', 'true', true)`) set
   immediately before the RPC's own `UPDATE`, checked by a `BEFORE UPDATE` trigger that
   raises if a status transition into/out of the archived state happens without it.
   **Reset the flag to `'false'` immediately after the `UPDATE`** — a stale flag left
   set for the rest of the transaction is a real bug this exact pattern already
   produced once (a later direct-bypass `UPDATE` in the same transaction sailed past
   the trigger). Test the trigger's block in *both* directions (into archived, and out
   of it via a raw bypass) — the symmetric case is easy to leave untested and was found
   missing once by an independent verifier pass.

## RLS: split INSERT from UPDATE/DELETE

A single combined `for all` policy cannot express "creator + active membership" for
INSERT — nobody can have a pre-existing membership on a row that doesn't exist yet.
Split into `<resource>_insert_admin` (or the resource's real create-authority tier,
which may be broader than admin-only) and `<resource>_update_delete_scope` (the
three-tier authorization, identical to what the RPCs re-derive internally — direct
writes must never be more permissive than the RPCs). This exact split was a real bug
found by testing before push, not something obvious from reading the SQL.

## The point of all this: security is pass/fail, never a maze

Once this pattern is in place, "delete" from the UI/AI means archive — reversible,
destroys nothing, so there's nothing to check beyond authorization. Real, permanent,
destructive deletion becomes a separate, rare, explicitly-labeled action
(`permanentlyDelete<Resource>`), gated to founder/admin, reachable only from an
Archived-items view — never the default Delete button, never exposed to chat unless the
user is explicit about permanence ("permanently delete," not "delete").

## Test every new instance of this pattern with the full matrix

Creator-with-membership (archive/restore/edit ✅), unrelated user (❌ everything),
resource-manager (✅), founder (✅ globally), former-creator-after-membership-removal
(❌ everything — the single most important regression this pattern exists to prevent),
idempotency (repeat twice, clean no-op), direct-bypass-blocked (both directions),
not-found handling, and a spoof attempt on the creator column at insert time. Test in a
rolled-back transaction against real production data before ever asking for push
authorization.
