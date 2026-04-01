import { NextFunction, Response, RequestHandler } from "express";

import { AuthRequest } from "./authMiddleware";
import { validateWorkspaceContext } from "../services/businessValidationService";
import {
  assertBotWorkspacePermission,
  assertWorkspaceMembership,
  assertWorkspacePermission,
  assertWorkspacePermissionAny,
  hasWorkspaceSupportEntryAccess,
  normalizeWorkspaceRole,
  type WorkspacePermission,
} from "../services/workspaceAccessService";
import { assertProjectContextAccess } from "../services/projectAccessService";
import { findBotById } from "../models/botModel";
import { findFlowById } from "../models/flowModel";
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

function isGlobalSuperAdminRequest(req: AuthRequest) {
  return String(req.user?.role || "").trim().toLowerCase() === "super_admin";
}

async function assertSuperAdminWorkspaceImpersonationAccess(
  req: AuthRequest,
  userId: string,
  workspaceId: string | null
) {
  if (!isGlobalSuperAdminRequest(req)) {
    return;
  }

  const workspacePath = String(req.path || "").trim();
  const isOverviewSurface =
    req.baseUrl === "/workspaces" &&
    /^\/[^/]+(?:\/overview)?$/.test(workspacePath);

  if (isOverviewSurface) {
    return;
  }

  if (!workspaceId) {
    throw {
      status: 403,
      message: "Super admin must enter workspace to access internal routes",
    };
  }

  const supportAccess = await hasWorkspaceSupportEntryAccess(userId, workspaceId);

  if (!supportAccess) {
    throw {
      status: 403,
      message: "Super admin must enter workspace to access internal routes",
    };
  }
}

function getDirectWorkspaceId(req: AuthRequest) {
  return (
    getStringValue(req.headers["x-workspace-id"]) ||
    getStringValue(req.params.workspaceId) ||
    getStringValue(req.params.id && req.baseUrl.includes("/workspaces") ? req.params.id : null) ||
    getStringValue(req.body?.workspaceId) ||
    getStringValue(req.body?.workspace_id) ||
    getStringValue(req.query?.workspaceId)
  );
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

  const directValue = getDirectWorkspaceId(req);

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

async function resolveFlowWorkspaceId(req: AuthRequest) {
  const botId =
    getStringValue(req.params.botId) ||
    getStringValue(req.body?.botId) ||
    getStringValue(req.body?.bot_id) ||
    getStringValue(req.query?.botId);
  if (botId) {
    const bot = await findBotById(botId);
    if (bot?.workspace_id) {
      return String(bot.workspace_id).trim();
    }
  }

  const flowId =
    getStringValue(req.params.id) ||
    getStringValue(req.body?.flowId) ||
    getStringValue(req.body?.flow_id) ||
    getStringValue(req.query?.flowId);
  if (flowId) {
    const flow = await findFlowById(flowId);
    if (flow?.bot_id) {
      const bot = await findBotById(String(flow.bot_id));
      if (bot?.workspace_id) {
        return String(bot.workspace_id).trim();
      }
    }
  }

  return resolveWorkspaceId(req);
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

export const requireSuperAdmin: RequestHandler = (req, res, next) => {
  const authReq = req as AuthRequest;
  const role = String(authReq.user?.role || "").trim().toLowerCase();

  if (role === "super_admin" || role === "developer") {
    next();
    return;
  }

  res.status(403).json({ error: "Forbidden: Super admin access required" });
};

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

    await assertSuperAdminWorkspaceImpersonationAccess(authReq, userId, workspaceId);

    const isWorkspaceOverviewRoute =
      authReq.baseUrl === "/workspaces" && /^\/[^/]+(?:\/overview)?$/.test(String(authReq.path || "").trim());

    if (isGlobalSuperAdminRequest(authReq) && isWorkspaceOverviewRoute) {
      next();
      return;
    }

    if (!workspaceId) {
      next();
      return;
    }

    const isReadOnlyRequest =
      String(authReq.method || "GET").toUpperCase() === "GET" ||
      String(authReq.method || "GET").toUpperCase() === "HEAD";

    await validateWorkspaceContext(workspaceId, {
      allowLocked: isReadOnlyRequest,
      allowWriteBlocked: isReadOnlyRequest,
      userId,
    });
    authReq.workspaceMembership = await assertWorkspaceMembership(userId, workspaceId);
    next();
  } catch (err) {
    next(err);
  }
};

export const resolveWorkspaceOversightContext: RequestHandler = async (req, res, next) => {
  try {
    const authReq = req as PolicyRequest;
    const userId = authReq.userId || getUserId(authReq);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const workspaceId = await resolveWorkspaceId(authReq);
    authReq.activeWorkspaceId = workspaceId;
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
      await assertSuperAdminWorkspaceImpersonationAccess(authReq, userId, authReq.activeWorkspaceId || getDirectWorkspaceId(authReq));
      if (isGlobalSuperAdminRequest(authReq) && authReq.baseUrl === "/workspaces") {
        next();
        return;
      }
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
    await assertSuperAdminWorkspaceImpersonationAccess(
      authReq,
      userId,
      authReq.activeWorkspaceId
    );
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

export function requireActiveWorkspaceEditAccess(
  permission: WorkspacePermission = "edit_workflow"
): RequestHandler {
  return async (req, res, next) => {
    try {
      const authReq = req as PolicyRequest;
      const userId = authReq.userId || getUserId(authReq);
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const workspaceId = authReq.activeWorkspaceId ?? (await resolveFlowWorkspaceId(authReq));
      if (!workspaceId) {
        res.status(400).json({ error: "Workspace context is required" });
        return;
      }

      await assertSuperAdminWorkspaceImpersonationAccess(authReq, userId, workspaceId);
      if (isGlobalSuperAdminRequest(authReq) && authReq.baseUrl === "/workspaces") {
        authReq.activeWorkspaceId = workspaceId;
        next();
        return;
      }

      await validateWorkspaceContext(workspaceId, {
        allowLocked: false,
        allowWriteBlocked: false,
        userId,
      });

      authReq.activeWorkspaceId = workspaceId;
      authReq.workspaceMembership = await assertWorkspaceMembership(userId, workspaceId);

      if (
        authReq.workspaceMembership &&
        normalizeWorkspaceRole(authReq.workspaceMembership.role) === "workspace_admin"
      ) {
        next();
        return;
      }

      await assertWorkspacePermission(userId, workspaceId, permission);
      next();
    } catch (err: any) {
      if (err?.status === 403) {
        res.status(403).json({ error: "Forbidden: Workspace Suspended" });
        return;
      }
      next(err);
    }
  };
}

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
      const isWorkspaceOverviewRoute =
        authReq.baseUrl === "/workspaces" &&
        /^\/[^/]+(?:\/overview)?$/.test(String(authReq.path || "").trim());
      if (isGlobalSuperAdminRequest(authReq) && isWorkspaceOverviewRoute) {
        next();
        return;
      }
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
