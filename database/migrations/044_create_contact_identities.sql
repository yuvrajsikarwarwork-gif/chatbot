CREATE TABLE IF NOT EXISTS contact_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    bot_id UUID REFERENCES bots(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    identity_type TEXT NOT NULL,
    identity_value TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_identities_workspace_identity_unique
ON contact_identities (workspace_id, platform, identity_type, identity_value);

CREATE INDEX IF NOT EXISTS idx_contact_identities_contact_id
ON contact_identities (contact_id);

CREATE INDEX IF NOT EXISTS idx_contact_identities_bot_id
ON contact_identities (bot_id);
