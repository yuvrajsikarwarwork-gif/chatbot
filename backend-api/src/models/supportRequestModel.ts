import { query } from "../config/db";

export async function createSupportRequest(input: {
  workspaceId: string;
  requestedBy: string;
  targetUserId?: string | null;
  reason: string;
  requestedExpiresAt?: string | null;
}) {
  const res = await query(
    `INSERT INTO support_requests
       (workspace_id, requested_by, target_user_id, reason, requested_expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      input.workspaceId,
      input.requestedBy,
      input.targetUserId || null,
      input.reason,
      input.requestedExpiresAt || null,
    ]
  );

  return res.rows[0];
}

export async function listSupportRequestsByWorkspace(workspaceId: string) {
  const res = await query(
    `SELECT sr.*,
            requester.name AS requested_by_name,
            requester.email AS requested_by_email,
            target.name AS target_user_name,
            target.email AS target_user_email,
            resolver.name AS resolved_by_name,
            resolver.email AS resolved_by_email
     FROM support_requests sr
     JOIN users requester ON requester.id = sr.requested_by
     LEFT JOIN users target ON target.id = sr.target_user_id
     LEFT JOIN users resolver ON resolver.id = sr.resolved_by
     WHERE sr.workspace_id = $1
     ORDER BY sr.created_at DESC`,
    [workspaceId]
  );

  return res.rows;
}

export async function hasOpenSupportRequestForWorkspace(workspaceId: string) {
  const res = await query(
    `SELECT 1
     FROM support_requests
     WHERE workspace_id = $1
       AND status = 'open'
     LIMIT 1`,
    [workspaceId]
  );

  return Boolean(res.rows[0]);
}

export async function findSupportRequestById(id: string) {
  const res = await query(
    `SELECT *
     FROM support_requests
     WHERE id = $1
     LIMIT 1`,
    [id]
  );

  return res.rows[0] || null;
}

export async function updateSupportRequestStatus(input: {
  id: string;
  status: "approved" | "denied" | "closed";
  resolvedBy: string;
  resolutionNotes?: string | null;
}) {
  const res = await query(
    `UPDATE support_requests
     SET status = $2,
         resolved_by = $3,
         resolved_at = NOW(),
         resolution_notes = $4,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [input.id, input.status, input.resolvedBy, input.resolutionNotes || null]
  );

  return res.rows[0] || null;
}
