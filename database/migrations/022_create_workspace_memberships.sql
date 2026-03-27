CREATE TABLE IF NOT EXISTS workspace_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  permissions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workspace_memberships_role_check CHECK (role IN ('workspace_owner', 'admin', 'user', 'agent')),
  CONSTRAINT workspace_memberships_status_check CHECK (status IN ('active', 'inactive', 'invited')),
  CONSTRAINT workspace_memberships_workspace_user_key UNIQUE (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_memberships_workspace_id
  ON workspace_memberships (workspace_id);

CREATE INDEX IF NOT EXISTS idx_workspace_memberships_user_id
  ON workspace_memberships (user_id);

INSERT INTO workspace_memberships (workspace_id, user_id, role, status, created_by)
SELECT w.id, w.owner_user_id, 'workspace_owner', 'active', w.owner_user_id
FROM workspaces w
WHERE w.owner_user_id IS NOT NULL
ON CONFLICT (workspace_id, user_id) DO UPDATE
SET role = EXCLUDED.role,
    status = 'active',
    updated_at = NOW();

INSERT INTO workspace_memberships (workspace_id, user_id, role, status, created_by)
SELECT u.workspace_id, u.id, 'user', 'active', u.id
FROM users u
WHERE u.workspace_id IS NOT NULL
ON CONFLICT (workspace_id, user_id) DO NOTHING;
