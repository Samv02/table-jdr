-- « viol* » touchait violet et violon, « mongol* » touchait Mongolie : formes exactes à la place.
delete from public.moderation_words where word in ('viol*', 'mongol*');
insert into public.moderation_words (word, category) values
  ('viol', 'sexuel'), ('violer', 'sexuel'), ('violé', 'sexuel'), ('violée', 'sexuel'),
  ('violeur', 'sexuel'), ('violeurs', 'sexuel'),
  ('mongol', 'insulte'), ('mongole', 'insulte')
on conflict (word) do nothing;
