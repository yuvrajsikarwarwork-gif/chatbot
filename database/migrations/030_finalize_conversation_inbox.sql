ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS unread_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_outbound_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal';

UPDATE conversations c
SET
    last_inbound_at = COALESCE(c.last_inbound_at, latest.last_inbound_at),
    last_outbound_at = COALESCE(c.last_outbound_at, latest.last_outbound_at),
    unread_count = COALESCE(NULLIF(c.unread_count, 0), latest.unread_count, 0),
    last_message_at = COALESCE(c.last_message_at, latest.last_message_at, c.updated_at, c.created_at)
FROM (
    SELECT
        m.conversation_id,
        MAX(m.created_at) FILTER (
            WHERE COALESCE(m.sender_type, m.sender, 'user') = 'user'
        ) AS last_inbound_at,
        MAX(m.created_at) FILTER (
            WHERE COALESCE(m.sender_type, m.sender, 'user') IN ('bot', 'agent')
        ) AS last_outbound_at,
        MAX(m.created_at) AS last_message_at,
        COUNT(*) FILTER (
            WHERE COALESCE(m.sender_type, m.sender, 'user') = 'user'
        )::INTEGER AS unread_count
    FROM messages m
    GROUP BY m.conversation_id
) latest
WHERE latest.conversation_id = c.id;

CREATE TABLE IF NOT EXISTS conversation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    workspace_id UUID,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_workspace_inbox_status
ON conversations(workspace_id, status, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_workspace_assigned
ON conversations(workspace_id, assigned_to, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_events_conversation_created
ON conversation_events(conversation_id, created_at DESC);
