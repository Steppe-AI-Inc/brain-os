# Brain OS Scenario Library — mandatory reading

This directory is a **permanent, executable library of realistic system scenarios** for
Brain OS: how founders, managers, employees, AI agents, customers, attackers, APIs, and
accidental mistakes actually interact with the system. It is repository content, not a
throwaway QA run — future Claude Code sessions, QA agents, security agents, human
developers, CI/CD, and release testing rely on it and extend it.

## The one rule everything here serves

> **A feature is not complete because the UI works. It is complete only when the intended
> user can perform the intended operation AND unintended users cannot perform or infer
> it — directly, indirectly, across companies, through the AI, twice, concurrently, or
> after something fails.**

"Infer" is load-bearing. Authorization applies to derived and aggregated information, not
just direct fields (SC-068). "Through the AI" is load-bearing: Brain OS is an AI operating
system, so the model is an authorization surface, not just an API (see `ai/`). "After
something fails" is load-bearing: a feature that leaks or double-executes on a retry,
timeout, or partial failure is not done (see `recovery/`, `adversarial/`).

## Before ANY major development, read (in this order)

1. `CLAUDE.md` (repo root) — the verification/evidence discipline every session obeys.
2. `governance/BRAIN_OS_CONSTITUTION.md` — the security/authorization hierarchy and its
   six-step workflow.
3. `governance/SECURITY_INVARIANTS.md` — the rules that hold regardless of role or prompt.
4. **This README**, then the persona files (`personas/`) and the scenario(s) touching what
   you are about to change.

Agent instructions are not security (the Constitution's own words). Telling the model
"don't reveal salaries" shapes what it builds; it is `salary_private`'s RLS that makes it
impossible. Every rule in this library is expressed twice: as prose here, and as a live
RLS policy / backend check proven by a runner script. If the two disagree, the live policy
is reality — that gap is the next thing to fix.

## How this library is organized

```
personas/     11 personas mapped to real app_roles + stable fixture UUIDs
core/         features that exist: auth, orgs, tasks, work_orders, approvals,
              documents, memory, finance, hr, legal, ownership, audit
ai/           the AI attack surface: context_security, tool_execution,
              hallucinated_authority, sensitive_inference, prompt_injection
adversarial/  privilege_escalation, cross_company, id_spoofing, replay,
              malformed_input, approval_abuse, service_role, race_conditions
recovery/     api_failure, database_failure, duplicate_events, partial_execution,
              expired_credentials, deployment_failure
messaging/    NOT-YET-BUILT channels — intended-behavior specs only (never "tested")
```

Every scenario file uses the same 16-field template (ID, PURPOSE, ACTOR, ORGANIZATION,
ROLE, CAPABILITIES, PRECONDITIONS, ACTION, EXPECTED RESULT, EXPECTED DENIALS, EXPECTED
DATABASE STATE, EXPECTED AUDIT EVENTS, EXPECTED AI VISIBILITY, CLEANUP, AUTOMATION STATUS,
LAST VERIFIED DATE). IDs follow `SC-0NN-slug` matching the numbered scenario they come from.

## Runnable evidence

`qa/scenarios-runner/` holds real SQL regression scripts executed live against production
(`pvphxgrtdfrudejjhzjk`) using the impersonation method inside rolled-back transactions —
zero residue, no production data mutated. Results: `RESULTS.md`. As of 2026-08-27, 14
scenarios PASS live, 2 reproduce real gaps live (SC-058 SoD, SC-060 payload immutability),
and the flagship SC-059/094 `decide_approval` logic is verified against the committed
migration (its production deployment is still **pending founder authorization** — the
migration is committed to git but not pushed).

## Honesty rules (non-negotiable — SC-116, SC-081)

- **AUTOMATION STATUS is honest.** One of: `AUTOMATED — see <script>`,
  `MANUAL VERIFICATION ONLY — <why>`, `NOT APPLICABLE — feature not yet implemented`,
  `KNOWN GAP — see qa/KNOWN_FAILURE_MODES.md #<n>`. A fixture pass is never a production
  claim (Viber: "FIXTURE VERIFIED / LIVE BLOCKED ON COMMERCIAL ACCOUNT. Do not report
  production-ready.").
- **A large honest library beats a smaller one that overclaims.** Known gaps are documented
  as gaps (SC-058, SC-060, SC-096 external case, memory sensitivity-floor), never as passes.
- **Realistic fixtures only** (SC-116): real company names (CLIX GPS, SEM Global Robotics,
  OpenSpot, Fuelmetrix, SEM Technologies), persona names, "Customer A"/"Supplier B" — never
  test1/foobar, and never real sensitive employee/customer secrets in a fixture.

## Cross-references to the existing qa/ and governance/ layers

This library extends, and does not fork, the existing files — read them alongside it:
`qa/TEST_PERSONAS.md`, `qa/ACCEPTANCE_TESTS.md`, `qa/SECURITY_MATRIX.md`,
`qa/REGRESSION_CATALOG.md`, `qa/KNOWN_FAILURE_MODES.md`, `qa/LIVE_SYSTEM_MAP.md`,
`qa/PRODUCTION_CHECKLIST.md`, `qa/RELEASE_EVIDENCE.md`; and all of `governance/`
(BRAIN_OS_CONSTITUTION, SECURITY_INVARIANTS, DATA_CLASSIFICATION, ACTION_RISK_LEVELS,
roles/*, agents/*, capabilities/CAPABILITY_MATRIX.yaml, policies/*).

Training docs in this directory: `QA_AGENT_TRAINING.md`, `SECURITY_AGENT_TRAINING.md`,
`ENGINEER_AGENT_TRAINING.md`, `RELEASE_REHEARSAL.md`, `RELEASE_CHAOS_TEST.md`,
`CAPABILITY_MATRIX.md`, `REGRESSION_RULE.md`.

## The objective (the point of all of it)

Every future Brain OS developer — human or agent — should think automatically in terms of:
**who** is acting, **which company**, **what authority**, **which domain**, **what
sensitivity**, **what exact resource**; what happens with the **wrong user**, what happens
if the **AI** tries it, what happens **twice**, what happens **concurrently**, what happens
when something **fails**; whether it can **leak indirectly**, whether it can **cross
companies**, whether the operation can **actually execute after approval**, and whether we
can **prove it happened correctly**.

The goal is not more tests. It is a development system where real business scenarios
continuously train engineering and QA — so that **every discovered mistake permanently
makes Brain OS harder to break.** A bug becomes a failure class; a failure class becomes a
system-wide search; the search becomes an automated regression; the regression becomes
permanent institutional memory (`REGRESSION_RULE.md`). That is the whole design.
