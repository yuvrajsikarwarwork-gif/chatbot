import { query } from "../config/db";

interface PlatformAccountInput {
  userId: string;
  workspaceId?: string | null;
  projectId?: string | null;
  platformType: string;
  name: string;
  phoneNumber?: string | null;
  accountId?: string | null;
  token?: string | null;
  businessId?: string | null;
  status?: string;
  metadata?: Record<string, unknown>;
}

export async function findPlatformAccountsByUser(
  userId: string,
  platformType?: string,
  workspaceId?: string | null,
  projectId?: string | null
) {
  const params: any[] = [userId];
  let where = `WHERE (
    user_id = $1
    OR (
      workspace_id IS NOT NULL
      AND workspace_id IN (
        SELECT workspace_id
        FROM workspace_memberships
        WHERE user_id = $1
          AND status = 'active'
      )
    )
  )`;

  if (platformType) {
    params.push(platformType);
    where += ` AND platform_type = $${params.length}`;
  }

  if (workspaceId) {
    params.push(workspaceId);
    where += ` AND workspace_id = $${params.length}`;
  }

  if (projectId) {
    params.push(projectId);
    where += ` AND project_id = $${params.length}`;
  }

  const res = await query(
    `SELECT *
     FROM platform_accounts
     ${where}
     ORDER BY created_at DESC`,
    params
  );

  return res.rows;
}

export async function findPlatformAccountById(id: string, userId: string) {
  const res = await query(
    `SELECT *
     FROM platform_accounts
     WHERE id = $1
       AND (
         user_id = $2
         OR (
           workspace_id IS NOT NULL
           AND workspace_id IN (
             SELECT workspace_id
             FROM workspace_memberships
             WHERE user_id = $2
               AND status = 'active'
           )
         )
       )`,
    [id, userId]
  );

  return res.rows[0];
}

export async function findPlatformAccountByExternalId(
  userId: string,
  platformType: string,
  accountId: string
) {
  const res = await query(
    `SELECT *
     FROM platform_accounts
     WHERE user_id = $1
       AND platform_type = $2
       AND account_id = $3
     LIMIT 1`,
    [userId, platformType, accountId]
  );

  return res.rows[0];
}

export async function findPlatformAccountsByWorkspaceProject(
  workspaceId: string,
  projectId?: string | null,
  platformType?: string
) {
  const params: Array<string | null> = [workspaceId];
  const clauses = ["workspace_id = $1"];

  if (projectId) {
    params.push(projectId);
    clauses.push(`project_id = $${params.length}`);
  }

  if (platformType) {
    params.push(platformType);
    clauses.push(`platform_type = $${params.length}`);
  }

  const res = await query(
    `SELECT *
     FROM platform_accounts
     WHERE ${clauses.join(" AND ")}
     ORDER BY created_at DESC`,
    params
  );

  return res.rows;
}

export async function createPlatformAccount(input: PlatformAccountInput) {
  const res = await query(
    `INSERT INTO platform_accounts
       (user_id, workspace_id, project_id, platform_type, name, phone_number, account_id, token, business_id, status, metadata)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
     RETURNING *`,
    [
      input.userId,
      input.workspaceId || null,
      input.projectId || null,
      input.platformType,
      input.name,
      input.phoneNumber || null,
      input.accountId || null,
      input.token || null,
      input.businessId || null,
      input.status || "active",
      JSON.stringify(input.metadata || {}),
    ]
  );

  return res.rows[0];
}

export async function updatePlatformAccount(
  id: string,
  _userId: string,
  input: Partial<PlatformAccountInput>
) {
  const res = await query(
    `UPDATE platform_accounts
     SET
       workspace_id = COALESCE($1, workspace_id),
       project_id = COALESCE($2, project_id),
       platform_type = COALESCE($3, platform_type),
       name = COALESCE($4, name),
       phone_number = COALESCE($5, phone_number),
       account_id = COALESCE($6, account_id),
       token = COALESCE($7, token),
       business_id = COALESCE($8, business_id),
       status = COALESCE($9, status),
       metadata = CASE WHEN $10::jsonb IS NULL THEN metadata ELSE $10::jsonb END,
       updated_at = NOW()
     WHERE id = $11
     RETURNING *`,
    [
      input.workspaceId || null,
      input.projectId || null,
      input.platformType || null,
      input.name || null,
      input.phoneNumber || null,
      input.accountId || null,
      input.token || null,
      input.businessId || null,
      input.status || null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      id,
    ]
  );

  return res.rows[0];
}

export async function updatePlatformAccountByWorkspaceProject(
  id: string,
  workspaceId: string,
  projectId: string,
  input: Partial<PlatformAccountInput>
) {
  const res = await query(
    `UPDATE platform_accounts
     SET
       name = COALESCE($1, name),
       phone_number = COALESCE($2, phone_number),
       account_id = COALESCE($3, account_id),
       token = COALESCE($4, token),
       business_id = COALESCE($5, business_id),
       status = COALESCE($6, status),
       metadata = CASE WHEN $7::jsonb IS NULL THEN metadata ELSE $7::jsonb END,
       updated_at = NOW()
     WHERE id = $8
       AND workspace_id = $9
       AND project_id = $10
     RETURNING *`,
    [
      input.name || null,
      input.phoneNumber || null,
      input.accountId || null,
      input.token || null,
      input.businessId || null,
      input.status || null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      id,
      workspaceId,
      projectId,
    ]
  );

  return res.rows[0];
}

export async function deletePlatformAccount(id: string, _userId: string) {
  await query(
    `DELETE FROM platform_accounts
     WHERE id = $1`,
    [id]
  );
}
