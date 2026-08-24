-- "Engineering factory" — AI-generated top-down technical diagrams (parking layouts, EV
-- charging stalls). Real drawings, not CAD-file (DXF/DWG) output — see
-- supabase/functions/generate-technical-drawing for the honest framing. RLS mirrors
-- documents' tier: founder/admin or the company's own manager can write, everyone with
-- company access can read.
create table if not exists public.engineering_drawings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  title text not null,
  description text not null,
  svg_content text not null,
  dimensions_summary text,
  notes text,
  created_by_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.engineering_drawings enable row level security;

create policy engineering_drawings_select on public.engineering_drawings
  for select using (
    company_id is null or public.is_founder_or_admin() or public.has_company_access(company_id)
  );

create policy engineering_drawings_write on public.engineering_drawings
  for insert with check (
    public.is_founder_or_admin() or (company_id is not null and public.is_company_manager(company_id))
  );

create policy engineering_drawings_delete on public.engineering_drawings
  for delete using (
    public.is_founder_or_admin() or (company_id is not null and public.is_company_manager(company_id))
  );

insert into public.agents (name, role, description, skills, forbidden_actions, cost_limit_usd)
values ('AI Engineering Drafter','engineering_drafter','Generates labeled technical layout diagrams from plain-language descriptions','["technical_drawing","layout_planning"]','["cad_file_export_without_review"]',1.0)
on conflict do nothing;
