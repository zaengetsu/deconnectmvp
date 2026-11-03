-- Annule 20261103170000_promotion_admins : un rôle admin coupait ces comptes des routes parent.
-- Ils redeviennent parents ; leur accès au back-office passe par la liste de
-- platform/auth/admin-allowlist.ts, en attendant que le statut admin soit stocké à part du rôle.
-- Sans effet sur une base qui n'a pas ces comptes (tests, Postgres nu).

UPDATE users
SET role = 'parent'
WHERE role = 'admin'
  AND email IN (
    'i.berthier@wineor.fr',
    'leonveyopa@gmail.com',
    'berthier.ivan@yahoo.fr',
    'jcharles.nmbiada@gmail.com'
  );

UPDATE profiles
SET role = 'parent'
WHERE role = 'admin'
  AND email IN (
    'i.berthier@wineor.fr',
    'leonveyopa@gmail.com',
    'berthier.ivan@yahoo.fr',
    'jcharles.nmbiada@gmail.com'
  );
