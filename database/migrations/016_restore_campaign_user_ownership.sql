ALTER TABLE campaigns
    ADD COLUMN IF NOT EXISTS user_id UUID;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'campaigns'
          AND column_name = 'created_by'
    ) THEN
        EXECUTE $sql$
            UPDATE campaigns
            SET user_id = COALESCE(user_id, created_by)
            WHERE user_id IS NULL
        $sql$;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_campaigns_user'
    ) THEN
        ALTER TABLE campaigns
            ADD CONSTRAINT fk_campaigns_user
            FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_campaigns_user_id
ON campaigns(user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_campaigns_user_slug
ON campaigns(user_id, slug)
WHERE user_id IS NOT NULL;
