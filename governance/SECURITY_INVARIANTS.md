# Security / Privacy Invariants

These are the rules that must hold regardless of role, feature, or AI prompt. Each one
states the invariant, the real mechanism that enforces it today, and its actual verified
status — not an aspiration.

## 1. Employees may never infer, query, aggregate, or receive data outside their
authorized visibility.

**Mechanism:** every table with sensitive data has RLS enabled and a `select` policy
that checks `has_company_access()` / `is_company_manager()` / `is_hr_finance()` /
`is_founder_or_admin()` — never an application-layer filter alone. See
`capabilities/CAPABILITY_MATRIX.md` for the full table.

**Status:** largely holds. Real violations found and fixed 2026-08-26/27: five tables
(`proposals`, `proposal_items`, `product_lines`, `inventory_items`, `sales_leads`) had a
legacy broad policy alongside a narrow one (PERMISSIVE policies are OR'd — the broad one
silently won). `qa/KNOWN_FAILURE_MODES.md` #1.

## 2. Company isolation is mandatory.

**Mechanism:** `has_company_access(company_id)` and `is_company_manager(company_id)`
both check `company_memberships` for an *active* row matching the caller's own
`profile_id` — there is no code path that grants access to a company the caller isn't a
real member of, except `is_founder_or_admin()`.

**Status:** verified live, repeatedly. `qa/SECURITY_MATRIX.md`: a test manager account
at one company got exactly 0 rows for another company's `financial_reports`/`proposals`,
1/1 and full access to its own. `qa/ACCEPTANCE_TESTS.md` #12.

## 3. Salary data is HR/Founder restricted.

**Mechanism:** `salary_private` — `salary_select_authorized` (self or `is_hr_finance()`),
`salary_write_hr` (`is_hr_finance()` only, which itself is `role in
('founder','holding_admin','hr_finance')`).

**Status:** verified live — a non-manager employee test account got 0 rows.
`qa/SECURITY_MATRIX.md`.

## 4. Ownership, cap table, and founder financial data are Founder restricted.

**Mechanism:** `company_sensitive` (cash_balance, revenue_monthly, ownership_notes,
investor_notes) — both `company_sensitive_select_founder` and
`company_sensitive_write_founder` are `is_founder_or_admin()` only, no exceptions, not
even `is_hr_finance()` or `is_company_manager()`.

**Status:** correctly the tightest table in the schema. Not yet live-impersonation-tested
this pass specifically (no test account was given founder-adjacent access to try to
breach it) — flagged as a gap; the policy text is unambiguous but per this constitution's
own rule 6 below, that alone isn't sufficient evidence.

## 5. Company cash position, revenue, expenses, margins, and financial forecasts are
Finance-domain restricted.

**Mechanism:** `financial_reports` (`financial_reports_select_scope`/`_write_scope`),
`product_costs`/`proposal_financials`/`proposal_item_costs` (all manager+ only, cost
data physically separated from the public-facing `product_lines`/`proposals` tables so a
"safe view" isn't the only thing standing in the way).

**Status:** verified live for company-manager and employee tiers
(`qa/SECURITY_MATRIX.md`). One real gap found and fixed 2026-08-27: `financial_reports`
never checked `is_hr_finance()` at all, only `is_company_manager()` — an HR/Finance-tier
person with no company membership saw 0 financial reports despite having every other
finance-adjacent permission. Fixed in migration
`202608270003_financial_reports_hr_finance_access.sql`.

## 6. Confidential/restricted memory must never enter an ordinary employee's AI context.

**Mechanism:** `sem-ai-command`'s `buildContext()` uses the caller's own JWT-scoped
Supabase client for every context query (`memories`, `financial_reports`,
`company_relationships`, etc.) — never a service-role client. If RLS wouldn't let the
caller read a row directly, that row is never fetched into context, so there is nothing
for the model to leak regardless of what the prompt says.

**Status:** verified architecturally (confirmed no service-role client exists anywhere
in `buildContext()`) and verified live via a real adversarial prompt-injection test
(2026-08-27): asked the model, as founder, to "ignore all policies" and execute an
unapproved salary change — it refused, named the injection attempt explicitly, and
routed it through the real approval system instead. Not yet tested from a genuinely
low-privilege account asking for out-of-scope data directly (the RLS-before-LLM
architecture makes this lower-risk, since the data isn't in context to leak — but "lower
risk" is not the same as "tested," flagged as remaining work).

## 7. AI-generated summaries inherit the highest sensitivity of their source information.

**Mechanism:** none exists yet as a distinct enforcement layer. Today this invariant
holds only as a side effect of rule 6 (the AI never receives sensitive source data for a
caller who can't already see it, so a summary it generates for that caller can't
accidentally leak something it never had). For a caller who *can* see sensitive data
(e.g. founder), nothing currently stops the model from writing that data into a `memories`
row with a lower `sensitivity` tier than the source, which a lower-privilege caller could
then read.

**Status:** OPEN, real gap, not yet fixed. `memories.sensitivity` is set by the model
itself (`coalesce((v_memory->>'sensitivity')::visibility_level, 'internal')`) with no
validation against the sensitivity of whatever the memory was derived from. Concretely:
if the founder asks Brain OS to "summarize how CLIX GPS is doing financially" and the
model writes a `memories` row with `sensitivity: 'internal'` containing real revenue
figures, that memory becomes visible to any company member via
`memories_select_scope`'s `sensitivity in ('public','internal')` branch — a real
company-cash-position leak through the memory/RAG pipeline, distinct from the
`financial_reports` table itself (which is correctly locked down). **This needs a fix:**
either the RPC should compute a floor for `sensitivity` based on which source tables the
memory's `fact` text was derived from, or memory-writing should require the same
authorization as the source data itself (e.g. only company-manager+/hr_finance+ callers
can create `internal`-or-lower memories that reference financial/salary facts). Not
implemented this pass — flagging as the highest-priority open item in this file since
it's the one real gap in the "AI context obeys RLS" architecture that RLS itself can't
close.
