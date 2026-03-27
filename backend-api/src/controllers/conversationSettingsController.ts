import { NextFunction, Response } from "express";

import { AuthRequest } from "../middleware/authMiddleware";
import {
  getConversationSettingsService,
  updateConversationSettingsService,
} from "../services/conversationSettingsService";

function getUserId(req: AuthRequest) {
  return req.user?.id || req.user?.user_id || null;
}

export async function getConversationSettingsCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    const workspaceId = req.params.workspaceId;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!workspaceId) {
      return res.status(400).json({ error: "Workspace id is required" });
    }

    const data = await getConversationSettingsService(workspaceId, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function updateConversationSettingsCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    const workspaceId = req.params.workspaceId;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!workspaceId) {
      return res.status(400).json({ error: "Workspace id is required" });
    }

    const data = await updateConversationSettingsService(workspaceId, userId, req.body || {});
    res.json(data);
  } catch (err) {
    next(err);
  }
}
