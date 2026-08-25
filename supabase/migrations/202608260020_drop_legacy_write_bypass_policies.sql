-- CRITICAL: these five tables each carry a legacy "*_company_scope" policy with
-- cmd = ALL and qual = has_company_access(company_id) — a PERMISSIVE policy, so it's
-- OR'd with the real *_write_manager / granular insert/update/delete policies that
-- already exist on every one of these tables. The practical effect: ANY active company
-- member can currently INSERT/UPDATE/DELETE proposals, proposal_items, product_lines,
-- inventory_items, and sales_leads — not just managers, completely undermining the
-- write_manager restriction that was supposedly already in place. This is a write/
-- tampering bug, not just a read leak — worse than anything else found in this pass.
-- Verified before dropping: every one of these tables already has a correct SELECT
-- policy and a correct write policy (write_manager, or granular insert/update/delete
-- for sales_leads) that fully covers legitimate access — nothing legitimate is lost.
drop policy if exists "inventory_company_scope" on public.inventory_items;
drop policy if exists "product_lines_company_scope" on public.product_lines;
drop policy if exists "proposal_items_scope" on public.proposal_items;
drop policy if exists "proposals_company_scope" on public.proposals;
drop policy if exists "sales_leads_company_scope" on public.sales_leads;
