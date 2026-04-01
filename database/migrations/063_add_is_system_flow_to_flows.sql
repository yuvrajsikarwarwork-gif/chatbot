ALTER TABLE flows
ADD COLUMN IF NOT EXISTS is_system_flow BOOLEAN NOT NULL DEFAULT false;

UPDATE flows
SET is_system_flow = true
WHERE is_system_flow = false
  AND (
    COALESCE(flow_json->>'system_flow_type', '') IN ('handoff', 'csat')
    OR COALESCE(flow_json->>'is_global_flow', 'false') = 'true'
    OR COALESCE(flow_json->>'isGlobalFlow', 'false') = 'true'
    OR COALESCE(flow_json->>'global_flow', 'false') = 'true'
  );
