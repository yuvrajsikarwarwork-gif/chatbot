import { NextFunction, Response } from "express";

import { AuthRequest } from "../middleware/authMiddleware";
import { getGlobalAuditLogsService } from "../services/adminAuditService";

export async function getGlobalAuditLogsCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const limit = Number.parseInt(String(req.query?.limit || "50"), 10);
    const offset = Number.parseInt(String(req.query?.offset || "0"), 10);
    const data = await getGlobalAuditLogsService(
      Number.isFinite(limit) ? limit : 50,
      Number.isFinite(offset) ? offset : 0
    );

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}
