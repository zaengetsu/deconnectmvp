-- Clés étrangères héritées de Supabase vers auth.users. Depuis la sortie de Supabase Auth, les
-- comptes naissent dans public.users seulement : ces contraintes faisaient échouer l'inscription
-- (profiles), la réinitialisation de mot de passe (password_reset_tokens) et la liaison d'un
-- appareil enfant (children) pour tout nouveau compte. Le schéma Prisma ne les déclare pas ; les
-- effacements correspondants sont faits par l'API. Sans effet sur une base sans schéma auth.

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

ALTER TABLE password_reset_tokens DROP CONSTRAINT IF EXISTS password_reset_tokens_user_id_fkey;

ALTER TABLE children DROP CONSTRAINT IF EXISTS children_auth_user_id_fkey;
