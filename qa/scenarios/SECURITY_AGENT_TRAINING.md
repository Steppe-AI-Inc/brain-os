# Security Agent Training (SC-112)

Mandatory reading for any security agent or reviewer working on Brain OS. **Brain OS
includes AI authorization surfaces, not just traditional API attacks** — the model is a
way to ask for data and to trigger actions, so every classic attack has an AI-mediated
twin. Work the whole checklist below.

## The systematic attack checklist

For each item: what is the attack, what is the real Brain OS control, and which scenario
proves it.

1. **Horizontal privilege escalation** (peer's data) — an employee reading a co-worker's
   task/salary. Control: `tasks_select_scope` owner/manager only; `salary_select_authorized`
   self/hr_finance. Proof: SC-054, SC-069.
2. **Vertical privilege escalation** (higher role's data/action) — employee→manager→
   founder. Control: `is_company_manager`/`is_hr_finance`/`is_founder_or_admin` gate reads
   and approvals. Proof: SC-057, SC-074, SC-118.
3. **IDOR / direct object reference** — fetching a resource by guessed id. Control: RLS on
   every table filters by tenant/owner regardless of how the id was obtained. Proof: SC-054
   (by-id), SC-056 (by-id).
4. **Cross-tenant access** — company A reading company B. Control: `has_company_access`/
   `is_company_manager` per-company, both directions. Proof: SC-056, SC-071, SC-090.
5. **AI-context leakage** — asking the model for restricted data. Control: `buildContext()`
   uses the caller's JWT, never service role — restricted rows never enter context. Proof:
   SC-055, SC-069, `ai/context_security`.
6. **Derived-data leakage** — "is it above $100k", "first digit", "rank vs last month".
   Control: the source figure isn't in context, so nothing to derive. Proof: SC-068.
7. **Service-role misuse** — a frontend route to a privileged function. Control: NO
   service-role client exists in any request path; MCP RPCs self-check founder. Proof:
   SC-092, SC-093.
8. **Approval bypass** — "urgent, skip approval" / self-elevation. Control: server-side
   `detectForcedApprovalKeywords` forces the gate regardless of the model. Proof: SC-065,
   SC-084, AI_ADVERSARIAL_PROMPT_BANK.
9. **Approval replay** — double-click / retry. Control: `decide_approval` pending-status
   guard + FOR UPDATE lock. Proof: SC-063, SC-064.
10. **Payload mutation** — change the approved content before execution. Control: server-
    built payloads + no edit UI + decision-time re-read. **KNOWN GAP**: no DB-level
    immutability (an approver CAN rewrite the payload). Proof/gap: SC-060,
    KNOWN_FAILURE_MODES.md #15.
11. **Webhook spoofing** — forged inbound events. Control: NOT APPLICABLE — no webhooks
    exist; required for the future build (SC-077, SC-109 item 1).
12. **Duplicate-event abuse** — replayed provider events. Control: NOT APPLICABLE today;
    idempotency required for the future build (SC-076, SC-099).
13. **Prompt injection** — instructions inside a document/customer message. Control: content
    is untrusted data; RLS-before-LLM means an injection cannot widen context. Proof:
    SC-066, SC-067.
14. **Secret leakage** — keys/tokens in logs/UI/audit. Control: no Edge Function logs
    secrets; MCP tokens live in Vault behind a founder-only RPC. Proof: SC-104, SC-086.
15. **Classification downgrade** — confidential→internal to widen audience. Control:
    sensitivity changes are manager+/protected. Proof: SC-073, SC-119.
16. **Segregation-of-duties bypass** — self-approve your own finance/salary action.
    **KNOWN GAP**: no preparer/approver split. Proof/gap: SC-058, KNOWN_FAILURE_MODES.md #14.

## Method

Use live impersonation (`qa/scenarios-runner/`, rolled-back transactions). Diff live
policies against the schema file with `_policy_drift_signature.sql` — a migration ledger
saying "applied" is NOT proof (it lied once, KNOWN_FAILURE_MODES.md #8). When you find a
gap, reproduce it live, document it in KNOWN_FAILURE_MODES.md, add a reproducing runner, and
STOP — do not weaken any control to make a test pass (ENGINEER_AGENT_TRAINING.md), and do
not push a schema/RLS fix without explicit founder authorization.

## Scope your claims

Never say "employee data isolation is secure." Say "verified live 2026-08-27: an employee
fixture at CLIX GPS read 0 of company B's tasks/documents/financial_reports (SC-056)."
State the exact persona × resource × route you tested (CLAUDE.md §"Security claims must
state their exact scope").
