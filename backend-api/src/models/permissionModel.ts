import { query } from "../config/db";

export async function listRolePermissions(role: string) {
  const res = await query(
    `SELECT permission_key, allowed
     FROM role_permissions
     WHERE role = $1`,
    [role]
  );

  return res.rows;
}

export async function listUserPermissions(userId: string, workspaceId?: string | null) {
  const params: Array<string | null> = [userId];
  let workspaceClause = "AND workspace_id IS NULL";
  if (workspaceId) {
    params.push(workspaceId);
    workspaceClause = `AND (workspace_id = $${params.length} OR workspace_id IS NULL)`;
  }

  const res = await query(
    `SELECT permission_key, allowed, workspace_id
     FROM user_permissions
     WHERE user_id = $1
       ${workspaceClause}
     ORDER BY workspace_id DESC NULLS LAST`,
    params
  );

  return res.rows;
}

export async function upsertUserPermission(input: {
  userId: string;
  workspaceId?: string | null;
  permissionKey: string;
  allowed: boolean;
}) {
  const res = await query(
    `INSERT INTO user_permissions (user_id, workspace_id, permission_key, allowed)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT ((user_id), (COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid)), (permission_key))
     DO UPDATE SET
       allowed = EXCLUDED.allowed,
       updated_at = NOW()
     RETURNING *`,
    [input.userId, input.workspaceId || null, input.permissionKey, input.allowed]
  );

  return res.rows[0];
}

export async function replaceWorkspaceUserPermissions(
  userId: string,
  workspaceId: string,
  permissionMap: Record<string, boolean>
) {
  await query(
    `DELETE FROM user_permissions
     WHERE user_id = $1
       AND workspace_id = $2`,
    [userId, workspaceId]
  );

  for (const [permissionKey, allowed] of Object.entries(permissionMap)) {
    await query(
      `INSERT INTO user_permissions (user_id, workspace_id, permission_key, allowed)
       VALUES ($1, $2, $3, $4)`,
      [userId, workspaceId, permissionKey, allowed]
    );
  }
}

export async function replaceRolePermissions(role: string, permissionMap: Record<string, boolean>) {
  await query(`DELETE FROM role_permissions WHERE role = $1`, [role]);
  const entries = Object.entries(permissionMap);
  for (const [permissionKey, allowed] of entries) {
    await query(
      `INSERT INTO role_permissions (role, permission_key, allowed)
       VALUES ($1, $2, $3)`,
      [role, permissionKey, allowed]
    );
  }
}
