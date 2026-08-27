SCENARIO ID: SC-107-new-table-governance-checklist

PURPOSE: A reusable checklist (not a one-off test) for adding any new table to Brain OS.
Synthetic worked example: a developer adds a `vendor_contracts` table. **`vendor_contracts`
does NOT exist in the schema — it is a hypothetical used only to make this checklist
concrete.** No governed table may ship without answering every item below.

ACTOR: any engineer / coding agent adding a table.

ORGANIZATION: n/a (process doc).

ROLE: n/a.

CAPABILITIES: n/a.

PRECONDITIONS: a migration introducing a new table.

ACTION: before merging, the author must answer, in the same change:

1. **Organization scope** — does a row belong to one company (`company_id` column checked
   via `has_company_access`/`is_company_manager`), to no company (global → founder-only by
   default), or is it itself a membership boundary? (`vendor_contracts` → per-company.)
2. **Sensitivity / domain** — one of `visibility_level` (public/internal/confidential/
   restricted/founder_only) and, if approval-adjacent, one of `approval_domain` (general/
   salary_hr/finance/legal/production/external_comms). A financial-value contract → `finance`
   domain, `confidential` tier.
3. **SELECT policy** — who can read? Must branch on the actual sensitivity column if one
   exists (DATA_CLASSIFICATION.md's decorative-column warning).
4. **INSERT policy** — who can create? (usually `has_company_access` or manager+.)
5. **UPDATE policy** — who can edit? Test SEPARATELY from SELECT (SC-118 lesson).
6. **DELETE policy** — who can delete? Usually narrower than update (manager+).
7. **AI visibility rule** — will sem-ai-command's `buildContext()` query this table? If so
   it inherits the caller's RLS automatically (no service role) — confirm the SELECT policy
   is what you want the model to see.
8. **Audit requirement** — do writes need an `audit_logs` row? For finance/legal: yes.
9. **Risk level** — map the destructive/external operations to `risk_level` +
   forced-approval keywords if the AI can trigger them.
10. **RLS enabled** — `alter table … enable row level security;` MUST be present, and there
    must be no leftover broad `for all` policy (KNOWN_FAILURE_MODES.md #1).
11. **Governance files updated in the SAME change** — DATA_CLASSIFICATION.md,
    CAPABILITY_MATRIX.yaml, the relevant roles/*.md (BRAIN_OS_CONSTITUTION.md rule).
12. **Live impersonation test added** — authorized + unauthorized + wrong-company personas,
    in qa/ (SC-118/119 pattern).

EXPECTED RESULT: a table that answers all 12 is governed; one that skips any is a claim,
not a control.

EXPECTED DENIALS / DATABASE STATE / AUDIT / AI VISIBILITY / CLEANUP: n/a (process doc).

AUTOMATION STATUS: MANUAL VERIFICATION ONLY — this is a review checklist. A migration-linter
that enforces items 3–6, 10 automatically is proposed in SC-125 (policy coverage gate) and
DATA_CLASSIFICATION.md — not yet built. Cross-ref governance/BRAIN_OS_CONSTITUTION.md
six-step workflow, SC-125.

LAST VERIFIED DATE: n/a (checklist)
