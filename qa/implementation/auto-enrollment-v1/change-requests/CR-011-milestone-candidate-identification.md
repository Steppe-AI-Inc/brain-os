# CHANGE REQUEST — DIRECTOR DECISION REQUIRED

**CR-011 — How does the server identify a milestone candidate, so that the campaign's physical-separation rule (S-16(b), AC-14(i))
applies to every one?**

- **Filed:** 2026-09-28 by the IMPLEMENTER capability, on `factory/auto-enrollment-v1-implementation`.
- **Built on:** Director r3 `c7a845b61a3b0b419e8c9dfeff397547fdc75b03`.
- **Kind:** a request for a Director statement. The r3 texts require the campaign's rule "for every milestone candidate" and do not
  say how the server knows that a work order is one. No Director text is edited.
- **Until the Director decides, the candidate keeps the r3 behaviour** for the question below (per-work-order campaign membership,
  set by the submitter), and the candidate report states it. The candidate does not rely on this request.
- **Revised 2026-09-28** after verifier review: the r3 basis of the refusals already in the candidate is stated, and option 3 is made
  consistent with it. The question is unchanged.

## Requirement (the r3 texts)

- **S-16(b)** (`docs/architecture/features/factory-node-management-auto-enrollment.SECURITY_TENANCY.md`, row S-16): "every milestone
  candidate is **certified on a different physical machine from every member of its authoring set**".
- **Contract §1**, the campaign "Auto-Enrollment V1" (`docs/architecture/features/factory-node-management-auto-enrollment.md`):
  "plus the certifying node differs physically from the node of every member of the authoring set, for every milestone candidate."
- **AC-14(i)** (`qa/verification/auto-enrollment-v1/ACCEPTANCE_MATRIX.md`): "The milestone campaign requires separation for every
  candidate, whoever the author is."
- **AC-12(e)** and **S-14**: through the Admin API a policy can only be made stricter; the campaign rows cannot be changed.
- **R-3** (`ACCEPTANCE_MATRIX.md`, rehearsals): AC-3 "with the campaign applied; or, on one machine, **under the tenant default
  only**, with the campaign's record-and-fingerprint rule proved by AC-14(i), (m) and (p)."
- **AC-3**: "Every certification satisfies S-13 against the whole authoring set and, **under the campaign**, is on a different
  physical machine from every author."

R-3 and AC-3 presuppose that a work order is, or is not, under the campaign. S-16(b) and AC-14(i) say the rule holds for every
milestone candidate. Nothing says how the server decides which work orders are milestone candidates.

## Evidence (what the candidate does)

- The campaign applies to a work order that names it (`work_orders.campaign_key`), as at r3. Under that per-work-order membership
  (the reading R-3 and AC-3 take: "under the campaign", "with the campaign applied"), **a work order carrying the campaign's key is a
  milestone candidate.**
- **Enforced now, on the r3 texts alone (no decision needed):**
  - the key a submission carries must name a campaign policy row of the tenant. An unknown key, a malformed one and a non-string
    are all refused by name at submission (`unknown_campaign`, nothing written, audited). A work order whose campaign has no policy
    row is refused at gate 7 and at certification (`campaign_unknown`) and is never read as the tenant default. Basis: P-9 (no
    silent fallback to a default authorization) and S-14 / AC-12(e) (the campaign's application cannot be relaxed through the Admin
    API);
  - a work order carrying the campaign's key cannot be submitted with `requires_verification` false
    (`campaign_requires_verification`). Basis: that work order is a milestone candidate under r3's per-work-order membership, and
    S-16(b) requires **every** milestone candidate to be certified on a different physical machine. A keyed work order that is never
    certified would carry the campaign's name while escaping its rule, which AC-12(e) forbids through the Admin API.
  - Code: `supabase/control-plane/v1/220_admin_releases_policies_work.sql` `admin_submit_work_order`; `110_eligibility.sql`
    `factory._campaign_known`; `130_verification.sql` `node_certify`. Regressions: `qa/factory/v1/admin_acceptance.mjs` G3,
    `qa/factory/v1/independence_acceptance.mjs` (i2).
- **Open (this request):** whether the server must identify milestone candidates beyond the work orders that name the campaign. The
  implementer's analysis of the current behaviour went to the Director privately, through the founder (ledger rule 3).

## Why it must be the Director's decision

Which work is a milestone candidate is a product and acceptance rule. Refusing untagged work, or treating every new-model work order
as a candidate, would make R-3's one-machine rehearsal ("under the tenant default only") impossible as written, and changes what a
Factory admin may dispatch. The implementer may not settle that by its own reading.

## Requested decision (any one)

1. **Fail closed by default.** While the tenant holds exactly one campaign row that requires physical separation, a new-model work
   order that names no campaign is under that campaign. Running under the tenant default needs an explicit, audited opt-out in the
   submission (for example `"campaign_key": "tenant_default"`), allowed only to tier `founder` with live role founder, because AC-12(e)
   forbids relaxing the campaign's application through the Admin API. `requires_verification` false is refused while the campaign
   applies. R-3's one-machine rehearsal passes the opt-out explicitly.
2. **As option 1, with the opt-out allowed to any Factory admin** (audited).
3. **The r3 behaviour stands:** membership is what the submitter names. A work order carrying the campaign's key is a milestone
   candidate and is always certified (so it cannot be submitted without verification, as the candidate already enforces); a work
   order without the key is not a milestone candidate. The Director states this in a revision, and the candidate report records who
   submits milestone candidates.
4. **Some other rule the Director specifies.**

## Alternative considered (and why not adopted)

Implementing option 1 now. It is ready (the submission front door already validates the key and reads the campaign rows), but it
changes which work a Factory admin may run outside the campaign and how R-3 is rehearsed. That is a decision about binding text, so
it waits for the Director.

## Impact

- Code: after a decision for option 1 or 2, `admin_submit_work_order` resolves an omitted key and the opt-out; developer suites that
  run under the tenant default (runtime U3, parts of the independence suite) pass the opt-out. Option 3 needs no code change.
- Acceptance: AC-14(i) and S-16(b) evidence then covers untagged submissions (options 1, 2) or states the submitter rule (option 3).
- No schema change for any option.
