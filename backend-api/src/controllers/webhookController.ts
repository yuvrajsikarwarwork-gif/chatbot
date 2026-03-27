import { Request, Response } from "express";

import { query } from "../config/db";
import {
  findCampaignChannelByWhatsAppPhoneNumberId,
  findCampaignChannelsByWhatsAppPhoneNumberId,
  findCampaignChannelsByBotAndPlatform
} from "../models/campaignModel";
import * as FlowEngine from "../services/flowEngine";
import {
  findLegacyWhatsAppBotMatch,
  findWebhookIntegration,
  getIntegrationVerifyToken,
} from "../services/integrationService";
import { updateMessageDeliveryStatusByExternalId } from "../models/messageModel";
import { routeMessage } from "../services/messageRouter";
import { decryptSecret } from "../utils/encryption";
import { applyTemplateStatusUpdate } from "./templateController";

function getLegacyVerifyToken() {
  return process.env.WA_VERIFY_TOKEN || process.env.VERIFY_TOKEN;
}

async function findLatestWhatsAppConversationBot(
  platformUserId: string,
  candidateBotIds: string[]
) {
  if (!platformUserId || candidateBotIds.length === 0) {
    return null;
  }

  const res = await query(
    `SELECT c.bot_id
     FROM conversations c
     JOIN contacts ct ON ct.id = c.contact_id
     WHERE c.channel = 'whatsapp'
       AND ct.platform_user_id = $1
       AND c.bot_id = ANY($2::uuid[])
     ORDER BY
       CASE
         WHEN c.status IN ('active', 'agent_pending') THEN 0
         WHEN c.status = 'closed' THEN 1
         ELSE 2
       END,
       CASE WHEN c.current_node IS NOT NULL THEN 0 ELSE 1 END,
       c.updated_at DESC
     LIMIT 1`,
    [platformUserId, candidateBotIds]
  );

  return res.rows[0]?.bot_id || null;
}

async function findLatestCsatPendingConversationBot(
  platformUserId: string,
  candidateBotIds: string[]
) {
  if (!platformUserId || candidateBotIds.length === 0) {
    return null;
  }

  const res = await query(
    `SELECT c.bot_id
     FROM conversations c
     JOIN contacts ct ON ct.id = c.contact_id
     WHERE c.channel = 'whatsapp'
       AND ct.platform_user_id = $1
       AND c.bot_id = ANY($2::uuid[])
       AND COALESCE(c.context_json->>'csat_pending', 'false') = 'true'
     ORDER BY c.updated_at DESC
     LIMIT 1`,
    [platformUserId, candidateBotIds]
  );

  return res.rows[0]?.bot_id || null;
}

async function handleWhatsAppStatuses(req: Request, res: Response) {
  const io = req.app.get("io");
  const statuses = req.body?.entry?.[0]?.changes?.[0]?.value?.statuses;
  if (!Array.isArray(statuses) || statuses.length === 0) {
    return res.sendStatus(200);
  }

  for (const statusRow of statuses) {
    const externalMessageId = String(statusRow?.id || "").trim();
    const deliveryStatus = String(statusRow?.status || "").trim().toLowerCase();
    if (!externalMessageId || !deliveryStatus) {
      continue;
    }

    const updatedRows = await updateMessageDeliveryStatusByExternalId(
      externalMessageId,
      deliveryStatus,
      statusRow
    );

    for (const updated of updatedRows) {
      if (io && updated?.conversation_id) {
        io.emit("dashboard_update", {
          conversationId: updated.conversation_id,
          botId: updated.bot_id,
          channel: updated.platform || updated.channel || "whatsapp",
          deliveryStatus,
          isBot: true,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  return res.sendStatus(200);
}

async function handleTemplateStatusUpdates(req: Request, res: Response) {
  const io = req.app.get("io");
  const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const field = String(change?.field || "").trim().toLowerCase();
      const value = change?.value && typeof change.value === "object" ? change.value : {};
      const isTemplateEvent =
        field.includes("template") ||
        value?.message_template_id ||
        value?.template_id ||
        value?.message_template_name ||
        value?.template_name;

      if (!isTemplateEvent) {
        continue;
      }

      const status =
        value?.status ||
        value?.event ||
        value?.event_type ||
        value?.message_template_status ||
        "pending";
      const rejectionReason =
        value?.reason ||
        value?.rejected_reason ||
        value?.rejection_reason ||
        null;

      await applyTemplateStatusUpdate({
        externalTemplateId:
          String(value?.message_template_id || value?.template_id || "").trim() || null,
        templateName:
          String(value?.message_template_name || value?.template_name || value?.name || "").trim() || null,
        status: String(status || "").trim() || null,
        rejectedReason:
          rejectionReason == null ? null : typeof rejectionReason === "string" ? rejectionReason : JSON.stringify(rejectionReason),
        rawPayload: change,
        io,
      });
    }
  }

  return res.sendStatus(200);
}

export const verifyWebhook = async (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const { platform, botId } = req.params;

  let verifyToken: string | null | undefined = getLegacyVerifyToken();

  if (platform && botId) {
    const channelConfigs = await findCampaignChannelsByBotAndPlatform(
      botId,
      platform
    );
    const matchedChannel = channelConfigs.find(
      (channel: any) => decryptSecret(channel.config?.verifyToken) === token
    );
    if (matchedChannel) {
      verifyToken = decryptSecret(matchedChannel.config?.verifyToken);
    }

    const integration = await findWebhookIntegration(botId, platform);
    if (!verifyToken) {
      verifyToken = integration ? getIntegrationVerifyToken(integration) : null;
    }
  }

  if (mode === "subscribe" && token === verifyToken) {
    console.log("Meta webhook verified");
    return res.status(200).send(challenge);
  }

  console.warn("Webhook verification failed");
  return res.sendStatus(403);
};

export const receiveMessage = async (req: Request, res: Response) => {
  const body = req.body;
  const io = req.app.get("io");
  const { platform, botId: routeBotId } = req.params;
  const resolvedPlatform = (platform || "whatsapp").toLowerCase();
  const entryKey =
    (typeof req.query.entryKey === "string" && req.query.entryKey) ||
    (typeof req.query.entry === "string" && req.query.entry) ||
    (typeof req.headers["x-entry-key"] === "string" && req.headers["x-entry-key"]) ||
    body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.referral?.source_url ||
    undefined;

  if (resolvedPlatform === "telegram") {
    return receiveTelegramMessage(req, res);
  }

  console.log("\n=========================================");
  console.log("Incoming webhook:");
  console.log(JSON.stringify(body, null, 2));
  console.log("=========================================\n");

  const containsTemplateWebhook =
    Array.isArray(body?.entry) &&
    body.entry.some((entry: any) =>
      Array.isArray(entry?.changes) &&
      entry.changes.some((change: any) => {
        const field = String(change?.field || "").toLowerCase();
        const value = change?.value || {};
        return (
          field.includes("template") ||
          value?.message_template_id ||
          value?.template_id ||
          value?.message_template_name ||
          value?.template_name
        );
      })
    );

  if (containsTemplateWebhook) {
    return handleTemplateStatusUpdates(req, res);
  }

  if (body.entry?.[0]?.changes?.[0]?.value?.statuses) {
    return handleWhatsAppStatuses(req, res);
  }

  if (body.object !== "whatsapp_business_account") {
    return res.sendStatus(404);
  }

  const value = body.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  if (!message) {
    return res.sendStatus(200);
  }

  const phoneNumberId = value?.metadata?.phone_number_id;
  const from = message.from;
  const waName = value?.contacts?.[0]?.profile?.name || "User";

  try {
    let incomingText = "";
    let buttonId = "";

    if (message.type === "text") {
      incomingText = message.text?.body || "";
    } else if (message.type === "interactive") {
      const interactive = message.interactive;
      buttonId =
        interactive.button_reply?.id || interactive.list_reply?.id || "";
      incomingText =
        interactive.button_reply?.title ||
        interactive.list_reply?.title ||
        buttonId;
    }

    const matchedChannels = phoneNumberId
      ? await findCampaignChannelsByWhatsAppPhoneNumberId(phoneNumberId)
      : [];
    let matchedChannel =
      matchedChannels.length === 1
        ? matchedChannels[0]
        : null;
    let requireExplicitTrigger = false;
    const normalizedIncomingText = String(incomingText || "").trim().toLowerCase();
    const isCsatReply =
      ["csat_good", "csat_okay", "csat_bad"].includes(String(buttonId || "").trim().toLowerCase()) ||
      ["great", "good", "okay", "ok", "fine", "bad", "poor"].includes(normalizedIncomingText);

    if (matchedChannels.length > 1 && (incomingText.trim() || buttonId.trim())) {
      if (isCsatReply) {
        const csatBotId = await findLatestCsatPendingConversationBot(
          from,
          matchedChannels.map((channelRow: any) => channelRow.bot_id)
        );
        if (csatBotId) {
          matchedChannel =
            matchedChannels.find(
              (channelRow: any) => String(channelRow.bot_id) === String(csatBotId)
            ) || null;
        }
      }

      let matchedByTrigger = false;
      if (!matchedChannel) {
        for (const candidateChannel of matchedChannels) {
          const hasMatch = await FlowEngine.botHasInboundTriggerMatch(
            candidateChannel.bot_id,
            incomingText,
            candidateChannel.project_id || null
          );

          if (hasMatch) {
            matchedChannel = candidateChannel;
            matchedByTrigger = true;
            break;
          }
        }
      }

      if (!matchedByTrigger && !matchedChannel) {
        const latestConversationBotId = await findLatestWhatsAppConversationBot(
          from,
          matchedChannels.map((channelRow: any) => channelRow.bot_id)
        );
        if (latestConversationBotId) {
          matchedChannel =
            matchedChannels.find(
              (channelRow: any) => String(channelRow.bot_id) === String(latestConversationBotId)
            ) || null;
          requireExplicitTrigger = true;
        } else {
          matchedChannel = matchedChannels[0] || null;
          requireExplicitTrigger = true;
        }
      }
    } else if (!matchedChannel && phoneNumberId) {
      matchedChannel = await findCampaignChannelByWhatsAppPhoneNumberId(phoneNumberId);
    }

    const matchedIntegration =
      matchedChannel || !phoneNumberId
        ? null
        : await findLegacyWhatsAppBotMatch(phoneNumberId);

    const botId = routeBotId || matchedChannel?.bot_id || matchedIntegration?.bot_id;

    if (!botId) {
      console.warn(
        `No active WhatsApp integration found for phone number id '${phoneNumberId}'.`
      );
      return res.sendStatus(200);
    }

    console.log(`Routing message from ${waName} to bot ${botId}`);

    const result = await FlowEngine.processIncomingMessage(
      botId,
      from,
      waName,
      incomingText,
      buttonId,
      io,
      "whatsapp",
      {
        ...(entryKey ? { entryKey } : {}),
        ...(requireExplicitTrigger ? { requireExplicitTrigger: true } : {}),
      }
    );

    if (result?.conversationId && result.actions?.length) {
      for (const action of result.actions) {
        await routeMessage(result.conversationId, action, io);
      }
    }

    const convRes = await query(
      `SELECT c.id
       FROM conversations c
       JOIN contacts ct ON c.contact_id = ct.id
       WHERE ct.platform_user_id = $1
         AND c.bot_id = $2
         AND c.channel = 'whatsapp'`,
      [from, botId]
    );

    if (io && convRes.rows[0]) {
      io.emit("dashboard_update", {
        conversationId: convRes.rows[0].id,
        botId,
        channel: "whatsapp",
        platformUserId: from,
        text: incomingText,
        isBot: false,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (err: any) {
    console.error("Webhook error:", err.message);
  }

  return res.sendStatus(200);
};

export const receiveTelegramMessage = async (_req: Request, res: Response) => {
  console.warn("Telegram webhook received before Telegram runtime wiring is complete.");
  return res.sendStatus(501);
};
