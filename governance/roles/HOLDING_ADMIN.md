# Holding Admin (`profiles.role = 'holding_admin'`)

Functionally identical to `founder` at the RLS layer — `is_founder_or_admin()` checks
`role in ('founder','holding_admin')`, no policy anywhere distinguishes the two.
Intended for a trusted admin at the holding-company level who isn't the founder
personally but needs the same operational reach.

## What this role can see/do
Everything `founder` can — same functions, same unconditional bypass on every policy.

## Verified
Tested live 2026-08-27 (`qa/SECURITY_MATRIX.md`): a test profile with
`role='holding_admin'` and zero company memberships saw the real global totals exactly
(7/7 companies, 2/2 financial_reports) — matching `is_founder_or_admin()`'s intent with
no gap found.

## Real-world identity
No production profile currently holds this role (only `founder` is in active use).
