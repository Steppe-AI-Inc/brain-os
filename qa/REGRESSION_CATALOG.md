# Regression Catalog

Real checks worth re-running after future changes, grouped by what they'd catch. Not a
test runner (no automation harness exists yet) — a checklist of exact queries/actions
proven to catch real defects, so they don't need to be reinvented each time.

## RLS write-bypass (catches: KNOWN_FAILURE_MODES.md #1 class)

Run after adding or modifying any table's RLS policies:

```sql
select tablename, policyname, cmd, qual from pg_policies
where cmd = 'ALL' order by tablename;
```
For every row, confirm the `qual` is actually the *narrowest* intended check — if a
table has both an `ALL`-cmd broad policy and a separate narrower write policy, that's
the exact pattern that caused the bug. There should be at most one `ALL`/write policy
per table (or a deliberate, reviewed combination), never a broad one left over from a
prior design.

## Storage vs. table sensitivity mismatch (catches: KNOWN_FAILURE_MODES.md #2 class)

For any table with a `sensitivity`/visibility column whose rows have associated Storage
objects, confirm the Storage RLS policy actually joins back to that column — grep the
storage policy `qual` for `exists (select 1 from public.<table> ...)`, not just a
folder-prefix check.

## Context-truncation-as-total (catches: KNOWN_FAILURE_MODES.md #4 class)

After adding any new `.limit(N)` to an array included in `sem-ai-command`'s
`context` pack, ask: "would a false or misleading total plausibly follow from an LLM
reading this array's length?" If yes, add a matching `context.counts.<x>Total` +
`<x>Shown` pair and an explicit prompt instruction, following the existing pattern.

Live spot-check: ask Brain OS chat "exactly how many X are there" for each entity type
in `context.counts`, cross-check the answer against a direct `SELECT COUNT(*)` with the
same filter. Should match exactly, not approximately.

## Duplicate task/approval creation (catches: KNOWN_FAILURE_MODES.md #5 class)

```sql
select title, count(*) from tasks
where status in ('queued','in_progress','blocked','needs_approval')
group by title having count(*) > 1;
```
Exact-title duplicates are rare (wording varies) — the real check is qualitative: skim
recent `needs_approval` task titles for near-identical phrasing about the same
underlying question asked more than once. If found, that's evidence the dedup prompt
instruction isn't being followed (or was regressed by a later prompt edit) — re-test
with the same repeated-ambiguous-request pattern used to find the original bug.

## Edge Function drift (catches: KNOWN_FAILURE_MODES.md #3/#6 class)

```bash
for fn in $(ls supabase/functions); do
  npx supabase functions download "$fn" --project-ref pvphxgrtdfrudejjhzjk
  git diff --stat "supabase/functions/$fn/index.ts"
done
```
Any non-empty diff means deployed ≠ tracked source — investigate before assuming
production runs what's in git. Also periodically cross-check `supabase functions list`
against `ls supabase/functions/` for any slug present in one but not the other
(catches both untracked-but-deployed and deployed-then-deleted-from-git cases).
