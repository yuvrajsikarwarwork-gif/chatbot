import { NextFunction, Response } from "express";

import { AuthRequest } from "../middleware/authMiddleware";
import {
  listNotificationsForCurrentUser,
  markAllNotificationsReadForCurrentUser,
  markNotificationReadForCurrentUser,
} from "../services/notificationService";

function getUserId(req: AuthRequest) {
  return req.user?.id || req.user?.user_id || null;
}

export async function listNotificationsCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const limit = Number(req.query.limit || 20);
    const data = await listNotificationsForCurrentUser(userId, limit);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function markNotificationReadCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const notificationId = String(req.params.id || "").trim();
    if (!notificationId) {
      return res.status(400).json({ error: "Notification id is required" });
    }

    const notification = await markNotificationReadForCurrentUser(notificationId, userId);
    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json(notification);
  } catch (err) {
    next(err);
  }
}

export async function markAllNotificationsReadCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const notifications = await markAllNotificationsReadForCurrentUser(userId);
    res.json({ success: true, notifications });
  } catch (err) {
    next(err);
  }
}

