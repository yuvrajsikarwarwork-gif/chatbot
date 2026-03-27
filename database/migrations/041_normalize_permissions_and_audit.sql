CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role TEXT NOT NULL,
    permission_key TEXT NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
    allowed BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (role, permission_key)
);

CREATE TABLE IF NOT EXISTS user_permissions (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    permission_key TEXT NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
    allowed BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_permissions_user_workspace_permission
ON user_permissions(user_id, COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), permission_key);

CREATE TABLE IF NOT EXISTS agent_scope (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    platform TEXT,
    channel_id UUID REFERENCES campaign_channels(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_scope_workspace_user
ON agent_scope(workspace_id, user_id);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    old_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    new_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace_created_at
ON audit_logs(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
ON audit_logs(entity, entity_id, created_at DESC);

ALTER TABLE plans
    ADD COLUMN IF NOT EXISTS max_users INTEGER NOT NULL DEFAULT 10;

ALTER TABLE plans
    ADD COLUMN IF NOT EXISTS max_projects INTEGER NOT NULL DEFAULT 3;

ALTER TABLE plans
    ADD COLUMN IF NOT EXISTS max_integrations INTEGER NOT NULL DEFAULT 50;

ALTER TABLE plans
    ADD COLUMN IF NOT EXISTS max_bots INTEGER NOT NULL DEFAULT 10;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'workspace_memberships_role_check'
    ) THEN
        ALTER TABLE workspace_memberships DROP CONSTRAINT workspace_memberships_role_check;
    END IF;

    ALTER TABLE workspace_memberships
        ADD CONSTRAINT workspace_memberships_role_check
        CHECK (role IN ('workspace_admin', 'editor', 'agent', 'viewer', 'workspace_owner', 'admin', 'user'));
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_project_access_role_check'
    ) THEN
        ALTER TABLE user_project_access DROP CONSTRAINT user_project_access_role_check;
    END IF;

    ALTER TABLE user_project_access
        ADD CONSTRAINT user_project_access_role_check
        CHECK (role IN ('project_admin', 'editor', 'agent', 'viewer', 'workspace_owner', 'admin', 'user'));
END $$;

INSERT INTO permissions (key, name)
VALUES
    ('view_workspace', 'View workspace'),
    ('manage_workspace', 'Manage workspace'),
    ('manage_users', 'Manage users'),
    ('manage_permissions', 'Manage permissions'),
    ('view_projects', 'View projects'),
    ('create_projects', 'Create projects'),
    ('edit_projects', 'Edit projects'),
    ('delete_projects', 'Delete projects'),
    ('view_campaigns', 'View campaigns'),
    ('can_create_campaign', 'Create campaigns'),
    ('edit_campaign', 'Edit campaigns'),
    ('delete_campaign', 'Delete campaigns'),
    ('view_flows', 'View flows'),
    ('can_create_flow', 'Create flows'),
    ('edit_workflow', 'Edit workflow'),
    ('delete_flow', 'Delete flow'),
    ('view_bots', 'View bots'),
    ('create_bots', 'Create bots'),
    ('edit_bots', 'Edit bots'),
    ('delete_bots', 'Delete bots'),
    ('view_platform_accounts', 'View integrations'),
    ('can_manage_platform_accounts', 'Manage integrations'),
    ('view_leads', 'View leads'),
    ('delete_leads', 'Delete leads'),
    ('export_data', 'Export data'),
    ('assign_conversation', 'Assign conversation'),
    ('view_conversation', 'View conversation')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role, permission_key, allowed)
SELECT role_name, permission_key, true
FROM (
    VALUES
      ('workspace_admin', 'view_workspace'),
      ('workspace_admin', 'manage_workspace'),
      ('workspace_admin', 'manage_users'),
      ('workspace_admin', 'manage_permissions'),
      ('workspace_admin', 'view_projects'),
      ('workspace_admin', 'create_projects'),
      ('workspace_admin', 'edit_projects'),
      ('workspace_admin', 'delete_projects'),
      ('workspace_admin', 'view_campaigns'),
      ('workspace_admin', 'can_create_campaign'),
      ('workspace_admin', 'edit_campaign'),
      ('workspace_admin', 'delete_campaign'),
      ('workspace_admin', 'view_flows'),
      ('workspace_admin', 'can_create_flow'),
      ('workspace_admin', 'edit_workflow'),
      ('workspace_admin', 'delete_flow'),
      ('workspace_admin', 'view_bots'),
      ('workspace_admin', 'create_bots'),
      ('workspace_admin', 'edit_bots'),
      ('workspace_admin', 'delete_bots'),
      ('workspace_admin', 'view_platform_accounts'),
      ('workspace_admin', 'can_manage_platform_accounts'),
      ('workspace_admin', 'view_leads'),
      ('workspace_admin', 'delete_leads'),
      ('workspace_admin', 'export_data'),
      ('workspace_admin', 'assign_conversation'),
      ('workspace_admin', 'view_conversation'),
      ('editor', 'view_workspace'),
      ('editor', 'view_projects'),
      ('editor', 'view_campaigns'),
      ('editor', 'can_create_campaign'),
      ('editor', 'edit_campaign'),
      ('editor', 'view_flows'),
      ('editor', 'can_create_flow'),
      ('editor', 'edit_workflow'),
      ('editor', 'view_bots'),
      ('editor', 'create_bots'),
      ('editor', 'edit_bots'),
      ('editor', 'view_platform_accounts'),
      ('editor', 'can_manage_platform_accounts'),
      ('editor', 'view_leads'),
      ('editor', 'view_conversation'),
      ('agent', 'view_workspace'),
      ('agent', 'view_leads'),
      ('agent', 'view_conversation'),
      ('agent', 'assign_conversation'),
      ('viewer', 'view_workspace'),
      ('viewer', 'view_projects'),
      ('viewer', 'view_campaigns'),
      ('viewer', 'view_flows'),
      ('viewer', 'view_bots'),
      ('viewer', 'view_platform_accounts'),
      ('viewer', 'view_leads'),
      ('viewer', 'view_conversation'),
      ('project_admin', 'view_projects'),
      ('project_admin', 'edit_projects'),
      ('project_admin', 'view_campaigns'),
      ('project_admin', 'can_create_campaign'),
      ('project_admin', 'edit_campaign'),
      ('project_admin', 'delete_campaign'),
      ('project_admin', 'view_flows'),
      ('project_admin', 'can_create_flow'),
      ('project_admin', 'edit_workflow'),
      ('project_admin', 'delete_flow'),
      ('project_admin', 'view_bots'),
      ('project_admin', 'create_bots'),
      ('project_admin', 'edit_bots'),
      ('project_admin', 'delete_bots'),
      ('project_admin', 'view_platform_accounts'),
      ('project_admin', 'can_manage_platform_accounts'),
      ('project_admin', 'view_leads'),
      ('project_admin', 'assign_conversation'),
      ('project_admin', 'view_conversation')
) AS seed(role_name, permission_key)
ON CONFLICT (role, permission_key) DO UPDATE
SET allowed = EXCLUDED.allowed,
    updated_at = NOW();
