-- Documentos financeiros: matriz UBY hoje, carregadores individuais depois.
-- Os arquivos ficam privados no Storage e a pagina carrega somente metadados.

create table if not exists public.uby_finance_documents (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'matrix' check (scope in ('matrix', 'charger')),
  work_id text,
  matrix_cost_id text,
  competence_key text not null check (competence_key ~ '^[0-9]{4}-[0-9]{2}$'),
  supplier text not null default '',
  category text not null default 'Outros custos',
  document_number text not null default '',
  document_type text not null default 'boleto',
  amount numeric(14,2) not null default 0 check (amount >= 0),
  due_date date,
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  installment_number integer check (installment_number is null or installment_number > 0),
  installment_total integer check (installment_total is null or installment_total > 0),
  storage_path text,
  file_name text,
  mime_type text,
  file_size integer check (file_size is null or file_size >= 0),
  notes text not null default '',
  created_by uuid references auth.users(id),
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists uby_finance_documents_scope_competence_idx
  on public.uby_finance_documents (scope, competence_key desc, created_at desc);
create index if not exists uby_finance_documents_matrix_cost_idx
  on public.uby_finance_documents (matrix_cost_id) where matrix_cost_id is not null;

alter table public.uby_finance_documents enable row level security;

drop policy if exists "finance documents select por perfil do app" on public.uby_finance_documents;
drop policy if exists "finance documents insert por perfil do app" on public.uby_finance_documents;
drop policy if exists "finance documents update por perfil do app" on public.uby_finance_documents;
drop policy if exists "finance documents delete por perfil do app" on public.uby_finance_documents;

create policy "finance documents select por perfil do app"
  on public.uby_finance_documents for select to authenticated
  using (private.can_access_obra_app());
create policy "finance documents insert por perfil do app"
  on public.uby_finance_documents for insert to authenticated
  with check (private.can_access_obra_app());
create policy "finance documents update por perfil do app"
  on public.uby_finance_documents for update to authenticated
  using (private.can_access_obra_app())
  with check (private.can_access_obra_app());
create policy "finance documents delete por perfil do app"
  on public.uby_finance_documents for delete to authenticated
  using (private.can_access_obra_app());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'finance-documents',
  'finance-documents',
  false,
  15728640,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "finance documents storage select" on storage.objects;
drop policy if exists "finance documents storage insert" on storage.objects;
drop policy if exists "finance documents storage delete" on storage.objects;

create policy "finance documents storage select"
  on storage.objects for select to authenticated
  using (bucket_id = 'finance-documents' and private.can_access_obra_app());
create policy "finance documents storage insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'finance-documents'
    and private.can_access_obra_app()
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
create policy "finance documents storage delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'finance-documents'
    and private.can_access_obra_app()
  );
