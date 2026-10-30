-- =====================================================================
-- ÉQUIPES : plusieurs groupes de jeu séparés sur la même plateforme
--
-- Chaque compte a une « équipe active » (profiles.active_team_id), changée
-- uniquement par enter_team / create_team / join_team. current_team() la lit et
-- toutes les règles de sécurité filtrent dessus : une requête ne peut donc jamais
-- sortir de l'équipe active, même si l'écran oublie un filtre.
-- Le rôle MJ / joueur est porté par team_members, équipe par équipe.
-- L'admin de la plateforme (platform_admins) entre où il veut avec les droits du
-- MJ, mais ne lance jamais de dé à la place d'un autre.
-- Idempotent.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 40),
  join_code text not null unique,
  owner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'player' check (role in ('player', 'gm')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index if not exists team_members_user on public.team_members (user_id);
-- Aucune politique ni droit pour les comptes : ne se remplit qu'en SQL ou par le service
create table if not exists public.platform_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists active_team_id uuid references public.teams(id) on delete set null;
alter table public.profiles add column if not exists suspended_at timestamptz;

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.platform_admins enable row level security;
-- Le code d'invitation n'est pas lisible directement : voir get_join_code()
revoke all on public.teams from anon, authenticated;
grant select (id, name, owner_id, created_at) on public.teams to authenticated;
revoke all on public.team_members from anon, authenticated;
grant select on public.team_members to authenticated;
revoke all on public.platform_admins from anon, authenticated;
grant all on public.teams, public.team_members, public.platform_admins to service_role;

-- ---------------------------------------------------------------------
-- 2. CONTEXTE : équipe active, admin, MJ
-- ---------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;

-- Équipe active, seulement si le compte y a encore droit et n'est pas suspendu
create or replace function public.current_team()
returns uuid language sql stable security definer set search_path = public as $$
  select p.active_team_id from public.profiles p
  where p.id = auth.uid() and p.suspended_at is null and p.active_team_id is not null
    and (public.is_platform_admin()
         or exists (select 1 from public.team_members m
                    where m.team_id = p.active_team_id and m.user_id = p.id))
$$;

create or replace function public.is_team_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members
                 where team_id = public.current_team() and user_id = auth.uid())
$$;

-- MJ de l'équipe active. L'admin de la plateforme a les mêmes droits dans l'équipe où il est entré.
create or replace function public.is_gm()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_team() is not null and (
    public.is_platform_admin()
    or exists (select 1 from public.team_members
               where team_id = public.current_team() and user_id = auth.uid() and role = 'gm'))
$$;

create or replace function public.new_join_code()
returns text language plpgsql volatile set search_path = public, extensions as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- sans 0/O ni 1/I/L
  code text;
begin
  loop
    select string_agg(substr(alphabet, 1 + (get_byte(b, i) % 31), 1), '') into code
    from (select gen_random_bytes(8) as b) r, generate_series(0, 7) i;
    exit when not exists (select 1 from public.teams where join_code = code);
  end loop;
  return code;
end $$;

-- Une équipe naît avec son état partagé (scène, musique, univers)
create or replace function public.team_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.session_state (team_id) values (new.id) on conflict (team_id) do nothing;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 3. REPRISE DES DONNÉES : tout l'existant devient une première équipe
-- ---------------------------------------------------------------------
do $$
declare t uuid; tbl text;
begin
  if not exists (select 1 from public.teams) and exists (select 1 from public.profiles) then
    insert into public.teams (name, join_code, owner_id)
    values ('Table de test', public.new_join_code(),
            (select id from public.profiles where role = 'gm' order by created_at limit 1))
    returning id into t;
    insert into public.team_members (team_id, user_id, role)
    select t, id, role from public.profiles;
    update public.profiles set active_team_id = t;
  end if;
  select id into t from public.teams order by created_at limit 1;

  foreach tbl in array array['characters', 'scenes', 'rolls', 'messages', 'holo_links'] loop
    execute format('alter table public.%I add column if not exists team_id uuid references public.teams(id) on delete cascade', tbl);
    execute format('update public.%I set team_id = $1 where team_id is null', tbl) using t;
    execute format('alter table public.%I alter column team_id set default public.current_team()', tbl);
    execute format('alter table public.%I alter column team_id set not null', tbl);
    execute format('create index if not exists %I on public.%I (team_id)', tbl || '_team', tbl);
  end loop;

  alter table public.session_state add column if not exists team_id uuid references public.teams(id) on delete cascade;
  update public.session_state set team_id = t where team_id is null;
  delete from public.session_state where team_id is null;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'session_state' and column_name = 'id') then
    alter table public.session_state drop column id;
    alter table public.session_state add primary key (team_id);
  end if;
end $$;

drop trigger if exists team_created on public.teams;
create trigger team_created after insert on public.teams
  for each row execute function public.team_created();

-- Le rôle est désormais porté par team_members
drop trigger if exists profiles_protect_role on public.profiles;
drop function if exists public.protect_role();
alter table public.profiles drop column if exists role;

-- ---------------------------------------------------------------------
-- 4. GARDE-FOUS
-- ---------------------------------------------------------------------
create or replace function public.owns_character(_cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.characters
                 where id = _cid and owner_id = auth.uid() and team_id = public.current_team())
$$;
-- MJ de l'équipe à laquelle appartient cette fiche
create or replace function public.gm_of_character(_cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_gm() and exists (select 1 from public.characters
                                    where id = _cid and team_id = public.current_team())
$$;

-- Une fiche ne change pas d'équipe et n'appartient qu'à un membre de son équipe
create or replace function public.characters_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.team_id is distinct from old.team_id then
    raise exception 'Une fiche ne change pas d''équipe';
  end if;
  if new.owner_id is not null
     and (tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id)
     and not exists (select 1 from public.team_members
                     where team_id = new.team_id and user_id = new.owner_id) then
    raise exception 'Ce joueur n''est pas membre de l''équipe';
  end if;
  return new;
end $$;
drop trigger if exists characters_guard on public.characters;
create trigger characters_guard before insert or update on public.characters
  for each row execute function public.characters_guard();

-- Départ d'un membre : ses fiches restent sans joueur, et l'équipe garde toujours un MJ
create or replace function public.team_member_left()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.characters set owner_id = null
   where team_id = old.team_id and owner_id = old.user_id;
  update public.profiles set active_team_id = null
   where id = old.user_id and active_team_id = old.team_id;
  if not exists (select 1 from public.team_members where team_id = old.team_id and role = 'gm') then
    update public.team_members set role = 'gm'
     where team_id = old.team_id
       and user_id = (select user_id from public.team_members
                      where team_id = old.team_id order by joined_at, user_id limit 1);
  end if;
  return old;
end $$;
drop trigger if exists team_member_left on public.team_members;
create trigger team_member_left after delete on public.team_members
  for each row execute function public.team_member_left();

-- L'expéditeur et l'équipe sont fixés par le serveur
create or replace function public.messages_set_sender()
returns trigger language plpgsql security definer set search_path = public as $$
declare x uuid; y uuid;
begin
  new.sender_user := auth.uid();
  new.team_id := public.current_team();
  new.created_at := now();
  new.body := btrim(new.body);
  if public.is_gm() then
    new.sender_character := null;
    new.sender_name := case when public.is_team_member() then 'MJ' else 'Admin' end;
  else
    if new.channel like 'gm:%' then
      new.sender_character := split_part(new.channel, ':', 2)::uuid;
    elsif new.channel like 'holo:%' then
      x := split_part(new.channel, ':', 2)::uuid; y := split_part(new.channel, ':', 3)::uuid;
      new.sender_character := case when public.owns_character(x) then x else y end;
    else
      new.sender_character := null;
    end if;
    select coalesce(nullif(c.handle, ''), c.name) into new.sender_name from public.characters c where c.id = new.sender_character;
    new.sender_name := coalesce(new.sender_name, '?');
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 5. RÈGLES D'ACCÈS
-- ---------------------------------------------------------------------
drop policy if exists "teams read" on public.teams;
create policy "teams read" on public.teams for select to authenticated
  using (public.is_platform_admin() or id = public.current_team()
         or exists (select 1 from public.team_members m where m.team_id = id and m.user_id = auth.uid()));

drop policy if exists "members read" on public.team_members;
create policy "members read" on public.team_members for select to authenticated
  using (user_id = auth.uid() or team_id = public.current_team());

-- Un profil n'est visible que par son propriétaire et l'équipe active
drop policy if exists "authenticated read profiles" on public.profiles;
drop policy if exists "read team profiles" on public.profiles;
create policy "read team profiles" on public.profiles for select to authenticated
  using (id = auth.uid() or exists (select 1 from public.team_members m
                                    where m.user_id = id and m.team_id = public.current_team()));

drop policy if exists "read characters" on public.characters;
drop policy if exists "gm insert characters" on public.characters;
drop policy if exists "gm update characters" on public.characters;
drop policy if exists "gm delete characters" on public.characters;
create policy "read characters" on public.characters for select to authenticated
  using (team_id = public.current_team() and (owner_id = auth.uid() or public.is_gm()));
create policy "gm insert characters" on public.characters for insert to authenticated
  with check (team_id = public.current_team() and public.is_gm());
create policy "gm update characters" on public.characters for update to authenticated
  using (team_id = public.current_team() and public.is_gm())
  with check (team_id = public.current_team() and public.is_gm());
create policy "gm delete characters" on public.characters for delete to authenticated
  using (team_id = public.current_team() and public.is_gm());

drop policy if exists "read state" on public.character_state;
drop policy if exists "update state" on public.character_state;
drop policy if exists "gm insert state" on public.character_state;
drop policy if exists "gm delete state" on public.character_state;
create policy "read state" on public.character_state for select to authenticated
  using (public.owns_character(character_id) or public.gm_of_character(character_id));
create policy "update state" on public.character_state for update to authenticated
  using (public.gm_of_character(character_id) or (public.owns_character(character_id) and public.player_can_edit(character_id)))
  with check (public.gm_of_character(character_id) or (public.owns_character(character_id) and public.player_can_edit(character_id)));
create policy "gm insert state" on public.character_state for insert to authenticated
  with check (public.gm_of_character(character_id));
create policy "gm delete state" on public.character_state for delete to authenticated
  using (public.gm_of_character(character_id));

drop policy if exists "notes read" on public.character_notes;
create policy "notes read" on public.character_notes for select to authenticated
  using (public.owns_character(character_id) or public.gm_of_character(character_id));

drop policy if exists "read rolls" on public.rolls;
create policy "read rolls" on public.rolls for select to authenticated
  using (team_id = public.current_team() and (is_secret = false or user_id = auth.uid() or public.is_gm()));

drop policy if exists scenes_read on public.scenes;
drop policy if exists scenes_gm on public.scenes;
create policy scenes_read on public.scenes for select to authenticated using (team_id = public.current_team());
create policy scenes_gm on public.scenes for all to authenticated
  using (team_id = public.current_team() and public.is_gm())
  with check (team_id = public.current_team() and public.is_gm());

drop policy if exists session_read on public.session_state;
drop policy if exists session_gm_update on public.session_state;
drop policy if exists session_gm_insert on public.session_state;
revoke insert on public.session_state from authenticated;
create policy session_read on public.session_state for select to authenticated using (team_id = public.current_team());
create policy session_gm_update on public.session_state for update to authenticated
  using (team_id = public.current_team() and public.is_gm())
  with check (team_id = public.current_team() and public.is_gm());

drop policy if exists "holo read" on public.holo_links;
drop policy if exists "holo insert" on public.holo_links;
drop policy if exists "holo delete" on public.holo_links;
create policy "holo read" on public.holo_links for select to authenticated
  using (team_id = public.current_team() and (public.is_gm() or public.owns_character(a) or public.owns_character(b)));
create policy "holo insert" on public.holo_links for insert to authenticated
  with check (team_id = public.current_team() and public.gm_of_character(a) and public.gm_of_character(b));
create policy "holo delete" on public.holo_links for delete to authenticated
  using (team_id = public.current_team() and public.is_gm());

drop policy if exists "messages read" on public.messages;
drop policy if exists "messages insert" on public.messages;
drop policy if exists "messages delete" on public.messages;
create policy "messages read" on public.messages for select to authenticated
  using (team_id = public.current_team() and public.can_read_channel(channel));
create policy "messages insert" on public.messages for insert to authenticated
  with check (sender_user = auth.uid() and team_id = public.current_team() and public.can_post_channel(channel));
create policy "messages delete" on public.messages for delete to authenticated
  using (team_id = public.current_team() and public.is_gm());

-- ---------------------------------------------------------------------
-- 6. FONCTIONS DE LA TABLE, LIMITÉES À L'ÉQUIPE ACTIVE
-- ---------------------------------------------------------------------
create or replace function public.get_party()
returns table(character_id uuid, handle text, avatar_url text, color text)
language sql stable security definer set search_path = public as $$
  select c.id, coalesce(nullif(c.handle, ''), c.name), p.avatar_url, p.color
  from public.characters c join public.profiles p on p.id = c.owner_id
  where c.team_id = public.current_team()
  order by c.created_at
$$;

create or replace function public.get_team_members()
returns table(user_id uuid, username text, role text, avatar_url text, color text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, m.role, p.avatar_url, p.color
  from public.team_members m join public.profiles p on p.id = m.user_id
  where m.team_id = public.current_team()
  order by m.joined_at
$$;

create or replace function public.get_universe()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select universe from public.session_state where team_id = public.current_team()), '{}'::jsonb)
$$;

create or replace function public.set_table_music(payload jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare next_music jsonb;
begin
  if not public.is_gm() then raise exception 'Action réservée au MJ'; end if;
  next_music := payload || jsonb_build_object('started_at', clock_timestamp());
  update public.session_state set music = next_music where team_id = public.current_team();
  return next_music;
end $$;

-- ---------------------------------------------------------------------
-- 7. GESTION DES ÉQUIPES
-- ---------------------------------------------------------------------
create or replace function public.my_teams()
returns table(id uuid, name text, role text, members int, active boolean)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, m.role,
         (select count(*)::int from public.team_members x where x.team_id = t.id),
         t.id = (select active_team_id from public.profiles where profiles.id = auth.uid())
  from public.team_members m join public.teams t on t.id = m.team_id
  where m.user_id = auth.uid()
  order by m.joined_at
$$;

-- Contexte de l'équipe active (nom, rôle du compte, visite d'admin)
create or replace function public.get_team_context()
returns table(id uuid, name text, role text, is_admin boolean)
language sql stable security definer set search_path = public as $$
  select t.id, t.name,
         (select m.role from public.team_members m where m.team_id = t.id and m.user_id = auth.uid()),
         public.is_platform_admin()
  from (select 1) one
  left join public.teams t on t.id = public.current_team()
$$;

create or replace function public.enter_team(_team uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if _team is not null and not public.is_platform_admin()
     and not exists (select 1 from public.team_members where team_id = _team and user_id = auth.uid()) then
    raise exception 'Tu n''es pas membre de cette équipe';
  end if;
  update public.profiles set active_team_id = _team where id = auth.uid();
end $$;

create or replace function public.create_team(_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if auth.uid() is null or exists (select 1 from public.profiles where id = auth.uid() and suspended_at is not null) then
    raise exception 'Compte suspendu';
  end if;
  if (select count(*) from public.teams where owner_id = auth.uid()) >= 10 then
    raise exception 'Limite atteinte : 10 équipes créées';
  end if;
  insert into public.teams (name, join_code, owner_id)
  values (btrim(_name), public.new_join_code(), auth.uid()) returning id into t;
  insert into public.team_members (team_id, user_id, role) values (t, auth.uid(), 'gm');
  update public.profiles set active_team_id = t where id = auth.uid();
  return t;
end $$;

create or replace function public.join_team(_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if auth.uid() is null or exists (select 1 from public.profiles where id = auth.uid() and suspended_at is not null) then
    raise exception 'Compte suspendu';
  end if;
  select id into t from public.teams
   where join_code = upper(regexp_replace(coalesce(_code, ''), '[^a-zA-Z0-9]', '', 'g'));
  if t is null then raise exception 'Code invalide'; end if;
  insert into public.team_members (team_id, user_id) values (t, auth.uid()) on conflict do nothing;
  update public.profiles set active_team_id = t where id = auth.uid();
  return t;
end $$;

create or replace function public.leave_team(_team uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.team_members where team_id = _team and user_id = auth.uid()
$$;

create or replace function public.get_join_code()
returns text language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_gm() then raise exception 'Action réservée au MJ'; end if;
  return (select join_code from public.teams where id = public.current_team());
end $$;

create or replace function public.regenerate_join_code()
returns text language plpgsql security definer set search_path = public as $$
declare code text;
begin
  if not public.is_gm() then raise exception 'Action réservée au MJ'; end if;
  update public.teams set join_code = public.new_join_code() where id = public.current_team()
  returning join_code into code;
  return code;
end $$;

create or replace function public.rename_team(_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_gm() then raise exception 'Action réservée au MJ'; end if;
  update public.teams set name = btrim(_name) where id = public.current_team();
end $$;

-- Le rôle se change dans l'équipe active, et elle garde toujours au moins un MJ
drop function if exists public.set_user_role(uuid, text);
create function public.set_user_role(_user uuid, _role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_gm() then raise exception 'Seul le MJ peut changer les rôles'; end if;
  if _role not in ('player', 'gm') then raise exception 'Rôle invalide'; end if;
  if _role = 'player' and not exists (
    select 1 from public.team_members
    where team_id = public.current_team() and role = 'gm' and user_id <> _user
  ) then
    raise exception 'L''équipe doit garder au moins un MJ';
  end if;
  update public.team_members set role = _role
   where team_id = public.current_team() and user_id = _user;
end $$;

create or replace function public.remove_team_member(_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_gm() then raise exception 'Action réservée au MJ'; end if;
  if _user = auth.uid() then raise exception 'Utilise « Quitter l''équipe »'; end if;
  if not public.is_platform_admin() and _user = (select owner_id from public.teams where id = public.current_team()) then
    raise exception 'Le créateur de l''équipe ne peut pas être retiré';
  end if;
  delete from public.team_members where team_id = public.current_team() and user_id = _user;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'is_platform_admin()', 'current_team()', 'is_team_member()', 'gm_of_character(uuid)',
    'get_team_members()', 'my_teams()', 'get_team_context()', 'enter_team(uuid)', 'create_team(text)',
    'join_team(text)', 'leave_team(uuid)', 'get_join_code()', 'regenerate_join_code()',
    'rename_team(text)', 'set_user_role(uuid, text)', 'remove_team_member(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke all on function public.new_join_code() from public, anon, authenticated;
end $$;

-- ---------------------------------------------------------------------
-- 8. IMAGES : chaque équipe a son dossier de scènes (<équipe>/<fichier>)
-- ---------------------------------------------------------------------
create or replace function public.team_scene_file(_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_team() is not null and (
    (storage.foldername(_name))[1] = public.current_team()::text
    or exists (select 1 from public.scenes s
               where s.image_path = _name and s.team_id = public.current_team()))
$$;
revoke all on function public.team_scene_file(text) from public, anon;
grant execute on function public.team_scene_file(text) to authenticated;

drop policy if exists scenes_files_read on storage.objects;
drop policy if exists scenes_files_insert on storage.objects;
drop policy if exists scenes_files_update on storage.objects;
drop policy if exists scenes_files_delete on storage.objects;
create policy scenes_files_read on storage.objects for select to authenticated
  using (bucket_id = 'scenes' and public.team_scene_file(name));
create policy scenes_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'scenes' and public.is_gm() and public.team_scene_file(name));
create policy scenes_files_update on storage.objects for update to authenticated
  using (bucket_id = 'scenes' and public.is_gm() and public.team_scene_file(name))
  with check (bucket_id = 'scenes' and public.is_gm() and public.team_scene_file(name));
create policy scenes_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'scenes' and public.is_gm() and public.team_scene_file(name));

-- Un avatar n'est visible que si le profil de son propriétaire l'est
drop policy if exists "avatars read" on storage.objects;
create policy "avatars read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars'
         and exists (select 1 from public.profiles p where p.id::text = (storage.foldername(objects.name))[1]));
