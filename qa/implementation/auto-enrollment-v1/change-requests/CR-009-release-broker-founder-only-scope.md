# CHANGE REQUEST — DIRECTOR DECISION REQUIRED

**CR-009 — What "founder-only for `release_broker`" covers beyond granting it**

- **Filed:** 2026-09-28 by the IMPLEMENTER capability, on `factory/auto-enrollment-v1-implementation`.
- **Built on:** Director r3 `c7a845b61a3b0b419e8c9dfeff397547fdc75b03`.
- **Kind:** a request for clarification. The r3 texts state the rule in two forms, a narrow one and a broader one. The candidate
  implements the narrow reading. No Director text is edited, and no behaviour changes because of this request.
- **Until the Director decides, the candidate keeps its current behaviour** (below), and the candidate report states it.

## Requirement (the r3 texts)

- **Contract §1** (`docs/architecture/features/factory-node-management-auto-enrollment.md:127`, the authorized capability envelope):
  "Set at Add Computer and amended only by a Factory admin (founder-only for `release_broker`), audited."
- **Contract §2** (same file, `:346`): "amended by a Factory admin (founder-only for `release_broker`), audited;"
- **WO-1** (`qa/work-orders/auto-enrollment-v1/WO-1.md:14`): "set at Add Computer, amended only by a Factory admin (founder-only for
  `release_broker`),".
- **Contract §4** (same file, `:422`): "grant `release_broker` in an envelope; publish a release | founder-only per S-8". The same
  table assigns its other rows to "a Factory admin".
- **S-8** (`docs/architecture/features/factory-node-management-auto-enrollment.SECURITY_TENANCY.md:18`): "Founder-only actions
  (granting `release_broker`; publishing, superseding or revoking a release) require tier `founder` in `tenant_admins` **and** live
  role founder".

§4 and S-8 name the founder-only action as *granting* `release_broker`. §1, §2 and WO-1 attach "founder-only for `release_broker`"
to *amending* the envelope. A reader can take that to mean any amendment of an envelope that holds `release_broker`.

## Evidence (what the candidate does: the narrow reading, §4 and S-8)

- **Granting** means adding `release_broker` to the envelope in force. The amendment reads that envelope under the computer's row
  lock (B-4). Add Computer with `release_broker` is also granting. Both need tier `founder` and live role founder, and a refusal is
  audited (`supabase/control-plane/v1/210_admin_computers.sql`, `admin_amend_envelope` and `admin_add_computer`;
  `factory._founder_only` in `200_admin_common.sql`).
- A tier admin **may** perform the contract §4 "a Factory admin" actions other than granting `release_broker`. The implementer's
  analysis of what this reading permits, with the actions it concerns, went to the Director privately, through the founder (ledger
  rule 3).
- Regressions that pin this reading: `qa/factory/v1/revocation_interleaving.mjs` I5c (a tier admin amends another field of an
  envelope that holds `release_broker`: allowed), I5a (a tier admin adding it: refused `founder_only`), and
  `qa/factory/v1/admin_acceptance.mjs` P4 / P4f.
- The candidate is stricter than §4 in two places, and the candidate report states both: `submit-work-order` that requires
  `release_broker`, and `revoke-key`, are founder-only.

## Why it must be the Director's decision

This is about who may change or use the release tier, which is an authority rule (S-8, CR-003). The implementer may not widen or
narrow an authority rule on its own reading. The r3 texts support both readings, so the Director has to choose one.

## Requested decision (any one)

1. **The narrow reading stands** (§4 / S-8 as written): only granting `release_broker` is founder-only. No change to the candidate.
2. **Every amendment of an envelope that holds `release_broker`, or would hold it afterwards, is founder-only.** That covers
   removing it and changing any other field. Other actions stay a Factory admin's.
3. **Option 2, and founder-only decisions for the further actions listed in the private note.**
4. **Some other resolution the Director specifies.**

## Alternative considered (and why not adopted)

Implementing option 2 or 3 now, because they are stricter. Not adopted:

- Both options narrow what §4 lets a Factory admin do: §4's rows name "a Factory admin" for those actions.
- A stricter rule is still a change to the authority contract. It would also change AC-7 persona outcomes that the verifier judges
  against r3 as written.

## Impact

- **If (1):** none. The Director may want to align §1 / §2 / WO-1 with §4 in a later revision.
- **If (2):** `admin_amend_envelope` refuses `founder_only` when the envelope in force or the new envelope holds `release_broker`.
  The decision is still made under the row lock. I5c changes to expect `founder_only`. P4 gains the amendment rows.
- **If (3):** as (2). In addition, the front doors named in the private note decide founder-only on the envelope in force, read
  under the same row lock. New per-action persona rows are added to P4, with one mutant for each action.
