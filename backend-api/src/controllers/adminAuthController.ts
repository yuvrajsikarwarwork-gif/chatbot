import { NextFunction, Response } from "express";

import { AuthRequest } from "../middleware/authMiddleware";
import { findActiveSupportAccess } from "../models/supportAccessModel";
import {
  createSupportWorkspaceSessionService,
  endSupportWorkspaceSessionService,
} from "../services/authService";

function getUserId(req: AuthRequest) {
  return req.user?.id || req.user?.user_id || null;
}

export async function impersonateWorkspaceCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    const workspaceId = String(req.params.workspaceId || "").trim();

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!workspaceId) {
      return res.status(400).json({ error: "Workspace id is required" });
    }

    const activeGrant = await findActiveSupportAccess(workspaceId, userId);
    if (!activeGrant) {
      return res.status(403).json({
        error: "Support access has not been granted for this workspace.",
      });
    }

    const data = await createSupportWorkspaceSessionService({
      actorUserId: userId,
      workspaceId,
      durationHours: Number(req.body?.durationHours || 4),
      consentConfirmed: true,
      consentNote: String(req.body?.consentNote || "").trim() || "Admin impersonation session",
    });

    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function exitImpersonationCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const workspaceId = String(req.body?.workspaceId || req.query?.workspaceId || "").trim() || null;
    const data = await endSupportWorkspaceSessionService({
      actorUserId: userId,
      workspaceId,
    });

    res.json(data);
  } catch (err) {
    next(err);
  }
}
