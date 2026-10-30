-- =====================================================================
-- PILOTAGE ET SUPPORT
--   platform_settings : maintenance, inscriptions, créations d'équipes (une seule ligne)
--   announcements     : bandeau à tous, ou à une équipe
--   support_tickets / support_messages : demandes des utilisateurs
--   account_notes     : notes internes de l'admin sur un compte
-- Les écritures de l'admin passent par les fonctions serveur (clé de service).
-- Les utilisateurs n'écrivent dans le support que par open_ticket et reply_ticket.
-- Idempotent.
-- =====================================================================

create table if not exists public.platform_settings (
  id int primary key default 1 check (id = 1),
  maintenance boolean not null default false,
  maintenance_message text not null default '' check (char_length(maintenance_message) <= 300),
  signups_open boolean not null default true,
  team_creation_open boolean not null default true,
  joins_open boolean not null default true,
  max_teams_per_user int not null default 10 check (max_teams_per_user between 1 and 100),
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (id) values (1) on conflict (id) do nothing;
alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated;
grant all on public.platform_settings to service_role;

-- Lisible avant connexion : l'écran d'accueil doit savoir si l'inscription est ouverte
create or replace function public.get_platform_status()
returns table(maintenance boolean, maintenance_message text, signups_open boolean,
              team_creation_open boolean, joins_open boolean)
language sql stable security definer set search_path = public as $$
  select maintenance, maintenance_message, signups_open, team_creation_open, joins_open
  from public.platform_settings where id = 1
$$;
revoke all on function public.get_platform_status() from public;
grant execute on function public.get_platform_status() to anon, authenticated;

-- Maintenance : tout accès aux équipes est coupé, sauf pour l'admin
create or replace function public.current_team()
returns uuid language sql stable security definer set search_path = public as $$
  select p.active_team_id from public.profiles p
  where p.id = auth.uid() and p.suspended_at is null and p.active_team_id is not null
    and (public.is_platform_admin()
         or (not coalesce((select s.maintenance from public.platform_settings s where s.id = 1), false)
             and exists (select 1 from public.team_members m
                         where m.team_id = p.active_team_id and m.user_id = p.id)))
$$;

create or replace function public.create_team(_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare t uuid; s public.platform_settings;
begin
  if auth.uid() is null or exists (select 1 from public.profiles where id = auth.uid() and suspended_at is not null) then
    raise exception 'Compte suspendu';
  end if;
  select * into s from public.platform_settings where id = 1;
  if not public.is_platform_admin() then
    if s.maintenance then raise exception 'Le site est en maintenance'; end if;
    if not s.team_creation_open then raise exception 'La création d''équipes est fermée pour le moment'; end if;
    if (select count(*) from public.teams where owner_id = auth.uid()) >= s.max_teams_per_user then
      raise exception 'Limite atteinte : % équipes créées', s.max_teams_per_user;
    end if;
  end if;
  insert into public.teams (name, join_code, owner_id)
  values (btrim(_name), public.new_join_code(), auth.uid()) returning id into t;
  insert into public.team_members (team_id, user_id, role) values (t, auth.uid(), 'gm');
  update public.profiles set active_team_id = t where id = auth.uid();
  return t;
end $$;

create or replace function public.join_team(_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare t uuid; s public.platform_settings;
begin
  if auth.uid() is null or exists (select 1 from public.profiles where id = auth.uid() and suspended_at is not null) then
    raise exception 'Compte suspendu';
  end if;
  select * into s from public.platform_settings where id = 1;
  if not public.is_platform_admin() then
    if s.maintenance then raise exception 'Le site est en maintenance'; end if;
    if not s.joins_open then raise exception 'Rejoindre une équipe est fermé pour le moment'; end if;
  end if;
  select id into t from public.teams
   where join_code = upper(regexp_replace(coalesce(_code, ''), '[^a-zA-Z0-9]', '', 'g'));
  if t is null then raise exception 'Code invalide'; end if;
  insert into public.team_members (team_id, user_id) values (t, auth.uid()) on conflict do nothing;
  update public.profiles set active_team_id = t where id = auth.uid();
  return t;
end $$;

-- Inscriptions fermées : seul l'admin crée encore des comptes (repère admin_created)
create or replace function public.signup_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not coalesce((select signups_open from public.platform_settings where id = 1), true)
     and coalesce(new.raw_app_meta_data->>'admin_created', '') <> 'true' then
    raise exception 'Les inscriptions sont fermées';
  end if;
  return new;
end $$;
drop trigger if exists signup_guard on auth.users;
create trigger signup_guard before insert on auth.users
  for each row execute function public.signup_guard();

-- ---------------------------------------------------------------------
-- ANNONCES
-- ---------------------------------------------------------------------
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  body text not null check (char_length(btrim(body)) between 1 and 500),
  level text not null default 'info' check (level in ('info', 'warning')),
  team_id uuid references public.teams(id) on delete cascade,
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.announcements enable row level security;
revoke all on public.announcements from anon, authenticated;
grant select on public.announcements to authenticated;
grant all on public.announcements to service_role;
drop policy if exists "announcements read" on public.announcements;
create policy "announcements read" on public.announcements for select to authenticated
  using (active and (expires_at is null or expires_at > now())
         and (team_id is null or team_id = public.current_team()));

-- ---------------------------------------------------------------------
-- SUPPORT
-- ---------------------------------------------------------------------
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  subject text not null check (char_length(btrim(subject)) between 3 and 120),
  category text not null default 'question' check (category in ('compte', 'bug', 'question', 'autre')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  user_unread boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  first_reply_at timestamptz,
  resolved_at timestamptz
);
create index if not exists support_tickets_user on public.support_tickets (user_id, updated_at desc);
create index if not exists support_tickets_status on public.support_tickets (status, updated_at desc);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  from_admin boolean not null default false,
  internal boolean not null default false,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists support_messages_ticket on public.support_messages (ticket_id, created_at);

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
revoke all on public.support_tickets, public.support_messages from anon, authenticated;
grant select on public.support_tickets, public.support_messages to authenticated;
grant all on public.support_tickets, public.support_messages to service_role;

drop policy if exists "tickets own" on public.support_tickets;
create policy "tickets own" on public.support_tickets for select to authenticated
  using (user_id = auth.uid());
-- Les notes internes de l'admin ne sont jamais visibles par l'utilisateur
drop policy if exists "ticket messages own" on public.support_messages;
create policy "ticket messages own" on public.support_messages for select to authenticated
  using (not internal and exists (select 1 from public.support_tickets t
                                  where t.id = ticket_id and t.user_id = auth.uid()));

create or replace function public.open_ticket(_subject text, _category text, _body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if auth.uid() is null then raise exception 'Connecte-toi d''abord'; end if;
  if (select count(*) from public.support_tickets
      where user_id = auth.uid() and status <> 'resolved') >= 5 then
    raise exception 'Tu as déjà 5 demandes en cours : attends une réponse';
  end if;
  insert into public.support_tickets (user_id, team_id, subject, category)
  values (auth.uid(), (select active_team_id from public.profiles where id = auth.uid()),
          btrim(_subject), _category)
  returning id into t;
  insert into public.support_messages (ticket_id, sender_id, body) values (t, auth.uid(), btrim(_body));
  return t;
end $$;

-- Répondre à une demande traitée la rouvre
create or replace function public.reply_ticket(_ticket uuid, _body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.support_tickets where id = _ticket and user_id = auth.uid()) then
    raise exception 'Demande introuvable';
  end if;
  insert into public.support_messages (ticket_id, sender_id, body) values (_ticket, auth.uid(), btrim(_body));
  update public.support_tickets
     set updated_at = now(), resolved_at = null,
         status = case when status = 'resolved' then 'open' else status end
   where id = _ticket;
end $$;

create or replace function public.mark_ticket_read(_ticket uuid)
returns void language sql security definer set search_path = public as $$
  update public.support_tickets set user_unread = false
   where id = _ticket and user_id = auth.uid() and user_unread
$$;

create or replace function public.close_ticket(_ticket uuid)
returns void language sql security definer set search_path = public as $$
  update public.support_tickets set status = 'resolved', resolved_at = now(), updated_at = now()
   where id = _ticket and user_id = auth.uid() and status <> 'resolved'
$$;

do $$
declare f text;
begin
  foreach f in array array['open_ticket(text, text, text)', 'reply_ticket(uuid, text)',
                           'mark_ticket_read(uuid)', 'close_ticket(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- NOTES INTERNES ET STATISTIQUES (service uniquement)
-- ---------------------------------------------------------------------
create table if not exists public.account_notes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 2000),
  updated_at timestamptz not null default now()
);
alter table public.account_notes enable row level security;
revoke all on public.account_notes from anon, authenticated;
grant all on public.account_notes to service_role;

-- Compté en base : une lecture de lignes serait tronquée à 1000 par l'API
create or replace function public.admin_daily_stats(_days int)
returns table(day date, signups int, rolls int, messages int)
language sql stable security definer set search_path = public as $$
  select d::date,
    (select count(*)::int from auth.users u where u.created_at::date = d::date),
    (select count(*)::int from public.rolls r where r.created_at::date = d::date),
    (select count(*)::int from public.messages m where m.created_at::date = d::date)
  from generate_series(current_date - (_days - 1), current_date, interval '1 day') d
  order by 1
$$;
create or replace function public.admin_team_activity(_since timestamptz)
returns table(team_id uuid, rolls int, messages int)
language sql stable security definer set search_path = public as $$
  select t.id,
    (select count(*)::int from public.rolls r where r.team_id = t.id and r.created_at >= _since),
    (select count(*)::int from public.messages m where m.team_id = t.id and m.created_at >= _since)
  from public.teams t
$$;
revoke all on function public.admin_daily_stats(int) from public, anon, authenticated;
revoke all on function public.admin_team_activity(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_daily_stats(int) to service_role;
grant execute on function public.admin_team_activity(timestamptz) to service_role;

do $$
declare t text;
begin
  foreach t in array array['announcements', 'support_tickets', 'support_messages'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
