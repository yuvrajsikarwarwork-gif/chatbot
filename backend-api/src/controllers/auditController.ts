import { NextFunction, Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import { listWorkspaceAuditLogsService } from "../services/auditService";

function getUserId(req: AuthRequest) {
  return req.user?.id || req.user?.user_id || null;
}

export async function listWorkspaceAuditLogsCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    const workspaceId = req.params.workspaceId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!workspaceId) {
      return res.status(400).json({ error: "Workspace id is required" });
    }

    const projectId =
      (typeof req.query.projectId === "string" && req.query.projectId) ||
      (typeof req.query.project_id === "string" && req.query.project_id) ||
      null;
    const entity = typeof req.query.entity === "string" ? req.query.entity : null;
    const action = typeof req.query.action === "string" ? req.query.action : null;
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;

    const data = await listWorkspaceAuditLogsService(workspaceId, userId, {
      ...(projectId ? { projectId } : {}),
      ...(entity ? { entity } : {}),
      ...(action ? { action } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
}
