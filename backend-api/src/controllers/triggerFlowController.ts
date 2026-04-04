import { NextFunction, Request, Response } from "express";

import { env } from "../config/env";
import { query } from "../config/db";
import {
  buildFlowTriggerFingerprint,
  completeFlowTriggerReceipt,
  createFlowTriggerReceipt,
  failFlowTriggerReceipt,
  findFlowTriggerReceiptByIdempotencyKey,
  findRecentFlowTriggerReceiptByFingerprint,
} from "../models/flowTriggerReceiptModel";
import { triggerFlowExternally } from "../services/flowEngine";
import { validateApiKeyForBotService } from "../services/apiKeyService";
import { MachineAuthRequest } from "../middleware/machineAuthMiddleware";

function hasInternalTriggerAccess(req: Request) {
  const headerSecret = String(req.headers["x-engine-secret"] || req.headers["x-trigger-secret"] || "").trim();
  const bodySecret = String(req.body?.secret || "").trim();
  const expectedSecret = String(env.INTERNAL_ENGINE_SECRET || "").trim();

  if (!expectedSecret) {
    return false;
  }

  return headerSecret === expectedSecret || bodySecret === expectedSecret;
}

async function resolveTriggerBotId(triggerPayload: { botId?: string; conversationId?: string }) {
  if (triggerPayload.botId) {
    return triggerPayload.botId;
  }

  if (!triggerPayload.conversationId) {
    return "";
  }

  const res = await query(
    `SELECT bot_id
     FROM conversations
     WHERE id = $1
     LIMIT 1`,
    [triggerPayload.conversationId]
  ).catch(() => ({ rows: [] as any[] }));

  return String(res.rows[0]?.bot_id || "").trim();
}

export async function triggerFlowCtrl(req: Request, res: Response, next: NextFunction) {
  try {
    const authReq = req as MachineAuthRequest;
    const hasMachineApiKey = authReq.machineAuth?.type === "api_key" && authReq.machineAuth.apiKey;
    const hasInternalSecret = authReq.machineAuth?.type === "internal_secret" || hasInternalTriggerAccess(req);

    if (!hasMachineApiKey && !hasInternalSecret) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const triggerPayload = {
      botId: typeof req.body?.botId === "string" ? req.body.botId : undefined,
      flowId: typeof req.body?.flowId === "string" ? req.body.flowId : undefined,
      startNodeId: typeof req.body?.startNodeId === "string" ? req.body.startNodeId : undefined,
      conversationId:
        typeof req.body?.conversationId === "string" ? req.body.conversationId : undefined,
      contactId: typeof req.body?.contactId === "string" ? req.body.contactId : undefined,
      platform: typeof req.body?.platform === "string" ? req.body.platform : undefined,
      channel: typeof req.body?.channel === "string" ? req.body.channel : undefined,
      platformUserId:
        typeof req.body?.platformUserId === "string" ? req.body.platformUserId : undefined,
      phone: typeof req.body?.phone === "string" ? req.body.phone : undefined,
      email: typeof req.body?.email === "string" ? req.body.email : undefined,
      contactName: typeof req.body?.contactName === "string" ? req.body.contactName : undefined,
      variables:
        req.body?.variables && typeof req.body.variables === "object" ? req.body.variables : {},
      context:
        req.body?.context && typeof req.body.context === "object" ? req.body.context : undefined,
      io: req.app.get("io"),
    };
    let machineApiKeyName: string | null = null;

    if (hasMachineApiKey) {
      const resolvedBotId = await resolveTriggerBotId({
        botId: triggerPayload.botId,
        conversationId: triggerPayload.conversationId,
      });
      const validation = await validateApiKeyForBotService(
        String(req.headers["x-api-key"] || "").trim(),
        resolvedBotId
      );
      if (!validation) {
        return res.status(403).json({ error: "API key is not authorized for this bot" });
      }
      machineApiKeyName = validation.apiKey?.name || null;
    }

    const explicitIdempotencyKey =
      typeof req.body?.idempotencyKey === "string"
        ? req.body.idempotencyKey.trim()
        : typeof req.body?.externalTriggerId === "string"
          ? req.body.externalTriggerId.trim()
          : "";

    const fingerprint = buildFlowTriggerFingerprint({
      botId: triggerPayload.botId || null,
      flowId: triggerPayload.flowId || null,
      startNodeId: triggerPayload.startNodeId || null,
      conversationId: triggerPayload.conversationId || null,
      contactId: triggerPayload.contactId || null,
      platform: triggerPayload.platform || triggerPayload.channel || null,
      platformUserId: triggerPayload.platformUserId || null,
      phone: triggerPayload.phone || null,
      email: triggerPayload.email || null,
      variables: triggerPayload.variables || {},
      context: triggerPayload.context || {},
    });

    const existingReceipt = explicitIdempotencyKey
      ? await findFlowTriggerReceiptByIdempotencyKey(explicitIdempotencyKey)
      : await findRecentFlowTriggerReceiptByFingerprint(fingerprint, 10);

    if (existingReceipt?.status === "completed" && existingReceipt.response_payload) {
      return res.json({
        success: true,
        deduped: true,
        receiptId: existingReceipt.id,
        ...(existingReceipt.response_payload as Record<string, unknown>),
      });
    }

    if (existingReceipt?.status === "processing") {
      return res.status(202).json({
        success: true,
        deduped: true,
        processing: true,
        receiptId: existingReceipt.id,
        message: "An identical trigger is already being processed.",
      });
    }

    const idempotencyKey =
      explicitIdempotencyKey || `auto:${fingerprint}:${Math.floor(Date.now() / 600000)}`;

    const createdReceipt = await createFlowTriggerReceipt({
        idempotencyKey,
        requestFingerprint: fingerprint,
        requestPayload: {
          ...triggerPayload,
          io: undefined,
        },
        botId: triggerPayload.botId,
        flowId: triggerPayload.flowId,
        conversationId: triggerPayload.conversationId,
        contactId: triggerPayload.contactId,
      });
    const receipt =
      createdReceipt || (await findFlowTriggerReceiptByIdempotencyKey(idempotencyKey));

    if (!receipt) {
      return res.status(500).json({ error: "Failed to reserve trigger receipt" });
    }

    if (receipt.status === "completed" && receipt.response_payload) {
      return res.json({
        success: true,
        deduped: true,
        receiptId: receipt.id,
        ...(receipt.response_payload as Record<string, unknown>),
      });
    }

    if (!createdReceipt && receipt.status === "processing") {
      return res.status(202).json({
        success: true,
        deduped: true,
        processing: true,
        receiptId: receipt.id,
        message: "An identical trigger is already being processed.",
      });
    }

    try {
      const result = await triggerFlowExternally({
        ...triggerPayload,
        authType: hasMachineApiKey ? "machine" : "human",
        authSourceName: machineApiKeyName,
      });

      await completeFlowTriggerReceipt({
        id: receipt.id,
        responsePayload: result,
        botId: result.botId,
        flowId: result.flowId,
        conversationId: result.conversationId,
        contactId: result.contactId,
      });

      return res.json({
        success: true,
        receiptId: receipt.id,
        idempotencyKey,
        ...result,
      });
    } catch (error: any) {
      await failFlowTriggerReceipt({
        id: receipt.id,
        errorMessage: String(error?.message || "Trigger flow execution failed"),
      });

      throw error;
    }
  } catch (err) {
    next(err);
  }
}
