import { query } from "../config/db";
import { sendWebAdapter } from "../connectors/website/websiteAdapter";
import { sendEmailAdapter } from "../connectors/email/emailAdapter";
import { sendWhatsAppAdapter } from "../connectors/whatsapp/whatsappAdapter";
import { normalizePlatform } from "../utils/platform";

let messageDeliveryColumnSupport:
  | {
      externalMessageId: boolean;
      status: boolean;
      statusUpdatedAt: boolean;
    }
  | null = null;
let templateColumnSupport:
  | {
      botId: boolean;
      workspaceId: boolean;
      projectId: boolean;
      campaignId: boolean;
      variables: boolean;
      content: boolean;
      platformType: boolean;
    }
  | null = null;

async function getMessageDeliveryColumnSupport() {
  if (messageDeliveryColumnSupport) {
    return messageDeliveryColumnSupport;
  }

  const res = await query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'messages'`
  );

  const columns = new Set(res.rows.map((row: any) => String(row.column_name || "").trim()));
  messageDeliveryColumnSupport = {
    externalMessageId: columns.has("external_message_id"),
    status: columns.has("status"),
    statusUpdatedAt: columns.has("status_updated_at"),
  };

  return messageDeliveryColumnSupport;
}

async function getTemplateColumnSupport() {
  if (templateColumnSupport) {
    return templateColumnSupport;
  }

  const res = await query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'templates'`
  );

  const columns = new Set(res.rows.map((row: any) => String(row.column_name || "").trim()));
  templateColumnSupport = {
    botId: columns.has("bot_id"),
    workspaceId: columns.has("workspace_id"),
    projectId: columns.has("project_id"),
    campaignId: columns.has("campaign_id"),
    variables: columns.has("variables"),
    content: columns.has("content"),
    platformType: columns.has("platform_type"),
  };

  return templateColumnSupport;
}

function parseJsonLike<T = any>(value: any): T | null {
  if (!value) return null;
  if (typeof value === "object") return value as T;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function buildTemplateTextLookup(input: {
  conversationVariables: Record<string, any>;
  contact: Record<string, any>;
  lead: Record<string, any>;
}) {
  const lookup: Record<string, string> = {};
  const assign = (keys: string[], value: any) => {
    if (value === undefined || value === null || String(value).trim() === "") {
      return;
    }
    for (const key of keys) {
      lookup[key] = String(value);
    }
  };

  const conversationVars = input.conversationVariables || {};
  const leadVars = parseJsonLike<Record<string, any>>(input.lead?.variables) || {};

  for (const [key, value] of Object.entries(conversationVars)) {
    assign([key], value);
  }

  for (const [key, value] of Object.entries(leadVars)) {
    assign([key], value);
  }

  assign(["name", "full_name", "user_name"], input.contact.contactName || input.lead.name);
  assign(["phone", "mobile", "wa_number"], input.contact.contactPhone || input.lead.phone);
  assign(["email"], input.contact.contactEmail || input.lead.email);
  assign(["source"], input.lead.source);
  assign(["wa_name"], input.lead.wa_name);
  assign(["wa_number"], input.lead.wa_number);

  return lookup;
}

function interpolateTemplateText(text: string, valuesByToken: Record<string, string>) {
  return String(text || "").replace(/{{\s*(\d+)\s*}}/g, (_, token) => {
    return valuesByToken[token] ?? `{{${token}}}`;
  });
}

function resolveTemplateMessageContent(input: {
  content: any;
  variableMap: Record<string, any>;
  valueLookup: Record<string, string>;
}) {
  const rawContent = parseJsonLike<any>(input.content) || {};
  const variableMap = parseJsonLike<Record<string, any>>(input.variableMap) || {};
  const valuesByToken: Record<string, string> = {};

  for (const [token, mappedField] of Object.entries(variableMap)) {
    const resolved = input.valueLookup[String(mappedField)];
    if (resolved !== undefined) {
      valuesByToken[String(token)] = resolved;
    }
  }

  const resolveButtonField = (button: any, field: "title" | "value") => {
    if (!button || typeof button !== "object") {
      return "";
    }
    return interpolateTemplateText(String(button[field] || ""), valuesByToken);
  };

  return {
    valuesByToken,
    content: {
      ...rawContent,
      header:
        rawContent?.header && typeof rawContent.header === "object"
          ? {
              ...rawContent.header,
              text: interpolateTemplateText(String(rawContent.header.text || ""), valuesByToken),
            }
          : rawContent?.header || null,
      body: interpolateTemplateText(String(rawContent?.body || ""), valuesByToken),
      footer: interpolateTemplateText(String(rawContent?.footer || ""), valuesByToken),
      buttons: Array.isArray(rawContent?.buttons)
        ? rawContent.buttons.map((button: any) => ({
            ...button,
            title: resolveButtonField(button, "title"),
            value: resolveButtonField(button, "value"),
          }))
        : [],
    },
  };
}

export interface GenericMessage {
  type: "text" | "interactive" | "system" | "template" | "media" | "image" | "video" | "audio" | "document";
  text?: string;
  buttons?: { id: string; title: string }[];
  buttonText?: string;
  sections?: Array<{
    title?: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>;
  templateName?: string;
  languageCode?: string;
  templateContent?: any;
  templateVariables?: Record<string, any>;
  templateParameters?: Array<Record<string, any>>;
  mediaUrl?: string;
}

export interface OutboundDeliveryResult {
  providerMessageId?: string | null;
  status?: string | null;
}

export const routeMessage = async (
  conversationId: string,
  message: GenericMessage,
  io?: any
) => {
  const convRes = await query(`
    SELECT
      c.bot_id,
      c.workspace_id,
      c.project_id,
      c.channel,
      c.channel_id,
      c.campaign_id,
      c.contact_id,
      c.platform_account_id,
      c.platform,
      c.current_flow,
      c.current_node,
      c.status,
      c.variables,
      ct.platform_user_id,
      ct.name AS contact_name,
      ct.phone AS contact_phone,
      ct.email AS contact_email
    FROM conversations c
    JOIN contacts ct ON c.contact_id = ct.id
    WHERE c.id = $1
  `, [conversationId]);

  const context = convRes.rows[0];
  if (!context) {
    throw { status: 404, message: `Conversation ${conversationId} not found` };
  }

  const {
    bot_id: botId,
    workspace_id: workspaceId,
    project_id: projectId,
    channel,
    channel_id: channelId,
    campaign_id: campaignId,
    contact_id: contactId,
    platform_account_id: platformAccountId,
    platform,
    platform_user_id: platformUserId,
    contact_name: contactName,
    contact_phone: contactPhone,
    contact_email: contactEmail,
    variables: conversationVariablesRaw,
  } = context;
  const normalizedChannel = normalizePlatform(platform || channel);
  const conversationVariables = parseJsonLike<Record<string, any>>(conversationVariablesRaw) || {};

  if (normalizedChannel === "whatsapp" && !platformAccountId) {
    throw {
      status: 400,
      message: "WhatsApp replies require a valid platform_account_id on the conversation",
    };
  }

  if (message.type === "template" && message.templateName) {
    if (!message.templateContent || !message.templateVariables) {
      const templateSupport = await getTemplateColumnSupport();
      const params: any[] = [message.templateName];
      const scopeConditions: string[] = [];
      const orderParts: string[] = [];
      const selectFields = [
        templateSupport.content ? "t.content" : "NULL AS content",
        "t.language",
        templateSupport.variables ? "t.variables" : "'{}'::jsonb AS variables",
      ];
      let platformParamIndex: number | null = null;

      if (templateSupport.platformType) {
        params.push(normalizedChannel);
        platformParamIndex = params.length;
        orderParts.push(`CASE WHEN t.platform_type = $${platformParamIndex} THEN 0 ELSE 1 END`);
      }

      if (templateSupport.campaignId && campaignId) {
        params.push(campaignId);
        scopeConditions.push(`t.campaign_id = $${params.length}`);
        orderParts.push(`CASE WHEN t.campaign_id = $${params.length} THEN 0 ELSE 1 END`);
      }
      if (templateSupport.projectId && projectId) {
        params.push(projectId);
        scopeConditions.push(`t.project_id = $${params.length}`);
        orderParts.push(`CASE WHEN t.project_id = $${params.length} THEN 0 ELSE 1 END`);
      }
      if (templateSupport.workspaceId && workspaceId) {
        params.push(workspaceId);
        scopeConditions.push(`t.workspace_id = $${params.length}`);
        orderParts.push(`CASE WHEN t.workspace_id = $${params.length} THEN 0 ELSE 1 END`);
      }
      if (templateSupport.botId && botId) {
        params.push(botId);
        scopeConditions.push(`t.bot_id = $${params.length}`);
        orderParts.push(`CASE WHEN t.bot_id = $${params.length} THEN 0 ELSE 1 END`);
      }

      const scopeWhere = scopeConditions.length
        ? `AND (${scopeConditions.join(" OR ")})`
        : "";
      const tplRes = await query(
        `SELECT ${selectFields.join(", ")}
         FROM templates t
         WHERE t.name = $1
           ${platformParamIndex ? `AND (t.platform_type = $${platformParamIndex} OR t.platform_type IS NULL)` : ""}
           ${scopeWhere}
         ORDER BY
           ${orderParts.join(", ")}${orderParts.length ? "," : ""}
           t.created_at DESC
         LIMIT 1`,
        params
      );

      if (tplRes.rows[0]) {
        message.templateContent = tplRes.rows[0].content;
        message.templateVariables = tplRes.rows[0].variables;
        message.languageCode = tplRes.rows[0].language || message.languageCode;
      } else {
        console.warn(`[Router] Template '${message.templateName}' not found in DB.`);
      }
    }

    if (message.templateContent) {
      const leadRes = await query(
        `SELECT *
         FROM leads
         WHERE contact_id = $1
           AND bot_id = $2
           AND COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid) =
               COALESCE($3, '00000000-0000-0000-0000-000000000000'::uuid)
         ORDER BY created_at DESC
         LIMIT 1`,
        [contactId, botId, projectId || null]
      );

      const valueLookup = buildTemplateTextLookup({
        conversationVariables,
        contact: {
          contactName: contactName || null,
          contactPhone: contactPhone || platformUserId || null,
          contactEmail: contactEmail || null,
        },
        lead: leadRes.rows[0] || {},
      });
      const resolvedTemplate = resolveTemplateMessageContent({
        content: message.templateContent,
        variableMap: message.templateVariables || {},
        valueLookup,
      });

      message.templateContent = resolvedTemplate.content;
      message.templateParameters = Object.keys(resolvedTemplate.valuesByToken)
        .sort((left, right) => Number(left) - Number(right))
        .map((token) => ({
          type: "text" as const,
          text: String(resolvedTemplate.valuesByToken[token] || ""),
        }))
        .filter((parameter) => parameter.text.trim() !== "");
    }
  }

  let deliveryResult: OutboundDeliveryResult = {
    providerMessageId: null,
    status: "sent",
  };

  if (normalizedChannel === "whatsapp") {
    deliveryResult = await sendWhatsAppAdapter(
      botId,
      platformUserId,
      message,
      channelId,
      platformAccountId
    );
  } else if (normalizedChannel === "website") {
    deliveryResult = await sendWebAdapter(botId, platformUserId, message, io, platformAccountId || null);
  } else if (normalizedChannel === "email") {
    deliveryResult = await sendEmailAdapter(
      botId,
      platformUserId,
      message,
      platformAccountId || null,
      workspaceId || null,
      projectId || null
    );
  } else {
    throw {
      status: 400,
      message: `Unsupported channel '${normalizedChannel}' for conversation replies`,
    };
  }

  const support = await getMessageDeliveryColumnSupport();
  const statusParamIndex =
    support.externalMessageId && support.status
      ? 13
      : support.externalMessageId || support.status
        ? 12
        : null;
  const columns = [
    "bot_id",
    "workspace_id",
    "project_id",
    "conversation_id",
    "channel",
    "sender",
    "sender_type",
    "platform",
    "platform_account_id",
    "platform_user_id",
    "message_type",
    "text",
    "content",
    ...(support.externalMessageId ? ["external_message_id"] : []),
    ...(support.status ? ["status"] : []),
    ...(support.statusUpdatedAt ? ["status_updated_at"] : []),
  ];
  const values = [
    "$1",
    "$2",
    "$3",
    "$4",
    "$5",
    "'bot'",
    "'bot'",
    "$6",
    "$7",
    "$8",
    "$9",
    "$10",
    "$11::jsonb",
    ...(support.externalMessageId ? ["$12"] : []),
    ...(support.status ? [`$${support.externalMessageId ? 13 : 12}`] : []),
    ...(support.statusUpdatedAt
      ? [
          `CASE WHEN $${statusParamIndex} IS NULL THEN NULL ELSE NOW() END`,
        ]
      : []),
  ];
  const params = [
    botId,
    workspaceId || null,
    projectId || null,
    conversationId,
    normalizedChannel,
    normalizedChannel,
    platformAccountId,
    platformUserId,
    message.type,
    message.text || null,
    JSON.stringify(message),
    ...(support.externalMessageId ? [deliveryResult.providerMessageId || null] : []),
    ...(support.status ? [deliveryResult.status || null] : []),
  ];

  await query(
    `INSERT INTO messages (${columns.join(", ")})
     VALUES (${values.join(", ")})`,
    params
  );

  await query(
    `UPDATE conversations
     SET updated_at = NOW(),
         last_message_at = NOW()
     WHERE id = $1`,
    [conversationId]
  );

  if (io && message.type !== "system") {
    io.emit("dashboard_update", {
      conversationId,
      botId,
      channel: normalizedChannel,
      platformUserId,
      message,
      deliveryStatus: deliveryResult.status || null,
      isBot: true,
    });
  }
};
