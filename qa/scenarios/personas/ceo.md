# Persona: CEO

- **Real `app_role`:** `holding_admin` (or `founder` when the founder is also CEO — in
  SEM's real structure they are the same person; the personas are separated here to keep
  the *authority* distinct from the *individual*).
- **Fixture identity:** no separate CEO fixture exists. Use the FOUNDER fixture for
  positive-control CEO tests and note the conflation, or provision a dedicated
  `holding_admin` fixture (tracked as future work in `qa/TEST_PERSONAS.md`).
- **Governing doc:** `governance/roles/HOLDING_ADMIN.md`.

## Scope mechanism

Group-wide operational authority. `holding_admin` is inside every
`is_founder_or_admin()` check, so at the RLS layer a `holding_admin` is currently
**indistinguishable from a founder** — including reading `company_sensitive`.

## Honest gap

The governance model *describes* the CEO/holding-admin tier as operational-but-not-owner
(no cap-table authority), but the schema does **not** yet enforce that distinction:
`company_sensitive` and `company_relationships` both check `is_founder_or_admin()`, which
`holding_admin` satisfies. So a `holding_admin` today **can** read ownership/cash data.
If the intent is "CEO runs operations but does not see the cap table," that is a
**real unenforced gap** — the tightest owner-only tier would need its own predicate
(e.g. `role = 'founder'` alone, not `in ('founder','holding_admin')`). Flagged, not
fixed. Cross-reference `governance/roles/HOLDING_ADMIN.md` and `personas/cfo.md`.

## Can do / Cannot do

Today: same as FOUNDER at the RLS layer. The *intended* narrower boundary (operations
yes, ownership/cap-table no) is documented but not enforced. Treat any scenario asserting
"CEO cannot see ownership" as **KNOWN GAP** until a founder-only predicate exists.

## Role in scenarios

Used to make the point (SC-057, SC-074) that "not-founder-but-senior" must still be
denied the founder-only tier — and to document honestly that, for `holding_admin`
specifically, that denial is **not** currently enforced.
