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
  findActiveWhatsAppPlatformAccountByPhoneNumberId,
  findWebhookIntegration,
  getIntegrationVerifyToken,
} from "../services/integrationService";
import {
  updateMessageDeliveryStatusByExternalId,
  updateMessageDeliveryStatusByOpaqueRef,
} from "../models/messageModel";
import { GenericMessage, routeMessage } from "../services/messageRouter";
import { decryptSecret } from "../utils/encryption";
import { applyTemplateStatusUpdate } from "./templateController";
import { normalizeWhatsAppPlatformUserId } from "../services/contactIdentityService";
import {
  findCampaignChannelsByPlatformAccountRefId,
} from "../models/campaignModel";

async function isWorkspaceOrBotSoftDeleted(input: {
  workspaceId?: string | null;
  botId?: string | null;
}) {
  const workspaceId = String(input.workspaceId || "").trim() || null;
  const botId = String(input.botId || "").trim() || null;

  if (workspaceId) {
    const workspaceRes = await query(
      `SELECT id
       FROM workspaces
       WHERE id = $1
         AND deleted_at IS NOT NULL
       LIMIT 1`,
      [workspaceId]
    );
    if (workspaceRes.rows[0]) {
      return true;
    }
  }

  if (botId) {
    const botRes = await query(
      `SELECT id
       FROM bots
       WHERE id = $1
         AND deleted_at IS NOT NULL
       LIMIT 1`,
      [botId]
    );
    if (botRes.rows[0]) {
      return true;
    }
  }

  return false;
}

function getMetaWebhookVerifyToken() {
  return process.env.META_WEBHOOK_VERIFY_TOKEN;
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
    const opaqueRef = String(statusRow?.biz_opaque_callback_data || "").trim();
    if ((!externalMessageId && !opaqueRef) || !deliveryStatus) {
      continue;
    }

    const updatedRowsByExternalId = externalMessageId
      ? await updateMessageDeliveryStatusByExternalId(
          externalMessageId,
          deliveryStatus,
          statusRow
        )
      : [];
    const updatedRows =
      updatedRowsByExternalId.length > 0
        ? updatedRowsByExternalId
        : opaqueRef
          ? await updateMessageDeliveryStatusByOpaqueRef(
              opaqueRef,
              deliveryStatus,
              statusRow
            )
          : [];

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

async function findGlobalMetaVerifyTokenMatch(token: string) {
  const campaignChannelRes = await query(
    `SELECT platform, config
     FROM campaign_channels
     WHERE platform IN ('whatsapp', 'facebook', 'instagram')`
  );
  for (const row of campaignChannelRes.rows) {
    const decrypted = decryptSecret(row?.config?.verifyToken ?? null);
    if (decrypted && decrypted === token) {
      return decrypted;
    }
  }

  const accountRes = await query(
    `SELECT metadata
     FROM platform_accounts
     WHERE platform_type IN ('whatsapp', 'facebook', 'instagram')`
  );
  for (const row of accountRes.rows) {
    const metadata =
      row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
    const decrypted = decryptSecret((metadata as any)?.verifyToken ?? null);
    if (decrypted && decrypted === token) {
      return decrypted;
    }
  }

  return null;
}

export const verifyWebhook = async (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const { platform, botId } = req.params;

  let verifyToken: string | null | undefined = getMetaWebhookVerifyToken();

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
  } else if (typeof token === "string" && token) {
    const matchedGlobalToken = await findGlobalMetaVerifyTokenMatch(token);
    verifyToken = matchedGlobalToken || verifyToken;
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
  console.log("Incoming webhook:", {
    platform: resolvedPlatform,
    hasEntry: Array.isArray(body?.entry),
    hasMessages: Boolean(body?.entry?.[0]?.changes?.[0]?.value?.messages?.length),
    hasStatuses: Boolean(body?.entry?.[0]?.changes?.[0]?.value?.statuses?.length),
  });
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
  const from = normalizeWhatsAppPlatformUserId(message.from) || String(message.from || "").trim();
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

    let matchedChannels = phoneNumberId
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

    const platformAccount =
      !matchedChannel && phoneNumberId
        ? await findActiveWhatsAppPlatformAccountByPhoneNumberId(phoneNumberId)
        : null;

    if (!matchedChannel && platformAccount) {
      const platformAccountChannels = await findCampaignChannelsByPlatformAccountRefId(
        platformAccount.id
      );
      if (platformAccountChannels.length > 0) {
        matchedChannels = platformAccountChannels;
        matchedChannel =
          matchedChannels.length === 1
            ? matchedChannels[0]
            : null;
      }
    }

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

    const legacyMatchedIntegration =
      matchedChannel || !phoneNumberId
        ? null
        : await findLegacyWhatsAppBotMatch(phoneNumberId);
    const matchedIntegration =
      matchedChannel || !phoneNumberId
        ? null
        : platformAccount?.bot_id
          ? platformAccount
          : legacyMatchedIntegration;

    const botId = routeBotId || matchedChannel?.bot_id || matchedIntegration?.bot_id;
    const workspaceId = matchedChannel?.workspace_id || matchedIntegration?.workspace_id || null;

    if (!botId) {
      console.warn("No active WhatsApp integration found for phone number id", {
        phoneNumberId: phoneNumberId || null,
        matchedChannelsCount: matchedChannels.length,
        matchedChannelBotId: matchedChannel?.bot_id || null,
        platformAccountId: platformAccount?.id || null,
        platformAccountBotId: platformAccount?.bot_id || null,
        legacyMatchedBotId: legacyMatchedIntegration?.bot_id || null,
      });
      return res.sendStatus(200);
    }

    if (await isWorkspaceOrBotSoftDeleted({ workspaceId, botId })) {
      console.log(`Dropping webhook for soft-deleted tenant bot=${botId} workspace=${workspaceId || "n/a"}`);
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
        await routeMessage(result.conversationId, action as GenericMessage, io);
      }
    }

    const convRes = await query(
      `SELECT c.id
       FROM conversations c
       JOIN contacts ct ON c.contact_id = ct.id
       WHERE ct.platform_user_id = $1
         AND c.bot_id = $2
         AND c.channel = 'whatsapp'
         AND c.deleted_at IS NULL`,
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
