-- Scènes : dossier, transition, ambiance animée et musique liée.
-- Seul le MJ écrit les scènes (règles déjà en place) ; les joueurs les lisent dans leur table.
alter table public.scenes add column if not exists folder text not null default '';
alter table public.scenes add column if not exists transition text not null default 'fade';
alter table public.scenes add column if not exists ambiance text not null default 'none';
alter table public.scenes add column if not exists music jsonb;

alter table public.scenes drop constraint if exists scenes_folder_len;
alter table public.scenes add constraint scenes_folder_len check (char_length(folder) <= 40);

alter table public.scenes drop constraint if exists scenes_transition_kind;
alter table public.scenes add constraint scenes_transition_kind
  check (transition in ('fade', 'cut', 'zoom', 'slide', 'blur', 'flash'));

alter table public.scenes drop constraint if exists scenes_ambiance_kind;
alter table public.scenes add constraint scenes_ambiance_kind
  check (ambiance in ('none', 'rain', 'storm', 'snow', 'mist', 'embers', 'ash', 'glitch'));

alter table public.scenes drop constraint if exists scenes_music_shape;
alter table public.scenes add constraint scenes_music_shape
  check (music is null or (jsonb_typeof(music) = 'object' and pg_column_size(music) < 600));
