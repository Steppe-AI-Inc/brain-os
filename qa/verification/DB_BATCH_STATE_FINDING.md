# Why two excluded migrations reached production

Asked by the founder, 7 September 2026, as the question that matters more than obtaining a read-only
URL. **Nothing below wrote to production. Every command is read-only.**

## The state

`supabase migration list --project-ref pvphxgrtdfrudejjhzjk`, run from both repos:

| Migration | Ruling | Remote |
|---|---|---|
| `202609020001` (A) | authorized | applied |
| `202609020002` (B) | authorized | applied |
| `202609020003` (C) | **excluded** | **applied** |
| `202609030001` (D) | authorized | applied |
| `202609040001` | **excluded** | **applied** |

## What is ruled out, with evidence

* **Not CI.** Two workflows exist. `supabase-functions.yml` is path-filtered to
  `supabase/functions/**` and only deploys Edge Functions; its last run was 1 September, which is
  v92. `migration-validation.yml` runs the DB harnesses against PGlite and a throwaway PostgreSQL
  service container, and it carries an explicit refusal:
  `case "$DBTEST_PG_URL" in *supabase*|*pvphxgrtdfrudejjhzjk*) echo "REFUSED: production host"; exit 9;;`
  Every run of it on 4–5 September succeeded against the disposable engine. **That workflow is
  well-built and is not the cause.**
* **Not this workstream's harness.** `qa/dbtest/apply-report.json` records its 82-migration apply
  against **PGlite** — a WASM PostgreSQL, in-process. It never touched the real database.

## What did it, mechanically

The migration ledger was stamped by **the Supabase CLI's own push bookkeeping**. This project has
already established that diagnostic, in ledger #16: a `remote` entry of this kind
*"specifically requires the Supabase CLI's own push/migration bookkeeping to have run — a plain
INSERT or manual SQL paste would create the object but not stamp the migration ledger this way."*

So a `supabase db push` (or `migration up --linked`) ran against production.

**And that is the whole explanation for the two exclusions**, because of a property of the tool
rather than anybody's intent:

> **`db push` has no selectivity. It applies every pending migration.**

The exclusion was expressed as an *authorization* — A, B and D approved, C and `202609040001` not.
But the only mechanism available applies the whole pending set. C and `202609040001` sat between and
after the approved three in the same directory, so any push that applied A, B and D applied them too.
That is precisely why `qa/dbtest/selective_apply_abd.sh` was later built to refuse unless the apply
set is exactly {A, B, D} — the tooling exists because the default tool cannot honour a partial ruling.

## The part that should not be comfortable: this is a recurrence

**Ledger #16, 2026-08-28** — *"A pending production migration was applied without a human-authorized
`db push`"*. Same project, same class, four weeks earlier. Its own process takeaway:

> *"'don't run `db push`' needs a real technical enforcement point for autonomous/overnight agent
> runs (e.g. an environment without `SUPABASE_ACCESS_TOKEN` / DB credentials at all, rather than
> trusting a prompt instruction) … **Flagged for the founder; not implemented in this pass.**"*

It was never implemented. **The enabling condition is still live on this machine right now:**
`supabase projects list` succeeds and reports the Brain OS project `"linked": true`, and
`supabase/.temp/project-ref` pins it to `pvphxgrtdfrudejjhzjk`. No token sits in `SUPABASE_ACCESS_TOKEN`,
`SUPABASE_DB_PASSWORD` or `~/.supabase/access-token` — the credential is held somewhere the CLI reads
without exposing it, and it works. **Any session here with CLI access can push migrations to
production, and the only thing preventing it is an instruction in a prompt.**

That is exactly the condition #16 said was insufficient, and it has now produced the same outcome twice.

## What I have NOT established

* **Which machine or session ran it.** `brain-os` is linked but does **not** contain these five
  migration files; `brain-os-bug006` contains them but is **not** linked (`migration list` there
  fails with `LegacyProjectNotLinkedError`). A push therefore required both together — someone
  linking bug006, or copying the files into a linked checkout, or a different machine entirely. The
  work-PC QA node is a standing second operator on this project and is the obvious candidate. **I
  have not proven it and am not going to assert it.**
* **Whether the schema objects actually exist.** Only the migration history was read. This project's
  own standing rule exists because `db push` has silently no-opped on real content before, so
  *recorded as applied* is not *applied*. Closing that needs a read-only `DBTEST_PG_URL` (then
  `qa/dbtest/live_preflight_abd.mjs --post` gives a per-migration verdict against the live catalog)
  or Docker for `supabase db dump`. Neither is available here.

## Recommended, in order

1. **Implement the enforcement #16 asked for.** Autonomous sessions should run in an environment with
   no production DB credentials at all. A prompt instruction has now failed twice; the second failure
   crossed an explicit exclusion the founder had written down.
2. **Reconcile C and `202609040001` deliberately** — decide whether they stay. C is the messaging
   transport foundation, which the plan defers until after the Phase 11 acceptance gate, so it being
   live is a scope question, not only a process one.
3. **Then** verify the objects with a read-only URL, and give A, B and D their per-migration
   LIVE VERIFIED verdicts.
