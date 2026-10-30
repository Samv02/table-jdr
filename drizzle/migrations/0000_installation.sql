-- Schéma complet de la table (copie de supabase/installation.sql, sans BEGIN/COMMIT).
-- Idempotent : peut être appliqué même si installation.sql a déjà été lancé à la main.
-- =====================================================================
-- TABLE DE JEU DE RÔLE — installation complète de la base (Supabase)
--
-- À lancer UNE FOIS dans un projet Supabase neuf : SQL Editor → coller → Run.
-- Le script peut être relancé sans danger (il ne supprime aucune donnée).
--
-- Contenu :
--   1. Profils (rôle joueur / MJ, couleur, avatar)
--   2. Personnages et état (PV, argent, munitions, inventaire, emplacements)
--      + verrou MJ des fiches + garde-fou des emplacements
--   3. Jets de dés (insérés uniquement par le serveur, anti-triche)
--   4. Scènes, musique, univers de la table (session_state)
--   5. Bloc-notes privés
--   6. Messagerie (annonces, canal MJ, échanges entre joueurs autorisés)
--   7. Stockage des images (avatars, scènes)
--   8. Temps réel
-- Puis, tout en bas : comment nommer le premier MJ.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. PROFILS
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  role text not null default 'player' check (role in ('player', 'gm')),
  avatar_url text,
  color text not null default 'cyan',
  created_at timestamptz not null default now()
);
alter table public.profiles drop constraint if exists profiles_color_check;
alter table public.profiles add constraint profiles_color_check
  check (color in ('yellow', 'red', 'cyan', 'green', 'violet', 'orange'));
alter table public.profiles drop constraint if exists profiles_username_len;
alter table public.profiles add constraint profiles_username_len
  check (username is null or char_length(username) between 3 and 20);
create unique index if not exists profiles_username_unique on public.profiles (lower(username));

alter table public.profiles enable row level security;
grant select on public.profiles to authenticated;
grant update (username, avatar_url, color) on public.profiles to authenticated;
grant all on public.profiles to service_role;

create or replace function public.is_gm()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'gm')
$$;

drop policy if exists "read own profile" on public.profiles;
drop policy if exists "authenticated read profiles" on public.profiles;
drop policy if exists "update own profile" on public.profiles;
-- Pseudo, couleur et avatar sont visibles par la table (jamais l'e-mail, qui reste dans auth.users)
create policy "authenticated read profiles" on public.profiles for select to authenticated using (true);
create policy "update own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Seul le MJ (ou l'éditeur SQL) change un rôle
create or replace function public.protect_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_gm() then
    raise exception 'Seul le MJ peut changer les rôles';
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role before update on public.profiles
  for each row execute function public.protect_role();

create or replace function public.set_user_role(_user uuid, _role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_gm() then raise exception 'Seul le MJ peut changer les rôles'; end if;
  if _role not in ('player', 'gm') then raise exception 'Rôle invalide'; end if;
  update public.profiles set role = _role where id = _user;
end $$;
revoke all on function public.set_user_role(uuid, text) from public, anon;
grant execute on function public.set_user_role(uuid, text) to authenticated;

-- Chaque nouveau compte reçoit un profil avec un pseudo provisoire (jamais l'e-mail)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (new.id, 'Joueur-' || upper(substr(md5(random()::text || new.id::text), 1, 4)))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
-- Comptes déjà créés avant ce script : profil manquant ajouté
insert into public.profiles (id, username)
select u.id, 'Joueur-' || upper(substr(md5(u.id::text), 1, 4)) from auth.users u
on conflict (id) do nothing;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------------
-- 2. PERSONNAGES ET ÉTAT
-- ---------------------------------------------------------------------
create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete set null,
  name text not null,
  handle text,
  sheet jsonb not null default '{}'::jsonb,
  -- Verrou MJ : le joueur ne modifie son état (PV, argent…) que si le MJ l'autorise
  players_can_edit boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.characters add column if not exists players_can_edit boolean not null default false;
alter table public.characters enable row level security;
grant select, insert, update, delete on public.characters to authenticated;
grant all on public.characters to service_role;

create or replace function public.owns_character(_cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.characters where id = _cid and owner_id = auth.uid())
$$;
create or replace function public.player_can_edit(_cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select players_can_edit from public.characters where id = _cid), false)
$$;

drop policy if exists "read characters" on public.characters;
drop policy if exists "gm insert characters" on public.characters;
drop policy if exists "gm update characters" on public.characters;
drop policy if exists "gm delete characters" on public.characters;
-- Un joueur ne voit que SES fiches ; le MJ voit et modifie tout
create policy "read characters" on public.characters for select to authenticated
  using (owner_id = auth.uid() or public.is_gm());
create policy "gm insert characters" on public.characters for insert to authenticated with check (public.is_gm());
create policy "gm update characters" on public.characters for update to authenticated
  using (public.is_gm()) with check (public.is_gm());
create policy "gm delete characters" on public.characters for delete to authenticated using (public.is_gm());

create table if not exists public.character_state (
  character_id uuid primary key references public.characters(id) on delete cascade,
  hp_current int not null default 0,
  eddies int not null default 0,              -- argent (le nom affiché vient de l'univers)
  ammo jsonb not null default '{}'::jsonb,
  inventory jsonb not null default '[]'::jsonb,
  programs jsonb not null default '[]'::jsonb, -- emplacements (programmes, sorts, pouvoirs…)
  program_slots int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.character_state add column if not exists programs jsonb not null default '[]'::jsonb;
alter table public.character_state add column if not exists program_slots int not null default 0;
alter table public.character_state drop constraint if exists program_slots_range;
alter table public.character_state add constraint program_slots_range check (program_slots between 0 and 20);
alter table public.character_state drop constraint if exists programs_is_array;
alter table public.character_state add constraint programs_is_array
  check (jsonb_typeof(programs) = 'array' and jsonb_array_length(programs) <= 30);
alter table public.character_state enable row level security;
grant select, insert, update, delete on public.character_state to authenticated;
grant all on public.character_state to service_role;

drop policy if exists "read state" on public.character_state;
drop policy if exists "update state" on public.character_state;
drop policy if exists "owner or gm update state" on public.character_state;
drop policy if exists "gm insert state" on public.character_state;
drop policy if exists "gm delete state" on public.character_state;
create policy "read state" on public.character_state for select to authenticated
  using (public.owns_character(character_id) or public.is_gm());
create policy "update state" on public.character_state for update to authenticated
  using (public.is_gm() or (public.owns_character(character_id) and public.player_can_edit(character_id)))
  with check (public.is_gm() or (public.owns_character(character_id) and public.player_can_edit(character_id)));
create policy "gm insert state" on public.character_state for insert to authenticated with check (public.is_gm());
create policy "gm delete state" on public.character_state for delete to authenticated using (public.is_gm());

drop trigger if exists character_state_touch on public.character_state;
create trigger character_state_touch before update on public.character_state
  for each row execute function public.touch_updated_at();

-- Emplacements : le joueur choisit quoi activer, le MJ fixe capacité, coûts, dés et effets
create or replace function public.cyberdeck_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  p jsonb; o jsonb; used int := 0; s jsonb;
begin
  if new.programs is not distinct from old.programs and new.program_slots is not distinct from old.program_slots then
    return new;
  end if;
  for p in select * from jsonb_array_elements(new.programs) loop
    if jsonb_typeof(p) <> 'object' or jsonb_typeof(p->'id') is distinct from 'string' then
      raise exception 'Élément invalide';
    end if;
    if char_length(coalesce(p->>'name', '')) > 60 or char_length(coalesce(p->>'effect', '')) > 500
       or char_length(coalesce(p->>'dice', '')) > 12 then
      raise exception 'Texte trop long';
    end if;
    s := coalesce(p->'slots', 'null'::jsonb);
    if s <> 'null'::jsonb and (jsonb_typeof(s) <> 'number' or (s#>>'{}')::numeric not between 1 and 10) then
      raise exception 'Coût invalide (1 à 10)';
    end if;
  end loop;
  if auth.uid() is null or public.is_gm() then
    return new;
  end if;
  if new.program_slots is distinct from old.program_slots then
    raise exception 'Seul le MJ règle la capacité';
  end if;
  for p in select * from jsonb_array_elements(new.programs) loop
    select x into o from jsonb_array_elements(old.programs) x where x->>'id' = p->>'id' limit 1;
    if o is null then
      if coalesce(p->'slots', 'null'::jsonb) <> 'null'::jsonb
         or coalesce(p->>'dice', '') <> '' or coalesce(p->>'effect', '') <> '' then
        raise exception 'Seul le MJ fixe le coût, le dé et l''effet';
      end if;
    elsif coalesce(p->'slots', 'null'::jsonb) <> coalesce(o->'slots', 'null'::jsonb)
       or coalesce(p->>'dice', '') <> coalesce(o->>'dice', '')
       or coalesce(p->>'effect', '') <> coalesce(o->>'effect', '') then
      raise exception 'Seul le MJ fixe le coût, le dé et l''effet';
    end if;
    if coalesce(p->'active', 'false'::jsonb) = 'true'::jsonb then
      if coalesce(p->'slots', 'null'::jsonb) = 'null'::jsonb then
        raise exception 'Cet élément attend que le MJ fixe son coût';
      end if;
      used := used + (p->>'slots')::numeric::int;
    end if;
  end loop;
  if used > new.program_slots then
    raise exception 'Pas assez de place : % utilisés sur %', used, new.program_slots;
  end if;
  return new;
end $$;
drop trigger if exists cyberdeck_guard on public.character_state;
create trigger cyberdeck_guard before update on public.character_state
  for each row execute function public.cyberdeck_guard();

-- Groupe visible par tous : pseudo du personnage, avatar et couleur seulement (jamais la fiche)
create or replace function public.get_party()
returns table(character_id uuid, handle text, avatar_url text, color text)
language sql stable security definer set search_path = public as $$
  select c.id, coalesce(nullif(c.handle, ''), c.name), p.avatar_url, p.color
  from public.characters c join public.profiles p on p.id = c.owner_id
  where c.owner_id is not null and auth.uid() is not null
  order by c.created_at
$$;
revoke all on function public.get_party() from public, anon;
grant execute on function public.get_party() to authenticated;

-- ---------------------------------------------------------------------
-- 3. JETS DE DÉS (écrits uniquement par le serveur : aucune politique d'insertion)
-- ---------------------------------------------------------------------
create table if not exists public.rolls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  character_id uuid references public.characters(id) on delete set null,
  label text,
  dice_count int not null,
  dice_sides int not null,
  modifier int not null default 0,
  results int[] not null,
  total int not null,
  target int,                     -- jets « sous la base » (pourcentage) : valeur à ne pas dépasser
  is_secret boolean not null default false,
  author_name text,
  character_name text,
  display_name text,
  created_at timestamptz not null default now()
);
alter table public.rolls add column if not exists target int;
alter table public.rolls add column if not exists author_name text;
alter table public.rolls add column if not exists character_name text;
alter table public.rolls add column if not exists display_name text;
create index if not exists rolls_created on public.rolls (created_at desc);
alter table public.rolls enable row level security;
grant select on public.rolls to authenticated;
grant all on public.rolls to service_role;
drop policy if exists "read rolls" on public.rolls;
create policy "read rolls" on public.rolls for select to authenticated
  using (is_secret = false or user_id = auth.uid() or public.is_gm());
alter table public.rolls replica identity full;

-- ---------------------------------------------------------------------
-- 4. SCÈNES, MUSIQUE ET UNIVERS
-- ---------------------------------------------------------------------
create table if not exists public.scenes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subtitle text not null default '',
  image_path text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.scenes enable row level security;
grant select, insert, update, delete on public.scenes to authenticated;
grant all on public.scenes to service_role;
drop policy if exists scenes_read on public.scenes;
drop policy if exists scenes_gm on public.scenes;
create policy scenes_read on public.scenes for select to authenticated using (true);
create policy scenes_gm on public.scenes for all to authenticated using (public.is_gm()) with check (public.is_gm());

create table if not exists public.session_state (
  id integer primary key default 1 check (id = 1),
  active_scene_id uuid references public.scenes(id) on delete set null,
  music jsonb not null default '{}'::jsonb,
  -- Univers de la table : thème, vocabulaire, règles (réglé dans MJ → Univers)
  universe jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.session_state add column if not exists universe jsonb not null default '{}'::jsonb;
insert into public.session_state (id) values (1) on conflict (id) do nothing;
alter table public.session_state enable row level security;
grant select, insert, update on public.session_state to authenticated;
grant all on public.session_state to service_role;
drop policy if exists session_read on public.session_state;
drop policy if exists session_gm_update on public.session_state;
drop policy if exists session_gm_insert on public.session_state;
create policy session_read on public.session_state for select to authenticated using (true);
create policy session_gm_update on public.session_state for update to authenticated
  using (public.is_gm()) with check (public.is_gm());
create policy session_gm_insert on public.session_state for insert to authenticated with check (public.is_gm());
drop trigger if exists session_touch on public.session_state;
create trigger session_touch before update on public.session_state
  for each row execute function public.touch_updated_at();

-- L'univers est lisible avant connexion (page d'accueil aux couleurs de la table)
create or replace function public.get_universe()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select universe from public.session_state where id = 1), '{}'::jsonb)
$$;
revoke all on function public.get_universe() from public;
grant execute on function public.get_universe() to anon, authenticated;

create or replace function public.table_server_time()
returns timestamptz language sql volatile security invoker set search_path = public as $$
  select clock_timestamp()
$$;
revoke all on function public.table_server_time() from public, anon;
grant execute on function public.table_server_time() to authenticated;

create or replace function public.set_table_music(payload jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare next_music jsonb;
begin
  if not public.is_gm() then raise exception 'Action réservée au MJ'; end if;
  next_music := payload || jsonb_build_object('started_at', clock_timestamp());
  update public.session_state set music = next_music where id = 1;
  return next_music;
end $$;
revoke all on function public.set_table_music(jsonb) from public, anon;
grant execute on function public.set_table_music(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 5. BLOC-NOTES PRIVÉS (le joueur écrit, le MJ lit, les autres ne voient rien)
-- ---------------------------------------------------------------------
create table if not exists public.character_notes (
  character_id uuid primary key references public.characters(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 10000),
  updated_at timestamptz not null default now()
);
alter table public.character_notes enable row level security;
grant select, insert, update on public.character_notes to authenticated;
grant all on public.character_notes to service_role;
drop policy if exists "notes read" on public.character_notes;
drop policy if exists "notes insert" on public.character_notes;
drop policy if exists "notes update" on public.character_notes;
create policy "notes read" on public.character_notes for select to authenticated
  using (public.owns_character(character_id) or public.is_gm());
create policy "notes insert" on public.character_notes for insert to authenticated
  with check (public.owns_character(character_id));
create policy "notes update" on public.character_notes for update to authenticated
  using (public.owns_character(character_id)) with check (public.owns_character(character_id));
drop trigger if exists character_notes_touch on public.character_notes;
create trigger character_notes_touch before update on public.character_notes
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 6. MESSAGERIE
--   "all"            Annonces : le MJ écrit, tout le monde lit
--   "gm:<perso>"     Canal privé joueur <-> MJ, toujours ouvert
--   "holo:<a>:<b>"   Échange entre deux personnages, si le MJ a autorisé la paire
-- ---------------------------------------------------------------------
create table if not exists public.holo_links (
  a uuid not null references public.characters(id) on delete cascade,
  b uuid not null references public.characters(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (a, b),
  check (a::text < b::text)
);
alter table public.holo_links enable row level security;
grant select, insert, delete on public.holo_links to authenticated;
grant all on public.holo_links to service_role;
drop policy if exists "holo read" on public.holo_links;
drop policy if exists "holo insert" on public.holo_links;
drop policy if exists "holo delete" on public.holo_links;
create policy "holo read" on public.holo_links for select to authenticated
  using (public.is_gm() or public.owns_character(a) or public.owns_character(b));
create policy "holo insert" on public.holo_links for insert to authenticated with check (public.is_gm());
create policy "holo delete" on public.holo_links for delete to authenticated using (public.is_gm());

create or replace function public.holo_allowed(_x uuid, _y uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.holo_links
    where a = case when _x::text < _y::text then _x else _y end
      and b = case when _x::text < _y::text then _y else _x end
  )
$$;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel ~ '^(all|gm:[0-9a-f-]{36}|holo:[0-9a-f-]{36}:[0-9a-f-]{36})$'),
  sender_user uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sender_character uuid references public.characters(id) on delete set null,
  sender_name text not null default '',
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists messages_channel_created on public.messages (channel, created_at desc);
alter table public.messages enable row level security;
grant select, insert, delete on public.messages to authenticated;
grant all on public.messages to service_role;

create or replace function public.can_read_channel(ch text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.is_gm() then true
    when ch = 'all' then auth.uid() is not null
    when ch like 'gm:%' then public.owns_character(split_part(ch, ':', 2)::uuid)
    when ch like 'holo:%' then public.owns_character(split_part(ch, ':', 2)::uuid)
                            or public.owns_character(split_part(ch, ':', 3)::uuid)
    else false
  end
$$;
create or replace function public.can_post_channel(ch text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.is_gm() then true
    when ch = 'all' then false
    when ch like 'gm:%' then public.owns_character(split_part(ch, ':', 2)::uuid)
    when ch like 'holo:%' then
      (public.owns_character(split_part(ch, ':', 2)::uuid) or public.owns_character(split_part(ch, ':', 3)::uuid))
      and public.holo_allowed(split_part(ch, ':', 2)::uuid, split_part(ch, ':', 3)::uuid)
    else false
  end
$$;

-- L'expéditeur est fixé par le serveur : impossible d'écrire au nom de quelqu'un d'autre
create or replace function public.messages_set_sender()
returns trigger language plpgsql security definer set search_path = public as $$
declare x uuid; y uuid;
begin
  new.sender_user := auth.uid();
  new.created_at := now();
  new.body := btrim(new.body);
  if public.is_gm() then
    new.sender_character := null;
    new.sender_name := 'MJ';
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
drop trigger if exists messages_sender on public.messages;
create trigger messages_sender before insert on public.messages
  for each row execute function public.messages_set_sender();

drop policy if exists "messages read" on public.messages;
drop policy if exists "messages insert" on public.messages;
drop policy if exists "messages delete" on public.messages;
create policy "messages read" on public.messages for select to authenticated using (public.can_read_channel(channel));
create policy "messages insert" on public.messages for insert to authenticated
  with check (sender_user = auth.uid() and public.can_post_channel(channel));
create policy "messages delete" on public.messages for delete to authenticated using (public.is_gm());
alter table public.holo_links replica identity full;

-- ---------------------------------------------------------------------
-- 7. STOCKAGE DES IMAGES (privé : liens signés)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('scenes', 'scenes', false) on conflict (id) do nothing;

drop policy if exists "avatars read" on storage.objects;
drop policy if exists "avatars own insert" on storage.objects;
drop policy if exists "avatars own update" on storage.objects;
drop policy if exists "avatars own delete" on storage.objects;
create policy "avatars read" on storage.objects for select to authenticated using (bucket_id = 'avatars');
create policy "avatars own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars own update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists scenes_files_read on storage.objects;
drop policy if exists scenes_files_insert on storage.objects;
drop policy if exists scenes_files_update on storage.objects;
drop policy if exists scenes_files_delete on storage.objects;
create policy scenes_files_read on storage.objects for select to authenticated using (bucket_id = 'scenes');
create policy scenes_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'scenes' and public.is_gm());
create policy scenes_files_update on storage.objects for update to authenticated
  using (bucket_id = 'scenes' and public.is_gm()) with check (bucket_id = 'scenes' and public.is_gm());
create policy scenes_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'scenes' and public.is_gm());

-- ---------------------------------------------------------------------
-- 8. TEMPS RÉEL
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['rolls', 'session_state', 'scenes', 'characters', 'character_state',
                           'character_notes', 'messages', 'holo_links'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;


