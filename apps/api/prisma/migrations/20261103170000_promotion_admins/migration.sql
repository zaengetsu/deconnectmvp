-- Premiers administrateurs du back-office : quatre comptes parents existants passent admin.
-- Un compte n'a qu'un rôle : ces comptes perdent les routes réservées aux parents.
-- `users` fait foi pour les jetons, `profiles` reste aligné (repli du pont Supabase).
-- Sans effet sur une base qui n'a pas ces comptes (tests, Postgres nu).

UPDATE users
SET role = 'admin'
WHERE email IN (
  'i.berthier@wineor.fr',
  'leonveyopa@gmail.com',
  'berthier.ivan@yahoo.fr',
  'jcharles.nmbiada@gmail.com'
);

UPDATE profiles
SET role = 'admin'
WHERE email IN (
  'i.berthier@wineor.fr',
  'leonveyopa@gmail.com',
  'berthier.ivan@yahoo.fr',
  'jcharles.nmbiada@gmail.com'
);
