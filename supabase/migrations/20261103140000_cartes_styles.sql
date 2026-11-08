-- Cartes : apparence choisie par le MJ (style de départ et retouches : couleurs, murs, hachures).
-- Lue par les joueurs avec le reste de la carte affichée, selon les règles déjà en place.
alter table public.maps add column if not exists style jsonb not null default '{}'::jsonb;

alter table public.maps drop constraint if exists maps_style_check;
alter table public.maps add constraint maps_style_check
  check (jsonb_typeof(style) = 'object' and octet_length(style::text) <= 4000);
