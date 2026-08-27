# QA Agent Training (SC-111)

Mandatory reading for any QA agent or human tester working on Brain OS. QA must NEVER stop
at "the button was clicked," "HTTP 200," or "a row exists." A green happy path is the
BEGINNING of testing, not the end.

## The mandatory question checklist — ask EVERY one, for EVERY feature

For anything you test, work through all of these explicitly:

1. **What should happen?** — the intended user performs the intended operation and it
   succeeds (positive control; use the FOUNDER or an authorized persona).
2. **What should NOT happen?** — name the specific things that must be impossible, not just
   "it works."
3. **Wrong user** — repeat as the EMPLOYEE fixture (and a scoped manager / hr_finance where
   relevant). Never test authorization with only founder/admin (that proves nothing about
   denial).
4. **Another company** — repeat as a member of a DIFFERENT company. Cross-company must
   return 0 in both directions (SC-056).
5. **Malformed data** — bad ids, wrong enum values, oversized input, foreign keys that
   don't resolve (SC-malformed-input-handling, SC-101).
6. **Twice** — run it again / double-click / retry the API call. Exactly one effect
   (SC-063, idempotency).
7. **Concurrently** — two actors at once. Exactly one winner where it matters (SC-064,
   SC-100).
8. **Dependency failure** — provider error, timeout, DB failure. Fails visibly and safely,
   never a false success, never partial persistence (SC-085, SC-095, SC-096, SC-097).
9. **Halfway through** — a mid-sequence failure. All-or-nothing; no orphan state (SC-095,
   CLAUDE.md §10).
10. **Authority changes** — promotion, demotion, transfer, termination, capability expiry.
    Access tracks the CURRENT state, live, with no stale grant surviving (SC-088–091).
11. **AI misunderstanding** — can the model be talked into it, does it invent an id, does
    it claim a fake approval, does it leak via summary/inference (SC-065, SC-101, SC-102,
    SC-068)?
12. **What evidence proves the result?** — a screenshot for UI, database output for a DB
    test, a network trace for integration. One kind of evidence cannot substitute for
    another (CLAUDE.md §18). "It should work" is not evidence.

## The four-path rule for every hidden feature (SC-105)

UI hiding is irrelevant to security. For any gated feature, verify ALL four fail for the
unauthorized user: (1) button/menu hidden, (2) direct route navigation, (3) direct
server-action/API call, (4) direct DB query. In Brain OS, paths 2–4 reduce to RLS (there
is no service-role bypass layer — SC-092), so a direct DB impersonation test covers the
data half; the UI/route halves still need a real browser.

## How to run the automated half

Use `qa/scenarios-runner/` — the live-impersonation method inside rolled-back transactions
(see `qa/scenarios-runner/README.md`). Every write is inside `begin; … rollback;` so
production is never mutated. Record honest AUTOMATION STATUS + LAST VERIFIED DATE in the
scenario file. If you find a NEW gap, document it in `qa/KNOWN_FAILURE_MODES.md` and add a
runner that REPRODUCES it (like SC-058/SC-060) — do not report it as a pass, and do not fix
schema/RLS yourself without founder authorization.

## What "done" testing looks like

An evidence table with PASS / FAIL / KNOWN-GAP / NOT-APPLICABLE per persona × operation,
covering positive AND negative cases, with the exact query/action and result — not a
narrative that "everything works." See `RESULTS.md` for the format.
