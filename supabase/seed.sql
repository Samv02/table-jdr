-- =====================================================================
-- DONNÉES DE DÉPART — base de DÉVELOPPEMENT uniquement
-- Base de développement seulement : à coller dans le SQL Editor d'un projet neuf, après les migrations.
--
-- Comptes de test (mot de passe pour les trois : table1234)
--   mj@table.local        → MJ
--   joueur1@table.local   → joueur, personnage « Alex »
--   joueur2@table.local   → joueur, personnage « Sam »
--   joueur3@table.local   → joueur, personnage « Mika »
--   admin@table.local     → admin du back office (hors équipe)
-- Les quatre premiers forment l'équipe « Table de test » (code TESTTEST).
-- Ne jamais utiliser ce fichier sur une base en ligne.
-- =====================================================================

-- Comptes (format attendu par le service d'authentification de Supabase)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  crypt('table1234', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
  '', '', '', ''
from (values
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'mj@table.local'),
  ('a0000000-0000-4000-8000-000000000002'::uuid, 'joueur1@table.local'),
  ('a0000000-0000-4000-8000-000000000003'::uuid, 'joueur2@table.local'),
  ('a0000000-0000-4000-8000-000000000004'::uuid, 'admin@table.local'),
  ('a0000000-0000-4000-8000-000000000005'::uuid, 'joueur3@table.local')
) as u(id, email)
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.email like '%@table.local'
  and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');

-- Pseudos lisibles (le profil est créé automatiquement par le trigger)
update public.profiles set username = 'MaitreDuJeu', color = 'yellow'
 where id = 'a0000000-0000-4000-8000-000000000001';
update public.profiles set username = 'Joueur1', color = 'cyan'
 where id = 'a0000000-0000-4000-8000-000000000002';
update public.profiles set username = 'Joueur2', color = 'violet'
 where id = 'a0000000-0000-4000-8000-000000000003';
update public.profiles set username = 'Joueur3', color = 'green'
 where id = 'a0000000-0000-4000-8000-000000000005';
update public.profiles set username = 'Admin', color = 'green'
 where id = 'a0000000-0000-4000-8000-000000000004';
insert into public.platform_admins (user_id) values ('a0000000-0000-4000-8000-000000000004')
on conflict (user_id) do nothing;

-- Une équipe de test : le MJ et les deux joueurs
insert into public.teams (id, name, join_code, owner_id) values
  ('b0000000-0000-4000-8000-000000000001', 'Table de test', 'TESTTEST', 'a0000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;
insert into public.team_members (team_id, user_id, role) values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'gm'),
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'player'),
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'player'),
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005', 'player')
on conflict (team_id, user_id) do nothing;
update public.profiles set active_team_id = 'b0000000-0000-4000-8000-000000000001'
 where id in ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002',
              'a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000005');

-- Deux personnages d'exemple (univers Neutre : PHY AGI ESP PER VOL PRE)
insert into public.characters (id, team_id, owner_id, name, handle, players_can_edit, sheet) values
(
  'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'Alex', 'Alex', true,
  '{
    "role": "Enquêtrice", "level": "1",
    "stats": { "PHY": 3, "AGI": 4, "ESP": 5, "PER": 4, "VOL": 3, "PRE": 2 },
    "skills": [
      { "name": "Investigation", "stat": "ESP", "level": 3 },
      { "name": "Discrétion", "stat": "AGI", "level": 2 },
      { "name": "Négociation", "stat": "PRE", "level": 1 }
    ],
    "weapons": [ { "name": "Pistolet", "dmg": "2d6", "ammo": "8", "rof": 1, "skill": "Armes de poing" } ],
    "cyberware": "Mémoire photographique",
    "armor": "1"
  }'::jsonb
),
(
  'c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'Sam', 'Sam', true,
  '{
    "role": "Mécano", "level": "1",
    "stats": { "PHY": 5, "AGI": 3, "ESP": 3, "PER": 3, "VOL": 4, "PRE": 3 },
    "skills": [
      { "name": "Mécanique", "stat": "ESP", "level": 3 },
      { "name": "Bagarre", "stat": "PHY", "level": 2 },
      { "name": "Athlétisme", "stat": "PHY", "level": 1 }
    ],
    "weapons": [ { "name": "Clé à molette", "dmg": "1d6+1", "ammo": "", "rof": 1, "skill": "Bagarre" } ],
    "cyberware": "Costaud",
    "armor": "2"
  }'::jsonb
)
on conflict (id) do nothing;

insert into public.characters (id, team_id, owner_id, name, handle, players_can_edit, sheet) values
(
  'c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005', 'Mika', 'Mika', true,
  '{
    "role": "Exploratrice", "level": "1",
    "stats": { "PHY": 3, "AGI": 5, "ESP": 4, "PER": 5, "VOL": 3, "PRE": 3 },
    "skills": [ { "name": "Discrétion", "stat": "AGI", "level": 3 }, { "name": "Observation", "stat": "PER", "level": 2 } ],
    "weapons": [ { "name": "Pistolet léger", "dmg": "2d6", "ammo": "12", "rof": 2, "skill": "Armes de poing" } ],
    "cyberware": "Vision nocturne",
    "armor": "1"
  }'::jsonb
)
on conflict (id) do nothing;

insert into public.character_state (character_id, hp_current, eddies, ammo, inventory) values
  ('c0000000-0000-4000-8000-000000000003', 16, 300, '{"0":{"mag":5,"spare":2,"loose":0}}', '[{"name":"Trousse de soin","qty":2}]'),
  ('c0000000-0000-4000-8000-000000000001', 16, 120, '{"0":{"mag":8,"spare":2,"loose":0}}', '[{"name":"Carnet","qty":1},{"name":"Lampe torche","qty":1}]'),
  ('c0000000-0000-4000-8000-000000000002', 20, 45, '{}', '[{"name":"Caisse à outils","qty":1}]')
on conflict (character_id) do nothing;
