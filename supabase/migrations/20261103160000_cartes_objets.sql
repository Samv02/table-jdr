-- Cartes : objets posés par le MJ (symboles, images importées, escaliers, textes).
-- Les images vivent dans le stockage `maps`, dossier `<table>/objets/`, lisible par la table seule.
alter table public.maps add column if not exists objects jsonb not null default '[]'::jsonb;

alter table public.maps drop constraint if exists maps_objects_check;
alter table public.maps add constraint maps_objects_check
  check (jsonb_typeof(objects) = 'array'
         and jsonb_array_length(objects) <= 2000
         and octet_length(objects::text) <= 1000000);

-- Une forme libre copiée d'une zone peut compter jusqu'à 1000 points : on relève la limite de taille
alter table public.maps drop constraint if exists maps_shapes_check;
alter table public.maps add constraint maps_shapes_check
  check (jsonb_typeof(shapes) = 'array'
         and jsonb_array_length(shapes) <= 1000
         and octet_length(shapes::text) <= 1500000);
