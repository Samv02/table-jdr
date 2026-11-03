-- Disposition de la fiche : propre à chaque membre dans chaque table, retrouvée sur tous ses appareils.
alter table public.team_members add column if not exists sheet_layout jsonb not null default '{}'::jsonb;

create or replace function public.get_sheet_layout()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select sheet_layout from public.team_members
                   where team_id = public.current_team() and user_id = auth.uid()), '{}'::jsonb)
$$;

create or replace function public.save_sheet_layout(_layout jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if pg_column_size(_layout) > 8000 then raise exception 'Disposition trop volumineuse'; end if;
  update public.team_members set sheet_layout = _layout
   where team_id = public.current_team() and user_id = auth.uid();
end $$;

revoke all on function public.get_sheet_layout() from public, anon;
revoke all on function public.save_sheet_layout(jsonb) from public, anon;
grant execute on function public.get_sheet_layout() to authenticated;
grant execute on function public.save_sheet_layout(jsonb) to authenticated;
