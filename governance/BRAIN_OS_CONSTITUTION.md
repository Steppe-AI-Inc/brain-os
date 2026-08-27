# Brain OS Constitution

This is the top of the governance hierarchy. Every migration, feature, agent, and AI
prompt in this repository is subordinate to this document and the files it points to.
It exists because of a real incident (2026-08-27): a domain-gated approval policy was
written, committed, and its migration ledger said "applied" — but production silently
ran the old ungated version for an unknown period, and it took a targeted security audit
to find it. Governance-by-file-reading doesn't scale past one engineer's memory. This
directory is the fix: a fixed hierarchy every future change — human or AI-authored —
must pass through, so the next engineer (or agent) doesn't have to rediscover the
security model from migration archaeology.

## The hierarchy

```
BRAIN OS CONSTITUTION                    (this file)
        |
Security / Privacy Invariants            SECURITY_INVARIANTS.md
        |
Data Classification                      DATA_CLASSIFICATION.md
        |
Role + Capability Matrix                 capabilities/CAPABILITY_MATRIX.md, roles/*.md
        |
Domain-specific Agent Rules              agents/*.md
        |
Action Risk Levels                       ACTION_RISK_LEVELS.md
        |
Database RLS + backend authorization     supabase/schema-v0.7-production-core.sql
        |
Automated policy tests                   qa/REGRESSION_CATALOG.md
        |
Feature acceptance tests                 qa/ACCEPTANCE_TESTS.md
        |
QA / Security review                     qa/SECURITY_MATRIX.md, qa/KNOWN_FAILURE_MODES.md
        |
Production
```

A change that only exists at one level (a rule in a `.md` file with no corresponding RLS
policy, or an RLS policy with no test proving it live) is not actually governed — it's a
claim. **Agent instructions are not security.** Telling Claude "employees must not see
salaries" shapes what Claude *builds*; it is `salary_private`'s RLS policies
(`salary_select_authorized`, `salary_write_hr` — both gated on `is_hr_finance()`) that
actually make it *impossible*, regardless of what any prompt says. Every rule in this
directory that matters is expressed twice: once here in prose (for humans and for an
agent's own reasoning), and once as a real, live-verified RLS policy or backend check
(for enforcement). If the two ever disagree, the RLS policy is what's actually true in
production — that gap is itself the next thing to fix, not the prose.

## What this replaces

`CLAUDE.md` at the repo root remains the operating constitution for *how an agent works*
(verification discipline, evidence standards, release-state vocabulary) — that document
is unchanged and still governs every session. This `governance/` directory is new and
narrower: it is the *content* of the security/authorization model itself — what the
roles are, what data classifications exist, what each agent may do — so that content
doesn't have to be re-derived from reading migrations every time. `CLAUDE.md` §"Before
building anything" now points here.

## How to use this directory

**Before implementing any feature that touches a table, an approval, an AI agent, or an
external action:**
1. Read `SECURITY_INVARIANTS.md` — does this feature touch anything listed there?
2. Read `DATA_CLASSIFICATION.md` — what classification does the data involved carry, and
   does a table for it already exist, or does a new one need a classification assigned?
3. Read `capabilities/CAPABILITY_MATRIX.md` — does an existing capability cover this
   action, or does a new one need to be defined and added to the matrix (and to every
   role's file that should or shouldn't have it)?
4. Read `ACTION_RISK_LEVELS.md` — what risk level does this action carry, and does that
   require an approval gate?
5. Implement the RLS policy / backend check that makes the rule real — not just an
   instruction to the AI.
6. Add a live impersonation test to `qa/` proving the policy does what this directory
   says it should, for both an authorized and an unauthorized persona (see
   `qa/SECURITY_MATRIX.md` for the established method).
7. Never weaken an existing policy to make a test pass — if a test fails, the policy or
   the test was wrong; find out which before changing either.

**Every "yes/allowed" claim in this directory must be backed by a policy anyone can
`pg_get_expr` and see for themselves. Every "no/restricted" claim must have a live test
in `qa/SECURITY_MATRIX.md` proving a real account was actually denied — not "should be
denied per the policy text."**

## Honesty about current state

This directory was created 2026-08-27 by reverse-engineering the *actual* current system
(real enum values, real RLS policies, real test results from that night's audit) — not
by designing a new system and hoping the code catches up. Several gaps between the ideal
architecture described here and what's actually enforced today are documented explicitly
in each file rather than glossed over (e.g. `DATA_CLASSIFICATION.md` notes that the
`restricted`/`founder_only` tiers of `visibility_level` are declared in the schema but
not yet read by any policy). Closing those gaps is real future work, tracked in
`qa/KNOWN_FAILURE_MODES.md`, not something to silently assume is already done because
this document now exists.
