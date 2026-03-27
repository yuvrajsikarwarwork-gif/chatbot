ALTER TABLE queue_jobs
  ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE queue_jobs
SET available_at = COALESCE(available_at, created_at, NOW());

CREATE INDEX IF NOT EXISTS idx_queue_jobs_available_at
ON queue_jobs(status, available_at, created_at);
