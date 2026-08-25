-- Founder governance doc, section 7: sell SEM Brain AI Service Credits, not
-- transferable provider tokens. Ledger is append-only by design — displayed balance is
-- always sum(amount), never a mutable column someone could edit directly. Corrections
-- are new 'adjustment'/'refund' rows, never UPDATE/DELETE on a past entry (acceptance
-- test #39: "Billing balance equals append-only ledger sum and cannot be directly
-- edited").
create table if not exists public.billing_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  currency text not null default 'USD',
  created_at timestamptz default now()
);

create table if not exists public.service_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null references public.billing_accounts(id) on delete cascade,
  entry_type text not null check (entry_type in ('deposit', 'usage', 'promo_credit', 'refund', 'adjustment')),
  amount numeric not null,
  description text,
  -- Unique (not just nullable) so a given provider usage event can generate at most one
  -- debit, ever — acceptance test #40: "Duplicate provider usage events do not double-
  -- charge customer balance."
  related_model_usage_id uuid references public.model_usage(id) on delete set null,
  created_by_profile_id uuid references public.profiles(id),
  created_at timestamptz default now(),
  constraint service_credit_ledger_usage_once unique (related_model_usage_id)
);

create index if not exists service_credit_ledger_account_idx on public.service_credit_ledger(billing_account_id);

-- Global markup applied to provider cost to derive the customer-facing charge — a
-- singleton settings row, founder-editable. Kept separate from any one ledger entry so
-- the rate can change over time without rewriting history.
create table if not exists public.ai_pricing_settings (
  id boolean primary key default true check (id),
  markup_multiplier numeric not null default 2.0 check (markup_multiplier > 0),
  updated_by_profile_id uuid references public.profiles(id),
  updated_at timestamptz default now()
);
insert into public.ai_pricing_settings (id, markup_multiplier) values (true, 2.0) on conflict (id) do nothing;

alter table public.billing_accounts enable row level security;
alter table public.service_credit_ledger enable row level security;
alter table public.ai_pricing_settings enable row level security;

drop policy if exists "billing_accounts_select" on public.billing_accounts;
create policy "billing_accounts_select" on public.billing_accounts for select using (
  public.is_founder_or_admin() or public.is_company_manager(company_id)
);
drop policy if exists "billing_accounts_write" on public.billing_accounts;
create policy "billing_accounts_write" on public.billing_accounts for all using (
  public.is_founder_or_admin()
) with check (
  public.is_founder_or_admin()
);

drop policy if exists "service_credit_ledger_select" on public.service_credit_ledger;
create policy "service_credit_ledger_select" on public.service_credit_ledger for select using (
  public.is_founder_or_admin()
  or exists (select 1 from public.billing_accounts ba where ba.id = service_credit_ledger.billing_account_id and public.is_company_manager(ba.company_id))
);
-- Insert-only for non-founders is intentionally not granted here — recording a deposit
-- is a founder/HR-finance action (manual bank-transfer confirmation, not a live payment
-- flow) until a real payment processor is connected.
drop policy if exists "service_credit_ledger_insert" on public.service_credit_ledger;
create policy "service_credit_ledger_insert" on public.service_credit_ledger for insert with check (
  public.is_founder_or_admin() or public.is_hr_finance()
);

drop policy if exists "ai_pricing_settings_select" on public.ai_pricing_settings;
create policy "ai_pricing_settings_select" on public.ai_pricing_settings for select using (
  public.is_founder_or_admin() or public.is_hr_finance()
);
drop policy if exists "ai_pricing_settings_write" on public.ai_pricing_settings;
create policy "ai_pricing_settings_write" on public.ai_pricing_settings for update using (
  public.is_founder_or_admin()
) with check (
  public.is_founder_or_admin()
);
