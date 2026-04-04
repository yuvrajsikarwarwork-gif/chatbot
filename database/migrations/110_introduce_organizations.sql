CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  plan_tier TEXT NOT NULL DEFAULT 'free',
  quota_ai_tokens INTEGER NOT NULL DEFAULT 50000,
  quota_messages INTEGER NOT NULL DEFAULT 1000,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT organization_memberships_role_check CHECK (role IN ('owner', 'admin', 'member')),
  CONSTRAINT organization_memberships_unique UNIQUE (organization_id, user_id)
);

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS organization_id UUID;

DO $$
DECLARE
  ws_record RECORD;
  new_org_id UUID;
  slug_candidate TEXT;
BEGIN
  FOR ws_record IN
    SELECT w.id, w.name, w.owner_user_id
    FROM workspaces w
    WHERE w.organization_id IS NULL
  LOOP
    slug_candidate := lower(
      regexp_replace(
        COALESCE(NULLIF(TRIM(ws_record.name), ''), 'workspace'),
        '[^a-z0-9]+',
        '-',
        'g'
      )
    ) || '-' || substr(ws_record.id::text, 1, 8);

    INSERT INTO organizations (
      name,
      slug,
      plan_tier
    ) VALUES (
      COALESCE(NULLIF(TRIM(ws_record.name), ''), 'Workspace') || ' Organization',
      slug_candidate,
      COALESCE(
        (SELECT plan_id FROM workspaces WHERE id = ws_record.id),
        'free'
      )
    )
    RETURNING id INTO new_org_id;

    UPDATE workspaces
    SET organization_id = new_org_id,
        updated_at = NOW()
    WHERE id = ws_record.id;

    IF ws_record.owner_user_id IS NOT NULL THEN
      INSERT INTO organization_memberships (organization_id, user_id, role)
      VALUES (new_org_id, ws_record.owner_user_id, 'owner')
      ON CONFLICT (organization_id, user_id) DO UPDATE
      SET role = EXCLUDED.role,
          updated_at = NOW();
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_organizations_slug
  ON organizations (slug);

CREATE INDEX IF NOT EXISTS idx_organization_memberships_user_id
  ON organization_memberships (user_id);

CREATE INDEX IF NOT EXISTS idx_organization_memberships_organization_id
  ON organization_memberships (organization_id);

CREATE INDEX IF NOT EXISTS idx_workspaces_organization_id
  ON workspaces (organization_id);

ALTER TABLE workspaces
  ALTER COLUMN organization_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_workspaces_organization'
  ) THEN
    ALTER TABLE workspaces
      ADD CONSTRAINT fk_workspaces_organization
      FOREIGN KEY (organization_id)
      REFERENCES organizations(id)
      ON DELETE RESTRICT;
  END IF;
END $$;
