import { query } from "../config/db";

interface SubscriptionUpdateInput {
  status?: string | null;
  billingCycle?: string | null;
  currency?: string | null;
  priceAmount?: number | null;
  expiryDate?: string | null;
  gracePeriodEnd?: string | null;
  autoRenew?: boolean | null;
  reminderLastSentAt?: string | null;
  lockAt?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function updateLatestWorkspaceSubscription(
  workspaceId: string,
  input: SubscriptionUpdateInput
) {
  const res = await query(
    `UPDATE subscriptions s
     SET
       status = COALESCE($1, s.status),
       billing_cycle = COALESCE($2, s.billing_cycle),
       currency = COALESCE($3, s.currency),
       price_amount = COALESCE($4, s.price_amount),
       expiry_date = COALESCE($5, s.expiry_date),
       grace_period_end = COALESCE($6, s.grace_period_end),
       auto_renew = COALESCE($7, s.auto_renew),
       reminder_last_sent_at = COALESCE($8, s.reminder_last_sent_at),
       lock_at = COALESCE($9, s.lock_at),
       metadata = CASE WHEN $10::jsonb IS NULL THEN s.metadata ELSE $10::jsonb END,
       updated_at = NOW()
     WHERE s.id = (
       SELECT id
       FROM subscriptions
       WHERE workspace_id = $11
       ORDER BY created_at DESC
       LIMIT 1
     )
     RETURNING *`,
    [
      input.status || null,
      input.billingCycle || null,
      input.currency || null,
      input.priceAmount ?? null,
      input.expiryDate || null,
      input.gracePeriodEnd || null,
      typeof input.autoRenew === "boolean" ? input.autoRenew : null,
      input.reminderLastSentAt || null,
      input.lockAt || null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      workspaceId,
    ]
  );

  return res.rows[0];
}
