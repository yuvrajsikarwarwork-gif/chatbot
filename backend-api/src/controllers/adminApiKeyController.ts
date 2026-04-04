import { NextFunction, Response } from "express";

import { AuthRequest } from "../middleware/authMiddleware";
import {
  createOrganizationApiKeyService,
  listOrganizationApiKeysService,
  revokeOrganizationApiKeyService,
} from "../services/apiKeyService";

function getUserId(req: AuthRequest) {
  return req.user?.id || req.user?.user_id || null;
}

export async function listOrganizationApiKeysCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const organizationId = String(req.params.organizationId || req.params.id || "").trim();
    if (!organizationId) {
      return res.status(400).json({ error: "Organization id is required" });
    }

    const data = await listOrganizationApiKeysService(organizationId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function createOrganizationApiKeyCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const organizationId = String(req.params.organizationId || req.params.id || "").trim();
    if (!organizationId) {
      return res.status(400).json({ error: "Organization id is required" });
    }

    const name = String(req.body?.name || "").trim();
    const prefix = String(req.body?.prefix || "test").trim() as "live" | "test";
    const workspaceId = String(req.body?.workspaceId || req.body?.workspace_id || "").trim() || null;
    const scopesRaw = req.body?.scopes;
    const scopes = Array.isArray(scopesRaw)
      ? scopesRaw.map((item) => String(item || "").trim()).filter(Boolean)
      : undefined;

    const created = await createOrganizationApiKeyService({
      organizationId,
      workspaceId,
      name,
      prefix,
      ...(scopes ? { scopes } : {}),
      createdBy: userId,
    });

    res.json({
      success: true,
      data: created.record,
      secret: created.fullKey,
    });
  } catch (err) {
    next(err);
  }
}

export async function revokeOrganizationApiKeyCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const organizationId = String(req.params.organizationId || req.params.id || "").trim();
    const keyId = String(req.params.keyId || req.params.apiKeyId || "").trim();
    if (!organizationId || !keyId) {
      return res.status(400).json({ error: "Organization id and key id are required" });
    }

    const reason = String(req.body?.reason || "").trim();
    const revoked = await revokeOrganizationApiKeyService(organizationId, keyId, userId, reason);
    res.json({
      success: true,
      data: revoked,
    });
  } catch (err) {
    next(err);
  }
}
