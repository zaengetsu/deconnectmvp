-- Le statut admin se sépare du rôle : un compte peut être parent ET administrateur.
-- Remplace la liste d'emails en dur de platform/auth/admin-allowlist.ts.
-- Les comptes de rôle `admin` restent admins : le rôle continue de compter (voir admin-access.ts).
-- Sans effet sur une base qui n'a pas ces comptes (tests, Postgres nu).

ALTER TABLE users ADD COLUMN is_admin boolean NOT NULL DEFAULT false;

UPDATE users
SET is_admin = true
WHERE email IN (
  'i.berthier@wineor.fr',
  'leonveyopa@gmail.com',
  'berthier.ivan@yahoo.fr',
  'jcharles.nmbiada@gmail.com'
);
