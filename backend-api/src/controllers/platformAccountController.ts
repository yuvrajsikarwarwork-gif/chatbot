import { NextFunction, Response } from "express";

import { AuthRequest } from "../middleware/authMiddleware";
import {
  createPlatformAccountService,
  deletePlatformAccountService,
  listPlatformAccountsService,
  updatePlatformAccountService,
} from "../services/platformAccountService";

function getUserId(req: AuthRequest) {
  return req.user?.id || req.user?.user_id || null;
}

export async function listPlatformAccountsCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await listPlatformAccountsService(
      userId,
      typeof req.query.platformType === "string" ? req.query.platformType : undefined,
      typeof req.query.workspaceId === "string"
        ? req.query.workspaceId
        : typeof req.headers["x-workspace-id"] === "string"
          ? req.headers["x-workspace-id"]
          : undefined,
      typeof req.query.projectId === "string"
        ? req.query.projectId
        : typeof req.headers["x-project-id"] === "string"
          ? req.headers["x-project-id"]
          : undefined
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function createPlatformAccountCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await createPlatformAccountService(userId, req.body);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

export async function updatePlatformAccountCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    const id = req.params.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!id) {
      return res.status(400).json({ error: "Platform account id is required" });
    }

    const data = await updatePlatformAccountService(id, userId, req.body);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function deletePlatformAccountCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    const id = req.params.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!id) {
      return res.status(400).json({ error: "Platform account id is required" });
    }

    await deletePlatformAccountService(id, userId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
