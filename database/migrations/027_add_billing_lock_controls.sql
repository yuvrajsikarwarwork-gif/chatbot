ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS lock_reason TEXT,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lock_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS reminder_last_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS grace_period_end DATE,
  ADD COLUMN IF NOT EXISTS lock_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE subscriptions
SET grace_period_end = COALESCE(grace_period_end, expiry_date + INTERVAL '7 day')
WHERE expiry_date IS NOT NULL;
