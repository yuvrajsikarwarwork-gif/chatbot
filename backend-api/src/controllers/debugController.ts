import { Response, NextFunction } from "express";

import { AuthRequest } from "../middleware/authMiddleware";

export async function logFlowSaveDebugCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id || req.user?.user_id || null;
    const payload = req.body && typeof req.body === "object" ? req.body : {};
    console.log("[FlowSaveDebug]", {
      requestId: req.requestId || "unknown",
      userId,
      flowId: payload.flowId || null,
      nodeId: payload.nodeId || null,
      nodeType: payload.nodeType || null,
      label: payload.label || null,
      stage: payload.stage || null,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
