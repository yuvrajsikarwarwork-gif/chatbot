ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS external_message_id TEXT,
    ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_messages_external_message_id
ON messages(external_message_id)
WHERE external_message_id IS NOT NULL;
