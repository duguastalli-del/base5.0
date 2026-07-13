-- Tabela para os leads captados pelo formulário "Ajude a campanha" do site institucional.
-- Rode este script no SQL Editor do projeto Supabase (mdkinyexgzekrraftwqx).

create table if not exists public.site_leads (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text not null,
  cidade text not null,
  bairro text,
  mensagem text,
  created_at timestamptz not null default now()
);

alter table public.site_leads enable row level security;

-- Permite que o site (chave anônima) grave novos leads, sem poder ler os já existentes.
create policy "site_leads_insert_anon"
  on public.site_leads
  for insert
  to anon
  with check (true);
