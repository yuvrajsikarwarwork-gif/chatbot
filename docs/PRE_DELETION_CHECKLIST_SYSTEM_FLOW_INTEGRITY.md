# Pre-Deletion Checklist: System Flow Integrity

**Objective**: Verify that state-driven flows like Handoff and CSAT are correctly wired before removing the legacy fallback router.

This checklist is the final gate before deleting:

- `backend-api/src/services/flowTriggerRouterService.ts`
- the legacy fallback branch in `backend-api/src/services/flowEngine.ts`

## 1. Configuration Check

Confirm that the bot is pointing at valid system flow IDs.

```sql
SELECT
  b.id AS bot_id,
  b.bot_name,
  b.workspace_id,
  b.settings_json->'system_flows'->>'handoff_flow_id' AS handoff_flow_id,
  b.settings_json->'system_flows'->>'csat_flow_id' AS csat_flow_id
FROM bots b
WHERE b.workspace_id = 'YOUR_WORKSPACE_ID'
ORDER BY b.created_at DESC;
```

Pass criteria:

- `handoff_flow_id` is not null
- `csat_flow_id` is not null
- both IDs match the expected bot configuration

## 2. Referential Integrity

Confirm that each mapped flow actually exists and is active.

```sql
SELECT
  b.bot_name,
  f.flow_name,
  f.id AS flow_id,
  f.is_active,
  f.workspace_id,
  CASE
    WHEN f.id IS NULL THEN 'missing'
    WHEN COALESCE(f.is_active, false) = false THEN 'inactive'
    WHEN f.workspace_id <> b.workspace_id THEN 'cross_workspace'
    ELSE 'ok'
  END AS status,
  CASE WHEN f.id IS NULL THEN 'handoff' ELSE 'csat' END AS flow_type
FROM bots b
LEFT JOIN flows f
  ON f.id = (b.settings_json->'system_flows'->>'handoff_flow_id')::uuid
   OR f.id = (b.settings_json->'system_flows'->>'csat_flow_id')::uuid
WHERE b.workspace_id = 'YOUR_WORKSPACE_ID'
ORDER BY b.created_at DESC, f.flow_name ASC NULLS LAST;
```

Pass criteria:

- both flows exist
- both flows are active
- both flows belong to the same workspace as the bot

## 3. Workspace Isolation

Use this if you want a more explicit tenant-safety check.

```sql
SELECT
  b.bot_name,
  b.workspace_id AS bot_workspace_id,
  f.flow_name,
  f.workspace_id AS flow_workspace_id,
  CASE
    WHEN f.workspace_id = b.workspace_id THEN 'ok'
    ELSE 'cross_workspace'
  END AS isolation_status
FROM bots b
JOIN flows f
  ON f.id IN (
    (b.settings_json->'system_flows'->>'handoff_flow_id')::uuid,
    (b.settings_json->'system_flows'->>'csat_flow_id')::uuid
  )
WHERE b.workspace_id = 'YOUR_WORKSPACE_ID';
```

Pass criteria:

- `bot_workspace_id` matches `flow_workspace_id`

## 4. Logic Execution Smoke Tests

These are not SQL-only, but they verify the state machine behavior that the registry should not replace.

- Handoff: trigger the support path and confirm the conversation transitions to `agent_pending`
- CSAT: close the support session and confirm the survey is created and `csat_pending` flips to `false`

Relevant code paths:

- `backend-api/src/services/flowInputHandlerService.ts`
- `backend-api/src/services/flowConfirmationHandlerService.ts`
- `backend-api/src/services/flowConfirmationService.ts`
- `backend-api/src/services/flowEngine.ts`

## 5. Legacy Audit

Confirm the registry is handling keyword intents and the fallback bridge is effectively idle.

```sql
SELECT
  created_at,
  metadata->>'keyword' AS keyword,
  flow_id,
  target_flow_id,
  event_type
FROM registry_events
WHERE workspace_id = 'YOUR_WORKSPACE_ID'
  AND event_type IN ('TRIGGER_MATCH', 'LEGACY_FALLBACK_MATCH')
ORDER BY created_at DESC
LIMIT 10;
```

Pass criteria:

- `TRIGGER_MATCH` is the normal result for test keywords
- `LEGACY_FALLBACK_MATCH` stays at 0 during the observation window

## Final Green Light

You are ready for the grand deletion only when all of the following are true:

- handoff and CSAT flow IDs resolve to real active flows
- those flows belong to the same workspace as the bot
- handoff and CSAT smoke tests pass
- legacy fallback hits remain flatlined at zero

At that point, the legacy router becomes dead weight and can be removed safely.
