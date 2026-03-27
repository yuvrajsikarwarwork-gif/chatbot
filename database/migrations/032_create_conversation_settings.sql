CREATE TABLE IF NOT EXISTS conversation_settings (
    workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    auto_assign BOOLEAN NOT NULL DEFAULT false,
    default_agent UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    allow_manual_reply BOOLEAN NOT NULL DEFAULT true,
    allow_agent_takeover BOOLEAN NOT NULL DEFAULT true,
    allow_bot_resume BOOLEAN NOT NULL DEFAULT false,
    show_campaign BOOLEAN NOT NULL DEFAULT true,
    show_flow BOOLEAN NOT NULL DEFAULT true,
    show_list BOOLEAN NOT NULL DEFAULT true,
    max_open_chats INTEGER NOT NULL DEFAULT 25,
    allowed_platforms JSONB NOT NULL DEFAULT '[]'::jsonb,
    default_campaign_id UUID NULL REFERENCES campaigns(id) ON DELETE SET NULL,
    default_list_id UUID NULL REFERENCES lists(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_settings_default_agent
    ON conversation_settings(default_agent);

CREATE INDEX IF NOT EXISTS idx_conversation_settings_default_campaign
    ON conversation_settings(default_campaign_id);

CREATE INDEX IF NOT EXISTS idx_conversation_settings_default_list
    ON conversation_settings(default_list_id);

CREATE OR REPLACE FUNCTION touch_conversation_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_conversation_settings_updated_at ON conversation_settings;

CREATE TRIGGER trg_conversation_settings_updated_at
BEFORE UPDATE ON conversation_settings
FOR EACH ROW
EXECUTE FUNCTION touch_conversation_settings_updated_at();
