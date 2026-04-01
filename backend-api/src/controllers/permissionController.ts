import { NextFunction, Response } from "express";

import { AuthRequest } from "../middleware/authMiddleware";
import { PolicyRequest } from "../middleware/policyMiddleware";
import {
  getMyPermissionsService,
  getRolePermissionsService,
  updateRolePermissionsService,
  updateUserPermissionsService,
} from "../services/permissionService";

function getUserId(req: AuthRequest) {
  return req.user?.id || req.user?.user_id || null;
}

export async function getMyPermissionsCtrl(
  req: PolicyRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await getMyPermissionsService({
      userId,
      workspaceId: req.activeWorkspaceId || null,
      projectId: req.activeProjectId || null,
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getRolePermissionsCtrl(
  req: PolicyRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    const role = req.params.role;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!role) {
      return res.status(400).json({ error: "Role is required" });
    }

    const workspaceId =
      (typeof req.query?.workspaceId === "string" && req.query.workspaceId.trim()) ||
      (typeof req.query?.workspace_id === "string" && req.query.workspace_id.trim()) ||
      null;

    const data = await getRolePermissionsService({
      actorUserId: userId,
      role,
      workspaceId,
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function patchRolePermissionsCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await updateRolePermissionsService({
      actorUserId: userId,
      role: req.body?.role,
      permissions: req.body?.permissions,
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function patchUserPermissionsCtrl(
  req: PolicyRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const workspaceId =
      req.activeWorkspaceId ||
      (typeof req.body?.workspaceId === "string" ? req.body.workspaceId : null) ||
      (typeof req.body?.workspace_id === "string" ? req.body.workspace_id : null);
    const targetUserId =
      (typeof req.body?.userId === "string" && req.body.userId) ||
      (typeof req.body?.user_id === "string" && req.body.user_id) ||
      null;

    if (!workspaceId) {
      return res.status(400).json({ error: "workspaceId is required" });
    }
    if (!targetUserId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const data = await updateUserPermissionsService({
      actorUserId: userId,
      workspaceId,
      userId: targetUserId,
      permissions: req.body?.permissions,
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
}
