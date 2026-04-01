import { NextFunction, Response } from "express";

import { AuthRequest } from "../middleware/authMiddleware";
import {
  cloneCampaignAutomationRuleService,
  getCampaignAutomationRuntimeService,
  replayCampaignAutomationRuleService,
  saveCampaignAutomationVersionService,
  setCampaignAutomationVersionStatusService,
  setCampaignAutomationRuleEnabledService,
} from "../services/campaignAutomationService";

function getUserId(req: AuthRequest) {
  return req.user?.id || req.user?.user_id || null;
}

export async function getCampaignAutomationRuntimeCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    const campaignId = String(req.params.campaignId || req.params.id || "").trim();
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!campaignId) {
      return res.status(400).json({ error: "Campaign id is required" });
    }

    const result = await getCampaignAutomationRuntimeService(campaignId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function pauseCampaignAutomationRuleCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    const campaignId = String(req.params.campaignId || req.params.id || "").trim();
    const ruleId = String(req.params.ruleId || "").trim();
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!campaignId || !ruleId) {
      return res.status(400).json({ error: "Campaign id and rule id are required" });
    }

    const result = await setCampaignAutomationRuleEnabledService({
      campaignId,
      ruleId,
      enabled: false,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function resumeCampaignAutomationRuleCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    const campaignId = String(req.params.campaignId || req.params.id || "").trim();
    const ruleId = String(req.params.ruleId || "").trim();
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!campaignId || !ruleId) {
      return res.status(400).json({ error: "Campaign id and rule id are required" });
    }

    const result = await setCampaignAutomationRuleEnabledService({
      campaignId,
      ruleId,
      enabled: true,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function replayCampaignAutomationRuleCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    const campaignId = String(req.params.campaignId || req.params.id || "").trim();
    const ruleId = String(req.params.ruleId || "").trim();
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!campaignId || !ruleId) {
      return res.status(400).json({ error: "Campaign id and rule id are required" });
    }

    const result = await replayCampaignAutomationRuleService({
      campaignId,
      ruleId,
      leadId: typeof req.body?.leadId === "string" ? req.body.leadId : undefined,
      io: req.app.get("io"),
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function saveCampaignAutomationVersionCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    const campaignId = String(req.params.campaignId || req.params.id || "").trim();
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!campaignId) {
      return res.status(400).json({ error: "Campaign id is required" });
    }

    const result = await saveCampaignAutomationVersionService({
      campaignId,
      label: typeof req.body?.label === "string" ? req.body.label : undefined,
      notes: typeof req.body?.notes === "string" ? req.body.notes : undefined,
      status:
        req.body?.status === "approved" ||
        req.body?.status === "pending" ||
        req.body?.status === "rejected"
          ? req.body.status
          : "draft",
      sourceRuleId: typeof req.body?.sourceRuleId === "string" ? req.body.sourceRuleId : undefined,
      sourceRuleName: typeof req.body?.sourceRuleName === "string" ? req.body.sourceRuleName : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function cloneCampaignAutomationRuleCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    const campaignId = String(req.params.campaignId || req.params.id || "").trim();
    const ruleId = String(req.params.ruleId || "").trim();
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!campaignId || !ruleId) {
      return res.status(400).json({ error: "Campaign id and rule id are required" });
    }

    const result = await cloneCampaignAutomationRuleService({ campaignId, ruleId });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function setCampaignAutomationVersionStatusCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    const campaignId = String(req.params.campaignId || req.params.id || "").trim();
    const versionId = String(req.params.versionId || "").trim();
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!campaignId || !versionId) {
      return res.status(400).json({ error: "Campaign id and version id are required" });
    }

    const status =
      req.body?.status === "approved" ||
      req.body?.status === "pending" ||
      req.body?.status === "rejected"
        ? req.body.status
        : "draft";

    const result = await setCampaignAutomationVersionStatusService({
      campaignId,
      versionId,
      status,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}
