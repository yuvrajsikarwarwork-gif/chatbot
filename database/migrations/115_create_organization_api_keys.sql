CREATE TABLE IF NOT EXISTS organization_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL CHECK (key_prefix IN ('live', 'test')),
  key_hash TEXT NOT NULL UNIQUE,
  key_last_four TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['flow:execute', 'analytics:read']::text[],
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  revoked_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash
ON organization_api_keys(key_hash);

CREATE INDEX IF NOT EXISTS idx_api_keys_organization_created_at
ON organization_api_keys(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_keys_workspace_created_at
ON organization_api_keys(workspace_id, created_at DESC);
