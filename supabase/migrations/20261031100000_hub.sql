-- Hub « Mes tables » : tout ce qu'il faut pour choisir sa table en un clic.
alter table public.teams add column if not exists next_session timestamptz;
alter table public.team_members add column if not exists last_opened_at timestamptz;

-- Entrer note la date pour proposer de reprendre la dernière table ; null = sortir de la table.
create or replace function public.enter_team(_team uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if _team is not null and not public.is_platform_admin()
     and not exists (select 1 from public.team_members where team_id = _team and user_id = auth.uid()) then
    raise exception 'Tu n''es pas membre de cette table';
  end if;
  update public.profiles set active_team_id = _team where id = auth.uid();
  if _team is not null then
    update public.team_members set last_opened_at = now()
     where team_id = _team and user_id = auth.uid();
  end if;
end $$;

drop function if exists public.my_teams();
drop function if exists public.my_hub();
create function public.my_hub()
returns table(
  id uuid, name text, role text, members int, sheets int, characters text[],
  universe jsonb, scene text, last_opened_at timestamptz, last_activity timestamptz,
  next_session timestamptz
)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, m.role,
         (select count(*)::int from public.team_members x where x.team_id = t.id),
         (select count(*)::int from public.characters c where c.team_id = t.id),
         array(select coalesce(nullif(c.handle, ''), c.name) from public.characters c
                where c.team_id = t.id and c.owner_id = auth.uid() order by c.name),
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

create or replace function public.set_next_session(_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_gm() then raise exception 'Action réservée au MJ'; end if;
  update public.teams set next_session = _at where id = public.current_team();
end $$;

revoke all on function public.my_hub() from public, anon;
grant execute on function public.my_hub() to authenticated;
revoke all on function public.set_next_session(timestamptz) from public, anon;
grant execute on function public.set_next_session(timestamptz) to authenticated;
