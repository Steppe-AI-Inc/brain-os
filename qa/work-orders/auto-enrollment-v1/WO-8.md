# WO-8 — Brain OS → Factory → Computers, and the Factory Admin API

- **Binding**, revision 1, issued by the DIRECTOR.
- Contract: §4, §5, §7; P-5, P-9; S-7, S-8.
- Founder text: I A.1 §1, I A.2.
- Executed by: the IMPLEMENTER.
- Certified by: a distinct authorized verifier.
- Scope changes: only a Director revision changes this WO.

## What must be true
- **What the page offers.** Brain OS → Factory → Computers shows the computer list with server-derived states, and offers:
  - Add Computer (envelope + pairing code);
  - the installer download (public; the file sha256 as served, the S-5 digest and the signing state shown; CR-004);
  - drain / resume;
  - rotate / revoke / re-pair;
  - create an agent principal and issue its pairing code;
  - archive / restore;
  - envelope amend;
  - the policy view;
  - release status;
  - waiting verifications;
  - work observation.
- **Two conditions for every admin action** (S-8, CR-001). The Factory Admin API requires both, re-derived from the caller's own Brain
  OS token on every call:
  - (a) founder / holding_admin;
  - (b) presence in `factory.tenant_admins`.
  - Founder-only actions require tier `founder` in `tenant_admins` **and** role founder (CR-003): granting `release_broker`, publishing
    or revoking a release. No Admin API action adds a trust key (S-5).
  - Refused, with no data and no existence leak: every other persona, a self-promoted employee, a holding_admin who self-promoted to
    founder, and an admin not in `tenant_admins`.
- **Policies are stricter-only.** The page and Admin API offer policy changes only in the stricter direction. The milestone campaign rows
  are read-only, except binding S-16(a) to a computer at its Add Computer (add-only; S-14).
- **Truth on the page.** It shows server truth only (derived states, heartbeat age from server time, aggregate counts), matching the
  server row for row after a reload and in a fresh session. Every refusal is shown by name.
- **Session-less routes.** Exactly the S-7 allowlist.
- **Brain OS production.** It gets no schema change from this feature.
- **`/software-factory/workers`.** Replaced or retired. The candidate states which, for Director ratification.

## Must satisfy
AC-2, AC-7, AC-12, S-7, S-8, S-9, S-11, S-14, P-5, P-9

## Depends on
WO-1, WO-2, WO-3, WO-7.

## Founder boundary
The production Brain OS deploy (a PR into `master`), production secrets, and seeding `tenant_admins` are founder actions. `master`
stays untouched in this phase.

## Candidate report must include
- The persona × path matrix, including the self-promoted employee.
- The allowlist probe.
- The row-for-row server comparison.
