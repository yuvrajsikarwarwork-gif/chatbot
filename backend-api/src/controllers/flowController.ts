import { Response, NextFunction } from "express";

import { AuthRequest } from "../middleware/authMiddleware";
import {
  createNewFlowService,
  getFlowsByBotService,
  getFlowBuilderCapabilitiesService,
  getFlowSummariesByBotService,
  getFlowService,
  normalizeFlowJson,
  patchFlowNodeService,
  saveFlowService,
  updateFlowService,
  deleteFlowService,
} from "../services/flowService";

function getUserId(req: AuthRequest) {
  return req.user?.id || req.user?.user_id || null;
}

function normalizeFlowPayload(data: any) {
  if (!data) {
    return { nodes: [], edges: [] };
  }

  if (data.flow_json && typeof data.flow_json === "object") {
    return {
      ...normalizeFlowJson(data.flow_json),
      id: data.id,
      bot_id: data.bot_id,
      is_system_flow: Boolean(data.is_system_flow),
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  return normalizeFlowJson(data);
}

export async function getFlowsByBot(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { botId } = req.params;
    const requestedFlowId = typeof req.query.flowId === "string" ? req.query.flowId : undefined;
    const userId = getUserId(req);
    if (!botId || botId === "undefined") return res.status(200).json({ nodes: [], edges: [] });
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const data = await getFlowsByBotService(botId, userId);
    if (!data || (Array.isArray(data) && data.length === 0)) {
      return res.status(200).json({ nodes: [], edges: [] });
    }

    const selected = Array.isArray(data)
      ? data.find((flow: any) => flow.id === requestedFlowId) || data[0]
      : data;
    res.json(normalizeFlowPayload(selected));
  } catch (err) {
    next(err);
  }
}

export async function getFlowSummariesByBot(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { botId } = req.params;
    const userId = getUserId(req);
    if (!botId || botId === "undefined") return res.status(200).json([]);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const data = await getFlowSummariesByBotService(botId, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getFlowBuilderCapabilities(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { botId } = req.params;
    const userId = getUserId(req);
    if (!botId || botId === "undefined") return res.status(400).json({ error: "botId is required" });
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const data = await getFlowBuilderCapabilitiesService(botId, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getFlow(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    if (!id) return res.status(400).json({ error: "id is required" });
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const data = await getFlowService(id, userId);
    res.json(normalizeFlowPayload(data));
  } catch (err) {
    next(err);
  }
}

/**
 * BULLETPROOF SAVE LOGIC
 * Extracts parameters and validates them before hitting the database.
 */
export async function saveFlowCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const botId = req.body.botId || req.body.bot_id;
    const flowJson = req.body.flow_json;
    const flowId = req.body.flowId || req.body.flow_id;
    const flowName = req.body.flow_name;
    const userId = getUserId(req);
    const requestId = req.requestId || "unknown";

    // Safety guards to prevent 500 crash
    if (!botId) return res.status(400).json({ error: "botId is missing in request." });
    if (!flowJson) return res.status(400).json({ error: "flow_json payload is missing." });
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const data = await saveFlowService(botId, userId, flowJson, flowId, flowName);
    res.status(200).json(data);
  } catch (err) {
    console.error(`[FlowSave][Controller][${req.requestId || "unknown"}] save-request-failed`, {
      botId: req.body?.botId || req.body?.bot_id || null,
      flowId: req.body?.flowId || req.body?.flow_id || null,
      flowName: req.body?.flow_name || null,
      error: err instanceof Error ? err.message : String(err || "Unknown save error"),
    });
    next(err);
  }
}

export async function createFlowCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    if (!req.body.bot_id) return res.status(400).json({ error: "bot_id is required" });
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const data = await createNewFlowService(
      req.body.bot_id,
      userId,
      req.body.flow_json || { nodes: [], edges: [] },
      req.body.flow_name,
      Boolean(req.body.is_default)
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function updateFlowCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    if (!id) return res.status(400).json({ error: "id is required" });
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const data = await updateFlowService(
      id,
      userId,
      req.body.flow_json,
      req.body.flow_name,
      typeof req.body.is_default === "boolean" ? req.body.is_default : undefined
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function patchFlowNodeCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  const requestId = req.requestId || "unknown";
  try {
    const { id, nodeId } = req.params;
    const userId = getUserId(req);
    if (!id) return res.status(400).json({ error: "id is required" });
    if (!nodeId) return res.status(400).json({ error: "nodeId is required" });
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const nodeData = req.body?.node_data ?? req.body?.nodeData ?? req.body?.data ?? req.body?.node;
    if (!nodeData || typeof nodeData !== "object") {
      return res.status(400).json({ error: "node_data payload is required" });
    }

    const data = await patchFlowNodeService(id, userId, nodeId, nodeData, requestId);
    res.json(normalizeFlowPayload(data));
  } catch (err) {
    console.error(`[NodeSave][Controller][${requestId}] patch-request-failed`, {
      flowId: req.params?.id || null,
      nodeId: req.params?.nodeId || null,
      userId: getUserId(req),
      error: err instanceof Error ? err.message : String(err || "Unknown patch error"),
    });
    next(err);
  }
}

export async function deleteFlowCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    if (!id) return res.status(400).json({ error: "id is required" });
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    await deleteFlowService(id, userId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
