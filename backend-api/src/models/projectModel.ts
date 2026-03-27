import { query } from "../config/db";

export interface ProjectRecord {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  status: string;
  is_default: boolean;
  is_internal: boolean;
  onboarding_complete: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectInput {
  workspaceId: string;
  name: string;
  description?: string | null;
  status?: string;
  isDefault?: boolean;
  isInternal?: boolean;
  onboardingComplete?: boolean;
}

export async function findProjectById(id: string) {
  const res = await query(
    `SELECT *
     FROM projects
     WHERE id = $1
     LIMIT 1`,
    [id]
  );

  return res.rows[0] as ProjectRecord | undefined;
}

export async function findProjectsByWorkspace(workspaceId: string) {
  const res = await query(
    `SELECT *
     FROM projects
     WHERE workspace_id = $1
     ORDER BY is_default DESC, created_at DESC`,
    [workspaceId]
  );

  return res.rows as ProjectRecord[];
}

export async function findProjectsByUser(userId: string, workspaceId?: string | null) {
  const params: Array<string | null> = [userId];
  let workspaceClause = "";
  if (workspaceId) {
    params.push(workspaceId);
    workspaceClause = `AND p.workspace_id = $${params.length}`;
  }

  const res = await query(
    `SELECT DISTINCT p.*
     FROM projects p
     WHERE (
       EXISTS (
         SELECT 1
         FROM users u
         WHERE u.id = $1
           AND u.role IN ('super_admin', 'developer')
       )
       OR EXISTS (
         SELECT 1
         FROM project_users pu
         WHERE pu.project_id = p.id
           AND pu.user_id = $1
           AND pu.status = 'active'
       )
       OR EXISTS (
         SELECT 1
         FROM workspaces w
         WHERE w.id = p.workspace_id
           AND w.owner_user_id = $1
       )
     )
     ${workspaceClause}
     ORDER BY p.is_default DESC, p.created_at DESC`,
    params
  );

  return res.rows as ProjectRecord[];
}

export async function findDefaultProjectByWorkspace(workspaceId: string) {
  const res = await query(
    `SELECT *
     FROM projects
     WHERE workspace_id = $1
       AND is_default = true
     ORDER BY created_at ASC
     LIMIT 1`,
    [workspaceId]
  );

  return res.rows[0] as ProjectRecord | undefined;
}

export async function createProject(input: ProjectInput) {
  const res = await query(
    `INSERT INTO projects
       (workspace_id, name, description, status, is_default, is_internal, onboarding_complete)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.workspaceId,
      input.name,
      input.description || null,
      input.status || "active",
      Boolean(input.isDefault),
      Boolean(input.isInternal),
      Boolean(input.onboardingComplete),
    ]
  );

  return res.rows[0] as ProjectRecord;
}

export async function updateProject(id: string, input: Partial<ProjectInput>) {
  const res = await query(
    `UPDATE projects
     SET
       name = COALESCE($1, name),
       description = CASE WHEN $2::text IS NULL THEN description ELSE $2 END,
       status = COALESCE($3, status),
       is_default = COALESCE($4, is_default),
       is_internal = COALESCE($5, is_internal),
       onboarding_complete = COALESCE($6, onboarding_complete),
       updated_at = NOW()
     WHERE id = $7
     RETURNING *`,
    [
      input.name || null,
      input.description === undefined ? null : input.description,
      input.status || null,
      typeof input.isDefault === "boolean" ? input.isDefault : null,
      typeof input.isInternal === "boolean" ? input.isInternal : null,
      typeof input.onboardingComplete === "boolean" ? input.onboardingComplete : null,
      id,
    ]
  );

  return res.rows[0] as ProjectRecord | undefined;
}

export async function deleteProject(id: string) {
  const res = await query(
    `DELETE FROM projects
     WHERE id = $1
     RETURNING *`,
    [id]
  );

  return res.rows[0] as ProjectRecord | undefined;
}
