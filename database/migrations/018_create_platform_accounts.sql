CREATE TABLE IF NOT EXISTS platform_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    workspace_id UUID,
    platform_type TEXT NOT NULL,
    name TEXT NOT NULL,
    phone_number TEXT,
    account_id TEXT,
    token TEXT,
    business_id TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_platform_accounts_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_platform_accounts_user
ON platform_accounts(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_accounts_workspace_platform
ON platform_accounts(workspace_id, platform_type, status);

CREATE INDEX IF NOT EXISTS idx_platform_accounts_account
ON platform_accounts(platform_type, account_id);

CREATE INDEX IF NOT EXISTS idx_platform_accounts_phone
ON platform_accounts(platform_type, phone_number);

CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_accounts_user_platform_account
ON platform_accounts(user_id, platform_type, account_id)
WHERE account_id IS NOT NULL;
