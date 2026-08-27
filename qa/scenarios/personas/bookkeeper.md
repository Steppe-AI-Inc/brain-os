# Persona: BOOKKEEPER

- **Real `app_role`:** `hr_finance` — **there is no separate bookkeeper/preparer role.**
- **Fixture identity:** same as CFO (there is no way to distinguish them in the schema).
- **Governing doc:** `governance/roles/HR_FINANCE.md`.

## The core finding this persona exists to document

Brain OS has **no segregation of duties between a preparer and an approver** for finance
or salary data. `salary_write_hr` is:

```sql
create policy "salary_write_hr" on public.salary_private
  for all using (public.is_hr_finance()) with check (public.is_hr_finance());
```

`for all` = insert + update + delete, all granted to **any** `is_hr_finance()` caller
with no distinction between "prepare" and "approve." The same account that enters a
salary change can approve the resulting `salary_hr` approval and can write the row
directly. A dedicated "bookkeeper prepares, CFO approves" control **cannot be expressed**
with the current roles.

## What a real bookkeeper *should* be able to do (intended, not enforced)

- Create expense records, upload invoices, categorize, create a payment request — yes.
- Approve their **own** payment request — **should be denied**, is **not** denied today.
- Execute a payment — no payment-execution subsystem exists at all.

## Enforcement status

**KNOWN GAP** — see `SC-058` and `qa/KNOWN_FAILURE_MODES.md` #14. To close it would
require either a new `app_role` (e.g. `bookkeeper` with insert-only on the relevant
tables and no approval authority) or a preparer-vs-approver check inside
`approvals_update_approver` that forbids `requested_by_profile_id = current_profile_id()`
for finance/salary domains. Neither exists. Do **not** report SC-058 as a passing test.

## Role in scenarios

`SC-058` (segregation of duties — documented gap). Also relevant to `SC-057` and the
`CAPABILITY_MATRIX.md` finance rows.
