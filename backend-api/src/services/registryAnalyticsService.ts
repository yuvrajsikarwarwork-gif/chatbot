import { query } from "../config/db";

export type RegistryEventType =
  | "TRIGGER_MATCH"
  | "LEGACY_FALLBACK_MATCH"
  | "ERROR_HANDLED"
  | "OVERRIDE_EXECUTED"
  | "AI_INTENT_RESULT"
  | "AI_EXTRACT_RESULT";

export interface RegistryEventInput {
  workspaceId: string;
  conversationId: string;
  eventType: RegistryEventType;
  flowId?: string | null;
  nodeId?: string | null;
  handlerId?: string | null;
  targetFlowId?: string | null;
  authType?: "human" | "machine" | "system" | null;
  metadata?: Record<string, any>;
}

function buildCreatedAtFilter(
  input: {
    sinceHours?: number | null;
    days?: number | null;
    startDate?: string | null;
  },
  paramIndex: number
) {
  const startDate = typeof input.startDate === "string" ? input.startDate.trim() : "";
  const parsedStartDate = startDate ? new Date(startDate) : null;
  if (parsedStartDate && !Number.isNaN(parsedStartDate.getTime())) {
    return {
      clause: `AND re.created_at >= $${paramIndex}::timestamptz`,
      values: [parsedStartDate.toISOString()],
    };
  }

  const days = Number(input.days || 0);
  if (Number.isFinite(days) && days > 0) {
    return {
      clause: `AND re.created_at >= NOW() - ($${paramIndex}::int * INTERVAL '1 day')`,
      values: [days],
    };
  }

  const sinceHours = Number(input.sinceHours || 0);
  if (Number.isFinite(sinceHours) && sinceHours > 0) {
    return {
      clause: `AND re.created_at >= NOW() - ($${paramIndex}::int * INTERVAL '1 hour')`,
      values: [sinceHours],
    };
  }

  return {
    clause: "",
    values: [] as Array<string | number>,
  };
}

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

export class RegistryAnalyticsService {
  static async logEvent(input: RegistryEventInput) {
    if (!String(input.workspaceId || "").trim() || !String(input.conversationId || "").trim()) {
      return;
    }

    if (!(await tableExists("registry_events"))) {
      return;
    }

    try {
      const authType = String(input.authType || input.metadata?.auth_type || "human").trim().toLowerCase() || "human";
      await query(
        `INSERT INTO registry_events (
           workspace_id,
           conversation_id,
           event_type,
           flow_id,
           node_id,
           handler_id,
           target_flow_id,
           metadata
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
        [
          input.workspaceId,
          input.conversationId,
          input.eventType,
          input.flowId || null,
          input.nodeId || null,
          input.handlerId || null,
          input.targetFlowId || null,
          JSON.stringify({
            ...(input.metadata || {}),
            auth_type: authType === "machine" ? "machine" : "human",
          }),
        ]
      );
    } catch (error) {
      console.error("[RegistryAnalyticsService] Failed to log registry event:", error);
    }
  }

  static async getDropoffReport(input: {
    workspaceId: string;
    eventType?: RegistryEventType | "ANY";
    limit?: number;
    sinceHours?: number | null;
    days?: number | null;
    startDate?: string | null;
  }) {
    if (!String(input.workspaceId || "").trim()) {
      return [];
    }

    if (!(await tableExists("registry_events"))) {
      return [];
    }

    const limit = Math.max(1, Math.min(Number(input.limit || 10), 100));
    const eventType = String(input.eventType || "ANY").trim().toUpperCase();
    const createdAtFilter = buildCreatedAtFilter(input, 4);

    const res = await query(
      `SELECT
         re.flow_id,
         re.node_id,
         re.event_type,
         re.target_flow_id,
         re.handler_id,
         COUNT(*)::int AS failure_count,
         MAX(re.created_at) AS last_seen_at,
         jsonb_agg(
           DISTINCT jsonb_build_object(
             'conversationId', re.conversation_id,
             'metadata', re.metadata
           )
         ) FILTER (WHERE re.conversation_id IS NOT NULL) AS samples
       FROM registry_events re
       WHERE re.workspace_id = $1
         AND ($2 = 'ANY' OR UPPER(re.event_type) = $2)
         ${createdAtFilter.clause}
       GROUP BY re.flow_id, re.node_id, re.event_type, re.target_flow_id, re.handler_id
       ORDER BY failure_count DESC, last_seen_at DESC
       LIMIT $3`,
      [...[input.workspaceId, eventType, limit], ...createdAtFilter.values]
    );

    return res.rows;
  }

  static async getKeywordPopularity(input: {
    workspaceId: string;
    limit?: number;
    sinceHours?: number | null;
    days?: number | null;
    startDate?: string | null;
  }) {
    if (!String(input.workspaceId || "").trim()) {
      return [];
    }

    if (!(await tableExists("registry_events"))) {
      return [];
    }

    const limit = Math.max(1, Math.min(Number(input.limit || 10), 100));
    const createdAtFilter = buildCreatedAtFilter(input, 2);

    const res = await query(
      `SELECT
         COALESCE(NULLIF(TRIM(re.metadata->>'keyword'), ''), 'unknown') AS keyword,
         COUNT(*)::int AS count,
         MAX(re.created_at) AS last_seen_at,
         COUNT(DISTINCT re.flow_id)::int AS flow_count,
         COUNT(DISTINCT re.node_id)::int AS node_count
       FROM registry_events re
       WHERE re.workspace_id = $1
         AND UPPER(re.event_type) = 'TRIGGER_MATCH'
         ${createdAtFilter.clause}
       GROUP BY COALESCE(NULLIF(TRIM(re.metadata->>'keyword'), ''), 'unknown')
       ORDER BY count DESC, last_seen_at DESC
       LIMIT $${2 + createdAtFilter.values.length}`,
      [...[input.workspaceId, limit], ...createdAtFilter.values]
    );

    return res.rows;
  }

  static async getLegacyFallbackKeywordReport(input: {
    workspaceId: string;
    limit?: number;
    sinceHours?: number | null;
    days?: number | null;
    startDate?: string | null;
  }) {
    if (!String(input.workspaceId || "").trim()) {
      return [];
    }

    if (!(await tableExists("registry_events"))) {
      return [];
    }

    const limit = Math.max(1, Math.min(Number(input.limit || 10), 100));
    const createdAtFilter = buildCreatedAtFilter(input, 2);

    const res = await query(
      `SELECT
         COALESCE(NULLIF(TRIM(re.metadata->>'keyword'), ''), 'unknown') AS keyword,
         COUNT(*)::int AS count,
         MAX(re.created_at) AS last_seen_at,
         COUNT(DISTINCT re.flow_id)::int AS flow_count,
         COUNT(DISTINCT re.node_id)::int AS node_count,
         jsonb_agg(
           DISTINCT jsonb_build_object(
             'conversationId', re.conversation_id,
             'flowId', re.flow_id,
             'nodeId', re.node_id,
             'reason', re.metadata->>'reason'
           )
         ) FILTER (WHERE re.conversation_id IS NOT NULL) AS samples
       FROM registry_events re
       WHERE re.workspace_id = $1
         AND UPPER(re.event_type) = 'LEGACY_FALLBACK_MATCH'
         ${createdAtFilter.clause}
       GROUP BY COALESCE(NULLIF(TRIM(re.metadata->>'keyword'), ''), 'unknown')
       ORDER BY count DESC, last_seen_at DESC
       LIMIT $${2 + createdAtFilter.values.length}`,
      [...[input.workspaceId, limit], ...createdAtFilter.values]
    );

    return res.rows;
  }

  static async getUnpublishedFlowSummary(input: {
    workspaceId: string;
    limit?: number;
  }) {
    if (!String(input.workspaceId || "").trim()) {
      return {
        total: 0,
        flows: [],
      };
    }

    const limit = Math.max(1, Math.min(Number(input.limit || 10), 100));

    const res = await query(
      `WITH unpublished_flows AS (
         SELECT
           f.id,
           f.flow_name,
           f.created_at,
           COUNT(t.id)::int AS trigger_count
         FROM flows f
         LEFT JOIN triggers t
           ON t.target_flow_id = f.id
         WHERE f.workspace_id = $1
           AND COALESCE(f.is_active, true) = true
           AND f.flow_json IS NOT NULL
         GROUP BY f.id, f.flow_name, f.created_at
         HAVING COUNT(t.id) = 0
       ),
       sampled_flows AS (
         SELECT *
         FROM unpublished_flows
         ORDER BY created_at DESC NULLS LAST, flow_name ASC
         LIMIT $2
       )
       SELECT
         (SELECT COUNT(*)::int FROM unpublished_flows) AS total,
         COALESCE(
           (
             SELECT jsonb_agg(
               jsonb_build_object(
                 'id', sf.id,
                 'name', sf.flow_name,
                 'updated_at', sf.created_at,
                 'trigger_count', sf.trigger_count
               )
               ORDER BY sf.created_at DESC NULLS LAST, sf.flow_name ASC
             )
             FROM sampled_flows sf
           ),
           '[]'::jsonb
         ) AS flows`,
      [input.workspaceId, limit]
    );

    const row = res.rows[0] || {};
    const flows = Array.isArray(row.flows) ? row.flows : typeof row.flows === "string" ? JSON.parse(row.flows) : [];

    return {
      total: Number(row.total || 0),
      flows: Array.isArray(flows) ? flows.slice(0, limit) : [],
    };
  }
}
