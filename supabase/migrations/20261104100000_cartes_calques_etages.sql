-- Cartes : calques et étages.
-- Un calque regroupe des sols et des objets en plus de ceux de la carte (le « calque principal »).
-- Un calque caché ne quitte jamais la base pour un joueur : la règle de lecture le filtre.
-- Les étages relient plusieurs cartes d'un même lieu (place + level).
create table if not exists public.map_layers (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null default public.current_team() references public.teams(id) on delete cascade,
  map_id uuid not null references public.maps(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  position int not null default 0,
  hidden boolean not null default false,
  locked boolean not null default false,
  shapes jsonb not null default '[]'::jsonb
    check (jsonb_typeof(shapes) = 'array' and jsonb_array_length(shapes) <= 1000
           and octet_length(shapes::text) <= 1500000),
  objects jsonb not null default '[]'::jsonb
    check (jsonb_typeof(objects) = 'array' and jsonb_array_length(objects) <= 2000
           and octet_length(objects::text) <= 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists map_layers_map on public.map_layers (map_id);

drop trigger if exists map_layers_touch on public.map_layers;
create trigger map_layers_touch before update on public.map_layers
  for each row execute function public.touch_updated_at();

alter table public.map_layers enable row level security;
grant select, insert, update, delete on public.map_layers to authenticated;
grant all on public.map_layers to service_role;

drop policy if exists map_layers_read on public.map_layers;
drop policy if exists map_layers_gm_insert on public.map_layers;
drop policy if exists map_layers_gm_update on public.map_layers;
drop policy if exists map_layers_gm_delete on public.map_layers;
create policy map_layers_read on public.map_layers for select to authenticated
  using (team_id = public.current_team()
         and (public.is_gm() or (not hidden and public.map_is_live(map_id))));
create policy map_layers_gm_insert on public.map_layers for insert to authenticated
  with check (team_id = public.current_team() and public.is_gm()
              and public.map_token_ok(team_id, map_id, null));
create policy map_layers_gm_update on public.map_layers for update to authenticated
  using (team_id = public.current_team() and public.is_gm())
  with check (team_id = public.current_team() and public.is_gm()
              and public.map_token_ok(team_id, map_id, null));
create policy map_layers_gm_delete on public.map_layers for delete to authenticated
  using (team_id = public.current_team() and public.is_gm());

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public'
                   and tablename = 'map_layers') then
    alter publication supabase_realtime add table public.map_layers;
  end if;
end $$;

-- Étages : un lieu (nom libre) et un niveau ; les cartes d'un même lieu se suivent
alter table public.maps add column if not exists place text
  check (place is null or char_length(place) <= 40);
alter table public.maps add column if not exists level int not null default 0
  check (level between -50 and 50);
