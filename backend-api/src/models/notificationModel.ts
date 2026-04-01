import { query } from "../config/db";

export type NotificationType = "support_request" | "billing_alert" | string;

export interface NotificationRow {
  id: string;
  user_id: string;
  workspace_id?: string | null;
  type: string;
  message: string;
  is_read: boolean;
  created_at?: string;
  read_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function createNotification(input: {
  userId: string;
  workspaceId?: string | null;
  type: NotificationType;
  message: string;
  metadata?: Record<string, unknown> | null;
}) {
  const res = await query(
    `INSERT INTO notifications
       (user_id, workspace_id, type, message, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING *`,
    [
      input.userId,
      input.workspaceId || null,
      input.type,
      input.message,
      JSON.stringify(input.metadata || {}),
    ]
  );

  return res.rows[0] as NotificationRow;
}

export async function listNotificationsForUser(userId: string, limit = 20) {
  const res = await query(
    `SELECT *
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, Math.max(1, Math.min(50, Number(limit || 20)))]
  );

  return res.rows as NotificationRow[];
}

export async function countUnreadNotificationsForUser(userId: string) {
  const res = await query(
    `SELECT COUNT(*)::int AS total
     FROM notifications
     WHERE user_id = $1
       AND is_read = false`,
    [userId]
  );

  return Number(res.rows[0]?.total || 0);
}

export async function markNotificationAsRead(notificationId: string, userId: string) {
  const res = await query(
    `UPDATE notifications
     SET is_read = true,
         read_at = COALESCE(read_at, NOW())
     WHERE id = $1
       AND user_id = $2
     RETURNING *`,
    [notificationId, userId]
  );

  return res.rows[0] as NotificationRow | undefined;
}

export async function markAllNotificationsAsRead(userId: string) {
  const res = await query(
    `UPDATE notifications
     SET is_read = true,
         read_at = COALESCE(read_at, NOW())
     WHERE user_id = $1
       AND is_read = false
     RETURNING *`,
    [userId]
  );

  return res.rows as NotificationRow[];
}

