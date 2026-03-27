CREATE TABLE IF NOT EXISTS conversation_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    author_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    note TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_tags (
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (conversation_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_conversation_notes_conversation_created
    ON conversation_notes(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_tags_workspace_tag
    ON conversation_tags(workspace_id, tag);

CREATE OR REPLACE FUNCTION touch_conversation_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_conversation_notes_updated_at ON conversation_notes;

CREATE TRIGGER trg_conversation_notes_updated_at
BEFORE UPDATE ON conversation_notes
FOR EACH ROW
EXECUTE FUNCTION touch_conversation_notes_updated_at();
