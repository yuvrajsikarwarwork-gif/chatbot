import { Request, Response } from "express";

import { findConversationSettingsByWorkspace } from "../models/conversationSettingsModel";
import {
  getConversationMessagesService,
  getConversationService,
  getWorkspaceConversationsService,
  replyToConversationService,
  updateConversationStatusService,
} from "../services/conversationService";

export const getTickets = async (_req: Request, res: Response) => {
  res.status(200).json([]);
};

export const createTicket = async (_req: Request, res: Response) => {
  res.status(200).json({});
};

export const closeTicket = async (_req: Request, res: Response) => {
  res.status(200).json({});
};

export const replyToTicket = async (_req: Request, res: Response) => {
  res.status(200).json({});
};

export const getInboxConversations = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const workspaceId =
      (req.query.workspaceId as string) ||
      (req.headers["x-workspace-id"] as string) ||
      undefined;
    const projectId =
      (req.query.projectId as string) ||
      (req.headers["x-project-id"] as string) ||
      undefined;

    const data = await getWorkspaceConversationsService(
      {
        workspaceId,
        projectId,
        botId: req.query.botId as string | undefined,
        campaignId: req.query.campaignId as string | undefined,
        channelId: req.query.channelId as string | undefined,
        platform: req.query.platform as string | undefined,
        platformAccountId: req.query.platformAccountId as string | undefined,
        flowId: req.query.flowId as string | undefined,
        listId: req.query.listId as string | undefined,
        status: req.query.status as string | undefined,
        search: req.query.search as string | undefined,
        agentId: req.query.agentId as string | undefined,
      },
      userId
    );

    res.json(data);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || "Failed to load conversations" });
  }
};

// Backward-compatible alias while the frontend finishes migrating.
export const getInboxLeads = getInboxConversations;

export const getConversationDetail = async (req: Request, res: Response) => {
  const { conversationId } = req.params;
  const userId = (req as any).user?.id;

  try {
    if (!conversationId) {
      return res.status(400).json({ error: "conversationId is required" });
    }
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const [conversation, messages] = await Promise.all([
      getConversationService(conversationId, userId),
      getConversationMessagesService(conversationId, userId),
    ]);

    res.json({
      ...conversation,
      messages,
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || "Failed to load conversation" });
  }
};

export const resumeConversation = async (req: Request, res: Response) => {
  const { conversationId } = req.params;
  const userId = (req as any).user?.id;

  try {
    if (!conversationId) {
      return res.status(400).json({ error: "conversationId is required" });
    }
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const conversation = await getConversationService(conversationId, userId);
    if (conversation.workspace_id) {
      const settings = await findConversationSettingsByWorkspace(conversation.workspace_id);
      if (settings && !settings.allow_bot_resume) {
        return res.status(403).json({ error: "Bot resume is disabled for this workspace" });
      }
    }

    const updatedConversation = await updateConversationStatusService(
      conversationId,
      "bot",
      userId,
      req.app.get("io")
    );

    res.json({ success: true, conversation: updatedConversation });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || "Failed to resume conversation" });
  }
};

export const sendAgentReply = async (req: Request, res: Response) => {
  const { conversationId } = req.params;
  const { text, type, templateName, languageCode } = req.body;
  const userId = (req as any).user?.id;

  if (!conversationId) {
    return res.status(400).json({ error: "conversationId is required" });
  }

  if (type === "template" && !templateName) {
    return res.status(400).json({ error: "templateName is required" });
  }

  if (type !== "template" && !text) {
    return res.status(400).json({ error: "Message text is required" });
  }

  try {
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const result = await replyToConversationService(
      conversationId,
      {
        text,
        type,
        templateName,
        languageCode,
      },
      userId,
      req.app.get("io")
    );

    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[Agent Reply Error]:", err.message);
    res.status(err.status || 500).json({ error: err.message || "Failed to send agent reply" });
  }
};
