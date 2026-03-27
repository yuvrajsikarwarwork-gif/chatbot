CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    owner_user_id UUID NOT NULL,
    plan_id TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_workspaces_owner
        FOREIGN KEY (owner_user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workspaces_owner
ON workspaces(owner_user_id, created_at DESC);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS workspace_id UUID;

ALTER TABLE bots
    ADD COLUMN IF NOT EXISTS workspace_id UUID;

ALTER TABLE flows
    ADD COLUMN IF NOT EXISTS workspace_id UUID;

ALTER TABLE lists
    ADD COLUMN IF NOT EXISTS workspace_id UUID;

ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS workspace_id UUID;

ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS workspace_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_workspace'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT fk_users_workspace
            FOREIGN KEY (workspace_id)
            REFERENCES workspaces(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_bots_workspace'
    ) THEN
        ALTER TABLE bots
            ADD CONSTRAINT fk_bots_workspace
            FOREIGN KEY (workspace_id)
            REFERENCES workspaces(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_flows_workspace'
    ) THEN
        ALTER TABLE flows
            ADD CONSTRAINT fk_flows_workspace
            FOREIGN KEY (workspace_id)
            REFERENCES workspaces(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_lists_workspace'
    ) THEN
        ALTER TABLE lists
            ADD CONSTRAINT fk_lists_workspace
            FOREIGN KEY (workspace_id)
            REFERENCES workspaces(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_leads_workspace'
    ) THEN
        ALTER TABLE leads
            ADD CONSTRAINT fk_leads_workspace
            FOREIGN KEY (workspace_id)
            REFERENCES workspaces(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_conversations_workspace'
    ) THEN
        ALTER TABLE conversations
            ADD CONSTRAINT fk_conversations_workspace
            FOREIGN KEY (workspace_id)
            REFERENCES workspaces(id)
            ON DELETE SET NULL;
    END IF;
END $$;

INSERT INTO workspaces (name, owner_user_id, plan_id, status)
SELECT
    COALESCE(NULLIF(u.name, ''), split_part(u.email, '@', 1), 'Workspace') || ' Workspace',
    u.id,
    'starter',
    'active'
FROM users u
WHERE NOT EXISTS (
    SELECT 1
    FROM workspaces w
    WHERE w.owner_user_id = u.id
);

UPDATE users u
SET workspace_id = w.id
FROM workspaces w
WHERE w.owner_user_id = u.id
  AND u.workspace_id IS NULL;

UPDATE campaigns c
SET workspace_id = u.workspace_id
FROM users u
WHERE c.user_id = u.id
  AND c.workspace_id IS NULL;

UPDATE platform_accounts pa
SET workspace_id = u.workspace_id
FROM users u
WHERE pa.user_id = u.id
  AND pa.workspace_id IS NULL;

UPDATE bots b
SET workspace_id = u.workspace_id
FROM users u
WHERE b.user_id = u.id
  AND b.workspace_id IS NULL;

UPDATE flows f
SET workspace_id = b.workspace_id
FROM bots b
WHERE f.bot_id = b.id
  AND f.workspace_id IS NULL;

UPDATE lists l
SET workspace_id = COALESCE(c.workspace_id, b.workspace_id)
FROM campaigns c, bots b
WHERE l.campaign_id = c.id
  AND l.bot_id = b.id
  AND l.workspace_id IS NULL;

UPDATE leads l
SET workspace_id = COALESCE(c.workspace_id, b.workspace_id)
FROM campaigns c, bots b
WHERE l.campaign_id = c.id
  AND l.bot_id = b.id
  AND l.workspace_id IS NULL;

UPDATE conversations cv
SET workspace_id = COALESCE(c.workspace_id, b.workspace_id)
FROM bots b, campaigns c
WHERE cv.bot_id = b.id
  AND cv.campaign_id = c.id
  AND cv.workspace_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_workspace
ON users(workspace_id);

CREATE INDEX IF NOT EXISTS idx_bots_workspace
ON bots(workspace_id);

CREATE INDEX IF NOT EXISTS idx_flows_workspace
ON flows(workspace_id);

CREATE INDEX IF NOT EXISTS idx_lists_workspace
ON lists(workspace_id);

CREATE INDEX IF NOT EXISTS idx_leads_workspace
ON leads(workspace_id);

CREATE INDEX IF NOT EXISTS idx_conversations_workspace
ON conversations(workspace_id);
