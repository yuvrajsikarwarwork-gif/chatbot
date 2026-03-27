import { query } from "../config/db";

export async function findActiveSupportAccess(workspaceId: string, userId: string) {
  const res = await query(
    `SELECT *
     FROM support_access
     WHERE workspace_id = $1
       AND user_id = $2
       AND expires_at > NOW()
     LIMIT 1`,
    [workspaceId, userId]
  );

  return res.rows[0] || null;
}

export async function listSupportAccessByWorkspace(workspaceId: string) {
  const res = await query(
    `SELECT sa.*, u.name AS user_name, u.email AS user_email,
            granted.name AS granted_by_name, granted.email AS granted_by_email
     FROM support_access sa
     JOIN users u ON u.id = sa.user_id
     LEFT JOIN users granted ON granted.id = sa.granted_by
     WHERE sa.workspace_id = $1
     ORDER BY sa.expires_at DESC, sa.created_at DESC`,
    [workspaceId]
  );

  return res.rows;
}

export async function upsertSupportAccess(input: {
  workspaceId: string;
  userId: string;
  grantedBy?: string | null;
  reason?: string | null;
  expiresAt: string;
}) {
  const res = await query(
    `INSERT INTO support_access (workspace_id, user_id, granted_by, reason, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (workspace_id, user_id)
     DO UPDATE SET
       granted_by = EXCLUDED.granted_by,
       reason = EXCLUDED.reason,
       expires_at = EXCLUDED.expires_at,
       updated_at = NOW()
     RETURNING *`,
    [input.workspaceId, input.userId, input.grantedBy || null, input.reason || null, input.expiresAt]
  );

  return res.rows[0];
}

export async function deleteSupportAccess(workspaceId: string, userId: string) {
  const res = await query(
    `DELETE FROM support_access
     WHERE workspace_id = $1
       AND user_id = $2
     RETURNING *`,
    [workspaceId, userId]
  );

  return res.rows[0] || null;
}
