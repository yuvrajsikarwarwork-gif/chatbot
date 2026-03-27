import { query } from "../config/db";

export async function createAuditLog(input: {
  userId?: string | null;
  workspaceId?: string | null;
  projectId?: string | null;
  action: string;
  entity: string;
  entityId: string;
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  const res = await query(
    `INSERT INTO audit_logs
       (user_id, workspace_id, project_id, action, entity, entity_id, old_data, new_data, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb)
     RETURNING *`,
    [
      input.userId || null,
      input.workspaceId || null,
      input.projectId || null,
      input.action,
      input.entity,
      input.entityId,
      JSON.stringify(input.oldData || {}),
      JSON.stringify(input.newData || {}),
      JSON.stringify(input.metadata || {}),
    ]
  );

  return res.rows[0];
}

export async function listAuditLogs(filters: {
  workspaceId: string;
  projectId?: string | null;
  entity?: string | null;
  action?: string | null;
  limit?: number;
}) {
  const params: Array<string | number | null> = [filters.workspaceId];
  const clauses = [`al.workspace_id = $1`];

  if (filters.projectId) {
    params.push(filters.projectId);
    clauses.push(`al.project_id = $${params.length}`);
  }
  if (filters.entity) {
    params.push(filters.entity);
    clauses.push(`al.entity = $${params.length}`);
  }
  if (filters.action) {
    params.push(filters.action);
    clauses.push(`al.action = $${params.length}`);
  }

  params.push(Math.min(500, Math.max(1, Number(filters.limit || 200))));

  try {
    const res = await query(
      `SELECT al.*, u.name AS user_name, u.email AS user_email
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY al.created_at DESC
       LIMIT $${params.length}`,
      params
    );

    return res.rows;
  } catch (err: any) {
    if (["42P01", "42703", "42702"].includes(String(err?.code || ""))) {
      return [];
    }
    throw err;
  }
}
