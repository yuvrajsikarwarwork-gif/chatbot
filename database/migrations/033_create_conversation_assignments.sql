ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS assignment_mode TEXT;

CREATE TABLE IF NOT EXISTS assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assignment_type TEXT NOT NULL DEFAULT 'manual',
    status TEXT NOT NULL DEFAULT 'active',
    notes TEXT,
    released_at TIMESTAMPTZ,
    released_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assignments_conversation_created
    ON assignments(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assignments_agent_status
    ON assignments(agent_id, status, assigned_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_assignments_conversation_active
    ON assignments(conversation_id)
    WHERE status = 'active';

CREATE OR REPLACE FUNCTION touch_assignments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assignments_updated_at ON assignments;

CREATE TRIGGER trg_assignments_updated_at
BEFORE UPDATE ON assignments
FOR EACH ROW
EXECUTE FUNCTION touch_assignments_updated_at();

UPDATE conversations
SET
    assigned_at = COALESCE(assigned_at, updated_at, created_at),
    assignment_mode = COALESCE(assignment_mode, 'manual')
WHERE assigned_to IS NOT NULL
  AND (assigned_at IS NULL OR assignment_mode IS NULL);
