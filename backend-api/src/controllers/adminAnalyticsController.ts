import { NextFunction, Response } from "express";

import { AuthRequest } from "../middleware/authMiddleware";
import {
  getGlobalTrafficSeriesService,
  getOrganizationUsageBreakdownService,
  getTopConsumersService,
} from "../services/adminAnalyticsService";

export async function getGlobalTrafficSeriesCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const timeWindow = typeof req.query.timeWindow === "string" ? req.query.timeWindow : "24 hours";
    const data = await getGlobalTrafficSeriesService(timeWindow);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function getTopConsumersCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 10;
    const timeWindow = typeof req.query.timeWindow === "string" ? req.query.timeWindow : "24 hours";
    const data = await getTopConsumersService(limit, timeWindow);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function getOrganizationUsageBreakdownCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const organizationId = String(req.params.organizationId || req.params.id || "").trim();
    const timeWindow = typeof req.query.timeWindow === "string" ? req.query.timeWindow : "30 days";
    const data = await getOrganizationUsageBreakdownService(organizationId, timeWindow);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}
