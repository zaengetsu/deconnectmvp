-- L'app mobile ne parle plus qu'à l'API : plus de supabase-js, de RPC, de Storage ni d'Edge Functions.
-- Supabase ne sert plus qu'à héberger la base Postgres.
--
-- 1. Preuves d'activité : stockées par l'API dans media_files (remplace le bucket « activity-proofs »).
-- 2. Invitations co-parent : code court à 6 caractères (saisi dans l'app).
-- 3. Jetons générés par d'anciens triggers : ils ne doivent plus écraser ceux de l'API
--    (lien de réinitialisation du mot de passe, code de liaison de l'appareil enfant).
-- 4. Comptes Supabase Auth → table users, en continu tant que d'anciennes versions de l'app circulent.
-- Idempotente et sans effet sur une base sans objets Supabase (tests, Postgres nu).

-- ─── 1. Preuves d'activité ───────────────────────────────────────────────────
ALTER TABLE media_files ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'offer';
ALTER TABLE media_files ADD COLUMN IF NOT EXISTS child_id uuid REFERENCES children(id) ON DELETE CASCADE;
ALTER TABLE media_files ADD COLUMN IF NOT EXISTS child_activity_id uuid REFERENCES child_activities(id) ON DELETE SET NULL;
ALTER TABLE media_files DROP CONSTRAINT IF EXISTS media_files_content_type_check;
ALTER TABLE media_files DROP CONSTRAINT IF EXISTS media_files_size_check;
ALTER TABLE media_files DROP CONSTRAINT IF EXISTS media_files_kind_check;
ALTER TABLE media_files ADD CONSTRAINT media_files_kind_check CHECK (
  (kind = 'offer' AND content_type IN ('image/png', 'image/jpeg', 'image/webp') AND size > 0 AND size <= 2097152)
  OR (kind = 'proof' AND child_id IS NOT NULL
      AND content_type IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime')
      AND size > 0 AND size <= 10485760)
);
CREATE INDEX IF NOT EXISTS media_files_child_activity_idx ON media_files (child_activity_id);

-- ─── 2. Invitations co-parent : code court ───────────────────────────────────
ALTER TABLE family_invitations ADD COLUMN IF NOT EXISTS short_code text;
CREATE UNIQUE INDEX IF NOT EXISTS family_invitations_pending_code_key ON family_invitations (short_code) WHERE status = 'pending' AND short_code IS NOT NULL;

-- ─── 3. Anciens triggers de génération de jetons : ne remplissent plus que les valeurs absentes ──
DO $$
BEGIN
  IF to_regprocedure('generate_reset_token()') IS NOT NULL THEN
    CREATE OR REPLACE FUNCTION generate_reset_token() RETURNS trigger AS $f$
    BEGIN
      NEW.token := COALESCE(NEW.token, encode(extensions.gen_random_bytes(32), 'hex'));
      RETURN NEW;
    END;
    $f$ LANGUAGE plpgsql;
  END IF;

  IF to_regprocedure('generate_link_token()') IS NOT NULL THEN
    CREATE OR REPLACE FUNCTION generate_link_token() RETURNS trigger AS $f$
    BEGIN
      NEW.token := COALESCE(NEW.token, encode(extensions.gen_random_bytes(16), 'hex'));
      IF NEW.short_code IS NULL AND to_regprocedure('generate_link_short_code()') IS NOT NULL THEN
        NEW.short_code := generate_link_short_code();
      END IF;
      RETURN NEW;
    END;
    $f$ LANGUAGE plpgsql;
  END IF;
END $$;

-- ─── 4. Comptes Supabase Auth → users ────────────────────────────────────────
-- Les comptes créés ou modifiés par une ancienne version de l'app (Supabase Auth) restent utilisables
-- avec l'API. Seuls les comptes encore au format bcrypt (jamais connectés via l'API) sont mis à jour :
-- une connexion par l'API re-hache le mot de passe en argon2 et fige le compte côté API.
CREATE OR REPLACE FUNCTION rk_sync_supabase_user(p_id uuid, p_email text, p_hash text, p_confirmed timestamptz, p_created timestamptz)
RETURNS void AS $$
BEGIN
  IF p_email IS NULL THEN RETURN; END IF;
  INSERT INTO users (id, email, password_hash, role, full_name, email_verified_at, created_at)
  SELECT p_id, lower(p_email), p_hash, COALESCE(p.role, 'parent'), p.full_name, p_confirmed, COALESCE(p_created, now())
  FROM (SELECT 1) one LEFT JOIN profiles p ON p.id = p_id
  ON CONFLICT DO NOTHING;

  UPDATE users u
     SET password_hash = COALESCE(p_hash, u.password_hash),
         email = CASE WHEN NOT EXISTS (SELECT 1 FROM users x WHERE x.email = lower(p_email) AND x.id <> u.id) THEN lower(p_email) ELSE u.email END,
         updated_at = now()
   WHERE u.id = p_id
     AND (u.password_hash IS NULL OR u.password_hash LIKE '$2%')
     AND (u.password_hash IS DISTINCT FROM p_hash OR u.email <> lower(p_email));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    PERFORM rk_sync_supabase_user(u.id, u.email, u.encrypted_password, u.email_confirmed_at, u.created_at)
      FROM auth.users u
     WHERE COALESCE(u.is_anonymous, false) = false;

    EXECUTE $t$
      CREATE OR REPLACE FUNCTION rk_on_supabase_user() RETURNS trigger AS $f$
      BEGIN
        IF COALESCE(NEW.is_anonymous, false) = false THEN
          PERFORM public.rk_sync_supabase_user(NEW.id, NEW.email, NEW.encrypted_password, NEW.email_confirmed_at, NEW.created_at);
        END IF;
        RETURN NEW;
      END;
      $f$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
    $t$;
    EXECUTE 'DROP TRIGGER IF EXISTS rk_on_supabase_user ON auth.users';
    EXECUTE 'CREATE TRIGGER rk_on_supabase_user AFTER INSERT OR UPDATE OF email, encrypted_password ON auth.users FOR EACH ROW EXECUTE FUNCTION rk_on_supabase_user()';
  END IF;
END $$;
