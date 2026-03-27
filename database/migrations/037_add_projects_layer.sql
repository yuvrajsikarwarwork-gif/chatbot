CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_internal BOOLEAN NOT NULL DEFAULT false,
    onboarding_complete BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_project_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    is_all_projects BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'active',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_project_access_role_check
        CHECK (role IN ('workspace_owner', 'admin', 'user', 'agent')),
    CONSTRAINT user_project_access_status_check
        CHECK (status IN ('active', 'inactive', 'invited')),
    CONSTRAINT user_project_access_user_project_key
        UNIQUE (user_id, project_id)
);

CREATE TABLE IF NOT EXISTS project_settings (
    project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    auto_assign BOOLEAN NOT NULL DEFAULT false,
    assignment_mode TEXT NOT NULL DEFAULT 'manual',
    default_agent_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    max_open_per_agent INTEGER NOT NULL DEFAULT 25,
    allow_takeover BOOLEAN NOT NULL DEFAULT true,
    allow_manual_reply BOOLEAN NOT NULL DEFAULT true,
    allow_bot_resume BOOLEAN NOT NULL DEFAULT false,
    show_campaign BOOLEAN NOT NULL DEFAULT true,
    show_flow BOOLEAN NOT NULL DEFAULT true,
    show_list BOOLEAN NOT NULL DEFAULT true,
    allowed_platforms JSONB NOT NULL DEFAULT '[]'::jsonb,
    default_campaign_id UUID NULL REFERENCES campaigns(id) ON DELETE SET NULL,
    default_list_id UUID NULL REFERENCES lists(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inbound_quarantine (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform TEXT NOT NULL,
    platform_user_id TEXT,
    phone_number_id TEXT,
    route_bot_id UUID,
    attempted_workspace_id UUID,
    attempted_project_id UUID,
    attempted_campaign_id UUID,
    attempted_channel_id UUID,
    attempted_platform_account_id UUID,
    entry_key TEXT,
    failure_reason TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_workspace_created_at
ON projects(workspace_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_workspace_default
ON projects(workspace_id)
WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_user_project_access_workspace_user_status
ON user_project_access(workspace_id, user_id, status);

CREATE INDEX IF NOT EXISTS idx_user_project_access_project_role_status
ON user_project_access(project_id, role, status);

CREATE INDEX IF NOT EXISTS idx_inbound_quarantine_status_created_at
ON inbound_quarantine(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inbound_quarantine_platform_created_at
ON inbound_quarantine(platform, created_at DESC);

CREATE OR REPLACE FUNCTION touch_projects_layer_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_projects_updated_at ON projects;
CREATE TRIGGER trg_projects_updated_at
BEFORE UPDATE ON projects
FOR EACH ROW
EXECUTE FUNCTION touch_projects_layer_updated_at();

DROP TRIGGER IF EXISTS trg_user_project_access_updated_at ON user_project_access;
CREATE TRIGGER trg_user_project_access_updated_at
BEFORE UPDATE ON user_project_access
FOR EACH ROW
EXECUTE FUNCTION touch_projects_layer_updated_at();

DROP TRIGGER IF EXISTS trg_project_settings_updated_at ON project_settings;
CREATE TRIGGER trg_project_settings_updated_at
BEFORE UPDATE ON project_settings
FOR EACH ROW
EXECUTE FUNCTION touch_projects_layer_updated_at();

ALTER TABLE platform_accounts
    ADD COLUMN IF NOT EXISTS project_id UUID;

ALTER TABLE campaigns
    ADD COLUMN IF NOT EXISTS project_id UUID;

ALTER TABLE campaign_channels
    ADD COLUMN IF NOT EXISTS project_id UUID;

ALTER TABLE entry_points
    ADD COLUMN IF NOT EXISTS project_id UUID;

ALTER TABLE flows
    ADD COLUMN IF NOT EXISTS project_id UUID;

ALTER TABLE bots
    ADD COLUMN IF NOT EXISTS project_id UUID;

ALTER TABLE lists
    ADD COLUMN IF NOT EXISTS project_id UUID;

ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS project_id UUID;

ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS project_id UUID;

ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS project_id UUID;

ALTER TABLE assignments
    ADD COLUMN IF NOT EXISTS project_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_platform_accounts_project'
    ) THEN
        ALTER TABLE platform_accounts
            ADD CONSTRAINT fk_platform_accounts_project
            FOREIGN KEY (project_id)
            REFERENCES projects(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_campaigns_project'
    ) THEN
        ALTER TABLE campaigns
            ADD CONSTRAINT fk_campaigns_project
            FOREIGN KEY (project_id)
            REFERENCES projects(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_campaign_channels_project'
    ) THEN
        ALTER TABLE campaign_channels
            ADD CONSTRAINT fk_campaign_channels_project
            FOREIGN KEY (project_id)
            REFERENCES projects(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_entry_points_project'
    ) THEN
        ALTER TABLE entry_points
            ADD CONSTRAINT fk_entry_points_project
            FOREIGN KEY (project_id)
            REFERENCES projects(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_flows_project'
    ) THEN
        ALTER TABLE flows
            ADD CONSTRAINT fk_flows_project
            FOREIGN KEY (project_id)
            REFERENCES projects(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_bots_project'
    ) THEN
        ALTER TABLE bots
            ADD CONSTRAINT fk_bots_project
            FOREIGN KEY (project_id)
            REFERENCES projects(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_lists_project'
    ) THEN
        ALTER TABLE lists
            ADD CONSTRAINT fk_lists_project
            FOREIGN KEY (project_id)
            REFERENCES projects(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_leads_project'
    ) THEN
        ALTER TABLE leads
            ADD CONSTRAINT fk_leads_project
            FOREIGN KEY (project_id)
            REFERENCES projects(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_conversations_project'
    ) THEN
        ALTER TABLE conversations
            ADD CONSTRAINT fk_conversations_project
            FOREIGN KEY (project_id)
            REFERENCES projects(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_messages_project'
    ) THEN
        ALTER TABLE messages
            ADD CONSTRAINT fk_messages_project
            FOREIGN KEY (project_id)
            REFERENCES projects(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_assignments_project'
    ) THEN
        ALTER TABLE assignments
            ADD CONSTRAINT fk_assignments_project
            FOREIGN KEY (project_id)
            REFERENCES projects(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_platform_accounts_workspace_project
ON platform_accounts(workspace_id, project_id);

CREATE INDEX IF NOT EXISTS idx_platform_accounts_project_created_at
ON platform_accounts(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_accounts_project_status
ON platform_accounts(project_id, status);

CREATE INDEX IF NOT EXISTS idx_campaigns_workspace_project
ON campaigns(workspace_id, project_id);

CREATE INDEX IF NOT EXISTS idx_campaigns_project_created_at
ON campaigns(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_campaigns_project_status
ON campaigns(project_id, status);

CREATE INDEX IF NOT EXISTS idx_campaign_channels_project_created_at
ON campaign_channels(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_entry_points_project_created_at
ON entry_points(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_flows_workspace_project
ON flows(workspace_id, project_id);

CREATE INDEX IF NOT EXISTS idx_flows_project_created_at
ON flows(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bots_workspace_project
ON bots(workspace_id, project_id);

CREATE INDEX IF NOT EXISTS idx_bots_project_created_at
ON bots(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lists_workspace_project
ON lists(workspace_id, project_id);

CREATE INDEX IF NOT EXISTS idx_lists_project_created_at
ON lists(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leads_workspace_project
ON leads(workspace_id, project_id);

CREATE INDEX IF NOT EXISTS idx_leads_project_created_at
ON leads(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_workspace_project
ON conversations(workspace_id, project_id);

CREATE INDEX IF NOT EXISTS idx_conversations_project_created_at
ON conversations(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_project_status
ON conversations(project_id, status);

CREATE INDEX IF NOT EXISTS idx_messages_workspace_project
ON messages(workspace_id, project_id);

CREATE INDEX IF NOT EXISTS idx_messages_project_created_at
ON messages(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assignments_project_created_at
ON assignments(project_id, created_at DESC);

INSERT INTO projects (
    workspace_id,
    name,
    description,
    status,
    is_default,
    is_internal,
    onboarding_complete
)
SELECT
    w.id,
    'Default Project',
    'Auto-generated compatibility project for existing workspace records',
    'active',
    true,
    COALESCE((to_jsonb(w) ->> 'is_internal')::boolean, false),
    true
FROM workspaces w
WHERE NOT EXISTS (
    SELECT 1
    FROM projects p
    WHERE p.workspace_id = w.id
      AND p.is_default = true
);

WITH default_projects AS (
    SELECT workspace_id, id AS project_id
    FROM projects
    WHERE is_default = true
)
UPDATE bots b
SET project_id = dp.project_id
FROM default_projects dp
WHERE b.workspace_id = dp.workspace_id
  AND b.project_id IS NULL;

WITH default_projects AS (
    SELECT workspace_id, id AS project_id
    FROM projects
    WHERE is_default = true
)
UPDATE flows f
SET project_id = COALESCE(dp.project_id, b.project_id)
FROM bots b
LEFT JOIN default_projects dp ON dp.workspace_id = b.workspace_id
WHERE f.bot_id = b.id
  AND f.project_id IS NULL
  AND COALESCE(dp.project_id, b.project_id) IS NOT NULL;

WITH default_projects AS (
    SELECT workspace_id, id AS project_id
    FROM projects
    WHERE is_default = true
)
UPDATE campaigns c
SET project_id = dp.project_id
FROM default_projects dp
WHERE c.workspace_id = dp.workspace_id
  AND c.project_id IS NULL;

WITH default_projects AS (
    SELECT workspace_id, id AS project_id
    FROM projects
    WHERE is_default = true
)
UPDATE platform_accounts pa
SET project_id = dp.project_id
FROM default_projects dp
WHERE pa.workspace_id = dp.workspace_id
  AND pa.project_id IS NULL;

UPDATE campaign_channels cc
SET project_id = src.project_id
FROM (
    SELECT
        cc_inner.id,
        COALESCE(c.project_id, b.project_id, f.project_id) AS project_id
    FROM campaign_channels cc_inner
    JOIN campaigns c ON c.id = cc_inner.campaign_id
    LEFT JOIN bots b ON b.id = cc_inner.bot_id
    LEFT JOIN flows f ON f.id = cc_inner.flow_id
) src
WHERE cc.id = src.id
  AND cc.project_id IS NULL
  AND src.project_id IS NOT NULL;

UPDATE entry_points ep
SET project_id = src.project_id
FROM (
    SELECT
        ep_inner.id,
        COALESCE(c.project_id, cc.project_id, b.project_id, f.project_id, l.project_id) AS project_id
    FROM entry_points ep_inner
    JOIN campaigns c ON c.id = ep_inner.campaign_id
    LEFT JOIN campaign_channels cc ON cc.id = ep_inner.channel_id
    LEFT JOIN bots b ON b.id = ep_inner.bot_id
    LEFT JOIN flows f ON f.id = ep_inner.flow_id
    LEFT JOIN lists l ON l.id = ep_inner.list_id
) src
WHERE ep.id = src.id
  AND ep.project_id IS NULL
  AND src.project_id IS NOT NULL;

UPDATE lists l
SET project_id = src.project_id
FROM (
    SELECT
        l_inner.id,
        COALESCE(c.project_id, cc.project_id, ep.project_id, b.project_id) AS project_id
    FROM lists l_inner
    JOIN campaigns c ON c.id = l_inner.campaign_id
    LEFT JOIN campaign_channels cc ON cc.id = l_inner.channel_id
    LEFT JOIN entry_points ep ON ep.id = l_inner.entry_point_id
    LEFT JOIN bots b ON b.id = l_inner.bot_id
) src
WHERE l.id = src.id
  AND l.project_id IS NULL
  AND src.project_id IS NOT NULL;

WITH default_projects AS (
    SELECT workspace_id, id AS project_id
    FROM projects
    WHERE is_default = true
)
UPDATE leads ld
SET project_id = src.project_id
FROM (
    SELECT
        ld_inner.id,
        COALESCE(
            dp.project_id,
            c.project_id,
            cc.project_id,
            ep.project_id,
            f.project_id,
            l.project_id,
            b.project_id
        ) AS project_id
    FROM leads ld_inner
    LEFT JOIN default_projects dp ON dp.workspace_id = ld_inner.workspace_id
    LEFT JOIN campaigns c ON c.id = ld_inner.campaign_id
    LEFT JOIN campaign_channels cc ON cc.id = ld_inner.channel_id
    LEFT JOIN entry_points ep ON ep.id = ld_inner.entry_point_id
    LEFT JOIN flows f ON f.id = ld_inner.flow_id
    LEFT JOIN lists l ON l.id = ld_inner.list_id
    LEFT JOIN bots b ON b.id = ld_inner.bot_id
) src
WHERE ld.id = src.id
  AND ld.project_id IS NULL
  AND src.project_id IS NOT NULL;

WITH default_projects AS (
    SELECT workspace_id, id AS project_id
    FROM projects
    WHERE is_default = true
)
UPDATE conversations cv
SET project_id = src.project_id
FROM (
    SELECT
        cv_inner.id,
        COALESCE(
            dp.project_id,
            cp.project_id,
            cc.project_id,
            ep.project_id,
            f.project_id,
            l.project_id,
            pa.project_id,
            b.project_id
        ) AS project_id
    FROM conversations cv_inner
    LEFT JOIN default_projects dp ON dp.workspace_id = cv_inner.workspace_id
    LEFT JOIN campaigns cp ON cp.id = cv_inner.campaign_id
    LEFT JOIN campaign_channels cc ON cc.id = cv_inner.channel_id
    LEFT JOIN entry_points ep ON ep.id = cv_inner.entry_point_id
    LEFT JOIN flows f ON f.id = cv_inner.flow_id
    LEFT JOIN lists l ON l.id = cv_inner.list_id
    LEFT JOIN platform_accounts pa ON pa.id = cv_inner.platform_account_id
    LEFT JOIN bots b ON b.id = cv_inner.bot_id
) src
WHERE cv.id = src.id
  AND cv.project_id IS NULL
  AND src.project_id IS NOT NULL;

WITH default_projects AS (
    SELECT workspace_id, id AS project_id
    FROM projects
    WHERE is_default = true
)
UPDATE messages m
SET project_id = src.project_id
FROM (
    SELECT
        m_inner.id,
        COALESCE(cv.project_id, dp.project_id, pa.project_id) AS project_id
    FROM messages m_inner
    LEFT JOIN conversations cv ON cv.id = m_inner.conversation_id
    LEFT JOIN default_projects dp ON dp.workspace_id = m_inner.workspace_id
    LEFT JOIN platform_accounts pa ON pa.id = m_inner.platform_account_id
) src
WHERE m.id = src.id
  AND m.project_id IS NULL
  AND src.project_id IS NOT NULL;

UPDATE assignments a
SET project_id = cv.project_id
FROM conversations cv
WHERE a.conversation_id = cv.id
  AND a.project_id IS NULL
  AND cv.project_id IS NOT NULL;

INSERT INTO user_project_access (
    workspace_id,
    user_id,
    project_id,
    role,
    is_all_projects,
    status,
    created_by
)
SELECT
    wm.workspace_id,
    wm.user_id,
    p.id,
    wm.role,
    wm.role IN ('workspace_owner', 'admin'),
    'active',
    COALESCE(wm.created_by, w.owner_user_id)
FROM workspace_memberships wm
JOIN workspaces w ON w.id = wm.workspace_id
JOIN projects p
  ON p.workspace_id = wm.workspace_id
 AND (
    wm.role IN ('workspace_owner', 'admin')
    OR p.is_default = true
 )
WHERE wm.status = 'active'
ON CONFLICT (user_id, project_id) DO UPDATE
SET
    role = EXCLUDED.role,
    is_all_projects = EXCLUDED.is_all_projects,
    status = EXCLUDED.status,
    updated_at = NOW();

INSERT INTO user_project_access (
    workspace_id,
    user_id,
    project_id,
    role,
    is_all_projects,
    status,
    created_by
)
SELECT
    w.id,
    w.owner_user_id,
    p.id,
    'workspace_owner',
    true,
    'active',
    w.owner_user_id
FROM workspaces w
JOIN projects p ON p.workspace_id = w.id
WHERE w.owner_user_id IS NOT NULL
ON CONFLICT (user_id, project_id) DO UPDATE
SET
    role = EXCLUDED.role,
    is_all_projects = EXCLUDED.is_all_projects,
    status = EXCLUDED.status,
    updated_at = NOW();

INSERT INTO project_settings (
    project_id,
    auto_assign,
    assignment_mode,
    default_agent_id,
    max_open_per_agent,
    allow_takeover,
    allow_manual_reply,
    allow_bot_resume,
    show_campaign,
    show_flow,
    show_list,
    allowed_platforms,
    default_campaign_id,
    default_list_id
)
SELECT
    p.id,
    COALESCE(cs.auto_assign, false),
    'manual',
    cs.default_agent,
    COALESCE(cs.max_open_chats, 25),
    COALESCE(cs.allow_agent_takeover, true),
    COALESCE(cs.allow_manual_reply, true),
    COALESCE(cs.allow_bot_resume, false),
    COALESCE(cs.show_campaign, true),
    COALESCE(cs.show_flow, true),
    COALESCE(cs.show_list, true),
    COALESCE(cs.allowed_platforms, '[]'::jsonb),
    cs.default_campaign_id,
    cs.default_list_id
FROM projects p
LEFT JOIN conversation_settings cs ON cs.workspace_id = p.workspace_id
WHERE p.is_default = true
ON CONFLICT (project_id) DO UPDATE
SET
    auto_assign = EXCLUDED.auto_assign,
    default_agent_id = EXCLUDED.default_agent_id,
    max_open_per_agent = EXCLUDED.max_open_per_agent,
    allow_takeover = EXCLUDED.allow_takeover,
    allow_manual_reply = EXCLUDED.allow_manual_reply,
    allow_bot_resume = EXCLUDED.allow_bot_resume,
    show_campaign = EXCLUDED.show_campaign,
    show_flow = EXCLUDED.show_flow,
    show_list = EXCLUDED.show_list,
    allowed_platforms = EXCLUDED.allowed_platforms,
    default_campaign_id = EXCLUDED.default_campaign_id,
    default_list_id = EXCLUDED.default_list_id,
    updated_at = NOW();

DO $$
DECLARE
    unresolved_leads INTEGER;
    unresolved_conversations INTEGER;
    unresolved_messages INTEGER;
    unresolved_assignments INTEGER;
BEGIN
    SELECT COUNT(*) INTO unresolved_leads
    FROM leads
    WHERE project_id IS NULL
      AND (
        workspace_id IS NOT NULL
        OR bot_id IS NOT NULL
        OR campaign_id IS NOT NULL
        OR channel_id IS NOT NULL
        OR entry_point_id IS NOT NULL
        OR flow_id IS NOT NULL
        OR list_id IS NOT NULL
      );

    SELECT COUNT(*) INTO unresolved_conversations
    FROM conversations
    WHERE project_id IS NULL
      AND (
        workspace_id IS NOT NULL
        OR bot_id IS NOT NULL
        OR campaign_id IS NOT NULL
        OR channel_id IS NOT NULL
        OR entry_point_id IS NOT NULL
        OR flow_id IS NOT NULL
        OR list_id IS NOT NULL
        OR platform_account_id IS NOT NULL
      );

    SELECT COUNT(*) INTO unresolved_messages
    FROM messages
    WHERE project_id IS NULL
      AND (
        workspace_id IS NOT NULL
        OR conversation_id IS NOT NULL
        OR platform_account_id IS NOT NULL
      );

    SELECT COUNT(*) INTO unresolved_assignments
    FROM assignments
    WHERE project_id IS NULL
      AND conversation_id IS NOT NULL;

    RAISE NOTICE 'Project backfill unresolved counts: leads=%, conversations=%, messages=%, assignments=%',
        unresolved_leads,
        unresolved_conversations,
        unresolved_messages,
        unresolved_assignments;
END $$;
