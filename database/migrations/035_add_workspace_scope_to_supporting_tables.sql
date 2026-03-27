ALTER TABLE contacts
    ADD COLUMN IF NOT EXISTS workspace_id UUID;

ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS workspace_id UUID;

ALTER TABLE integrations
    ADD COLUMN IF NOT EXISTS workspace_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_contacts_workspace'
    ) THEN
        ALTER TABLE contacts
            ADD CONSTRAINT fk_contacts_workspace
            FOREIGN KEY (workspace_id)
            REFERENCES workspaces(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_messages_workspace'
    ) THEN
        ALTER TABLE messages
            ADD CONSTRAINT fk_messages_workspace
            FOREIGN KEY (workspace_id)
            REFERENCES workspaces(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_integrations_workspace'
    ) THEN
        ALTER TABLE integrations
            ADD CONSTRAINT fk_integrations_workspace
            FOREIGN KEY (workspace_id)
            REFERENCES workspaces(id)
            ON DELETE SET NULL;
    END IF;
END $$;

UPDATE contacts ct
SET workspace_id = b.workspace_id
FROM bots b
WHERE ct.bot_id = b.id
  AND ct.workspace_id IS NULL;

UPDATE messages m
SET workspace_id = COALESCE(c.workspace_id, b.workspace_id)
FROM conversations c
JOIN bots b ON b.id = c.bot_id
WHERE m.conversation_id = c.id
  AND m.workspace_id IS NULL;

UPDATE integrations i
SET workspace_id = b.workspace_id
FROM bots b
WHERE i.bot_id = b.id
  AND i.workspace_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_workspace
ON contacts(workspace_id, bot_id, platform_user_id);

CREATE INDEX IF NOT EXISTS idx_messages_workspace
ON messages(workspace_id, conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_integrations_workspace
ON integrations(workspace_id, bot_id, channel, is_active);
