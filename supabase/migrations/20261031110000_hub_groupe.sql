-- Hub : le groupe de chaque table, sous forme de pseudos de personnages (jamais d'e-mail).
drop function if exists public.my_hub();
create function public.my_hub()
returns table(
  id uuid, name text, role text, members int, sheets int, characters text[],
  party jsonb, universe jsonb, scene text, last_opened_at timestamptz, last_activity timestamptz,
  next_session timestamptz
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
         t.next_session
  from public.team_members m
  join public.teams t on t.id = m.team_id
  left join public.session_state s on s.team_id = t.id
  where m.user_id = auth.uid()
  order by coalesce(m.last_opened_at, m.joined_at) desc
$$;

revoke all on function public.my_hub() from public, anon;
grant execute on function public.my_hub() to authenticated;
