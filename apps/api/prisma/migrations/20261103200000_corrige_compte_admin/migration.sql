-- Corrige 20261103190000_statut_admin_hors_role : le statut visait une adresse presque identique
-- à celle du compte concerné. Sans effet sur une base qui n'a pas ces comptes (tests, Postgres nu).

UPDATE users SET is_admin = true WHERE email = 'leonceyopa@gmail.com';

UPDATE users SET is_admin = false WHERE email = 'leonveyopa@gmail.com';
