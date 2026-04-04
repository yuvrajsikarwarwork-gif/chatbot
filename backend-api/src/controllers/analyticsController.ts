import { NextFunction, Response } from "express";

import { AuthRequest } from "../middleware/authMiddleware";
import {
  getBotStatsService,
  getEventsService,
  getWorkspaceAgentPresenceService,
  getWorkspaceEventsService,
  getWorkspaceNodeOptimizationReportService,
  getWorkspaceOptimizationPerformanceService,
  getWorkspaceRegistryDropoffReportService,
  getWorkspaceRegistryLegacyFallbackInspectorService,
  getWorkspaceRegistryKeywordPopularityService,
  getWorkspaceRegistryUnpublishedFlowSummaryService,
  getWorkspaceStatsService,
  getWorkspaceUsageSummaryService,
} from "../services/analyticsService";
import { OptimizerAlertService } from "../services/optimizerAlertService";

export async function getBotStats(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { botId } = req.params;
    const userId = req.user?.id;

    if (!botId) {
      return res.status(400).json({ error: "botId is required" });
    }

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await getBotStatsService(botId, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getEvents(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { botId } = req.params;
    const userId = req.user?.id;

    if (!botId) {
      return res.status(400).json({ error: "botId is required" });
    }

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await getEventsService(botId, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getWorkspaceStats(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { workspaceId } = req.params;
    const userId = req.user?.id || req.user?.user_id;

    if (!workspaceId) {
      return res.status(400).json({ error: "workspaceId is required" });
    }

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const projectId =
      (req.query.projectId as string) ||
      (req.headers["x-project-id"] as string) ||
      undefined;
    const sinceHours = typeof req.query.sinceHours === "string" ? Number(req.query.sinceHours) : null;

    const data = await getWorkspaceStatsService(
      workspaceId,
      userId,
      projectId,
      Number.isFinite(sinceHours || NaN) ? sinceHours : null
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getWorkspaceEvents(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { workspaceId } = req.params;
    const userId = req.user?.id || req.user?.user_id;

    if (!workspaceId) {
      return res.status(400).json({ error: "workspaceId is required" });
    }

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const projectId =
      (req.query.projectId as string) ||
      (req.headers["x-project-id"] as string) ||
      undefined;
    const sinceHours = typeof req.query.sinceHours === "string" ? Number(req.query.sinceHours) : null;

    const data = await getWorkspaceEventsService(
      workspaceId,
      userId,
      projectId,
      Number.isFinite(sinceHours || NaN) ? sinceHours : null
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getWorkspaceUsageSummary(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user?.id || req.user?.user_id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await getWorkspaceUsageSummaryService(userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getWorkspaceAgentPresence(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { workspaceId } = req.params;
    const userId = req.user?.id || req.user?.user_id;

    if (!workspaceId) {
      return res.status(400).json({ error: "workspaceId is required" });
    }

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const projectId =
      (req.query.projectId as string) ||
      (req.headers["x-project-id"] as string) ||
      undefined;

    const data = await getWorkspaceAgentPresenceService(workspaceId, userId, projectId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getWorkspaceRegistryDropoffReport(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { workspaceId } = req.params;
    const userId = req.user?.id || req.user?.user_id;

    if (!workspaceId) {
      return res.status(400).json({ error: "workspaceId is required" });
    }

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const eventType = typeof req.query.eventType === "string" ? req.query.eventType : null;
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : null;
    const sinceHours = typeof req.query.sinceHours === "string" ? Number(req.query.sinceHours) : null;
    const days = typeof req.query.days === "string" ? Number(req.query.days) : null;
    const startDate = typeof req.query.startDate === "string" ? req.query.startDate : null;

    const data = await getWorkspaceRegistryDropoffReportService(
      workspaceId,
      userId,
      eventType,
      Number.isFinite(limit || NaN) ? limit : null,
      Number.isFinite(sinceHours || NaN) ? sinceHours : null,
      Number.isFinite(days || NaN) ? days : null,
      startDate && startDate.trim() ? startDate.trim() : null
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getWorkspaceRegistryKeywordPopularity(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { workspaceId } = req.params;
    const userId = req.user?.id || req.user?.user_id;

    if (!workspaceId) {
      return res.status(400).json({ error: "workspaceId is required" });
    }

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : null;
    const sinceHours = typeof req.query.sinceHours === "string" ? Number(req.query.sinceHours) : null;

    const data = await getWorkspaceRegistryKeywordPopularityService(
      workspaceId,
      userId,
      Number.isFinite(limit || NaN) ? limit : null,
      Number.isFinite(sinceHours || NaN) ? sinceHours : null
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getWorkspaceRegistryLegacyFallbackInspector(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { workspaceId } = req.params;
    const userId = req.user?.id || req.user?.user_id;

    if (!workspaceId) {
      return res.status(400).json({ error: "workspaceId is required" });
    }

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : null;
    const sinceHours = typeof req.query.sinceHours === "string" ? Number(req.query.sinceHours) : null;
    const days = typeof req.query.days === "string" ? Number(req.query.days) : null;
    const startDate = typeof req.query.startDate === "string" ? req.query.startDate : null;

    const data = await getWorkspaceRegistryLegacyFallbackInspectorService(
      workspaceId,
      userId,
      Number.isFinite(limit || NaN) ? limit : null,
      Number.isFinite(sinceHours || NaN) ? sinceHours : null,
      Number.isFinite(days || NaN) ? days : null,
      startDate && startDate.trim() ? startDate.trim() : null
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getWorkspaceRegistryUnpublishedFlowSummary(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { workspaceId } = req.params;
    const userId = req.user?.id || req.user?.user_id;

    if (!workspaceId) {
      return res.status(400).json({ error: "workspaceId is required" });
    }

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : null;

    const data = await getWorkspaceRegistryUnpublishedFlowSummaryService(
      workspaceId,
      userId,
      Number.isFinite(limit || NaN) ? limit : null
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getWorkspaceOptimizationNodes(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const workspaceId = String(req.params.workspaceId || req.query.workspaceId || "").trim();
    const userId = req.user?.id || req.user?.user_id;

    if (!workspaceId) {
      return res.status(400).json({ error: "workspaceId is required" });
    }

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : null;
    const sinceHours = typeof req.query.sinceHours === "string" ? Number(req.query.sinceHours) : null;
    const days = typeof req.query.days === "string" ? Number(req.query.days) : null;
    const startDate = typeof req.query.startDate === "string" ? req.query.startDate : null;

    const data = await getWorkspaceNodeOptimizationReportService(
      workspaceId,
      userId,
      Number.isFinite(limit || NaN) ? limit : null,
      Number.isFinite(sinceHours || NaN) ? sinceHours : null,
      Number.isFinite(days || NaN) ? days : null,
      startDate && startDate.trim() ? startDate.trim() : null
    );

    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getWorkspaceOptimizationPerformance(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const workspaceId = String(req.params.workspaceId || req.query.workspaceId || "").trim();
    const userId = req.user?.id || req.user?.user_id;

    if (!workspaceId) {
      return res.status(400).json({ error: "workspaceId is required" });
    }

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const days = typeof req.query.days === "string" ? Number(req.query.days) : null;
    const data = await getWorkspaceOptimizationPerformanceService(
      workspaceId,
      userId,
      Number.isFinite(days || NaN) ? days : null
    );

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getWorkspaceOptimizationAlerts(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const workspaceId = String(req.params.workspaceId || req.query.workspaceId || "").trim();
    const userId = req.user?.id || req.user?.user_id;

    if (!workspaceId) {
      return res.status(400).json({ error: "workspaceId is required" });
    }

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : null;
    const status = typeof req.query.status === "string" ? req.query.status : null;
    const data = await OptimizerAlertService.listWorkspaceAlertHistory(
      workspaceId,
      limit !== null && Number.isFinite(limit) ? limit : undefined,
      status
    );

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function evaluateWorkspaceOptimizationAlerts(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const workspaceId = String(req.params.workspaceId || req.body?.workspaceId || req.query.workspaceId || "").trim();
    const userId = req.user?.id || req.user?.user_id;

    if (!workspaceId) {
      return res.status(400).json({ error: "workspaceId is required" });
    }

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const result = await OptimizerAlertService.evaluateWorkspaceFailureSpikeAlerts({
      workspaceId,
      ...(typeof req.body?.windowHours === "number"
        ? { windowHours: req.body.windowHours }
        : typeof req.query.windowHours === "string"
          ? { windowHours: Number(req.query.windowHours) }
          : {}),
      ...(typeof req.body?.cooldownHours === "number"
        ? { cooldownHours: req.body.cooldownHours }
        : typeof req.query.cooldownHours === "string"
          ? { cooldownHours: Number(req.query.cooldownHours) }
          : {}),
      ...(typeof req.body?.failureRateThreshold === "number"
        ? { failureRateThreshold: req.body.failureRateThreshold }
        : typeof req.query.failureRateThreshold === "string"
          ? { failureRateThreshold: Number(req.query.failureRateThreshold) }
          : {}),
      ...(typeof req.body?.minAttempts === "number"
        ? { minAttempts: req.body.minAttempts }
        : typeof req.query.minAttempts === "string"
          ? { minAttempts: Number(req.query.minAttempts) }
          : {}),
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function updateWorkspaceOptimizationAlertStatus(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const alertId = String(req.params.id || req.params.alertId || "").trim();
    const workspaceId = String(req.body?.workspaceId || req.query.workspaceId || "").trim();
    const userId = req.user?.id || req.user?.user_id;
    const status = String(req.body?.status || "").trim().toLowerCase();
    const note = String(req.body?.note || "").trim();

    if (!alertId) {
      return res.status(400).json({ error: "alertId is required" });
    }

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!["acknowledged", "resolved"].includes(status)) {
      return res.status(400).json({ error: "status must be acknowledged or resolved" });
    }

    const updated = await OptimizerAlertService.updateAlertStatus({
      alertId,
      userId,
      status: status as "acknowledged" | "resolved",
      ...(workspaceId ? { workspaceId } : {}),
      ...(note ? { note } : {}),
    });

    if (!updated) {
      return res.status(404).json({ error: "Alert not found" });
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}
