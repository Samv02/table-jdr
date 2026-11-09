-- Champs de vision des pions (ennemis, alliés) : direction, ouverture, portée, balayage.
-- null = pas de champ de vision. Seul le MJ écrit les pions (règles déjà en place).
alter table public.map_tokens add column if not exists cone jsonb;

alter table public.map_tokens drop constraint if exists map_tokens_cone_shape;
alter table public.map_tokens add constraint map_tokens_cone_shape check (
  cone is null or (jsonb_typeof(cone) = 'object' and pg_column_size(cone) < 600)
);
