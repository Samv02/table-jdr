-- Cartes : éclairage et brouillard effacé à la main.
-- light : réglages de la nuit (allumé, couleur, obscurité, lumière des pions du groupe).
-- manual_fog + fog_mask : cases révélées par le MJ, un bit par case sur une grille fixe 100 × 100,
-- en base64 (1668 caractères au plus).
alter table public.maps add column if not exists light jsonb not null default '{}'::jsonb;
alter table public.maps add column if not exists manual_fog boolean not null default false;
alter table public.maps add column if not exists fog_mask text not null default '';

alter table public.maps drop constraint if exists maps_light_check;
alter table public.maps add constraint maps_light_check
  check (jsonb_typeof(light) = 'object' and octet_length(light::text) <= 1000);
alter table public.maps drop constraint if exists maps_fog_mask_check;
alter table public.maps add constraint maps_fog_mask_check
  check (char_length(fog_mask) <= 1700);
