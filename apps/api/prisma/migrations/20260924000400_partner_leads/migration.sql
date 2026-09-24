-- Demandes de contact de la landing partenaires (« Être rappelé »).
CREATE TABLE IF NOT EXISTS partner_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  organization text NOT NULL,
  email text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('store', 'brand', 'public_institution', 'cse')),
  message text,
  source text NOT NULL DEFAULT 'landing',
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'converted', 'archived')),
  handled_by uuid,
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS partner_leads_status_idx ON partner_leads (status, created_at);
CREATE INDEX IF NOT EXISTS partner_leads_email_idx ON partner_leads (email, created_at);
