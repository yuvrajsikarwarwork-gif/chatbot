import { query } from "../config/db";

export async function findBotsByUser(userId: string) {
  const res = await query(
    "SELECT * FROM bots WHERE user_id = $1 ORDER BY status = 'active' DESC, created_at DESC",
    [userId]
  );
  return res.rows;
}

export async function findBotsByWorkspaceProject(
  workspaceId: string,
  projectId?: string | null
) {
  const params: Array<string | null> = [workspaceId];
  let projectClause = "";

  if (projectId) {
    params.push(projectId);
    projectClause = ` AND project_id = $${params.length}`;
  }

  const res = await query(
    `SELECT *
     FROM bots
     WHERE workspace_id = $1${projectClause}
     ORDER BY status = 'active' DESC, created_at DESC`,
    params
  );
  return res.rows;
}

export async function findBotById(id: string) {
  const res = await query("SELECT * FROM bots WHERE id = $1", [id]);
  return res.rows[0];
}

export async function findBotByIdAndProject(id: string, projectId: string) {
  const res = await query("SELECT * FROM bots WHERE id = $1 AND project_id = $2", [
    id,
    projectId,
  ]);
  return res.rows[0];
}

export async function createBot(userId: string, name: string) {
  const res = await query(
    "INSERT INTO bots (user_id, name, status) VALUES ($1, $2, 'inactive') RETURNING *",
    [userId, name]
  );
  return res.rows[0];
}

export async function createScopedBot(input: {
  userId: string;
  name: string;
  triggerKeywords?: string | null;
  workspaceId?: string | null;
  projectId?: string | null;
}) {
  const res = await query(
    `INSERT INTO bots (user_id, workspace_id, project_id, name, trigger_keywords, status)
     VALUES ($1, $2, $3, $4, $5, 'inactive')
     RETURNING *`,
    [
      input.userId,
      input.workspaceId || null,
      input.projectId || null,
      input.name,
      input.triggerKeywords || "",
    ]
  );
  return res.rows[0];
}

export async function updateBot(
  id: string,
  userId: string,
  data: {
    name?: string;
    trigger_keywords?: string;
    status?: string;
    workspace_id?: string | null;
    project_id?: string | null;
  }
) {
  const res = await query(
    `
    UPDATE bots
    SET
      name = CASE WHEN $1::text IS NOT NULL THEN $1 ELSE name END,
      trigger_keywords = CASE WHEN $2::text IS NOT NULL THEN $2 ELSE trigger_keywords END,
      status = CASE WHEN $3::text IS NOT NULL THEN $3 ELSE status END,
      workspace_id = CASE WHEN $6::boolean THEN $4 ELSE workspace_id END,
      project_id = CASE WHEN $7::boolean THEN $5 ELSE project_id END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $8 AND user_id = $9
    RETURNING *
    `,
    [
      data.name !== undefined ? data.name : null,
      data.trigger_keywords !== undefined ? data.trigger_keywords : null,
      data.status !== undefined ? data.status : null,
      data.workspace_id !== undefined ? data.workspace_id : null,
      data.project_id !== undefined ? data.project_id : null,
      data.workspace_id !== undefined,
      data.project_id !== undefined,
      id,
      userId,
    ]
  );
  return res.rows[0];
}

export async function updateWorkspaceBot(
  id: string,
  data: {
    name?: string;
    trigger_keywords?: string;
    status?: string;
    workspace_id?: string | null;
    project_id?: string | null;
  }
) {
  const res = await query(
    `
    UPDATE bots
    SET
      name = CASE WHEN $1::text IS NOT NULL THEN $1 ELSE name END,
      trigger_keywords = CASE WHEN $2::text IS NOT NULL THEN $2 ELSE trigger_keywords END,
      status = CASE WHEN $3::text IS NOT NULL THEN $3 ELSE status END,
      workspace_id = CASE WHEN $6::boolean THEN $4 ELSE workspace_id END,
      project_id = CASE WHEN $7::boolean THEN $5 ELSE project_id END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $8
    RETURNING *
    `,
    [
      data.name !== undefined ? data.name : null,
      data.trigger_keywords !== undefined ? data.trigger_keywords : null,
      data.status !== undefined ? data.status : null,
      data.workspace_id !== undefined ? data.workspace_id : null,
      data.project_id !== undefined ? data.project_id : null,
      data.workspace_id !== undefined,
      data.project_id !== undefined,
      id,
    ]
  );
  return res.rows[0];
}

export async function deleteBot(id: string, userId: string) {
  await query("DELETE FROM bots WHERE id = $1 AND user_id = $2", [id, userId]);
}

export async function deleteWorkspaceBot(id: string) {
  await query("DELETE FROM bots WHERE id = $1", [id]);
}
