
## DB-R3 — independent DB review round 3 (2026-09-04) on master `fbc5c79`: FAIL on all four prepared migrations, and the evidence that had printed SECURITY VERIFIED could not have exercised the guard it certified

Reviewer: `brain-os-verifier` as a TOP_LEVEL_ISOLATED_PROCESS in `brain-os-verify-fbc5c79`
(branch `verify-fbc5c79-campaign3` @ `3215ddd`), 54 reviewer-written PGlite probes, no
production authority used. Verdict file: `qa/verification/DB_REVIEW_ROUND3_VERDICT.md`.

**The load-bearing finding was the implementing session's, not the migrations' (D-1, P1).**
The real-PostgreSQL CI job connected as `postgres`. Migration D's two authority gates
deliberately trust `session_user in ('postgres','supabase_admin')` — the supervisor's
direct-connection identity. `SET ROLE authenticated` changes `current_user`, not
`session_user`, so on that connection the guard returned `new` unconditionally for every
persona and the claim function's authority check was unconditionally satisfied. The job
printed `SECURITY VERIFIED` for D on evidence structurally incapable of testing D. The
workflow header and the round-3 response both asserted the opposite ("cannot flatter a
result"). Reviewer proof: the same manager write SUCCEEDED with `session_user = postgres`
and was REFUSED with `session_user = rev_authenticator`. The R-D1 CRITICAL fix was correct
in the SQL and had zero behavioural evidence anywhere.

**A-1 (P1) — a live-schema defect class, not a property of an unpushed file.** Migration A
gated trusted-column writes on a custom GUC, `app.chat_channel_state_trusted_write`, with a
comment claiming only a SECURITY DEFINER RPC could set it. Any role can `set_config()` a
custom GUC; the reviewer planted a fabricated `last_successful_mutation` as `authenticated`
in one statement. The property held only because PostgREST exposes no `SET` — by transport,
not by design, and tested by nothing. The reviewer's same-class sweep found the identical
`app.*_lifecycle_rpc` / `app.*_rpc` flag-as-authority pattern ALREADY PUSHED in five
migrations: `202608280013` (`app.company_lifecycle_rpc`), `202608290001`
(`app.task_lifecycle_rpc`, `app.goal_lifecycle_rpc`), `202608290008`, `202608300002`,
`202608290010`. **Those five are OPEN in the live schema** and are owed their own migration
under a separate Work Order; they were not folded into the four prepared files.

**Other findings closed in round 4 (all reproduced by reviewer probes first):** A-3 (a
same-company manager could DELETE the founder's armed pending action and plant a
`focus_stack` entry via the table-tier policy); B-1 (`p_manager_person_id` had no company
guard while `p_department_id` had two); B-2 (R-B2 HIGH, "inherited" in round 2, reproduced
against the file that re-creates the function: a manager of any company could end a
person's employment elsewhere); C-2 ("OFF until explicitly enabled post-review" enforced
by nobody); C-3 (an enabled binding could be repointed onto the founder's channel); D-2
(the claim function's ONLY grantee, `service_role`, is the one identity its own check
refuses — a dead grant documenting an impossible path); D-3 (`execution_mode`, the
reviewer-facing attestation added by the same migration, was not in the guard's column
list); A-6 (eight trigger functions PUBLIC-executable, contradicting the file's own sweep
discipline); X-1 (zero `governance/` registration against CLAUDE.md §24); X-2 (a broken
`\s`→`s` regex made the real-engine neutralisation report silently empty); X-3 (persona JWT
leaked across the suite). Accepted in writing, with scope stated in the SQL: A-2
(`record_chat_channel_mutation` is un-forgeable against OTHER users only), A-4 (`version`
is client-writable by design; self-harm only once the manager tier is gone), A-5 (shape
guard is presence-only). C-1 (sequencing): migration C is split out of the A/B/D
authorization batch.

**What round 4 changed structurally:** the trusted-write gate requires the flag AND the
SECURITY DEFINER execution context (`current_user` = the RPC owner — the rebinding R-D1
warned about when the question was "who is the caller" is exactly the right answer when
the question is "am I inside the definer"); every persona runs under
`SET SESSION AUTHORIZATION qa_authenticator` (a non-superuser, non-BYPASSRLS LOGIN role,
PostgREST's shape) and `securitySelfCheck` refuses to produce any verdict while
`session_user` is a privileged identity; `FOR UPDATE SKIP LOCKED` is exercised for the
first time under genuine concurrency (`qa/dbtest/concurrency.mjs`, two `pg.Client`s on the
real engine); a company-manager persona exists; `migration_round4_mutation_proof.mjs`
(10/10) breaks each new guard and the harness itself and watches the named persona test
fail. Two invariants were added to `governance/SECURITY_INVARIANTS.md` (#8 "a GUC is never
authority", #9 "security evidence is produced under the identity the code does not
privilege") and the four tables registered in `governance/DATA_CLASSIFICATION.md`.

**Lessons, stated for the next reader:** (1) "non-superuser after SET ROLE" is not
"non-privileged session" — check `session_user` against every identity the code trusts,
and make the harness refuse otherwise. (2) A self-check that cannot fail is decoration; this
one was mutation-tested by the reviewer and passed, and it still had the hole above,
because it asserted only what its author thought to assert. (3) A P2 that is "accepted"
must be accepted in the SQL comment where the next engineer will read it, not in a JSON
file. (4) A review that returns FAIL on all four while confirming 22 of 47 prior closures
re-derived from the SQL is the most useful kind: it is exactly what an independent
reviewer is for.
