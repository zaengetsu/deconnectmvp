-- Visuels téléversés (offres partenaires, bons) : stockés dans Postgres, servis par l'API.
CREATE TABLE IF NOT EXISTS media_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid REFERENCES partners(id) ON DELETE CASCADE,
  uploaded_by uuid,
  content_type text NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg', 'image/webp')),
  size integer NOT NULL CHECK (size > 0 AND size <= 2097152),
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_files_partner_idx ON media_files (partner_id);
