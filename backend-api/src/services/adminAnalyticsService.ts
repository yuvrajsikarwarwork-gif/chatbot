import { query } from "../config/db";

async function tableExists(tableName: string) {
  const res = await query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = $1
     ) AS exists`,
    [tableName]
  );

  return Boolean(res.rows[0]?.exists);
}

function normalizeTimeWindow(input?: string | null) {
  const normalized = String(input || "").trim().toLowerCase();
  if (normalized === "7 days" || normalized === "7d") {
    return { label: "7 days" as const, hours: 24 * 7 };
  }
  if (normalized === "30 days" || normalized === "billing cycle" || normalized === "30d") {
    return { label: "30 days" as const, hours: 24 * 30 };
  }
  return { label: "24 hours" as const, hours: 24 };
}

export type GlobalTrafficPoint = {
  timestamp: string;
  human: number;
  machine: number;
  total: number;
};

export type TopConsumerRow = {
  org_id: string;
  org_name: string;
  plan_tier: string | null;
  human_count: number;
  machine_count: number;
  total_count: number;
};

export type OrganizationUsageBreakdownRow = {
  workspace_id: string;
  workspace_name: string;
  source_name: string;
  auth_type: "human" | "machine";
  total_requests: number;
};

export async function getGlobalTrafficSeriesService(timeWindow = "24 hours"): Promise<GlobalTrafficPoint[]> {
  const window = normalizeTimeWindow(timeWindow);

  if (!(await tableExists("registry_events"))) {
    return [];
  }

  const res = await query(
    `WITH timeline AS (
       SELECT generate_series(
         date_trunc('hour', NOW() - GREATEST($1::int - 1, 0) * INTERVAL '1 hour'),
         date_trunc('hour', NOW()),
         INTERVAL '1 hour'
       ) AS bucket
     ),
     traffic AS (
       SELECT
         date_trunc('hour', re.created_at) AS bucket,
         CASE
           WHEN LOWER(COALESCE(NULLIF(TRIM(re.metadata->>'auth_type'), ''), 'human')) = 'machine'
           THEN 'machine'
           ELSE 'human'
         END AS auth_type,
         COUNT(*)::int AS request_count
       FROM registry_events re
       WHERE re.created_at >= NOW() - ($1::int * INTERVAL '1 hour')
       GROUP BY 1, 2
     )
     SELECT
       TO_CHAR(t.bucket, 'YYYY-MM-DD"T"HH24:00:00Z') AS timestamp,
       COALESCE(SUM(CASE WHEN traffic.auth_type = 'human' THEN traffic.request_count ELSE 0 END), 0)::int AS human,
       COALESCE(SUM(CASE WHEN traffic.auth_type = 'machine' THEN traffic.request_count ELSE 0 END), 0)::int AS machine
     FROM timeline t
     LEFT JOIN traffic
       ON traffic.bucket = t.bucket
     GROUP BY t.bucket
     ORDER BY t.bucket ASC`,
    [window.hours]
  );

  return (res.rows || []).map((row) => {
    const human = Number(row.human || 0);
    const machine = Number(row.machine || 0);
    return {
      timestamp: String(row.timestamp || ""),
      human,
      machine,
      total: human + machine,
    };
  });
}

export async function getTopConsumersService(limit = 10, timeWindow = "24 hours"): Promise<TopConsumerRow[]> {
  const normalizedLimit = Math.max(1, Math.min(Number(limit || 10), 50));
  const window = normalizeTimeWindow(timeWindow);

  if (!(await tableExists("registry_events"))) {
    return [];
  }

  const res = await query(
    `SELECT
       o.id AS org_id,
       o.name AS org_name,
       o.plan_tier,
       COUNT(*) FILTER (
         WHERE LOWER(COALESCE(NULLIF(TRIM(re.metadata->>'auth_type'), ''), 'human')) = 'human'
       )::int AS human_count,
       COUNT(*) FILTER (
         WHERE LOWER(COALESCE(NULLIF(TRIM(re.metadata->>'auth_type'), ''), 'human')) = 'machine'
       )::int AS machine_count,
       COUNT(*)::int AS total_count
     FROM registry_events re
     JOIN workspaces w
       ON w.id = re.workspace_id
     JOIN organizations o
       ON o.id = w.organization_id
     WHERE re.created_at >= NOW() - ($2::int * INTERVAL '1 hour')
     GROUP BY o.id, o.name, o.plan_tier
     ORDER BY total_count DESC, machine_count DESC, human_count DESC, o.name ASC
     LIMIT $1`,
    [normalizedLimit, window.hours]
  );

  return (res.rows || []).map((row) => ({
    org_id: String(row.org_id || "").trim(),
    org_name: String(row.org_name || "").trim(),
    plan_tier: row.plan_tier ? String(row.plan_tier).trim() : null,
    human_count: Number(row.human_count || 0),
    machine_count: Number(row.machine_count || 0),
    total_count: Number(row.total_count || 0),
  }));
}

export async function getOrganizationUsageBreakdownService(
  organizationId: string,
  timeWindow = "30 days"
): Promise<OrganizationUsageBreakdownRow[]> {
  const normalizedOrganizationId = String(organizationId || "").trim();
  const window = normalizeTimeWindow(timeWindow);

  if (!normalizedOrganizationId) {
    return [];
  }

  if (!(await tableExists("registry_events"))) {
    return [];
  }

  const res = await query(
    `WITH scoped_events AS (
       SELECT
         COALESCE(w.id::text, '') AS workspace_id,
         COALESCE(w.name, 'Unknown workspace') AS workspace_name,
         CASE
           WHEN LOWER(COALESCE(NULLIF(TRIM(re.metadata->>'auth_type'), ''), 'human')) = 'machine'
             THEN COALESCE(
               NULLIF(TRIM(re.metadata->>'api_key_name'), ''),
               NULLIF(TRIM(re.metadata->>'auth_source_name'), ''),
               'Machine/API'
             )
           ELSE 'Human/Web'
         END AS source_name,
         CASE
           WHEN LOWER(COALESCE(NULLIF(TRIM(re.metadata->>'auth_type'), ''), 'human')) = 'machine' THEN 'machine'
           ELSE 'human'
         END AS auth_type
       FROM registry_events re
       JOIN workspaces w
         ON w.id = re.workspace_id
       WHERE w.organization_id = $1
         AND re.created_at >= NOW() - ($2::int * INTERVAL '1 hour')
     )
     SELECT
       workspace_id,
       workspace_name,
       source_name,
       auth_type,
       COUNT(*)::int AS total_requests
     FROM scoped_events
     GROUP BY workspace_id, workspace_name, source_name, auth_type
     ORDER BY total_requests DESC, workspace_name ASC, source_name ASC`,
    [normalizedOrganizationId, window.hours]
  );

  return (res.rows || []).map((row) => ({
    workspace_id: String(row.workspace_id || "").trim(),
    workspace_name: String(row.workspace_name || "").trim(),
    source_name: String(row.source_name || "").trim(),
    auth_type: String(row.auth_type || "human").trim().toLowerCase() === "machine" ? "machine" : "human",
    total_requests: Number(row.total_requests || 0),
  }));
}
