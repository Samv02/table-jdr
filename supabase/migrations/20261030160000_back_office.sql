-- Back office : le service peut créer des équipes, et chaque action d'admin est journalisée.
-- Aucun accès pour les comptes : ces données passent uniquement par les fonctions serveur.
grant execute on function public.new_join_code() to service_role;

create table if not exists public.admin_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists admin_log_created on public.admin_log (created_at desc);
alter table public.admin_log enable row level security;
revoke all on public.admin_log from anon, authenticated;
grant all on public.admin_log to service_role;
