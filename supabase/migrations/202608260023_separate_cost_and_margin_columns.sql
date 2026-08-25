-- Column-level sensitivity can't be expressed as Postgres RLS (RLS is row-level), and a
-- "safe view without the sensitive column" (safe_proposals already existed) does NOT
-- protect anything if the underlying base table itself remains directly queryable — any
-- authenticated client can just query the base table and get the column the view
-- omitted. Confirmed live: product_lines.unit_cost and proposals.internal_margin /
-- proposal_items.unit_cost were selected and displayed in the Product Factory and
-- Proposal Factory UIs to any company member (has_company_access tier), not just
-- managers. The real fix is moving the sensitive column into its own table with its own
-- manager+-only RLS, so there is no row containing both the operational data (any member
-- can read) and the cost/margin data (manager+ only) to leak from.

create table if not exists public.product_costs (
  product_line_id uuid primary key references public.product_lines(id) on delete cascade,
  unit_cost numeric,
  updated_at timestamptz default now()
);
insert into public.product_costs (product_line_id, unit_cost)
  select id, unit_cost from public.product_lines where unit_cost is not null
  on conflict (product_line_id) do nothing;
alter table public.product_lines drop column if exists unit_cost;

alter table public.product_costs enable row level security;
drop policy if exists "product_costs_select" on public.product_costs;
create policy "product_costs_select" on public.product_costs for select using (
  public.is_founder_or_admin()
  or exists (select 1 from public.product_lines pl where pl.id = product_costs.product_line_id and public.is_company_manager(pl.company_id))
);
drop policy if exists "product_costs_write" on public.product_costs;
create policy "product_costs_write" on public.product_costs for all using (
  public.is_founder_or_admin()
  or exists (select 1 from public.product_lines pl where pl.id = product_costs.product_line_id and public.is_company_manager(pl.company_id))
) with check (
  public.is_founder_or_admin()
  or exists (select 1 from public.product_lines pl where pl.id = product_costs.product_line_id and public.is_company_manager(pl.company_id))
);

create table if not exists public.proposal_financials (
  proposal_id uuid primary key references public.proposals(id) on delete cascade,
  internal_margin numeric,
  updated_at timestamptz default now()
);
insert into public.proposal_financials (proposal_id, internal_margin)
  select id, internal_margin from public.proposals where internal_margin is not null
  on conflict (proposal_id) do nothing;
alter table public.proposals drop column if exists internal_margin;

alter table public.proposal_financials enable row level security;
drop policy if exists "proposal_financials_select" on public.proposal_financials;
create policy "proposal_financials_select" on public.proposal_financials for select using (
  public.is_founder_or_admin()
  or exists (select 1 from public.proposals p where p.id = proposal_financials.proposal_id and public.is_company_manager(p.company_id))
);
drop policy if exists "proposal_financials_write" on public.proposal_financials;
create policy "proposal_financials_write" on public.proposal_financials for all using (
  public.is_founder_or_admin()
  or exists (select 1 from public.proposals p where p.id = proposal_financials.proposal_id and public.is_company_manager(p.company_id))
) with check (
  public.is_founder_or_admin()
  or exists (select 1 from public.proposals p where p.id = proposal_financials.proposal_id and public.is_company_manager(p.company_id))
);

create table if not exists public.proposal_item_costs (
  proposal_item_id uuid primary key references public.proposal_items(id) on delete cascade,
  unit_cost numeric,
  updated_at timestamptz default now()
);
insert into public.proposal_item_costs (proposal_item_id, unit_cost)
  select id, unit_cost from public.proposal_items where unit_cost is not null
  on conflict (proposal_item_id) do nothing;
alter table public.proposal_items drop column if exists unit_cost;

alter table public.proposal_item_costs enable row level security;
drop policy if exists "proposal_item_costs_select" on public.proposal_item_costs;
create policy "proposal_item_costs_select" on public.proposal_item_costs for select using (
  public.is_founder_or_admin()
  or exists (
    select 1 from public.proposal_items pi join public.proposals p on p.id = pi.proposal_id
    where pi.id = proposal_item_costs.proposal_item_id and public.is_company_manager(p.company_id)
  )
);
drop policy if exists "proposal_item_costs_write" on public.proposal_item_costs;
create policy "proposal_item_costs_write" on public.proposal_item_costs for all using (
  public.is_founder_or_admin()
  or exists (
    select 1 from public.proposal_items pi join public.proposals p on p.id = pi.proposal_id
    where pi.id = proposal_item_costs.proposal_item_id and public.is_company_manager(p.company_id)
  )
) with check (
  public.is_founder_or_admin()
  or exists (
    select 1 from public.proposal_items pi join public.proposals p on p.id = pi.proposal_id
    where pi.id = proposal_item_costs.proposal_item_id and public.is_company_manager(p.company_id)
  )
);
