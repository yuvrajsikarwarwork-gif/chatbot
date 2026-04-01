import { NextFunction, Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import { listQueueOpsService, retryQueueJobService, retryQueueJobsService } from "../services/queueOpsService";

function getUserId(req: AuthRequest) {
  return req.user?.id || req.user?.user_id || null;
}

export async function listQueueOpsCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const filters: { status?: string; jobType?: string } = {};
    if (typeof req.query.status === "string") {
      filters.status = req.query.status;
    }
    if (typeof req.query.jobType === "string") {
      filters.jobType = req.query.jobType;
    }

    const result = await listQueueOpsService(userId, filters);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function retryQueueJobCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    const jobId = String(req.params.id || "").trim();
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!jobId) {
      return res.status(400).json({ error: "Job id is required" });
    }

    const result = await retryQueueJobService(userId, jobId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function retryQueueJobsCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const result = await retryQueueJobsService(userId, {
      status: typeof req.body?.status === "string" ? req.body.status : undefined,
      jobType: typeof req.body?.jobType === "string" ? req.body.jobType : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}
