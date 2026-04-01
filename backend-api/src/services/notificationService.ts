import { query } from "../config/db";
import {
  countUnreadNotificationsForUser,
  createNotification,
  listNotificationsForUser,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "../models/notificationModel";

export async function notifyPlatformOperators(input: {
  workspaceId?: string | null;
  type: string;
  message: string;
  metadata?: Record<string, unknown> | null;
}) {
  const res = await query(
    `SELECT id
     FROM users
     WHERE role IN ('super_admin', 'developer')`
  );

  const userIds = (res.rows || [])
    .map((row: any) => String(row?.id || "").trim())
    .filter(Boolean);

  return Promise.all(
    userIds.map((userId) =>
      createNotification({
        userId,
        workspaceId: input.workspaceId || null,
        type: input.type,
        message: input.message,
        metadata: input.metadata || null,
      })
    )
  );
}

export async function listNotificationsForCurrentUser(userId: string, limit?: number) {
  try {
    const [notifications, unreadCount] = await Promise.all([
      listNotificationsForUser(userId, limit),
      countUnreadNotificationsForUser(userId),
    ]);

    return {
      notifications,
      unreadCount,
    };
  } catch (error: any) {
    const code = String(error?.code || "");
    if (code === "42P01" || code === "42703") {
      return {
        notifications: [],
        unreadCount: 0,
      };
    }

    throw error;
  }
}

export async function markNotificationReadForCurrentUser(notificationId: string, userId: string) {
  return markNotificationAsRead(notificationId, userId);
}

export async function markAllNotificationsReadForCurrentUser(userId: string) {
  return markAllNotificationsAsRead(userId);
}
