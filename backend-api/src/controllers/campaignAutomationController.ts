import { NextFunction, Request, Response } from "express";

import { executeCampaignWebhookAutomationService } from "../services/campaignAutomationService";

export async function executeCampaignAutomationWebhookCtrl(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const campaignId = String(req.params.campaignId || "").trim();
    const ruleId = String(req.params.ruleId || "").trim();
    const secret =
      String(req.headers["x-automation-secret"] || req.body?.secret || "").trim() || null;

    if (!campaignId || !ruleId) {
      return res.status(400).json({ error: "campaignId and ruleId are required" });
    }

    const result = await executeCampaignWebhookAutomationService({
      campaignId,
      ruleId,
      secret,
      contactId: typeof req.body?.contactId === "string" ? req.body.contactId : undefined,
      leadId: typeof req.body?.leadId === "string" ? req.body.leadId : undefined,
      platformUserId:
        typeof req.body?.platformUserId === "string" ? req.body.platformUserId : undefined,
      phone: typeof req.body?.phone === "string" ? req.body.phone : undefined,
      email: typeof req.body?.email === "string" ? req.body.email : undefined,
      contactName: typeof req.body?.contactName === "string" ? req.body.contactName : undefined,
      variables: req.body?.variables && typeof req.body.variables === "object" ? req.body.variables : {},
      io: req.app.get("io"),
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}
