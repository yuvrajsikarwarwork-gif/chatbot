import { query } from "../config/db";

export async function findPlans() {
  const res = await query(
    `SELECT *
     FROM plans
     WHERE status = 'active'
     ORDER BY monthly_price_inr ASC`
  );

  return res.rows;
}

export async function findPlanById(id: string) {
  const res = await query(
    `SELECT *
     FROM plans
     WHERE id = $1
     LIMIT 1`,
    [id]
  );

  return res.rows[0];
}

export async function findActiveSubscriptionByWorkspace(workspaceId: string) {
  const res = await query(
    `SELECT s.*, p.name AS plan_name, p.max_campaigns, p.max_numbers, p.allowed_platforms, p.features
     FROM subscriptions s
     JOIN plans p ON p.id = s.plan_id
     WHERE s.workspace_id = $1
       AND s.status IN ('active', 'trialing', 'overdue')
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [workspaceId]
  );

  return res.rows[0];
}

export async function findLatestSubscriptionByWorkspace(workspaceId: string) {
  const res = await query(
    `SELECT s.*, p.name AS plan_name, p.max_campaigns, p.max_numbers, p.allowed_platforms, p.features
     FROM subscriptions s
     JOIN plans p ON p.id = s.plan_id
     WHERE s.workspace_id = $1
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [workspaceId]
  );

  return res.rows[0];
}
