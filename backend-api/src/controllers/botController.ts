import { Response } from "express";

import { AuthRequest } from "../middleware/authMiddleware";
import {
  activateBotService,
  createBotService,
  copyBotService,
  deleteBotService,
  getBotService,
  getBotsService,
  updateBotService,
} from "../services/botService";
import { getSystemFlowSummariesByBotService } from "../services/flowService";

function getUserId(req: AuthRequest) {
  return req.user?.id || req.user?.user_id || null;
}

export async function updateBotCtrl(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    if (!id) return res.status(400).json({ message: "Bot ID is required" });
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const bot = await updateBotService(id, userId, req.body);
    res.json(bot);
  } catch (error: any) {
    console.error("updateBotCtrl Error:", error.message);
    res.status(error.status || 500).json({ message: error.message });
  }
}

export async function activateBotCtrl(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    if (!id) return res.status(400).json({ message: "Bot ID is required" });
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const bot = await activateBotService(id, userId);
    res.json(bot);
  } catch (error: any) {
    console.error("activateBotCtrl Error:", error.message);
    res.status(error.status || 500).json({ message: error.message });
  }
}

export async function getBots(req: AuthRequest, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const hasWorkspaceQuery = Object.prototype.hasOwnProperty.call(req.query, "workspaceId");
    const hasProjectQuery = Object.prototype.hasOwnProperty.call(req.query, "projectId");
    const workspaceId =
      hasWorkspaceQuery
        ? ((req.query.workspaceId as string) || undefined)
        : ((req.headers["x-workspace-id"] as string) || undefined);
    const projectId =
      hasProjectQuery
        ? ((req.query.projectId as string) || undefined)
        : ((req.headers["x-project-id"] as string) || undefined);
    const bots = await getBotsService(userId, workspaceId, projectId);
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.json(bots);
  } catch (error: any) {
    res.status(error.status || 500).json({ message: error.message });
  }
}

export async function getBot(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    if (!id) return res.status(400).json({ message: "Bot ID is required" });
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const bot = await getBotService(id, userId);
    res.json(bot);
  } catch (error: any) {
    res.status(error.status || 500).json({ message: error.message });
  }
}

export async function getBotSystemFlows(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    if (!id) return res.status(400).json({ message: "Bot ID is required" });
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    await getBotService(id, userId);
    const flows = await getSystemFlowSummariesByBotService(id, userId);
    res.json(flows);
  } catch (error: any) {
    res.status(error.status || 500).json({ message: error.message });
  }
}

export async function createBotCtrl(req: AuthRequest, res: Response) {
  try {
    const { name, trigger_keywords, workspaceId, workspace_id, projectId, project_id } = req.body;
    const userId = getUserId(req);

    if (!name) {
      return res.status(400).json({ message: "Bot name is required." });
    }
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const bot = await createBotService(userId, {
      name,
      trigger_keywords: trigger_keywords || "",
      workspaceId: workspaceId || workspace_id || null,
      projectId: projectId || project_id || null,
    });

    res.status(201).json(bot);
  } catch (error: any) {
    console.error("createBotCtrl Error:", error.message);
    res.status(error.status || 500).json({ message: error.message });
  }
}

export async function copyBotCtrl(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    if (!id) return res.status(400).json({ message: "Bot ID is required" });
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const bot = await copyBotService(id, userId, {
      name: req.body?.name,
      trigger_keywords: req.body?.trigger_keywords,
      projectId: req.body?.projectId || req.body?.project_id || null,
    });
    res.status(201).json(bot);
  } catch (error: any) {
    console.error("copyBotCtrl Error:", error.message);
    res.status(error.status || 500).json({ message: error.message });
  }
}

export async function deleteBotCtrl(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    if (!id) return res.status(400).json({ message: "Bot ID is required" });
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    await deleteBotService(id, userId);
    res.status(204).send();
  } catch (error: any) {
    console.error("deleteBotCtrl Error:", error.message);
    res.status(error.status || 500).json({ message: error.message });
  }
}
