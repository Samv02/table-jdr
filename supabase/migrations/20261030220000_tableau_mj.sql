-- Disposition du tableau de bord : propre à chaque MJ dans chaque équipe, retrouvée sur tous ses appareils.
alter table public.team_members add column if not exists dashboard jsonb not null default '{}'::jsonb;

create or replace function public.get_dashboard_prefs()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select dashboard from public.team_members
                   where team_id = public.current_team() and user_id = auth.uid()), '{}'::jsonb)
$$;

create or replace function public.save_dashboard_prefs(_prefs jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_gm() then raise exception 'Action réservée au MJ'; end if;
  if pg_column_size(_prefs) > 20000 then raise exception 'Réglages trop volumineux'; end if;
  update public.team_members set dashboard = _prefs
   where team_id = public.current_team() and user_id = auth.uid();
end $$;

revoke all on function public.get_dashboard_prefs() from public, anon;
revoke all on function public.save_dashboard_prefs(jsonb) from public, anon;
grant execute on function public.get_dashboard_prefs() to authenticated;
grant execute on function public.save_dashboard_prefs(jsonb) to authenticated;
