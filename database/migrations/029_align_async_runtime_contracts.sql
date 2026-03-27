ALTER TABLE queue_jobs
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by TEXT,
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_retries INTEGER;

UPDATE queue_jobs
SET updated_at = COALESCE(updated_at, completed_at, created_at, NOW());

ALTER TABLE conversation_state
  ADD COLUMN IF NOT EXISTS current_node_id TEXT,
  ADD COLUMN IF NOT EXISTS variables JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS waiting_input BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS waiting_agent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS input_variable TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT;

UPDATE conversation_state
SET
  current_node_id = COALESCE(current_node_id, current_node),
  variables = COALESCE(variables, context_variables, '{}'::jsonb);

CREATE INDEX IF NOT EXISTS idx_queue_jobs_locked_at
ON queue_jobs(locked_at);
