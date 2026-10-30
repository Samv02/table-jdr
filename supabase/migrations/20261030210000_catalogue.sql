-- Catalogue d'équipe : tout ce que le MJ prépare à l'avance (armes, potions, pouvoirs…).
-- Un objet hors boutique reste invisible des joueurs, même en interrogeant la base :
-- c'est pour ça qu'il vit dans sa table et pas dans l'univers, lisible par toute l'équipe.
-- Achats et utilisations passent par des fonctions serveur (dés et effets anti-triche).
create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null default public.current_team() references public.teams(id) on delete cascade,
  kind text not null default 'gear' check (kind in ('weapon', 'consumable', 'power', 'gear')),
  category text not null default '' check (char_length(category) <= 40),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  description text not null default '' check (char_length(description) <= 1000),
  price int not null default 0 check (price between 0 and 100000000),
  in_shop boolean not null default true,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists catalog_items_team on public.catalog_items (team_id, kind, name);

alter table public.catalog_items enable row level security;
revoke all on public.catalog_items from anon, authenticated;
grant select, insert, update, delete on public.catalog_items to authenticated;
grant all on public.catalog_items to service_role;

drop policy if exists "catalog read" on public.catalog_items;
drop policy if exists "catalog gm" on public.catalog_items;
create policy "catalog read" on public.catalog_items for select to authenticated
  using (team_id = public.current_team() and (in_shop or public.is_gm()));
create policy "catalog gm" on public.catalog_items for all to authenticated
  using (team_id = public.current_team() and public.is_gm())
  with check (team_id = public.current_team() and public.is_gm());

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public'
                   and tablename = 'catalog_items') then
    alter publication supabase_realtime add table public.catalog_items;
  end if;
end $$;
