-- Photo propre à une table : vide = la photo du compte s'affiche.
-- Le hub indique aussi les tables dont le compte est propriétaire.
alter table public.team_members add column if not exists avatar_url text;

-- team_members n'est pas modifiable par les comptes : chacun passe par cette fonction,
-- pour sa propre ligne et un fichier de son propre dossier.
create or replace function public.set_table_avatar(_team uuid, _path text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if _path is not null
     and (char_length(_path) > 300 or _path not like auth.uid()::text || '/%') then
    raise exception 'Fichier refusé.';
  end if;
  update public.team_members set avatar_url = _path
   where team_id = _team and user_id = auth.uid();
  if not found then raise exception 'Tu n''es pas membre de cette table.'; end if;
end $$;
revoke all on function public.set_table_avatar(uuid, text) from public, anon;
grant execute on function public.set_table_avatar(uuid, text) to authenticated;

create or replace function public.get_party()
returns table(character_id uuid, handle text, avatar_url text, color text)
language sql stable security definer set search_path = public as $$
  select c.id, coalesce(nullif(c.handle, ''), c.name), coalesce(m.avatar_url, p.avatar_url), p.color
  from public.characters c
  join public.profiles p on p.id = c.owner_id
  left join public.team_members m on m.team_id = c.team_id and m.user_id = c.owner_id
  where c.team_id = public.current_team()
  order by c.created_at
$$;

create or replace function public.get_team_members()
returns table(user_id uuid, username text, role text, avatar_url text, color text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, m.role, coalesce(m.avatar_url, p.avatar_url), p.color
  from public.team_members m join public.profiles p on p.id = m.user_id
  where m.team_id = public.current_team()
  order by m.joined_at
$$;

drop function if exists public.my_hub();
create function public.my_hub()
returns table(
  id uuid, name text, role text, members int, sheets int, characters text[],
  party jsonb, universe jsonb, scene text, last_opened_at timestamptz, last_activity timestamptz,
  next_session timestamptz, is_owner boolean, my_avatar text
)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, m.role,
         (select count(*)::int from public.team_members x where x.team_id = t.id),
         (select count(*)::int from public.characters c where c.team_id = t.id),
         array(select coalesce(nullif(c.handle, ''), c.name) from public.characters c
                where c.team_id = t.id and c.owner_id = auth.uid() order by c.name),
         (select coalesce(jsonb_agg(g), '[]'::jsonb) from (
            select coalesce(nullif(c.handle, ''), c.name) as label, p.color
              from public.characters c join public.profiles p on p.id = c.owner_id
             where c.team_id = t.id order by c.name limit 6) g),
         s.universe,
         (select sc.name from public.scenes sc where sc.id = s.active_scene_id),
         m.last_opened_at,
         (select max(r.created_at) from public.rolls r where r.team_id = t.id and not r.is_secret),
         t.next_session,
         t.owner_id is not distinct from auth.uid(),
         m.avatar_url
  from public.team_members m
  join public.teams t on t.id = m.team_id
  left join public.session_state s on s.team_id = t.id
  where m.user_id = auth.uid()
  order by coalesce(m.last_opened_at, m.joined_at) desc
$$;

revoke all on function public.my_hub() from public, anon;
grant execute on function public.my_hub() to authenticated;
