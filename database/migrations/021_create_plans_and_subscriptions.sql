CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    monthly_price_inr INTEGER NOT NULL,
    yearly_price_inr INTEGER NOT NULL,
    monthly_price_usd INTEGER NOT NULL,
    yearly_price_usd INTEGER NOT NULL,
    max_campaigns INTEGER NOT NULL,
    max_numbers INTEGER NOT NULL,
    included_users INTEGER NOT NULL DEFAULT 5,
    allowed_platforms JSONB NOT NULL DEFAULT '[]'::jsonb,
    features JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    plan_id TEXT NOT NULL,
    billing_cycle TEXT NOT NULL DEFAULT 'monthly',
    currency TEXT NOT NULL DEFAULT 'INR',
    price_amount INTEGER NOT NULL,
    start_date DATE NOT NULL,
    expiry_date DATE,
    status TEXT NOT NULL DEFAULT 'active',
    auto_renew BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_subscriptions_workspace
        FOREIGN KEY (workspace_id)
        REFERENCES workspaces(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_subscriptions_plan
        FOREIGN KEY (plan_id)
        REFERENCES plans(id)
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_workspace
ON subscriptions(workspace_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_active_workspace
ON subscriptions(workspace_id)
WHERE status = 'active';

INSERT INTO plans (
    id,
    name,
    description,
    monthly_price_inr,
    yearly_price_inr,
    monthly_price_usd,
    yearly_price_usd,
    max_campaigns,
    max_numbers,
    included_users,
    allowed_platforms,
    features,
    status
)
VALUES
(
    'starter',
    'Starter',
    'Single-workspace baseline for early teams. Priced below AiSensy Basic and ManyChat/entry automation tools.',
    1299,
    12999,
    35,
    350,
    10,
    2,
    5,
    '["whatsapp","website","api"]'::jsonb,
    '{"broadcasts": true, "entry_points": true, "platform_accounts": true, "workspaces": 1}'::jsonb,
    'active'
),
(
    'growth',
    'Growth',
    'Core multichannel plan for growing teams. Priced below AiSensy Pro and well below respond.io Growth.',
    2799,
    27999,
    89,
    890,
    35,
    8,
    10,
    '["whatsapp","website","facebook","instagram","api","telegram"]'::jsonb,
    '{"broadcasts": true, "entry_points": true, "platform_accounts": true, "analytics": true, "api_access": true, "workspaces": 3}'::jsonb,
    'active'
),
(
    'scale',
    'Scale',
    'Advanced plan for larger multi-workspace teams. Priced roughly 15-18% below respond.io Advanced.',
    4999,
    49999,
    229,
    2290,
    100,
    20,
    25,
    '["whatsapp","website","facebook","instagram","api","telegram"]'::jsonb,
    '{"broadcasts": true, "entry_points": true, "platform_accounts": true, "analytics": true, "api_access": true, "priority_support": true, "workspaces": 10}'::jsonb,
    'active'
)
ON CONFLICT (id) DO UPDATE
SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    monthly_price_inr = EXCLUDED.monthly_price_inr,
    yearly_price_inr = EXCLUDED.yearly_price_inr,
    monthly_price_usd = EXCLUDED.monthly_price_usd,
    yearly_price_usd = EXCLUDED.yearly_price_usd,
    max_campaigns = EXCLUDED.max_campaigns,
    max_numbers = EXCLUDED.max_numbers,
    included_users = EXCLUDED.included_users,
    allowed_platforms = EXCLUDED.allowed_platforms,
    features = EXCLUDED.features,
    status = EXCLUDED.status,
    updated_at = NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_workspaces_plan'
    ) THEN
        ALTER TABLE workspaces
            ADD CONSTRAINT fk_workspaces_plan
            FOREIGN KEY (plan_id)
            REFERENCES plans(id)
            ON DELETE SET NULL;
    END IF;
END $$;

INSERT INTO subscriptions (
    workspace_id,
    plan_id,
    billing_cycle,
    currency,
    price_amount,
    start_date,
    expiry_date,
    status,
    auto_renew
)
SELECT
    w.id,
    COALESCE(w.plan_id, 'starter'),
    'monthly',
    'INR',
    p.monthly_price_inr,
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '30 day',
    'active',
    true
FROM workspaces w
JOIN plans p ON p.id = COALESCE(w.plan_id, 'starter')
WHERE NOT EXISTS (
    SELECT 1
    FROM subscriptions s
    WHERE s.workspace_id = w.id
      AND s.status = 'active'
);
