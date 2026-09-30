# CHANGE REQUEST — DIRECTOR DECISION REQUIRED

**CR-008 — The canonical-RPC recipe in `governance/CANONICAL_WORK_CONTRACT.md` §2 names `set search_path = ''`; the Factory V1
functions pin `set search_path = pg_catalog, pg_temp`**

- **Filed:** 2026-09-28 by the IMPLEMENTER capability, on `factory/auto-enrollment-v1-implementation`.
- **Built on:** Director r3 `c7a845b61a3b0b419e8c9dfeff397547fdc75b03`.
- **Kind:** a Director-owned governance text whose example form differs from the form the candidate uses. No Factory contract row,
  invariant or acceptance criterion changes; the candidate conforms to r3 as written (below).
- **The candidate does not rely on this change request.** The r3 Factory texts require only "a pinned `search_path`", which the
  candidate meets. Until the Director decides, `governance/CANONICAL_WORK_CONTRACT.md` stays as it is; the implementer does not edit it.

## Requirement

- **S-10** (`docs/architecture/features/factory-node-management-auto-enrollment.SECURITY_TENANCY.md:20`): "All authority and lifecycle
  logic lives in SECURITY DEFINER SQL front doors with a pinned `search_path`."
- **WO-1** (`qa/work-orders/auto-enrollment-v1/WO-1.md:52`): "All authority lives in SECURITY DEFINER SQL front doors with a pinned
  `search_path`."
- **VERIFICATION_SPEC §3.4** (`qa/verification/auto-enrollment-v1/VERIFICATION_SPEC.md:298`): a function's SET clause, "such as the
  pinned `search_path` S-10 requires on every SECURITY DEFINER front door", is not a hit.
- **The governance recipe** (`governance/CANONICAL_WORK_CONTRACT.md:45`): "The canonical operation is a database RPC (`security
  definer`, `set search_path = ''`, authorization re-derived inside) ...".

## Evidence

- Every function the V1 migration creates (133 at this amendment: the 38 SECURITY DEFINER front doors, the guards and the helpers)
  pins `set search_path = pg_catalog, pg_temp`. The static contract's R8 reads it from the source and schema acceptance C10 reads it
  back from the plane after the migration; any other setting, the empty one included, fails both. (Amended: part 990 no longer
  re-checks the pin inside the migration, see CR-021; the fact and its two developer rows are unchanged.)
- The PostgreSQL documentation (CREATE FUNCTION, "Writing SECURITY DEFINER Functions Safely") recommends a `search_path` that lists
  `pg_temp` explicitly and last. The candidate uses that form and treats any other setting in its own functions as a defect; schema
  acceptance L9, L9b, L11 and L11b are its regressions (nothing a calling session creates takes part in a guard's or a front
  door's evaluation).
- The governance recipe is general Brain OS guidance (it points to `supabase/migrations/202608280013_frictionless_company_delete.sql`
  and the `frictionless-secure-crud` skill). It is not a Factory V1 acceptance source, but a reader following it would write the form
  the candidate now refuses.

## Why it must be the Director's decision

`governance/` is Director-owned and must stay byte-identical to r3 on the implementation branch. The divergence is deliberate and
conforms to the ratified Factory texts, but a governance recipe that recommends the other form should be reconciled by its owner,
not silently contradicted by an implementation.

## Requested decision (any one)

1. **Align the governance wording** with `set search_path = pg_catalog, pg_temp` (pg_catalog first, pg_temp last), in a Director
   revision, and decide whether the reference implementation and the `frictionless-secure-crud` skill follow.
2. **Record the Factory V1 form as an accepted, scoped divergence** from the general recipe, with no text change now.
3. **Some other resolution the Director specifies.**

## Alternative considered (and why not adopted)

Keeping `set search_path = ''` in the V1 functions to match the governance text. Rejected: the S-10 / WO-1 requirement is a pinned
`search_path`, both forms are pinned, and the candidate's regressions (L9, L9b, L11, L11b) require the documented form: they fail with the
empty one.

## Impact

- **If (1):** a Director revision of `governance/CANONICAL_WORK_CONTRACT.md` (and, at the Director's choice, the general Brain OS
  migrations and the skill); no Factory V1 change.
- **If (2) or (3):** no Factory V1 change unless the Director names one.
- No product code, migration statement, contract row or acceptance criterion changes on the strength of this CR before it is decided.
