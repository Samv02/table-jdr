-- Cartes : image de fond, échelle, vision, pions réglables, déplacement par les joueurs.
alter table public.maps add column if not exists background_path text;
alter table public.maps add column if not exists background_opacity real not null default 0.8
  check (background_opacity between 0 and 1);
alter table public.maps add column if not exists cell_value real not null default 1
  check (cell_value > 0 and cell_value <= 1000);
alter table public.maps add column if not exists cell_unit text not null default 'case'
  check (char_length(cell_unit) between 1 and 12);
alter table public.maps add column if not exists show_grid boolean not null default true;
alter table public.maps add column if not exists fog boolean not null default false;
alter table public.maps add column if not exists players_move boolean not null default false;

alter table public.map_tokens add column if not exists size real not null default 1
  check (size between 0.5 and 4);
alter table public.map_tokens add column if not exists color text
  check (color is null or color in ('cyan', 'pink', 'yellow', 'red', 'green', 'violet'));

-- Un joueur ne déplace que le pion de SON personnage, et seulement si le MJ l'a permis.
create or replace function public.move_my_token(_id uuid, _x double precision, _y double precision)
returns void language plpgsql security definer set search_path = public as $$
declare m public.maps;
begin
  select mp.* into m
    from public.map_tokens t
    join public.maps mp on mp.id = t.map_id
    join public.characters c on c.id = t.character_id
   where t.id = _id
     and t.team_id = public.current_team()
     and c.owner_id = auth.uid()
     and mp.players_move
     and public.map_is_live(mp.id);
  if not found then raise exception 'Tu ne peux pas déplacer ce pion.'; end if;
  update public.map_tokens
     set x = least(greatest(_x, 0), m.width), y = least(greatest(_y, 0), m.height)
   where id = _id;
end $$;
revoke all on function public.move_my_token(uuid, double precision, double precision) from public, anon;
grant execute on function public.move_my_token(uuid, double precision, double precision) to authenticated;

-- Images de fond : dossier de la table, privées, déposées par le MJ.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('maps', 'maps', false, 15728640, array['image/*'])
on conflict (id) do nothing;

drop policy if exists maps_files_read on storage.objects;
drop policy if exists maps_files_insert on storage.objects;
drop policy if exists maps_files_update on storage.objects;
drop policy if exists maps_files_delete on storage.objects;
create policy maps_files_read on storage.objects for select to authenticated
  using (bucket_id = 'maps' and (storage.foldername(name))[1] = public.current_team()::text);
create policy maps_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'maps' and public.is_gm()
              and (storage.foldername(name))[1] = public.current_team()::text);
create policy maps_files_update on storage.objects for update to authenticated
  using (bucket_id = 'maps' and public.is_gm()
         and (storage.foldername(name))[1] = public.current_team()::text);
create policy maps_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'maps' and public.is_gm()
         and (storage.foldername(name))[1] = public.current_team()::text);
