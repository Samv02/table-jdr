-- Inscriptions fermées : le back office annonce l'e-mail exact qu'il va créer, juste avant de le créer.
-- Le repère admin_created de la migration précédente n'arrive pas à temps dans auth.users.
alter table public.platform_settings add column if not exists signup_allowed_email text;

create or replace function public.signup_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not coalesce((select signups_open from public.platform_settings where id = 1), true)
     and lower(new.email) is distinct from
         (select lower(signup_allowed_email) from public.platform_settings where id = 1) then
    raise exception 'Les inscriptions sont fermées';
  end if;
  return new;
end $$;
