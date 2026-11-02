-- Règles de vision par carte, décidées par le MJ quand la vision limitée est active.
-- room : les joueurs voient toute la pièce où ils se trouvent, jusqu'à la prochaine porte fermée.
-- sight : champ de vue depuis chaque pion, limité à vision_range (0 = sans limite, dans l'unité
-- de la carte) ; vision_corners montre aussi ce qui se cache dans les angles.
alter table public.maps add column if not exists vision_mode text not null default 'sight'
  check (vision_mode in ('room', 'sight'));
alter table public.maps add column if not exists vision_range real not null default 0
  check (vision_range >= 0 and vision_range <= 10000);
alter table public.maps add column if not exists vision_corners boolean not null default false;
