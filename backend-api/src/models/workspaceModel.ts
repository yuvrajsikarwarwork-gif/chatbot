import { query } from "../config/db";

interface WorkspaceInput {
  name: string;
  ownerUserId: string;
  planId?: string | null;
  status?: string;
  lockReason?: string | null;
  adminNotes?: string | null;
  agentSeatLimitOverride?: number | null;
  projectLimitOverride?: number | null;
  activeBotLimitOverride?: number | null;
  monthlyCampaignLimitOverride?: number | null;
  maxNumbersOverride?: number | null;
  aiReplyLimitOverride?: number | null;
  archivedAt?: string | null;
  deletedAt?: string | null;
  purgeAfter?: string | null;
}

const WORKSPACE_SELECT_BASE = `SELECT DISTINCT ON (w.id)
       w.*,
       bs.id::text AS subscription_id,
       bs.status AS subscription_status,
       bs.current_period_end AS expiry_date,
       NULL::timestamptz AS grace_period_end,
       bs.billing_cycle AS billing_cycle,
       bs.currency AS currency,
       bs.base_price_amount AS price_amount,
       (bs.canceled_at IS NULL) AS auto_renew,
       COALESCE(bs.plan_id, w.plan_id) AS effective_plan_id,
       p.name AS subscription_plan_name,
       bs.seat_quantity,
       bs.included_seat_limit,
       bs.extra_seat_quantity,
       bs.extra_seat_unit_price,
       bs.ai_reply_limit,
       bs.ai_overage_unit_price,
       bs.wallet_auto_topup_enabled,
       bs.wallet_auto_topup_amount,
       bs.wallet_low_balance_threshold,
       bs.external_customer_ref,
       bs.external_subscription_ref,
       bs.current_period_start,
       bs.current_period_end,
       bs.trial_ends_at,
       bs.canceled_at,
       bs.metadata AS billing_metadata,
       COALESCE(campaign_counts.campaign_count, 0) AS campaign_count,
       COALESCE(account_counts.platform_account_count, 0) AS platform_account_count
     FROM workspaces
     w
     LEFT JOIN LATERAL (
       SELECT *
       FROM billing_subscriptions bs
       WHERE bs.workspace_id = w.id
       ORDER BY bs.created_at DESC
       LIMIT 1
     ) bs ON true
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
     LEFT JOIN plans p ON p.id = COALESCE(bs.plan_id, w.plan_id)`;

const WORKSPACE_SELECT_PLAN_LIMITS = `,
       p.max_campaigns,
       p.max_numbers,
       p.max_users,
       p.max_projects,
       p.max_integrations,
       p.max_bots`;

const WORKSPACE_SELECT_LEGACY = `SELECT DISTINCT ON (w.id)
       w.*,
       NULL::text AS subscription_id,
       NULL::text AS subscription_status,
       NULL::timestamptz AS expiry_date,
       NULL::timestamptz AS grace_period_end,
       NULL::text AS billing_cycle,
       NULL::text AS currency,
       NULL::numeric AS price_amount,
       NULL::boolean AS auto_renew,
       w.plan_id AS effective_plan_id,
       NULL::text AS subscription_plan_name,
       NULL::int AS seat_quantity,
       NULL::int AS included_seat_limit,
       NULL::int AS extra_seat_quantity,
       NULL::numeric AS extra_seat_unit_price,
       NULL::int AS ai_reply_limit,
       NULL::numeric AS ai_overage_unit_price,
       NULL::boolean AS wallet_auto_topup_enabled,
       NULL::numeric AS wallet_auto_topup_amount,
       NULL::numeric AS wallet_low_balance_threshold,
       NULL::text AS external_customer_ref,
       NULL::text AS external_subscription_ref,
       NULL::timestamptz AS current_period_start,
       NULL::timestamptz AS current_period_end,
       NULL::timestamptz AS trial_ends_at,
       NULL::timestamptz AS canceled_at,
       '{}'::jsonb AS billing_metadata,
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
    `WHERE (
         EXISTS (
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
       )
       AND w.deleted_at IS NULL
     ORDER BY w.id, w.created_at DESC`,
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
       admin_notes = CASE WHEN $5 THEN $6 ELSE admin_notes END,
       locked_at = CASE
         WHEN COALESCE($3, status) = 'locked' THEN COALESCE(locked_at, NOW())
         WHEN COALESCE($3, status) <> 'locked' THEN NULL
         ELSE locked_at
       END,
       agent_seat_limit_override = CASE WHEN $7 THEN $8 ELSE agent_seat_limit_override END,
       project_limit_override = CASE WHEN $9 THEN $10 ELSE project_limit_override END,
       active_bot_limit_override = CASE WHEN $11 THEN $12 ELSE active_bot_limit_override END,
       monthly_campaign_limit_override = CASE WHEN $13 THEN $14 ELSE monthly_campaign_limit_override END,
       max_numbers_override = CASE WHEN $15 THEN $16 ELSE max_numbers_override END,
       ai_reply_limit_override = CASE WHEN $17 THEN $18 ELSE ai_reply_limit_override END,
       archived_at = CASE WHEN $19 THEN $20 ELSE archived_at END,
       deleted_at = CASE WHEN $21 THEN $22 ELSE deleted_at END,
       purge_after = CASE WHEN $23 THEN $24 ELSE purge_after END,
        updated_at = NOW()
     WHERE id = $25
     RETURNING *`,
    [
      input.name || null,
      input.planId || null,
      input.status || null,
      input.lockReason === undefined ? null : input.lockReason,
      input.adminNotes !== undefined,
      input.adminNotes ?? null,
      input.agentSeatLimitOverride !== undefined,
      input.agentSeatLimitOverride ?? null,
      input.projectLimitOverride !== undefined,
      input.projectLimitOverride ?? null,
      input.activeBotLimitOverride !== undefined,
      input.activeBotLimitOverride ?? null,
      input.monthlyCampaignLimitOverride !== undefined,
      input.monthlyCampaignLimitOverride ?? null,
      input.maxNumbersOverride !== undefined,
      input.maxNumbersOverride ?? null,
      input.aiReplyLimitOverride !== undefined,
      input.aiReplyLimitOverride ?? null,
      input.archivedAt !== undefined,
      input.archivedAt ?? null,
      input.deletedAt !== undefined,
      input.deletedAt ?? null,
      input.purgeAfter !== undefined,
      input.purgeAfter ?? null,
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
