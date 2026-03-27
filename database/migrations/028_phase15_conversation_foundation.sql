ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS contact_phone TEXT,
    ADD COLUMN IF NOT EXISTS contact_name TEXT,
    ADD COLUMN IF NOT EXISTS platform_account_id UUID,
    ADD COLUMN IF NOT EXISTS assigned_to UUID,
    ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;

ALTER TABLE conversations
    ALTER COLUMN context_json SET DEFAULT '{}'::jsonb;

ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS platform_account_id UUID,
    ADD COLUMN IF NOT EXISTS sender_type TEXT,
    ADD COLUMN IF NOT EXISTS sender_id UUID,
    ADD COLUMN IF NOT EXISTS message_type TEXT,
    ADD COLUMN IF NOT EXISTS text TEXT,
    ADD COLUMN IF NOT EXISTS media_url TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT;

UPDATE conversations c
SET
    contact_phone = COALESCE(NULLIF(c.contact_phone, ''), ct.phone),
    contact_name = COALESCE(NULLIF(c.contact_name, ''), ct.name),
    last_message_at = COALESCE(
        c.last_message_at,
        (
            SELECT MAX(m.created_at)
            FROM messages m
            WHERE m.conversation_id = c.id
        ),
        c.updated_at,
        c.created_at
    )
FROM contacts ct
WHERE c.contact_id = ct.id;

UPDATE conversations c
SET platform_account_id = cc.platform_account_ref_id
FROM campaign_channels cc
WHERE c.channel_id = cc.id
  AND c.platform_account_id IS NULL
  AND cc.platform_account_ref_id IS NOT NULL;

UPDATE messages
SET
    sender_type = COALESCE(sender_type, CASE
        WHEN sender = 'bot' THEN 'bot'
        WHEN sender = 'agent' THEN 'agent'
        WHEN sender = 'system' THEN 'system'
        ELSE 'user'
    END),
    message_type = COALESCE(message_type, CASE
        WHEN content ? 'templateName' THEN 'template'
        WHEN content ? 'mediaUrl' THEN 'image'
        WHEN content ? 'buttons' THEN 'button'
        ELSE 'text'
    END),
    text = COALESCE(text, NULLIF(message, ''), content ->> 'text'),
    media_url = COALESCE(media_url, content ->> 'mediaUrl'),
    platform_account_id = COALESCE(
        platform_account_id,
        (
            SELECT c.platform_account_id
            FROM conversations c
            WHERE c.id = messages.conversation_id
        )
    )
WHERE sender_type IS NULL
   OR message_type IS NULL
   OR text IS NULL
   OR media_url IS NULL
   OR platform_account_id IS NULL;

ALTER TABLE conversations
    DROP CONSTRAINT IF EXISTS fk_conversations_platform_account;

ALTER TABLE messages
    DROP CONSTRAINT IF EXISTS fk_messages_platform_account;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_conversations_platform_account'
          AND table_name = 'conversations'
    ) THEN
        ALTER TABLE conversations
            ADD CONSTRAINT fk_conversations_platform_account
            FOREIGN KEY (platform_account_id)
            REFERENCES platform_accounts(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_messages_platform_account'
          AND table_name = 'messages'
    ) THEN
        ALTER TABLE messages
            ADD CONSTRAINT fk_messages_platform_account
            FOREIGN KEY (platform_account_id)
            REFERENCES platform_accounts(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_conversations_workspace_last_message
ON conversations(workspace_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_workspace_filters
ON conversations(workspace_id, platform, campaign_id, channel_id, flow_id, list_id);

CREATE INDEX IF NOT EXISTS idx_conversations_platform_account
ON conversations(platform_account_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at
ON messages(conversation_id, created_at ASC);
