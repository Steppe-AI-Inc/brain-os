-- Real folder hierarchy for the document browser: Company -> Department/Project (optional)
-- -> Category -> files. Nullable because most documents (financial statements, generic
-- uploads) aren't tied to one department or project — only company + category.
alter table public.documents add column if not exists department_id uuid references public.departments(id) on delete set null;
alter table public.documents add column if not exists project_id uuid references public.projects(id) on delete set null;

create index if not exists documents_department_id_idx on public.documents(department_id);
create index if not exists documents_project_id_idx on public.documents(project_id);
