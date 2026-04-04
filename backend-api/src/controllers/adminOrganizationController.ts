import { NextFunction, Response } from "express";

import { query } from "../config/db";
import { AuthRequest } from "../middleware/authMiddleware";
import {
  getOrganizationDetailsService,
  listAllOrganizationsService,
  listOrganizationWorkspacesService,
  updateOrganizationQuotasService,
} from "../services/organizationService";
import { getMonthlyUsageService } from "../services/organizationUsageService";

function getUserId(req: AuthRequest) {
  return req.user?.id || req.user?.user_id || null;
}

export async function listOrganizationsCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await listAllOrganizationsService();
    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function getOrganizationCtrl(
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

    const [data, workspaces] = await Promise.all([
      getOrganizationDetailsService(organizationId, userId),
      listOrganizationWorkspacesService(organizationId, userId),
    ]);
    if (!data) {
      return res.status(404).json({ error: "Organization not found" });
    }

    res.json({
      success: true,
      data: {
        ...data,
        workspaces,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function listOrganizationTemplatesCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const organizationId = String(req.params.organizationId || "").trim();
    if (!organizationId) {
      return res.status(400).json({ error: "Organization id is required" });
    }

    const platform = String(req.query.platform || "").trim().toLowerCase();
    const params: Array<string> = [organizationId];
    const conditions: string[] = ["w.organization_id = $1"];

    if (platform) {
      params.push(platform);
      conditions.push(`LOWER(COALESCE(t.platform_type, 'whatsapp')) = $${params.length}`);
    }

    const result = await query(
      `
        SELECT
          t.*,
          w.name AS workspace_name,
          p.name AS project_name
        FROM templates t
        LEFT JOIN workspaces w
          ON w.id = t.workspace_id
        LEFT JOIN projects p
          ON p.id = t.project_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY t.updated_at DESC, t.created_at DESC
      `,
      params
    ).catch((err) => {
      throw err;
    });

    res.json({
      success: true,
      data: result.rows || [],
    });
  } catch (err) {
    next(err);
  }
}

export async function updateOrganizationCtrl(
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

    const reason = String(req.body?.reason || "").trim();
    if (!reason) {
      return res.status(400).json({ error: "Reason is required" });
    }

    const planTierRaw = req.body?.plan_tier ?? req.body?.planTier;
    const planTier = typeof planTierRaw === "string" ? planTierRaw.trim().toLowerCase() : null;
    if (planTier && !["free", "pro", "enterprise"].includes(planTier)) {
      return res.status(400).json({ error: "Invalid plan tier" });
    }
    const quotaMessagesRaw = req.body?.quota_messages ?? req.body?.quotaMessages;
    const quotaAiTokensRaw = req.body?.quota_ai_tokens ?? req.body?.quotaAiTokens;
    const hasQuotaMessages = quotaMessagesRaw !== undefined && quotaMessagesRaw !== null && String(quotaMessagesRaw).trim() !== "";
    const hasQuotaAiTokens = quotaAiTokensRaw !== undefined && quotaAiTokensRaw !== null && String(quotaAiTokensRaw).trim() !== "";
    const hasPlanTier = Boolean(planTier);

    if (!hasQuotaMessages && !hasQuotaAiTokens && !hasPlanTier) {
      return res.status(400).json({ error: "At least one quota or plan tier must be provided" });
    }

    const updated = await updateOrganizationQuotasService(
      organizationId,
      {
        planTier,
        quotaMessages: hasQuotaMessages ? Number(quotaMessagesRaw) : null,
        quotaAiTokens: hasQuotaAiTokens ? Number(quotaAiTokensRaw) : null,
        reason,
      },
      userId
    );

    res.json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}

export async function getOrganizationUsageCtrl(
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

    const usage = await getMonthlyUsageService(organizationId);
    res.json({
      success: true,
      data: usage,
    });
  } catch (err) {
    next(err);
  }
}
