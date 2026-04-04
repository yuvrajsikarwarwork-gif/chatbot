import { query } from "../config/db";

type GlobalAuditLogRow = {
  id: string;
  action: string;
  entity: string;
  entity_id: string;
  created_at: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  actor_name: string | null;
  actor_email: string | null;
  target_org_name: string | null;
  target_org_id: string | null;
  target_org_slug: string | null;
  workspace_name: string | null;
  workspace_id: string | null;
  project_name: string | null;
  project_id: string | null;
  reason: string | null;
};

function isRecoverableAuditQueryError(err: any) {
  return ["42P01", "42703", "42704"].includes(String(err?.code || ""));
}

function normalizeJson(value: unknown): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
}

function toGlobalAuditLogRow(row: any): GlobalAuditLogRow {
  return {
    id: String(row?.id || "").trim(),
    action: String(row?.action || "").trim(),
    entity: String(row?.entity || "").trim(),
    entity_id: String(row?.entity_id || "").trim(),
    created_at: row?.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    old_data: normalizeJson(row?.old_data),
    new_data: normalizeJson(row?.new_data),
    metadata: normalizeJson(row?.metadata),
    actor_name: row?.actor_name ? String(row.actor_name).trim() : null,
    actor_email: row?.actor_email ? String(row.actor_email).trim() : null,
    target_org_name: row?.target_org_name ? String(row.target_org_name).trim() : null,
    target_org_id: row?.target_org_id ? String(row.target_org_id).trim() : null,
    target_org_slug: row?.target_org_slug ? String(row.target_org_slug).trim() : null,
    workspace_name: row?.workspace_name ? String(row.workspace_name).trim() : null,
    workspace_id: row?.workspace_id ? String(row.workspace_id).trim() : null,
    project_name: row?.project_name ? String(row.project_name).trim() : null,
    project_id: row?.project_id ? String(row.project_id).trim() : null,
    reason: row?.reason ? String(row.reason).trim() : null,
  };
}

export async function getGlobalAuditLogsService(limit = 50, offset = 0) {
  const safeLimit = Math.min(200, Math.max(1, Number(limit || 50)));
  const safeOffset = Math.max(0, Number(offset || 0));

  try {
    const countResult = await query(
      `
        SELECT COUNT(*)::int AS total
        FROM audit_logs al
      `
    );

    const rows = await query(
      `
        SELECT
          al.id,
          al.action,
          al.entity,
          al.entity_id,
          al.old_data,
          al.new_data,
          al.metadata,
          al.created_at,
          COALESCE(actor.name, fallback_user.name) AS actor_name,
          COALESCE(actor.email, fallback_user.email) AS actor_email,
          CASE
            WHEN al.entity = 'organization' THEN org_entity.name
            ELSE org_from_workspace.name
          END AS target_org_name,
          CASE
            WHEN al.entity = 'organization' THEN org_entity.id
            ELSE org_from_workspace.id
          END AS target_org_id,
          CASE
            WHEN al.entity = 'organization' THEN org_entity.slug
            ELSE org_from_workspace.slug
          END AS target_org_slug,
          w.name AS workspace_name,
          w.id AS workspace_id,
          p.name AS project_name,
          p.id AS project_id,
          COALESCE(NULLIF(TRIM(al.metadata->>'reason'), ''), NULLIF(TRIM(al.new_data->>'reason'), ''), NULLIF(TRIM(al.old_data->>'reason'), '')) AS reason
        FROM audit_logs al
        LEFT JOIN users fallback_user
          ON fallback_user.id = al.user_id
        LEFT JOIN users actor
          ON actor.id = COALESCE(al.actor_user_id, al.user_id)
        LEFT JOIN workspaces w
          ON w.id = al.workspace_id
        LEFT JOIN organizations org_from_workspace
          ON org_from_workspace.id = w.organization_id
        LEFT JOIN organizations org_entity
          ON org_entity.id = CASE WHEN al.entity = 'organization' THEN al.entity_id ELSE NULL END
        LEFT JOIN projects p
          ON p.id = al.project_id
        ORDER BY al.created_at DESC
        LIMIT $1 OFFSET $2
      `,
      [safeLimit, safeOffset]
    );

    return {
      rows: (rows.rows || []).map(toGlobalAuditLogRow),
      total: Number(countResult.rows?.[0]?.total || 0),
      limit: safeLimit,
      offset: safeOffset,
    };
  } catch (err: any) {
    if (isRecoverableAuditQueryError(err)) {
      return {
        rows: [],
        total: 0,
        limit: safeLimit,
        offset: safeOffset,
      };
    }
    throw err;
  }
}
