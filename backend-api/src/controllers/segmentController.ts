import { NextFunction, Response } from "express";

import { AuthRequest } from "../middleware/authMiddleware";
import { listSegmentLibraryService } from "../services/segmentLibraryService";

function getUserId(req: AuthRequest) {
  return req.user?.id || req.user?.user_id || null;
}

export async function listSegmentLibraryCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const filters: {
      workspaceId?: string;
      projectId?: string;
      sourceType?: string;
      campaignId?: string;
    } = {};

    if (typeof req.query.workspaceId === "string") filters.workspaceId = req.query.workspaceId;
    if (typeof req.query.projectId === "string") filters.projectId = req.query.projectId;
    if (typeof req.query.sourceType === "string") filters.sourceType = req.query.sourceType;
    if (typeof req.query.campaignId === "string") filters.campaignId = req.query.campaignId;

    const data = await listSegmentLibraryService(userId, filters);
    res.json(data);
  } catch (err) {
    next(err);
  }
}
