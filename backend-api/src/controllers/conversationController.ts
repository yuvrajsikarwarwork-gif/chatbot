import { NextFunction, Response } from "express";

import { AuthRequest } from "../middleware/authMiddleware";
import {
  addConversationNoteService,
  addConversationTagService,
  getConversationMessagesService,
  getConversationService,
  getConversationsService,
  getWorkspaceConversationsService,
  deleteConversationTagService,
  replyToConversationService,
  updateConversationContextService,
  updateConversationListService,
  updateConversationStatusService,
} from "../services/conversationService";
import {
  assignConversationService,
  listAssignmentCapacityService,
  listConversationAssignmentsService,
  reassignConversationService,
  releaseConversationService,
} from "../services/conversationAssignmentService";

function getUserId(req: AuthRequest) {
  return req.user?.id || req.user?.user_id || null;
}

export async function getWorkspaceConversations(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
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
        agentId: req.query.agentId as string | undefined,
        status: req.query.status as string | undefined,
        search: req.query.search as string | undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      },
      userId
    );

    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getConversations(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { botId } = req.params;
    const userId = getUserId(req);
    if (!botId) return res.status(400).json({ error: "botId is required" });
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const data = await getConversationsService(botId, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getConversation(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    if (!id) return res.status(400).json({ error: "id is required" });
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const data = await getConversationService(id, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getMessages(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    if (!id) return res.status(400).json({ error: "id is required" });
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const data = await getConversationMessagesService(id, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function updateConversationStatus(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = getUserId(req);

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const result = await updateConversationStatusService(id, status, userId, req.app.get("io"));
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function replyToConversation(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const result = await replyToConversationService(
      id,
      {
        text: req.body?.text,
        type: req.body?.type,
        templateName: req.body?.templateName,
        languageCode: req.body?.languageCode,
        mediaUrl: req.body?.mediaUrl,
        buttons: req.body?.buttons,
      },
      userId,
      req.app.get("io")
    );

    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function assignConversation(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    if (!id) return res.status(400).json({ error: "id is required" });
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const data = await assignConversationService(id, req.body || {}, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function reassignConversation(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    if (!id) return res.status(400).json({ error: "id is required" });
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const data = await reassignConversationService(id, req.body || {}, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function releaseConversation(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    if (!id) return res.status(400).json({ error: "id is required" });
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const data = await releaseConversationService(id, req.body || {}, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getConversationAssignments(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    if (!id) return res.status(400).json({ error: "id is required" });
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const data = await listConversationAssignmentsService(id, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getAssignmentCapacity(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const workspaceId =
      (req.query.workspaceId as string) ||
      (req.headers["x-workspace-id"] as string) ||
      undefined;
    const projectId =
      (req.query.projectId as string) ||
      (req.headers["x-project-id"] as string) ||
      undefined;

    const payload: {
      workspaceId?: string | null;
      projectId?: string | null;
      conversationId?: string | null;
    } = {};

    if (typeof workspaceId !== "undefined") {
      payload.workspaceId = workspaceId;
    }
    if (typeof projectId !== "undefined") {
      payload.projectId = projectId;
    }
    if (typeof req.query.conversationId !== "undefined") {
      payload.conversationId = req.query.conversationId as string;
    }

    const data = await listAssignmentCapacityService(payload, userId);

    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function addConversationNote(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    if (!id) return res.status(400).json({ error: "id is required" });
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const data = await addConversationNoteService(id, req.body || {}, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function addConversationTag(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    if (!id) return res.status(400).json({ error: "id is required" });
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const data = await addConversationTagService(id, req.body || {}, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function removeConversationTag(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { id, tag } = req.params;
    const userId = getUserId(req);
    if (!id) return res.status(400).json({ error: "id is required" });
    if (!tag) return res.status(400).json({ error: "tag is required" });
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const data = await deleteConversationTagService(id, tag, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function updateConversationList(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    if (!id) return res.status(400).json({ error: "id is required" });
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const data = await updateConversationListService(id, req.body || {}, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function updateConversationContext(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    if (!id) return res.status(400).json({ error: "id is required" });
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const data = await updateConversationContextService(id, req.body || {}, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}
