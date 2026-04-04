import {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";
import jwt from "jsonwebtoken";

import { env } from "../config/env";
import {
  assertBotWorkspacePermission,
  WORKSPACE_PERMISSIONS,
} from "../services/workspaceAccessService";
import { touchAgentPresence } from "../services/agentPresenceService";

export interface JwtPayload {
  id?: string;
  user_id?: string;
  role?: string;
  organization_id?: string | null;
  organization_role?: string | null;
  impersonator_id?: string | null;
  impersonated_organization_id?: string | null;
  impersonation_mode?: string | null;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
  activeOrganizationId?: string | null;
  activeOrganization?: any | null;
  activeOrganizationMembership?: any | null;
  organizationMembership?: any | null;
  organizations?: any[];
}

export const authMiddleware: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  const token = header.split(" ")[1];
  if (!token) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as unknown as JwtPayload;
    (req as AuthRequest).user = decoded;
    const userId = decoded.id || decoded.user_id;
    if (userId) {
      const workspaceId =
        (req.headers["x-workspace-id"] as string) ||
        (typeof req.query.workspaceId === "string" ? req.query.workspaceId : undefined) ||
        undefined;
      const projectId =
        (req.headers["x-project-id"] as string) ||
        (typeof req.query.projectId === "string" ? req.query.projectId : undefined) ||
        undefined;
      void touchAgentPresence(userId, {
        workspaceId: workspaceId || null,
        projectId: projectId || null,
        lastAction: `${req.method} ${req.path}`,
      }).catch((presenceErr) => {
        console.warn("Agent presence touch skipped", presenceErr);
      });
    }
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      console.warn("JWT expired", {
        path: req.originalUrl,
        expiredAt: err.expiredAt,
      });
    } else {
      console.error("JWT Verification Error:", err);
    }
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

export const authorizeRoles =
  (...allowedRoles: string[]): RequestHandler =>
  (req, res, next) => {
    const authReq = req as AuthRequest;

    if (!authReq.user?.role) {
      res.status(403).json({ error: "Forbidden: No role assigned" });
      return;
    }

    if (!allowedRoles.includes(authReq.user.role)) {
      res.status(403).json({ error: "Forbidden: Insufficient permissions" });
      return;
    }

    next();
  };

export const botAccessGuard: RequestHandler = async (req, res, next) => {
  const authReq = req as AuthRequest;
  const userId = authReq.user?.id;
  const botId = req.params.botId || req.body.botId || req.body.bot_id;

  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!botId) {
    res.status(400).json({ error: "botId is required" });
    return;
  }

  try {
    await assertBotWorkspacePermission(
      userId,
      botId,
      WORKSPACE_PERMISSIONS.managePlatformAccounts
    );
    next();
  } catch (err) {
    console.error("botAccessGuard Error:", err);
    res.status((err as any)?.status || 500).json({
      error: (err as any)?.message || "Authorization check failed",
    });
  }
};
