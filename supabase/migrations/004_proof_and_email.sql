-- Migration 004: Activity proof + email events log

-- Add proof_url to child_activities
ALTER TABLE child_activities ADD COLUMN IF NOT EXISTS proof_url text;
ALTER TABLE child_activities ADD COLUMN IF NOT EXISTS proof_type text;

-- Email events log (for tracking sent emails)
CREATE TABLE IF NOT EXISTS email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email text NOT NULL,
  event_type text NOT NULL,
  payload jsonb,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  error text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT email_events_status_check CHECK (status IN ('pending','sent','failed')),
  CONSTRAINT email_events_type_check CHECK (event_type IN (
    'welcome','email_confirmation','password_reset','password_changed',
    'activity_validated','activity_rejected','reward_requested',
    'reward_approved','reward_rejected','activity_submitted'
  ))
);

ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;
-- Only service role can read/write email events
CREATE POLICY "No direct client access to email_events" ON email_events FOR ALL USING (false);
