import { NextFunction, Response } from "express";
import { Request } from "express";

import { AuthRequest } from "../middleware/authMiddleware";
import {
  deleteLeadService,
  getLeadService,
  listLeadListsService,
  listLeadsService,
  updateLeadStatusService,
} from "../services/leadService";
import { upsertLeadCaptureFromConversationVariables } from "../services/leadCaptureService";
import { env } from "../config/env";

function getUserId(req: AuthRequest) {
  return req.user?.id || req.user?.user_id || null;
}

function hasInternalEngineAccess(req: Request) {
  const secret = String(req.headers["x-engine-secret"] || "").trim();
  return Boolean(env.INTERNAL_ENGINE_SECRET) && secret === env.INTERNAL_ENGINE_SECRET;
}

export async function internalUpsertLeadCaptureCtrl(req: Request, res: Response, next: NextFunction) {
  try {
    if (!hasInternalEngineAccess(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const conversationId = String(req.body?.conversationId || "").trim();
    const botId = String(req.body?.botId || "").trim();
    const platform = String(req.body?.platform || "").trim() || "whatsapp";
    const variables =
      req.body?.variables && typeof req.body.variables === "object" ? req.body.variables : {};

    if (!conversationId || !botId) {
      return res.status(400).json({ error: "conversationId and botId are required" });
    }

    const data = await upsertLeadCaptureFromConversationVariables({
      conversationId,
      botId,
      platform,
      variables,
      leadFormId:
        typeof req.body?.leadFormId === "string" ? req.body.leadFormId : undefined,
      linkedFieldKey:
        typeof req.body?.linkedFieldKey === "string" ? req.body.linkedFieldKey : undefined,
      sourceLabel: typeof req.body?.sourceLabel === "string" ? req.body.sourceLabel : undefined,
      statusValue: typeof req.body?.statusValue === "string" ? req.body.statusValue : undefined,
      sourcePayload:
        req.body?.sourcePayload && typeof req.body.sourcePayload === "object"
          ? req.body.sourcePayload
          : undefined,
    });

    res.json(data || { success: true, skipped: true });
  } catch (err) {
    next(err);
  }
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

export async function updateLeadStatusCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    const id = req.params.id;
    const status = String(req.body?.status || "").trim();

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!id) {
      return res.status(400).json({ error: "Lead id is required" });
    }

    const data = await updateLeadStatusService(id, userId, status);
    res.json(data);
  } catch (err) {
    next(err);
  }
}
