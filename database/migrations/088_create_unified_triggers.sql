CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id UUID NULL REFERENCES projects(id) ON DELETE CASCADE,
    bot_id UUID NULL REFERENCES bots(id) ON DELETE CASCADE,
    campaign_id UUID NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    keyword TEXT NOT NULL,
    target_flow_id UUID NOT NULL,
    target_node_id TEXT NULL,
    source_type TEXT NOT NULL DEFAULT 'universal',
    priority INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT triggers_source_type_check
        CHECK (source_type IN ('campaign', 'bot', 'universal'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_triggers_scope_keyword
ON triggers (
    workspace_id,
    COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
    source_type,
    COALESCE(bot_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid),
    LOWER(TRIM(keyword))
)
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_triggers_lookup
ON triggers (
    workspace_id,
    COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
    LOWER(TRIM(keyword))
)
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_triggers_scope_priority
ON triggers (
    workspace_id,
    COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
    source_type,
    priority DESC,
    updated_at DESC
)
WHERE is_active = true;

CREATE OR REPLACE FUNCTION touch_triggers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_triggers_updated_at ON triggers;
CREATE TRIGGER trg_triggers_updated_at
BEFORE UPDATE ON triggers
FOR EACH ROW
EXECUTE FUNCTION touch_triggers_updated_at();

CREATE OR REPLACE FUNCTION split_trigger_keywords(raw_value TEXT)
RETURNS TABLE(keyword TEXT)
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT DISTINCT NULLIF(LOWER(TRIM(token)), '') AS keyword
    FROM regexp_split_to_table(
        replace(
            replace(
                replace(
                    replace(
                        replace(COALESCE(raw_value, ''), '[', ''),
                        ']',
                        ''
                    ),
                    '{',
                    ''
                ),
                '}',
                ''
            ),
            '"',
            ''
        ),
        E'[,;\\n\\r|]+'
    ) AS token
    WHERE NULLIF(LOWER(TRIM(token)), '') IS NOT NULL;
$$;

WITH campaign_keyword_sources AS (
    SELECT
        c.id AS campaign_id,
        c.workspace_id,
        c.project_id,
        COALESCE(c.updated_at, c.created_at, NOW()) AS source_ts,
        COALESCE(
            NULLIF(TRIM(c.settings_json->'system_flow_rules'->>'handoff_keywords'), ''),
            NULLIF(TRIM(c.settings_json->'system_flow_rules'->>'keywords'), ''),
            NULLIF(TRIM(c.settings_json->'system_flow_rules'->>'trigger_keywords'), ''),
            NULLIF(TRIM(c.settings_json->'system_flows'->'handoff'->>'keywords'), ''),
            NULLIF(TRIM(c.settings_json->'system_flows'->'handoff'->>'triggerKeywords'), ''),
            NULLIF(TRIM(c.settings_json->'system_flows'->'handoff'->>'trigger_keywords'), '')
        ) AS raw_keywords
    FROM campaigns c
    WHERE c.deleted_at IS NULL
)
INSERT INTO triggers (
    workspace_id,
    project_id,
    bot_id,
    campaign_id,
    keyword,
    target_flow_id,
    target_node_id,
    source_type,
    priority,
    is_active,
    created_at,
    updated_at
)
SELECT DISTINCT
    cks.workspace_id,
    cks.project_id,
    NULL::uuid AS bot_id,
    cks.campaign_id,
    kw.keyword,
    '00000000-0000-0000-0000-000000000001'::uuid AS target_flow_id,
    NULL::text AS target_node_id,
    'campaign' AS source_type,
    2 AS priority,
    true AS is_active,
    cks.source_ts AS created_at,
    cks.source_ts AS updated_at
FROM campaign_keyword_sources cks
CROSS JOIN LATERAL split_trigger_keywords(cks.raw_keywords) AS kw(keyword)
WHERE cks.raw_keywords IS NOT NULL
ON CONFLICT DO NOTHING;

WITH bot_primary_flow AS (
    SELECT DISTINCT ON (f.bot_id)
        f.bot_id,
        f.id AS flow_id
    FROM flows f
    WHERE COALESCE(f.is_active, true) = true
    ORDER BY
        f.bot_id,
        COALESCE(f.is_default, false) DESC,
        f.updated_at DESC NULLS LAST,
        f.created_at DESC
),
bot_keyword_sources AS (
    SELECT
        b.id AS bot_id,
        b.workspace_id,
        b.project_id,
        COALESCE(b.updated_at, b.created_at, NOW()) AS source_ts,
        b.trigger_keywords AS raw_keywords
    FROM bots b
    WHERE b.deleted_at IS NULL
      AND NULLIF(TRIM(COALESCE(b.trigger_keywords, '')), '') IS NOT NULL

    UNION ALL

    SELECT
        f.bot_id AS bot_id,
        b.workspace_id,
        b.project_id,
        COALESCE(f.updated_at, f.created_at, b.updated_at, b.created_at, NOW()) AS source_ts,
        COALESCE(
            NULLIF(TRIM(f.flow_json->>'keywords'), ''),
            NULLIF(TRIM(f.flow_json->>'triggerKeywords'), ''),
            NULLIF(TRIM(f.flow_json->>'trigger_keywords'), '')
        ) AS raw_keywords
    FROM flows f
    JOIN bots b ON b.id = f.bot_id
    WHERE b.deleted_at IS NULL
      AND COALESCE(f.is_active, true) = true
      AND COALESCE(
            NULLIF(TRIM(f.flow_json->>'keywords'), ''),
            NULLIF(TRIM(f.flow_json->>'triggerKeywords'), ''),
            NULLIF(TRIM(f.flow_json->>'trigger_keywords'), '')
      ) IS NOT NULL

    UNION ALL

    SELECT
        f.bot_id AS bot_id,
        b.workspace_id,
        b.project_id,
        COALESCE(f.updated_at, f.created_at, b.updated_at, b.created_at, NOW()) AS source_ts,
        COALESCE(
            NULLIF(TRIM(node->'data'->>'keywords'), ''),
            NULLIF(TRIM(node->'data'->>'triggerKeywords'), ''),
            NULLIF(TRIM(node->'data'->>'trigger_keywords'), ''),
            NULLIF(TRIM(node->'data'->>'entryKey'), ''),
            CASE
                WHEN char_length(TRIM(COALESCE(node->'data'->>'text', ''))) BETWEEN 1 AND 39
                THEN TRIM(node->'data'->>'text')
                ELSE NULL
            END
        ) AS raw_keywords
    FROM flows f
    JOIN bots b ON b.id = f.bot_id
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(f.flow_json->'nodes', '[]'::jsonb)) AS node
    WHERE b.deleted_at IS NULL
      AND COALESCE(f.is_active, true) = true
      AND LOWER(COALESCE(node->>'type', '')) IN ('start', 'trigger')
      AND COALESCE(
            NULLIF(TRIM(node->'data'->>'keywords'), ''),
            NULLIF(TRIM(node->'data'->>'triggerKeywords'), ''),
            NULLIF(TRIM(node->'data'->>'trigger_keywords'), ''),
            NULLIF(TRIM(node->'data'->>'entryKey'), ''),
            CASE
                WHEN char_length(TRIM(COALESCE(node->'data'->>'text', ''))) BETWEEN 1 AND 39
                THEN TRIM(node->'data'->>'text')
                ELSE NULL
            END
      ) IS NOT NULL
)
INSERT INTO triggers (
    workspace_id,
    project_id,
    bot_id,
    campaign_id,
    keyword,
    target_flow_id,
    target_node_id,
    source_type,
    priority,
    is_active,
    created_at,
    updated_at
)
SELECT DISTINCT
    bks.workspace_id,
    bks.project_id,
    bks.bot_id,
    NULL::uuid AS campaign_id,
    kw.keyword,
    bpf.flow_id AS target_flow_id,
    NULL::text AS target_node_id,
    'bot' AS source_type,
    1 AS priority,
    true AS is_active,
    bks.source_ts AS created_at,
    bks.source_ts AS updated_at
FROM bot_keyword_sources bks
JOIN bot_primary_flow bpf ON bpf.bot_id = bks.bot_id
CROSS JOIN LATERAL split_trigger_keywords(bks.raw_keywords) AS kw(keyword)
WHERE bks.raw_keywords IS NOT NULL
ON CONFLICT DO NOTHING;

WITH universal_rule_sources AS (
    SELECT
        b.id AS bot_id,
        b.workspace_id,
        b.project_id,
        COALESCE(b.updated_at, b.created_at, NOW()) AS source_ts,
        CASE
            WHEN COALESCE(
                NULLIF(TRIM(rule->>'flowId'), ''),
                NULLIF(TRIM(rule->>'flow_id'), ''),
                NULLIF(TRIM(rule->>'target_flow_id'), ''),
                NULLIF(TRIM(rule->>'targetFlowId'), '')
            ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN COALESCE(
                NULLIF(TRIM(rule->>'flowId'), ''),
                NULLIF(TRIM(rule->>'flow_id'), ''),
                NULLIF(TRIM(rule->>'target_flow_id'), ''),
                NULLIF(TRIM(rule->>'targetFlowId'), '')
            )::uuid
            ELSE NULL
        END AS target_flow_id,
        COALESCE(
            NULLIF(TRIM(rule->>'keywords'), ''),
            NULLIF(TRIM(rule->>'keyword'), ''),
            NULLIF(TRIM(rule->>'trigger_keywords'), ''),
            NULLIF(TRIM(rule->>'triggerKeywords'), '')
        ) AS raw_keywords
    FROM bots b
    CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(
            b.global_settings->'keyword_interrupts',
            b.global_settings->'universal_rules',
            b.settings_json->'keyword_interrupts',
            b.settings_json->'universal_rules',
            '[]'::jsonb
        )
    ) AS rule
    WHERE b.deleted_at IS NULL
)
INSERT INTO triggers (
    workspace_id,
    project_id,
    bot_id,
    campaign_id,
    keyword,
    target_flow_id,
    target_node_id,
    source_type,
    priority,
    is_active,
    created_at,
    updated_at
)
SELECT DISTINCT
    urs.workspace_id,
    urs.project_id,
    urs.bot_id,
    NULL::uuid AS campaign_id,
    kw.keyword,
    urs.target_flow_id,
    NULL::text AS target_node_id,
    'universal' AS source_type,
    0 AS priority,
    true AS is_active,
    urs.source_ts AS created_at,
    urs.source_ts AS updated_at
FROM universal_rule_sources urs
CROSS JOIN LATERAL split_trigger_keywords(urs.raw_keywords) AS kw(keyword)
WHERE urs.target_flow_id IS NOT NULL
  AND urs.raw_keywords IS NOT NULL
ON CONFLICT DO NOTHING;
