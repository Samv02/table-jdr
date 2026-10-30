-- Modération : les messages ne sont jamais bloqués, seuls les mots de cette liste sont
-- signalés à l'admin. « * » en fin de mot accepte toutes les terminaisons.
-- Pas de mots seuls comme « tuer » ou « mort » : ils sont normaux dans un jeu de rôle.
create table if not exists public.moderation_words (
  id uuid primary key default gen_random_uuid(),
  word text not null unique check (char_length(btrim(word)) between 2 and 60),
  category text not null default 'insulte'
    check (category in ('haine', 'menace', 'danger', 'sexuel', 'insulte', 'arnaque')),
  created_at timestamptz not null default now()
);
create table if not exists public.moderation_reviews (
  message_id uuid primary key references public.messages(id) on delete cascade,
  reviewed_at timestamptz not null default now()
);
alter table public.moderation_words enable row level security;
alter table public.moderation_reviews enable row level security;
revoke all on public.moderation_words, public.moderation_reviews from anon, authenticated;
grant all on public.moderation_words, public.moderation_reviews to service_role;

insert into public.moderation_words (word, category)
select w, c from (values
  -- Haine : racisme, antisémitisme, homophobie, transphobie
  ('nègre*', 'haine'), ('negro*', 'haine'), ('bougnoul*', 'haine'), ('youpin*', 'haine'),
  ('bicot*', 'haine'), ('raton*', 'haine'), ('chinetoque*', 'haine'), ('bamboula*', 'haine'),
  ('sale arabe', 'haine'), ('sale noir', 'haine'), ('sale juif', 'haine'), ('sale musulman', 'haine'),
  ('sale race', 'haine'), ('pédé*', 'haine'), ('tapette*', 'haine'), ('gouine*', 'haine'),
  ('tarlouze*', 'haine'), ('travelo*', 'haine'), ('heil hitler', 'haine'), ('sieg heil', 'haine'),
  ('nigger*', 'haine'), ('faggot*', 'haine'),
  -- Menaces visant une personne réelle
  ('je sais où tu habites', 'menace'), ('je connais ton adresse', 'menace'), ('je vais te retrouver', 'menace'),
  ('je vais te frapper', 'menace'), ('je vais te violer', 'menace'), ('je vais te tuer', 'menace'),
  ('je vais te buter', 'menace'), ('je vais te défoncer', 'menace'), ('je publie ton adresse', 'menace'),
  ('tes photos', 'menace'),
  -- Personne en danger : à traiter avec soin, pas à sanctionner
  ('me suicider', 'danger'), ('me tuer pour de vrai', 'danger'), ('envie de mourir', 'danger'),
  ('me faire du mal', 'danger'), ('en finir avec la vie', 'danger'), ('tue toi', 'danger'),
  ('suicide toi', 'danger'), ('va te pendre', 'danger'), ('kys', 'danger'),
  -- Sexuel
  ('viol*', 'sexuel'), ('pédophil*', 'sexuel'), ('pedoporn*', 'sexuel'), ('nudes', 'sexuel'),
  ('envoie une photo de toi', 'sexuel'), ('quel âge as tu', 'sexuel'),
  -- Insultes
  ('connard*', 'insulte'), ('connasse*', 'insulte'), ('salope*', 'insulte'), ('pute*', 'insulte'),
  ('enculé*', 'insulte'), ('fils de pute', 'insulte'), ('ta mère la', 'insulte'), ('nique ta mère', 'insulte'),
  ('ntm', 'insulte'), ('fdp', 'insulte'), ('trou du cul', 'insulte'), ('sous merde', 'insulte'),
  ('attardé*', 'insulte'), ('mongol*', 'insulte'), ('débile mental', 'insulte'),
  -- Arnaques et données personnelles
  ('ton mot de passe', 'arnaque'), ('mot de passe de ton compte', 'arnaque'), ('carte bancaire', 'arnaque'),
  ('code de ta carte', 'arnaque'), ('virement', 'arnaque'), ('iban', 'arnaque'), ('crypto gratuit*', 'arnaque')
) as t(w, c)
on conflict (word) do nothing;
