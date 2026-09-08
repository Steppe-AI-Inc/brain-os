Scratch harnesses for campaign #66 (verify 72dabe6, structured-claim architecture).

- attack66.mjs   — 33 adversarial probes against the REAL structured-claim block, wider
                   extraction window than the implementer's suite (through the
                   deterministic-confirmation override).
- corpus66.mjs   — differential of deployed v92 vs the branch over the real production
                   work_orders corpus. Regenerate its input read-only with:

      select w.id, left(coalesce(w.output->>'summary',''), 600) as summary,
             left(coalesce(w.command,''),120) as command
      from work_orders w where w.output->>'summary' is not null order by w.created_at;

  then save the CLI's `rows` array as corpus_rows.json here. The dump itself is NOT
  committed: it is real business content, not test data.
- mutate66.mjs / mutate66b.mjs — 30 source mutations against the implementer's suite.
- mutate66c.mjs — 10 source mutations proving the new permanent suite is non-vacuous.

Every mutation script restores supabase/functions/sem-ai-command/index.ts and aborts if
the sha256 does not match the pre-mutation value.
