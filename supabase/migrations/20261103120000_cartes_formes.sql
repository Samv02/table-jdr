-- Cartes : sols dessinés par formes (rectangles, cercles, couloirs, formes libres).
-- Les murs posés sur la grille restent dans `walls` ; les règles de lecture des cartes
-- (le MJ voit tout, le joueur ne lit que la carte affichée) s'appliquent aussi aux formes.
alter table public.maps add column if not exists shapes jsonb not null default '[]'::jsonb;

alter table public.maps drop constraint if exists maps_shapes_check;
alter table public.maps add constraint maps_shapes_check
  check (jsonb_typeof(shapes) = 'array'
         and jsonb_array_length(shapes) <= 1000
         and octet_length(shapes::text) <= 600000);
