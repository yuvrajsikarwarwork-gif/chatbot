import { NextFunction, Response } from "express";

import { AuthRequest } from "../middleware/authMiddleware";
import {
  getBotStatsService,
  getEventsService,
  getWorkspaceAgentPresenceService,
  getWorkspaceEventsService,
  getWorkspaceStatsService,
  getWorkspaceUsageSummaryService,
} from "../services/analyticsService";

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

    const data = await getWorkspaceStatsService(workspaceId, userId, projectId);
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

    const data = await getWorkspaceEventsService(workspaceId, userId, projectId);
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
