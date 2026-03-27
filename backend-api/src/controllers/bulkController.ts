import { Request, Response } from "express";
import { query } from "../config/db";
import {
  findAccessibleTemplate,
  launchCampaign as launchTemplateCampaign,
} from "./templateController";

export const triggerBulkCampaign = async (req: Request, res: Response) => {
  const { campaignName, templateId, leadFilter = {} } = req.body;

  try {
    const userId =
      (req as any).user?.id ||
      (req as any).user?.user_id ||
      null;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const template = await findAccessibleTemplate(String(templateId || ""), userId);

    let leadQuery = `SELECT id FROM leads WHERE bot_id = $1`;
    const params: any[] = [template.bot_id];

    if (leadFilter.status) {
      params.push(leadFilter.status);
      leadQuery += ` AND status = $${params.length}`;
    }
    if (leadFilter.source) {
      params.push(leadFilter.source);
      leadQuery += ` AND source = $${params.length}`;
    }
    if (leadFilter.id) {
      params.push(leadFilter.id);
      leadQuery += ` AND id = $${params.length}`;
    }

    const leadsRes = await query(leadQuery, params);

    req.body = {
      bot_id: template.bot_id,
      templateId,
      campaignName,
      leadIds: leadsRes.rows.map((lead: any) => lead.id)
    };

    return launchTemplateCampaign(req, res);
  } catch (error) {
    console.error("Bulk Send Error:", error);
    res.status(500).json({ error: "Bulk operation failed" });
  }
};
