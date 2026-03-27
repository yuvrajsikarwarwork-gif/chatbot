import { query } from "../config/db";

interface WorkspaceInput {
  name: string;
  ownerUserId: string;
  planId?: string | null;
  status?: string;
  lockReason?: string | null;
}

const WORKSPACE_SELECT_BASE = `SELECT
       w.*,
       s.id AS subscription_id,
       s.status AS subscription_status,
       s.expiry_date,
       s.grace_period_end,
       s.billing_cycle,
       s.currency,
       s.price_amount,
       s.auto_renew,
       p.name AS subscription_plan_name,
       COALESCE(campaign_counts.campaign_count, 0) AS campaign_count,
       COALESCE(account_counts.platform_account_count, 0) AS platform_account_count
     FROM workspaces
     w
     LEFT JOIN LATERAL (
       SELECT *
       FROM subscriptions s
       WHERE s.workspace_id = w.id
       ORDER BY s.created_at DESC
       LIMIT 1
     ) s ON true
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS campaign_count
       FROM campaigns c
       WHERE c.workspace_id = w.id
     ) campaign_counts ON true
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS platform_account_count
       FROM platform_accounts pa
       WHERE pa.workspace_id = w.id
     ) account_counts ON true
     LEFT JOIN plans p ON p.id = s.plan_id`;

const WORKSPACE_SELECT_PLAN_LIMITS = `,
       p.max_campaigns,
       p.max_numbers,
       p.max_users,
       p.max_projects,
       p.max_integrations,
       p.max_bots`;

const WORKSPACE_SELECT_LEGACY = `SELECT
       w.*,
       NULL::text AS subscription_id,
       NULL::text AS subscription_status,
       NULL::timestamptz AS expiry_date,
       NULL::timestamptz AS grace_period_end,
       NULL::text AS billing_cycle,
       NULL::text AS currency,
       NULL::numeric AS price_amount,
       NULL::boolean AS auto_renew,
       NULL::text AS subscription_plan_name,
       0::int AS campaign_count,
       0::int AS platform_account_count,
       NULL::int AS max_campaigns,
       NULL::int AS max_numbers,
       NULL::int AS max_users,
       NULL::int AS max_projects,
       NULL::int AS max_integrations,
       NULL::int AS max_bots
     FROM workspaces w`;

function isRecoverableWorkspaceQueryError(err: any) {
  return ["42703", "42P01", "42704"].includes(String(err?.code || ""));
}

async function queryWorkspacesWithFallback(whereClause: string, params: any[]) {
  const variants = [
    `${WORKSPACE_SELECT_BASE}
     ${WORKSPACE_SELECT_PLAN_LIMITS}
     ${whereClause}`,
    `${WORKSPACE_SELECT_BASE}
     ${whereClause}`,
    `${WORKSPACE_SELECT_LEGACY}
     ${whereClause}`,
  ];

  let lastError: any = null;

  for (const sql of variants) {
    try {
      return await query(sql, params);
    } catch (err: any) {
      lastError = err;
      if (!isRecoverableWorkspaceQueryError(err)) {
        throw err;
      }
    }
  }

  throw lastError;
}

export async function findWorkspacesByUser(userId: string) {
  const res = await queryWorkspacesWithFallback(
    `WHERE EXISTS (
         SELECT 1
         FROM users u
         WHERE u.id = $1
            AND u.role IN ('super_admin', 'developer')
        )
        OR w.owner_user_id = $1
        OR w.id IN (
          SELECT workspace_id
          FROM workspace_memberships
          WHERE user_id = $1
            AND status = 'active'
        )
        OR w.id IN (
          SELECT workspace_id
          FROM users
          WHERE id = $1
        )
     ORDER BY w.created_at DESC`,
    [userId]
  );

  return res.rows;
}

export async function findWorkspaceById(id: string, userId: string) {
  const res = await queryWorkspacesWithFallback(
    `WHERE w.id = $1
       AND (
         EXISTS (
           SELECT 1
           FROM users u
           WHERE u.id = $2
             AND u.role IN ('super_admin', 'developer')
         )
         OR
         w.owner_user_id = $2
         OR w.id IN (
           SELECT workspace_id
           FROM workspace_memberships
           WHERE user_id = $2
             AND status = 'active'
         )
         OR w.id IN (
           SELECT workspace_id
           FROM users
           WHERE id = $2
         )
       )`,
    [id, userId]
  );

  return res.rows[0];
}

export async function createWorkspace(input: WorkspaceInput) {
  const res = await query(
    `INSERT INTO workspaces
       (name, owner_user_id, plan_id, status)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [
      input.name,
      input.ownerUserId,
      input.planId || "starter",
      input.status || "active",
    ]
  );

  return res.rows[0];
}

export async function updateWorkspace(
  id: string,
  _userId: string,
  input: Partial<WorkspaceInput>
) {
  const res = await query(
    `UPDATE workspaces
     SET
       name = COALESCE($1, name),
       plan_id = COALESCE($2, plan_id),
       status = COALESCE($3, status),
       lock_reason = CASE WHEN $4::text IS NULL THEN lock_reason ELSE $4 END,
       locked_at = CASE
         WHEN COALESCE($3, status) = 'locked' THEN COALESCE(locked_at, NOW())
         WHEN COALESCE($3, status) <> 'locked' THEN NULL
         ELSE locked_at
       END,
       updated_at = NOW()
     WHERE id = $5
     RETURNING *`,
    [
      input.name || null,
      input.planId || null,
      input.status || null,
      input.lockReason === undefined ? null : input.lockReason,
      id,
    ]
  );

  return res.rows[0];
}

export async function deleteWorkspace(id: string) {
  const res = await query(
    `DELETE FROM workspaces
     WHERE id = $1
     RETURNING *`,
    [id]
  );

  return res.rows[0];
}
