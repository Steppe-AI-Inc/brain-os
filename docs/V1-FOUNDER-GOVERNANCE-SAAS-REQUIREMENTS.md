# SEM Brain v1 — Founder Governance, SaaS Tenancy, AI Assistants, Knowledge and Billing

Status: product requirement / architecture guardrail
Branch: `codex/sem-brain-v1`

## 1. Role certification and senior knowledge transfer

SEM Brain must reduce recurring senior-person training overhead.

Every role may have a level/certification path. A person progresses by passing defined tests and producing evidence, not by tenure alone. Higher responsibility, bonus eligibility, or role upgrade can depend on passing the relevant level and tests. Employment/legal terms remain subject to applicable law and human approval.

Senior and country-manager roles must maintain a Role Knowledge Pack containing the source materials needed to reproduce their work. Required artifacts may include SOPs, brochures, proposal templates, editable presentations, spreadsheets, checklists, customer scripts, pricing guidance, reports, training material, and role-specific operating documents.

Editable originals are required where an editable source exists. PDF-only delivery is insufficient for assets that should remain editable. Store both editable source and approved/exported derivative when appropriate, for example PPTX + PDF, DOCX + PDF, XLSX + PDF/CSV.

Artifacts require metadata: organization, role, owner, source format, editable-source requirement, version, approval status, language, sensitivity, and evidence/source links.

AI should be the first-line tutor using approved role knowledge. Senior escalation should occur only when documentation/tests cannot resolve the issue or a judgment/approval is required.

## 2. Global SaaS identity vs organization membership vs employee profile

Do not encode employment role as a global user role.

Separate:

- `auth.users` / platform identity: a person who can sign into SEM Brain.
- `organizations`: a tenant/workspace/company using SEM Brain.
- `organization_memberships`: relationship between a user and an organization, including owner/admin/manager/employee/contractor/guest roles.
- `employee_profiles`: employment relationship, compensation/KPI/manager/position data. An employee profile may exist before the employee has a login.
- `platform_admin`: SEM Brain platform operations role, separate from customer-organization ownership.

A single user may own one organization, be an employee of another, and be a guest of a third.

SEM Technologies' founder has ultimate automation/approval authority inside authorized SEM organizations. This must not automatically grant default read access to unrelated customer tenants.

## 3. Signup and invitation model

Two entry paths are required:

### Public/free signup
A new user may create an account without belonging to an existing organization. On signup the system creates a personal workspace, or lets the user create/connect a company. The user becomes owner of organizations they create.

### Organization invitation
An organization owner/admin may invite a user by email. Invitations must be expiring, single-use, role-scoped and organization-scoped. If the invitee already has a SEM Brain account, membership attaches to that identity. If not, signup completes the invite.

SEM internal companies may use invitation-only membership even while the public product allows self-signup into personal/customer workspaces.

UX must visibly distinguish:
- Platform account
- Active workspace/organization
- Organization role
- Employee status if applicable

Provide a workspace switcher. Never mix SaaS billing identity with employment compensation identity.

## 4. RLS and chat privacy

All tenant-owned production tables must carry organization/company ownership or have an unambiguous path to it.

Authorization must be enforced server-side using Supabase Auth + RLS. Browser UI filtering and prompts are not security boundaries.

AI context retrieval must execute using the authenticated user's JWT/RLS scope before model invocation. The model receives only records the authenticated actor is authorized to read.

Examples:
- Technician asking for full company revenue must receive no restricted financial data.
- Employee cannot read ownership, company cash, other salaries, restricted margins, founder-only memories or unauthorized companies.
- Company manager may see permitted operating data but cannot automatically read founder/holding-company private data.
- Cross-company access returns no rows.

Use explicit capability checks for sensitive domains such as ownership, finance, salary, legal, contracts, margins, investor data and founder-only strategy.

AI assistants must never bypass RLS because a prompt requests restricted information.

## 5. Per-person AI assistant and founder automation authority

Every active employee may have a paired AI assistant, for example:
- Human: Aigerim
- AI: Aigerim AI Assistant

The assistant is not the human. AI-authored messages must be visibly identified as AI-authored.

Conversation policy is set by an authorized organization owner/founder, with modes such as:
- manual: human replies only
- draft: AI drafts, human sends
- auto-routine: AI may answer pre-approved routine categories
- fallback-after-timeout: if the assigned human does not respond within configured SLA, AI may answer permitted categories

Employees may reply to their conversations but cannot unilaterally increase their AI assistant's automation authority beyond organization policy.

The AI assistant's data access is the intersection of:
1. the human/role's RLS scope,
2. organization automation policy,
3. channel/action policy,
4. sensitivity restrictions.

Sensitive/external/high-risk actions still require appropriate approval.

When an employee leaves, revoke the human membership immediately. Do not impersonate the former employee. Preserve approved company knowledge as a role/knowledge archive and transfer active work to a role/team assistant or successor.

Every AI reply must log: actor type, assistant identity, human/role represented, source conversation, knowledge/evidence references, automation policy, timestamp, and approval if applicable.

## 6. Software Factory — required production capability

Current v0.7.1 Software Factory is not sufficient. v1 must become a real delivery pipeline, not only a ticket generator.

Target lifecycle:

Founder/product command
→ product brief
→ PRD and acceptance criteria
→ architecture and threat/RLS design
→ schema/migration plan
→ atomic implementation tickets
→ coding agent branches/commits
→ unit/integration/security/browser tests
→ preview deployment
→ autonomous QA
→ human approval gate
→ merge/release
→ monitoring and post-release verification

Software Factory must support generating a separate product/application from a reusable template without contaminating the SEM Brain repo.

### Immediate reference use case: Mongolia HOA automation platform

The factory should be capable of taking a founder request such as “Build a full HOA automation system” and producing a working project including at minimum:
- organizations/HOAs/buildings/units
- resident and household accounts
- invitation/login/access control
- recurring dues and billing
- invoices and payment status
- payment integration abstraction
- resident balances/ledger
- transparent resident-facing financial window with configurable disclosure
- expenses and vendor/contract records
- maintenance/service requests
- technician/work-order assignment
- announcements and notifications
- document/artifact library
- resident communication/chat
- audit trail
- manager/admin dashboard
- role/RLS separation
- EN/MN-ready shell
- tests and Vercel preview

Production deployment must remain approval-gated.

## 7. SEM Brain billing / AI usage resale model

SEM Brain should have a first-class Billing area for SaaS customers.

Do not represent vendor credits as transferable SEM Brain money. Use an internal SEM Brain prepaid service-credit ledger for consumption of SEM Brain features/AI orchestration.

Required core objects:
- billing_accounts
- service_credit_ledger (append-only debit/credit ledger)
- deposits/payments
- invoices
- provider_usage_events
- model/provider price table
- customer rate table
- markup/margin rules
- usage reservations/holds where needed
- credit grants/promotions
- refunds/adjustments with audit
- referral/partner earnings

Displayed balance must be derived from ledger entries, not a freely mutable balance column.

Token/usage dashboard should show by organization/user/model/provider:
- input/output/cached tokens or equivalent usage units
- provider cost
- SEM Brain customer charge
- gross margin
- remaining prepaid service balance
- daily/monthly budgets
- hard stops/alerts

SEM Brain may charge for its application/orchestration service, but must not sell/transfer provider API keys or provider-issued non-transferable credits.

## 8. Compensation separation

Employee compensation is separate from SaaS customer billing.

Employee model:
- fixed base salary
- attendance/reliability inputs where lawful and contractually applicable
- performance bonus, normally bounded by policy (for example up to 20–30%)
- value-creation incentives such as uncapped sales commission according to approved rules

AI calculates/recommends from auditable evidence. Salary/bonus/deduction policy remains versioned and compensation actions require authorized human approval.

## 9. Minimum additional v1 acceptance tests

Add to the release gate:

26. A public user can sign up and receive a personal workspace without becoming a member of SEM's organizations.
27. An invited employee joins only the invited organization and role.
28. One user can switch between organizations without data leakage.
29. Platform-admin status does not silently bypass customer-tenant RLS.
30. Technician asking AI for restricted revenue receives no restricted financial records.
31. AI context pack contains only RLS-authorized data before model invocation.
32. Each employee can have a separately identified AI assistant.
33. AI-generated external/chat replies are visibly marked as AI-authored and audited.
34. Employee cannot grant their assistant broader automation authority than organization policy permits.
35. Fallback-after-timeout assistant activates only after configured SLA and only for permitted categories.
36. Terminated/revoked employee loses access immediately and the assistant cannot impersonate the departed human.
37. Senior-role knowledge pack rejects PDF-only delivery when an editable source is required.
38. Software Factory can create a complete isolated project lifecycle from PRD through tested Vercel preview.
39. Billing balance equals append-only ledger sum and cannot be directly edited.
40. Duplicate provider usage events do not double-charge customer balance.
41. Vendor API keys/credits are never exposed or transferred to customer accounts.
42. Customer usage charge, provider cost and gross margin reconcile for every billable AI event.

## 10. Architecture rule

These requirements are mandatory inputs to the v1 architecture. Do not implement them as disconnected dashboard mockups. Identity, tenancy, RLS, conversation authorization, workflow approval, artifacts, billing and execution must share a coherent production data model and audit trail.
