import { NextFunction, Response } from "express";

import { AuthRequest } from "../middleware/authMiddleware";
import {
  deleteLeadService,
  getLeadService,
  listLeadListsService,
  listLeadsService,
} from "../services/leadService";

function getUserId(req: AuthRequest) {
  return req.user?.id || req.user?.user_id || null;
}

export async function listLeadsCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await listLeadsService(userId, req.query);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getLeadCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    const id = req.params.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!id) {
      return res.status(400).json({ error: "Lead id is required" });
    }

    const data = await getLeadService(id, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function listLeadListsCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const campaignId =
      typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
    const workspaceId =
      typeof req.query.workspaceId === "string"
        ? req.query.workspaceId
        : typeof req.headers["x-workspace-id"] === "string"
          ? req.headers["x-workspace-id"]
          : undefined;
    const projectId =
      typeof req.query.projectId === "string"
        ? req.query.projectId
        : typeof req.headers["x-project-id"] === "string"
          ? req.headers["x-project-id"]
          : undefined;
    const data = await listLeadListsService(userId, campaignId, workspaceId, projectId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function deleteLeadCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    const id = req.params.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!id) {
      return res.status(400).json({ error: "Lead id is required" });
    }

    await deleteLeadService(id, userId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
