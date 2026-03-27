CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_campaigns_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,
    CONSTRAINT uq_campaigns_user_slug
        UNIQUE (user_id, slug)
);

ALTER TABLE campaigns
    ADD COLUMN IF NOT EXISTS user_id UUID,
    ADD COLUMN IF NOT EXISTS slug TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE campaigns
    ALTER COLUMN status SET DEFAULT 'draft',
    ALTER COLUMN created_at SET DEFAULT NOW();

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'campaigns'
          AND column_name = 'platform_type'
    ) THEN
        ALTER TABLE campaigns
            ALTER COLUMN platform_type SET DEFAULT 'multi_platform';
    END IF;
END $$;

UPDATE campaigns
SET
    slug = COALESCE(
        NULLIF(slug, ''),
        NULLIF(
            trim(both '-' FROM regexp_replace(lower(COALESCE(name, 'campaign')), '[^a-z0-9]+', '-', 'g')),
            ''
        ),
        id::text
    ),
    metadata = COALESCE(metadata, '{}'::jsonb),
    updated_at = COALESCE(updated_at, created_at, NOW());

ALTER TABLE flows
    ADD COLUMN IF NOT EXISTS flow_name TEXT,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS flow_key TEXT,
    ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS context_schema JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE flows
SET
    flow_name = COALESCE(NULLIF(flow_name, ''), 'Primary Flow'),
    flow_json = COALESCE(flow_json, '{"nodes":[],"edges":[]}'::jsonb),
    is_active = COALESCE(is_active, true)
WHERE flow_name IS NULL
   OR flow_name = ''
   OR flow_json IS NULL
   OR is_active IS NULL;

ALTER TABLE flows
    ALTER COLUMN flow_name SET NOT NULL,
    ALTER COLUMN flow_json SET NOT NULL;

DO $$
DECLARE
    constraint_row RECORD;
    index_row RECORD;
BEGIN
    FOR constraint_row IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'flows'
          AND c.contype = 'u'
          AND pg_get_constraintdef(c.oid) ILIKE '%(bot_id)%'
    LOOP
        EXECUTE format('ALTER TABLE flows DROP CONSTRAINT IF EXISTS %I', constraint_row.conname);
    END LOOP;

    FOR index_row IN
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'flows'
          AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
          AND indexdef ILIKE '%(bot_id)%'
    LOOP
        EXECUTE format('DROP INDEX IF EXISTS %I', index_row.indexname);
    END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_flows_default_per_bot
ON flows(bot_id)
WHERE is_default = true;

CREATE TABLE IF NOT EXISTS campaign_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL,
    user_id UUID NOT NULL,
    bot_id UUID NOT NULL,
    platform TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    default_flow_id UUID,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_campaign_channels_campaign
        FOREIGN KEY (campaign_id)
        REFERENCES campaigns(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_campaign_channels_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_campaign_channels_bot
        FOREIGN KEY (bot_id)
        REFERENCES bots(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_campaign_channels_default_flow
        FOREIGN KEY (default_flow_id)
        REFERENCES flows(id)
        ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_channels_platform_bot
ON campaign_channels(campaign_id, platform, bot_id);

CREATE TABLE IF NOT EXISTS entry_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL,
    channel_id UUID NOT NULL,
    user_id UUID NOT NULL,
    bot_id UUID NOT NULL,
    flow_id UUID NOT NULL,
    platform TEXT NOT NULL,
    name TEXT NOT NULL,
    entry_key TEXT NOT NULL,
    entry_type TEXT NOT NULL DEFAULT 'generic',
    source_ref TEXT,
    landing_url TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_entry_points_campaign
        FOREIGN KEY (campaign_id)
        REFERENCES campaigns(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_entry_points_channel
        FOREIGN KEY (channel_id)
        REFERENCES campaign_channels(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_entry_points_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_entry_points_bot
        FOREIGN KEY (bot_id)
        REFERENCES bots(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_entry_points_flow
        FOREIGN KEY (flow_id)
        REFERENCES flows(id)
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_entry_points_channel_key
ON entry_points(channel_id, entry_key);

CREATE UNIQUE INDEX IF NOT EXISTS uq_entry_points_default_per_channel
ON entry_points(channel_id)
WHERE is_default = true;

CREATE TABLE IF NOT EXISTS lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    bot_id UUID NOT NULL,
    campaign_id UUID NOT NULL,
    channel_id UUID,
    entry_point_id UUID,
    platform TEXT NOT NULL,
    name TEXT NOT NULL,
    list_key TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'entry_point',
    is_system BOOLEAN NOT NULL DEFAULT true,
    filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_lists_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_lists_bot
        FOREIGN KEY (bot_id)
        REFERENCES bots(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_lists_campaign
        FOREIGN KEY (campaign_id)
        REFERENCES campaigns(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_lists_channel
        FOREIGN KEY (channel_id)
        REFERENCES campaign_channels(id)
        ON DELETE SET NULL,
    CONSTRAINT fk_lists_entry_point
        FOREIGN KEY (entry_point_id)
        REFERENCES entry_points(id)
        ON DELETE SET NULL,
    CONSTRAINT uq_lists_user_key
        UNIQUE (user_id, list_key)
);

ALTER TABLE entry_points
    ADD COLUMN IF NOT EXISTS list_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_entry_points_list'
    ) THEN
        ALTER TABLE entry_points
            ADD CONSTRAINT fk_entry_points_list
            FOREIGN KEY (list_id)
            REFERENCES lists(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS flow_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id UUID NOT NULL,
    node_id TEXT NOT NULL,
    node_type TEXT NOT NULL,
    node_label TEXT,
    node_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    position_x DOUBLE PRECISION,
    position_y DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_flow_nodes_flow
        FOREIGN KEY (flow_id)
        REFERENCES flows(id)
        ON DELETE CASCADE,
    CONSTRAINT uq_flow_nodes_node
        UNIQUE (flow_id, node_id)
);

CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    bot_id UUID,
    contact_id UUID,
    campaign_id UUID,
    channel_id UUID,
    entry_point_id UUID,
    flow_id UUID,
    platform TEXT,
    list_id UUID,
    name TEXT,
    phone TEXT,
    email TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    source TEXT,
    source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    variables JSONB NOT NULL DEFAULT '{}'::jsonb,
    notes TEXT,
    wa_name TEXT,
    wa_number TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS user_id UUID,
    ADD COLUMN IF NOT EXISTS bot_id UUID,
    ADD COLUMN IF NOT EXISTS contact_id UUID,
    ADD COLUMN IF NOT EXISTS campaign_id UUID,
    ADD COLUMN IF NOT EXISTS channel_id UUID,
    ADD COLUMN IF NOT EXISTS entry_point_id UUID,
    ADD COLUMN IF NOT EXISTS flow_id UUID,
    ADD COLUMN IF NOT EXISTS platform TEXT,
    ADD COLUMN IF NOT EXISTS list_id UUID,
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS phone TEXT,
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new',
    ADD COLUMN IF NOT EXISTS source TEXT,
    ADD COLUMN IF NOT EXISTS source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS variables JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS wa_name TEXT,
    ADD COLUMN IF NOT EXISTS wa_number TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'leads'
          AND column_name = 'platform_user_id'
    ) THEN
        ALTER TABLE leads
            ALTER COLUMN platform_user_id DROP NOT NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_leads_user'
    ) THEN
        ALTER TABLE leads
            ADD CONSTRAINT fk_leads_user
            FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_leads_bot'
    ) THEN
        ALTER TABLE leads
            ADD CONSTRAINT fk_leads_bot
            FOREIGN KEY (bot_id)
            REFERENCES bots(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_leads_contact'
    ) THEN
        ALTER TABLE leads
            ADD CONSTRAINT fk_leads_contact
            FOREIGN KEY (contact_id)
            REFERENCES contacts(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_leads_campaign'
    ) THEN
        ALTER TABLE leads
            ADD CONSTRAINT fk_leads_campaign
            FOREIGN KEY (campaign_id)
            REFERENCES campaigns(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_leads_channel'
    ) THEN
        ALTER TABLE leads
            ADD CONSTRAINT fk_leads_channel
            FOREIGN KEY (channel_id)
            REFERENCES campaign_channels(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_leads_entry_point'
    ) THEN
        ALTER TABLE leads
            ADD CONSTRAINT fk_leads_entry_point
            FOREIGN KEY (entry_point_id)
            REFERENCES entry_points(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_leads_flow'
    ) THEN
        ALTER TABLE leads
            ADD CONSTRAINT fk_leads_flow
            FOREIGN KEY (flow_id)
            REFERENCES flows(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_leads_list'
    ) THEN
        ALTER TABLE leads
            ADD CONSTRAINT fk_leads_list
            FOREIGN KEY (list_id)
            REFERENCES lists(id)
            ON DELETE SET NULL;
    END IF;
END $$;

ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS campaign_id UUID,
    ADD COLUMN IF NOT EXISTS channel_id UUID,
    ADD COLUMN IF NOT EXISTS entry_point_id UUID,
    ADD COLUMN IF NOT EXISTS flow_id UUID,
    ADD COLUMN IF NOT EXISTS list_id UUID,
    ADD COLUMN IF NOT EXISTS context_json JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_conversations_campaign'
    ) THEN
        ALTER TABLE conversations
            ADD CONSTRAINT fk_conversations_campaign
            FOREIGN KEY (campaign_id)
            REFERENCES campaigns(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_conversations_channel'
    ) THEN
        ALTER TABLE conversations
            ADD CONSTRAINT fk_conversations_channel
            FOREIGN KEY (channel_id)
            REFERENCES campaign_channels(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_conversations_entry_point'
    ) THEN
        ALTER TABLE conversations
            ADD CONSTRAINT fk_conversations_entry_point
            FOREIGN KEY (entry_point_id)
            REFERENCES entry_points(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_conversations_flow'
    ) THEN
        ALTER TABLE conversations
            ADD CONSTRAINT fk_conversations_flow
            FOREIGN KEY (flow_id)
            REFERENCES flows(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_conversations_list'
    ) THEN
        ALTER TABLE conversations
            ADD CONSTRAINT fk_conversations_list
            FOREIGN KEY (list_id)
            REFERENCES lists(id)
            ON DELETE SET NULL;
    END IF;
END $$;

UPDATE leads
SET
    name = COALESCE(name, wa_name),
    phone = COALESCE(phone, wa_number),
    platform = COALESCE(platform, 'whatsapp'),
    source = COALESCE(source, 'legacy'),
    variables = COALESCE(variables, '{}'::jsonb),
    source_payload = COALESCE(source_payload, '{}'::jsonb),
    updated_at = COALESCE(updated_at, NOW());

CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_context_contact
ON leads(campaign_id, channel_id, entry_point_id, contact_id)
WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_user
ON campaigns(user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_campaigns_user_slug
ON campaigns(user_id, slug)
WHERE user_id IS NOT NULL
  AND slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_channels_campaign
ON campaign_channels(campaign_id, platform);

CREATE INDEX IF NOT EXISTS idx_entry_points_channel
ON entry_points(channel_id, platform, is_active);

CREATE INDEX IF NOT EXISTS idx_entry_points_lookup
ON entry_points(bot_id, platform, entry_key, is_active);

CREATE INDEX IF NOT EXISTS idx_lists_campaign_platform
ON lists(campaign_id, platform, entry_point_id);

CREATE INDEX IF NOT EXISTS idx_leads_filters
ON leads(user_id, campaign_id, platform, channel_id, entry_point_id, flow_id, list_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_context
ON conversations(bot_id, campaign_id, channel_id, entry_point_id, flow_id);
