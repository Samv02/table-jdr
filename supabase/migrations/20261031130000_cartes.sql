-- Cartes 2D : le MJ prépare ses cartes (murs et portes sur la grille), en affiche une à la table
-- et y place des pions libres. Un joueur ne lit que la carte affichée et ses pions visibles.
create table if not exists public.maps (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null default public.current_team() references public.teams(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  width int not null default 20 check (width between 4 and 100),
  height int not null default 15 check (height between 4 and 100),
  walls jsonb not null default '[]'::jsonb
    check (jsonb_typeof(walls) = 'array' and jsonb_array_length(walls) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists maps_team on public.maps (team_id);

alter table public.session_state
  add column if not exists active_map_id uuid references public.maps(id) on delete set null;

create table if not exists public.map_tokens (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null default public.current_team() references public.teams(id) on delete cascade,
  map_id uuid not null references public.maps(id) on delete cascade,
  kind text not null check (kind in ('enemy', 'ally', 'party')),
  character_id uuid references public.characters(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 40),
  x double precision not null check (x between 0 and 100),
  y double precision not null check (y between 0 and 100),
  hidden boolean not null default false,
  updated_at timestamptz not null default now(),
  check ((kind = 'party') = (character_id is not null))
);
create index if not exists map_tokens_map on public.map_tokens (map_id);
create unique index if not exists map_tokens_one_per_character
  on public.map_tokens (map_id, character_id) where character_id is not null;

drop trigger if exists maps_touch on public.maps;
create trigger maps_touch before update on public.maps
  for each row execute function public.touch_updated_at();
drop trigger if exists map_tokens_touch on public.map_tokens;
create trigger map_tokens_touch before update on public.map_tokens
  for each row execute function public.touch_updated_at();

create or replace function public.map_is_live(_map uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.session_state
                 where team_id = public.current_team() and active_map_id = _map)
$$;

-- Un pion ne pointe que vers une carte et un personnage de sa propre table
create or replace function public.map_token_ok(_team uuid, _map uuid, _character uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.maps where id = _map and team_id = _team)
     and (_character is null
          or exists (select 1 from public.characters where id = _character and team_id = _team))
$$;
revoke all on function public.map_is_live(uuid) from public, anon;
revoke all on function public.map_token_ok(uuid, uuid, uuid) from public, anon;
grant execute on function public.map_is_live(uuid) to authenticated;
grant execute on function public.map_token_ok(uuid, uuid, uuid) to authenticated;

alter table public.maps enable row level security;
alter table public.map_tokens enable row level security;
grant select, insert, update, delete on public.maps, public.map_tokens to authenticated;
grant all on public.maps, public.map_tokens to service_role;

drop policy if exists maps_read on public.maps;
drop policy if exists maps_gm_insert on public.maps;
drop policy if exists maps_gm_update on public.maps;
drop policy if exists maps_gm_delete on public.maps;
create policy maps_read on public.maps for select to authenticated
  using (team_id = public.current_team() and (public.is_gm() or public.map_is_live(id)));
create policy maps_gm_insert on public.maps for insert to authenticated
  with check (team_id = public.current_team() and public.is_gm());
create policy maps_gm_update on public.maps for update to authenticated
  using (team_id = public.current_team() and public.is_gm())
  with check (team_id = public.current_team() and public.is_gm());
create policy maps_gm_delete on public.maps for delete to authenticated
  using (team_id = public.current_team() and public.is_gm());

drop policy if exists map_tokens_read on public.map_tokens;
drop policy if exists map_tokens_gm_insert on public.map_tokens;
drop policy if exists map_tokens_gm_update on public.map_tokens;
drop policy if exists map_tokens_gm_delete on public.map_tokens;
create policy map_tokens_read on public.map_tokens for select to authenticated
  using (team_id = public.current_team()
         and (public.is_gm() or (not hidden and public.map_is_live(map_id))));
create policy map_tokens_gm_insert on public.map_tokens for insert to authenticated
  with check (team_id = public.current_team() and public.is_gm()
              and public.map_token_ok(team_id, map_id, character_id));
create policy map_tokens_gm_update on public.map_tokens for update to authenticated
  using (team_id = public.current_team() and public.is_gm())
  with check (team_id = public.current_team() and public.is_gm()
              and public.map_token_ok(team_id, map_id, character_id));
create policy map_tokens_gm_delete on public.map_tokens for delete to authenticated
  using (team_id = public.current_team() and public.is_gm());

do $$
declare t text;
begin
  foreach t in array array['maps', 'map_tokens'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
