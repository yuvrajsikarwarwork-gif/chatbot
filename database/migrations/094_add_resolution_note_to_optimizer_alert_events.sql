ALTER TABLE optimizer_alert_events
ADD COLUMN IF NOT EXISTS resolution_note TEXT NULL;
