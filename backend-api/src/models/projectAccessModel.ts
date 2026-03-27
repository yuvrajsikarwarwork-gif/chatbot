import { query } from "../config/db";

export interface ProjectAccessRecord {
  id: string;
  workspace_id: string;
  user_id: string;
  project_id: string;
  role: string;
  is_all_projects: boolean;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectAccessInput {
  workspaceId: string;
  userId: string;
  projectId: string;
  role: string;
  isAllProjects?: boolean;
  status?: string;
  createdBy?: string | null;
}

export async function findProjectAccessByUserAndProject(userId: string, projectId: string) {
  const res = await query(
    `SELECT *
     FROM project_users
     WHERE user_id = $1
       AND project_id = $2
     LIMIT 1`,
    [userId, projectId]
  );

  return res.rows[0] as ProjectAccessRecord | undefined;
}

export async function findProjectAccessesByUser(userId: string, workspaceId?: string | null) {
  const params: Array<string | null> = [userId];
  let workspaceClause = "";
  if (workspaceId) {
    params.push(workspaceId);
    workspaceClause = `AND pu.workspace_id = $${params.length}`;
  }

  const res = await query(
    `SELECT pu.*, p.name AS project_name, p.is_default
     FROM project_users pu
     JOIN projects p ON p.id = pu.project_id
     WHERE pu.user_id = $1
       AND pu.status = 'active'
       ${workspaceClause}
     ORDER BY p.is_default DESC, pu.created_at DESC`,
    params
  );

  return res.rows;
}

export async function findWorkspaceProjectAccesses(workspaceId: string, userId?: string | null) {
  const params: Array<string | null> = [workspaceId];
  let userClause = "";
  if (userId) {
    params.push(userId);
    userClause = `AND pu.user_id = $${params.length}`;
  }

  const res = await query(
    `SELECT pu.*, u.name AS user_name, u.email AS user_email, p.name AS project_name
     FROM project_users pu
     JOIN users u ON u.id = pu.user_id
     JOIN projects p ON p.id = pu.project_id
     WHERE pu.workspace_id = $1
       ${userClause}
     ORDER BY pu.created_at DESC`,
    params
  );

  return res.rows as ProjectAccessRecord[];
}

export async function upsertProjectAccess(input: ProjectAccessInput) {
  const normalizedRole =
    input.role === "workspace_owner" || input.role === "admin"
      ? "project_admin"
      : input.role === "user"
        ? "editor"
        : input.role;

  const res = await query(
    `INSERT INTO project_users
       (workspace_id, user_id, project_id, role, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (project_id, user_id)
     DO UPDATE SET
       role = EXCLUDED.role,
       status = EXCLUDED.status,
       updated_at = NOW()
     RETURNING *`,
    [
      input.workspaceId,
      input.userId,
      input.projectId,
      normalizedRole,
      input.status || "active",
      input.createdBy || null,
    ]
  );

  // Keep legacy table in sync while remaining code paths migrate.
  await query(
    `INSERT INTO user_project_access
       (workspace_id, user_id, project_id, role, is_all_projects, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, project_id)
     DO UPDATE SET
       role = EXCLUDED.role,
       is_all_projects = EXCLUDED.is_all_projects,
       status = EXCLUDED.status,
       updated_at = NOW()`,
    [
      input.workspaceId,
      input.userId,
      input.projectId,
      normalizedRole,
      Boolean(input.isAllProjects),
      input.status || "active",
      input.createdBy || null,
    ]
  );

  return res.rows[0] as ProjectAccessRecord;
}

export async function deleteProjectAccess(workspaceId: string, userId: string, projectId: string) {
  const res = await query(
    `DELETE FROM project_users
     WHERE workspace_id = $1
       AND user_id = $2
       AND project_id = $3
     RETURNING *`,
    [workspaceId, userId, projectId]
  );

  await query(
    `DELETE FROM user_project_access
     WHERE workspace_id = $1
       AND user_id = $2
       AND project_id = $3`,
    [workspaceId, userId, projectId]
  );

  return res.rows[0] as ProjectAccessRecord | undefined;
}
