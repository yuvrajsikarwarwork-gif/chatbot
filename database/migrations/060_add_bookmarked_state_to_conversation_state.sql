ALTER TABLE conversation_state
  ADD COLUMN IF NOT EXISTS bookmarked_state JSONB;
