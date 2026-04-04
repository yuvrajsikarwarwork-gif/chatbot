CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS flow_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,

    flow_json JSONB NOT NULL,
    triggers_json JSONB NOT NULL,

    published_by UUID REFERENCES users(id) ON DELETE SET NULL,
    published_at TIMESTAMPTZ DEFAULT NOW(),

    change_summary TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (flow_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_flow_versions_lookup
    ON flow_versions (flow_id, version_number DESC);

CREATE INDEX IF NOT EXISTS idx_flow_versions_published_at
    ON flow_versions (flow_id, published_at DESC);
