import { NextFunction, Response, RequestHandler } from "express";

import { AuthRequest } from "./authMiddleware";
import { validateWorkspaceContext } from "../services/businessValidationService";
import {
  assertBotWorkspacePermission,
  assertWorkspaceMembership,
  assertWorkspacePermission,
  assertWorkspacePermissionAny,
  normalizeWorkspaceRole,
  type WorkspacePermission,
} from "../services/workspaceAccessService";
import { assertProjectContextAccess } from "../services/projectAccessService";
import { findProjectById } from "../models/projectModel";
import { findCampaignById } from "../models/campaignModel";
import { findPlatformAccountById } from "../models/platformAccountModel";
import { findWorkspaceById } from "../models/workspaceModel";
import { assertPlatformRoles } from "../services/workspaceAccessService";

export interface PolicyRequest extends AuthRequest {
  userId?: string | null;
  activeWorkspaceId?: string | null;
  activeProjectId?: string | null;
  workspaceMembership?: any;
  projectAccess?: any;
}

function getUserId(req: AuthRequest) {
  return req.user?.id || req.user?.user_id || null;
}

function getStringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getBotId(req: AuthRequest) {
  return (
    getStringValue(req.params.botId) ||
    getStringValue(req.body?.botId) ||
    getStringValue(req.body?.bot_id) ||
    getStringValue(req.query?.botId)
  );
}

async function resolveWorkspaceId(req: AuthRequest) {
  const userId = getUserId(req);
  const campaignId =
    getStringValue(req.params.campaignId) ||
    getStringValue(req.params.id && req.baseUrl.includes("/campaigns") ? req.params.id : null) ||
    getStringValue(req.body?.campaignId);
  if (campaignId && userId) {
    const campaign = await findCampaignById(campaignId, userId);
    if (campaign?.workspace_id) {
      return campaign.workspace_id;
    }
  }

  const platformAccountId =
    getStringValue(req.params.id && req.baseUrl.includes("/platform-accounts") ? req.params.id : null);
  if (platformAccountId && userId) {
    const account = await findPlatformAccountById(platformAccountId, userId);
    if (account?.workspace_id) {
      return account.workspace_id;
    }
  }

  const directValue =
    getStringValue(req.headers["x-workspace-id"]) ||
    getStringValue(req.params.workspaceId) ||
    getStringValue(req.params.id && req.baseUrl.includes("/workspaces") ? req.params.id : null) ||
    getStringValue(req.body?.workspaceId) ||
    getStringValue(req.body?.workspace_id) ||
    getStringValue(req.query?.workspaceId);

  if (directValue) {
    return directValue;
  }

  return null;
}

function getProjectId(req: AuthRequest) {
  return (
    getStringValue(req.headers["x-project-id"]) ||
    getStringValue(req.params.projectId) ||
    getStringValue(req.body?.projectId) ||
    getStringValue(req.body?.project_id) ||
    getStringValue(req.query?.projectId)
  );
}

export const requireAuthenticatedUser: RequestHandler = (req, res, next) => {
  const userId = getUserId(req as AuthRequest);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  (req as PolicyRequest).userId = userId;
  next();
};

export function requirePlatformRoles(allowedRoles: string[]): RequestHandler {
  return async (req, res, next) => {
    try {
      const userId = getUserId(req as AuthRequest);
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      await assertPlatformRoles(userId, allowedRoles);
      next();
    } catch (err) {
      next(err);
    }
  };
}

export const resolveWorkspaceContext: RequestHandler = async (req, res, next) => {
  try {
    const authReq = req as PolicyRequest;
    const userId = authReq.userId || getUserId(authReq);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const workspaceId = await resolveWorkspaceId(authReq);
    authReq.activeWorkspaceId = workspaceId;

    if (!workspaceId) {
      next();
      return;
    }

    await validateWorkspaceContext(workspaceId);
    authReq.workspaceMembership = await assertWorkspaceMembership(userId, workspaceId);
    next();
  } catch (err) {
    next(err);
  }
};

export const resolveProjectContext: RequestHandler = async (req, res, next) => {
  try {
    const authReq = req as PolicyRequest;
    const userId = authReq.userId || getUserId(authReq);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const projectId = getProjectId(authReq);
    authReq.activeProjectId = projectId;

    if (!projectId) {
      next();
      return;
    }

    const project = await findProjectById(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    if (authReq.activeWorkspaceId && authReq.activeWorkspaceId !== project.workspace_id) {
      res.status(400).json({ error: "Project does not belong to the active workspace" });
      return;
    }

    authReq.activeWorkspaceId = project.workspace_id;
    authReq.workspaceMembership =
      authReq.workspaceMembership || (await assertWorkspaceMembership(userId, project.workspace_id));
    authReq.projectAccess = await assertProjectContextAccess(
      userId,
      projectId,
      authReq.activeWorkspaceId
    );
    next();
  } catch (err) {
    next(err);
  }
};

export function requireWorkspacePermission(permission: WorkspacePermission): RequestHandler {
  return async (req, res, next) => {
    try {
      const authReq = req as PolicyRequest;
      const userId = authReq.userId || getUserId(authReq);
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const workspaceId = authReq.activeWorkspaceId ?? (await resolveWorkspaceId(authReq));
      if (workspaceId) {
        authReq.activeWorkspaceId = workspaceId;
        authReq.workspaceMembership = await assertWorkspacePermission(
          userId,
          workspaceId,
          permission
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireWorkspacePermissionAny(
  permissions: WorkspacePermission[]
): RequestHandler {
  return async (req, res, next) => {
    try {
      const authReq = req as PolicyRequest;
      const userId = authReq.userId || getUserId(authReq);
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const workspaceId = authReq.activeWorkspaceId ?? (await resolveWorkspaceId(authReq));
      if (workspaceId) {
        authReq.activeWorkspaceId = workspaceId;
        authReq.workspaceMembership = await assertWorkspacePermissionAny(
          userId,
          workspaceId,
          permissions
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

export const requireWorkspaceAccess: RequestHandler = async (req, res, next) => {
  try {
    const authReq = req as PolicyRequest;
    const userId = authReq.userId || getUserId(authReq);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const workspaceId = authReq.activeWorkspaceId ?? (await resolveWorkspaceId(authReq));
    if (workspaceId) {
      authReq.activeWorkspaceId = workspaceId;
      if (
        !authReq.workspaceMembership ||
        String(authReq.workspaceMembership.workspace_id || "") !== workspaceId
      ) {
        authReq.workspaceMembership = await assertWorkspaceMembership(userId, workspaceId);
      }
    }

    next();
  } catch (err) {
    next(err);
  }
};

export function requireBotPermission(permission: WorkspacePermission): RequestHandler {
  return async (req, res, next) => {
    try {
      const authReq = req as PolicyRequest;
      const userId = authReq.userId || getUserId(authReq);
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const botId = getBotId(authReq);
      if (!botId) {
        res.status(400).json({ error: "botId is required" });
        return;
      }

      const bot = await assertBotWorkspacePermission(userId, botId, permission);
      authReq.activeWorkspaceId = bot.workspace_id || authReq.activeWorkspaceId || null;
      if (authReq.activeWorkspaceId) {
        authReq.workspaceMembership = await assertWorkspaceMembership(
          userId,
          authReq.activeWorkspaceId
        );
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export const requireWorkspaceOwnerOrAdmin: RequestHandler = async (req, res, next) => {
  try {
    const authReq = req as PolicyRequest;
    const userId = authReq.userId || getUserId(authReq);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const workspaceId = authReq.activeWorkspaceId ?? (await resolveWorkspaceId(authReq));
    if (!workspaceId) {
      res.status(400).json({ error: "Workspace context is required" });
      return;
    }

    const workspace = await findWorkspaceById(workspaceId, userId);
    if (!workspace) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const membership = await assertWorkspaceMembership(userId, workspaceId);
    if (!membership || normalizeWorkspaceRole(membership.role) !== "workspace_admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    authReq.activeWorkspaceId = workspaceId;
    authReq.workspaceMembership = membership;
    next();
  } catch (err) {
    next(err);
  }
};
