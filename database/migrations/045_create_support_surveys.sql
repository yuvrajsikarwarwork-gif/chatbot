CREATE TABLE IF NOT EXISTS support_surveys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    workspace_id UUID NULL REFERENCES workspaces(id) ON DELETE SET NULL,
    project_id UUID NULL REFERENCES projects(id) ON DELETE SET NULL,
    bot_id UUID NULL REFERENCES bots(id) ON DELETE SET NULL,
    rating TEXT NOT NULL,
    source TEXT NULL,
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_surveys_conversation_id
ON support_surveys(conversation_id, created_at DESC);
