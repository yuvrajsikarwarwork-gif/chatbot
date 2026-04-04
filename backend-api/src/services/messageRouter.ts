import { query } from "../config/db";
import crypto from "crypto";
import { sendWebAdapter } from "../connectors/website/websiteAdapter";
import { sendEmailAdapter } from "../connectors/email/emailAdapter";
import { sendWhatsAppAdapter } from "../connectors/whatsapp/whatsappAdapter";
import { normalizePlatform } from "../utils/platform";
import {
  assertWalletCanCharge,
  recordAiReplyUsage,
  recordOutboundMessageCharge,
} from "./walletService";

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
      metaTemplateId: boolean;
      metaTemplateName: boolean;
      status: boolean;
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
    metaTemplateId: columns.has("meta_template_id"),
    metaTemplateName: columns.has("meta_template_name"),
    status: columns.has("status"),
  };

  return templateColumnSupport;
}

async function canSendMessage(conversationId: string) {
  const res = await query(
    `SELECT COALESCE(ct.opted_in, true) AS opted_in
     FROM conversations c
     JOIN contacts ct ON ct.id = c.contact_id
     WHERE c.id = $1
       AND c.deleted_at IS NULL
     LIMIT 1`,
    [conversationId]
  );

  return res.rows[0]?.opted_in === true;
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

function extractOrderedTemplateTokens(text: string) {
  const matches = Array.from(String(text || "").matchAll(/{{\s*(\d+)\s*}}/g));
  const tokens = new Set<string>();
  for (const match of matches) {
    const token = String(match?.[1] || "").trim();
    if (token) {
      tokens.add(token);
    }
  }
  return Array.from(tokens).sort((left, right) => Number(left) - Number(right));
}

function buildTemplateComponentParameters(input: {
  content: any;
  valuesByToken: Record<string, string>;
}) {
  const rawContent = parseJsonLike<any>(input.content) || {};
  const valuesByToken = input.valuesByToken || {};
  const components: Array<Record<string, any>> = [];
  const headerType = String(rawContent?.header?.type || "").trim().toLowerCase();
  const headerText = String(rawContent?.header?.text || "");
  const headerTokens = extractOrderedTemplateTokens(headerText);

  if (headerType === "text" && headerTokens.length > 0) {
    const parameters = headerTokens
      .map((token) => String(valuesByToken[token] || "").trim())
      .filter(Boolean)
      .map((text) => ({
        type: "text" as const,
        text,
      }));

    if (parameters.length > 0) {
      components.push({
        type: "header",
        parameters,
      });
    }
  }

  const bodyTokens = extractOrderedTemplateTokens(String(rawContent?.body || ""));
  if (bodyTokens.length > 0) {
    const parameters = bodyTokens
      .map((token) => String(valuesByToken[token] || "").trim())
      .filter(Boolean)
      .map((text) => ({
        type: "text" as const,
        text,
      }));

    if (parameters.length > 0) {
      components.push({
        type: "body",
        parameters,
      });
    }
  }

  const buttons = Array.isArray(rawContent?.buttons) ? rawContent.buttons : [];
  buttons.forEach((button: any, index: number) => {
    const buttonType = String(button?.type || "").trim().toLowerCase();
    if (buttonType !== "url") {
      return;
    }

    const value = String(button?.value || "");
    const tokens = extractOrderedTemplateTokens(value);
    if (tokens.length === 0) {
      return;
    }

    const firstToken = String(tokens[0] || "").trim();
    if (!firstToken) {
      return;
    }

    const parameterValue = String(valuesByToken[firstToken] || "").trim();
    if (!parameterValue) {
      return;
    }

    components.push({
      type: "button",
      sub_type: "url",
      index: String(index),
      parameters: [
        {
          type: "text",
          text: parameterValue,
        },
      ],
    });
  });

  return components;
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
  templateComponents?: Array<Record<string, any>>;
  metaTemplateId?: string | null;
  metaTemplateName?: string | null;
  mediaUrl?: string;
  pricingCategory?: string | null;
  entryKind?: string | null;
  providerOpaqueRef?: string | null;
}

export interface OutboundDeliveryResult {
  providerMessageId?: string | null;
  status?: string | null;
}

const OUTBOUND_IDEMPOTENCY_WINDOW_SECONDS = 300;

function buildOutboundDeliveryKey(conversationId: string, message: GenericMessage) {
  const normalized = JSON.stringify({
    conversationId,
    type: message.type,
    text: message.text || null,
    buttons: message.buttons || null,
    buttonText: message.buttonText || null,
    sections: message.sections || null,
    templateName: message.templateName || null,
    languageCode: message.languageCode || null,
    templateContent: message.templateContent || null,
    templateVariables: message.templateVariables || null,
    templateParameters: message.templateParameters || null,
    templateComponents: message.templateComponents || null,
    metaTemplateId: message.metaTemplateId || null,
    metaTemplateName: message.metaTemplateName || null,
    mediaUrl: message.mediaUrl || null,
    pricingCategory: message.pricingCategory || null,
    entryKind: message.entryKind || null,
  });

  return crypto.createHash("sha256").update(normalized).digest("hex");
}

async function reserveOutboundMessage(input: {
  botId: string;
  workspaceId?: string | null;
  projectId?: string | null;
  conversationId: string;
  normalizedChannel: string;
  platformAccountId?: string | null;
  platformUserId: string;
  message: GenericMessage;
  support: { externalMessageId: boolean; status: boolean; statusUpdatedAt: boolean };
}) {
  const deliveryKey = buildOutboundDeliveryKey(input.conversationId, input.message);
  const duplicateSelect = [
    "id",
    ...(input.support.externalMessageId ? ["external_message_id"] : ["NULL AS external_message_id"]),
    ...(input.support.status ? ["status"] : ["NULL AS status"]),
  ];
  const duplicateStatusFilter = input.support.status
    ? "AND COALESCE(status, 'sent') <> 'failed'"
    : "";
  const duplicateRes = await query(
    `SELECT ${duplicateSelect.join(", ")}
     FROM messages
     WHERE conversation_id = $1
       AND sender = 'bot'
       AND content->>'deliveryKey' = $2
       ${duplicateStatusFilter}
       AND created_at >= NOW() - ($3 * INTERVAL '1 second')
     ORDER BY created_at DESC
     LIMIT 1`,
    [input.conversationId, deliveryKey, OUTBOUND_IDEMPOTENCY_WINDOW_SECONDS]
  );

  const duplicate = duplicateRes.rows[0];
  if (duplicate) {
    return {
      duplicate: true,
      messageId: String(duplicate.id),
      providerMessageId: duplicate.external_message_id || null,
      status: duplicate.status || "sent",
      deliveryKey,
    };
  }

  const contentPayload = {
    ...input.message,
    deliveryKey,
    deliveryStatus: "sending",
  };
  const statusParamIndex =
    input.support.externalMessageId && input.support.status
      ? 13
      : input.support.externalMessageId || input.support.status
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
    ...(input.support.externalMessageId ? ["external_message_id"] : []),
    ...(input.support.status ? ["status"] : []),
    ...(input.support.statusUpdatedAt ? ["status_updated_at"] : []),
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
    ...(input.support.externalMessageId ? ["$12"] : []),
    ...(input.support.status ? [`$${input.support.externalMessageId ? 13 : 12}`] : []),
    ...(input.support.statusUpdatedAt
      ? [
          `CASE WHEN $${statusParamIndex} IS NULL THEN NULL ELSE NOW() END`,
        ]
      : []),
  ];
  const params = [
    input.botId,
    input.workspaceId || null,
    input.projectId || null,
    input.conversationId,
    input.normalizedChannel,
    input.normalizedChannel,
    input.platformAccountId || null,
    input.platformUserId,
    input.message.type,
    input.message.text || null,
    JSON.stringify(contentPayload),
    ...(input.support.externalMessageId ? [null] : []),
    ...(input.support.status ? ["sending"] : []),
  ];

  const reserveRes = await query(
    `INSERT INTO messages (${columns.join(", ")})
     VALUES (${values.join(", ")})
     RETURNING id`,
    params
  );

  return {
    duplicate: false,
    messageId: String(reserveRes.rows[0]?.id),
    providerMessageId: null,
    status: "sending",
    deliveryKey,
  };
}

async function finalizeReservedOutboundMessage(input: {
  messageId: string;
  support: { externalMessageId: boolean; status: boolean; statusUpdatedAt: boolean };
  deliveryResult: OutboundDeliveryResult;
  message: GenericMessage;
  deliveryKey: string;
}) {
  const support = input.support;
  const assignments = [
    "content = $2::jsonb",
    ...(support.externalMessageId ? ["external_message_id = $3"] : []),
    ...(support.status ? [`status = $${support.externalMessageId ? 4 : 3}`] : []),
    ...(support.statusUpdatedAt
      ? [`status_updated_at = CASE WHEN $${support.externalMessageId && support.status ? 4 : support.status ? 3 : 2} IS NULL THEN status_updated_at ELSE NOW() END`]
      : []),
  ];
  const params = [
    input.messageId,
    JSON.stringify({
      ...input.message,
      deliveryKey: input.deliveryKey,
      deliveryStatus: input.deliveryResult.status || "sent",
      providerMessageId: input.deliveryResult.providerMessageId || null,
    }),
    ...(support.externalMessageId ? [input.deliveryResult.providerMessageId || null] : []),
    ...(support.status ? [input.deliveryResult.status || "sent"] : []),
  ];

  await query(
    `UPDATE messages
     SET ${assignments.join(", ")}
     WHERE id = $1`,
    params
  );
}

async function markReservedOutboundMessageFailed(input: {
  messageId: string;
  support: { externalMessageId: boolean; status: boolean; statusUpdatedAt: boolean };
  message: GenericMessage;
  deliveryKey: string;
  errorMessage: string;
}) {
  const assignments = [
    "content = $2::jsonb",
    ...(input.support.status ? ["status = $3"] : []),
    ...(input.support.statusUpdatedAt ? [`status_updated_at = NOW()`] : []),
  ];
  const params = [
    input.messageId,
    JSON.stringify({
      ...input.message,
      deliveryKey: input.deliveryKey,
      deliveryStatus: "failed",
      deliveryError: input.errorMessage,
    }),
    ...(input.support.status ? ["failed"] : []),
  ];
  await query(
    `UPDATE messages
     SET ${assignments.join(", ")}
     WHERE id = $1`,
    params
  );
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
      AND c.deleted_at IS NULL
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

  const tenantDeletionRes = await query(
    `SELECT
       EXISTS (
         SELECT 1
         FROM workspaces
         WHERE id = $1
           AND deleted_at IS NOT NULL
       ) AS workspace_deleted,
       EXISTS (
         SELECT 1
         FROM bots
         WHERE id = $2
           AND deleted_at IS NOT NULL
       ) AS bot_deleted`,
    [workspaceId || null, botId]
  );
  if (tenantDeletionRes.rows[0]?.workspace_deleted || tenantDeletionRes.rows[0]?.bot_deleted) {
    console.log(`[Router] Dropping outbound message for soft-deleted tenant conversation=${conversationId}`);
    return;
  }

  if (!(await canSendMessage(conversationId))) {
    console.log(`[Router] Dropping outbound message for opted-out conversation=${conversationId}`);
    return;
  }

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
        templateSupport.metaTemplateId ? "t.meta_template_id" : "NULL AS meta_template_id",
        templateSupport.metaTemplateName ? "t.meta_template_name" : "NULL AS meta_template_name",
        templateSupport.status ? "t.status" : "NULL AS status",
      ];
      let platformParamIndex: number | null = null;

      if (templateSupport.platformType) {
        params.push(normalizedChannel);
        platformParamIndex = params.length;
        orderParts.push(`CASE WHEN t.platform_type = $${platformParamIndex} THEN 0 ELSE 1 END`);
      }
      if (templateSupport.status) {
        orderParts.push(
          `CASE WHEN LOWER(COALESCE(NULLIF(TRIM(t.status), ''), 'pending')) = 'approved' THEN 0 ELSE 1 END`
        );
      }
      if (templateSupport.metaTemplateId || templateSupport.metaTemplateName) {
        const metaIdentityChecks = [
          templateSupport.metaTemplateId
            ? `NULLIF(TRIM(COALESCE(t.meta_template_id, '')), '') IS NOT NULL`
            : null,
          templateSupport.metaTemplateName
            ? `NULLIF(TRIM(COALESCE(t.meta_template_name, '')), '') IS NOT NULL`
            : null,
        ]
          .filter(Boolean)
          .join(" OR ");
        if (metaIdentityChecks) {
          orderParts.push(`CASE WHEN (${metaIdentityChecks}) THEN 0 ELSE 1 END`);
        }
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
        message.metaTemplateId = tplRes.rows[0].meta_template_id || null;
        message.metaTemplateName = tplRes.rows[0].meta_template_name || null;
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
           AND deleted_at IS NULL
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
      const originalTemplateContent = message.templateContent;
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
      message.templateComponents = buildTemplateComponentParameters({
        content: originalTemplateContent,
        valuesByToken: resolvedTemplate.valuesByToken,
      });
    }
  }

  let deliveryResult: OutboundDeliveryResult = {
    providerMessageId: null,
    status: "sent",
  };
  const support = await getMessageDeliveryColumnSupport();
  const reservedMessage = await reserveOutboundMessage({
    botId,
    workspaceId: workspaceId || null,
    projectId: projectId || null,
    conversationId,
    normalizedChannel,
    platformAccountId: platformAccountId || null,
    platformUserId,
    message,
    support,
  });
  if (reservedMessage.duplicate) {
    return;
  }
  message.providerOpaqueRef = reservedMessage.deliveryKey;
  const pricingCategory =
    String(message.pricingCategory || "").trim().toLowerCase() ||
    (message.type === "template" ? "marketing" : normalizedChannel === "whatsapp" ? "service" : "");
  const estimatedAmount =
    normalizedChannel === "whatsapp"
      ? undefined
      : 0;

  try {
    if (normalizedChannel === "whatsapp") {
      const walletChargeCheck =
        estimatedAmount !== undefined
          ? {
              workspaceId,
              platform: normalizedChannel,
              amount: estimatedAmount,
            }
          : {
              workspaceId,
              platform: normalizedChannel,
            };
      await assertWalletCanCharge(walletChargeCheck);
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
  } catch (error: any) {
    await markReservedOutboundMessageFailed({
      messageId: reservedMessage.messageId,
      support,
      message,
      deliveryKey: reservedMessage.deliveryKey,
      errorMessage: String(error?.message || error || "Outbound delivery failed"),
    });
    throw error;
  }

  await recordOutboundMessageCharge({
    workspaceId,
    projectId,
    conversationId,
    botId,
    platform: normalizedChannel,
    externalMessageId: deliveryResult.providerMessageId || null,
    pricingCategory,
    entryKind: message.entryKind || null,
    referenceType: message.type === "template" ? "template" : "conversation",
    referenceId:
      message.type === "template"
        ? String(message.metaTemplateId || message.metaTemplateName || "")
        : conversationId,
    metadata: {
      messageType: message.type,
      templateName: message.templateName || null,
    },
  });

  if (String(message.entryKind || "").trim().toLowerCase() === "ai_reply") {
    await recordAiReplyUsage({
      workspaceId,
      projectId,
      conversationId,
      botId,
      platform: normalizedChannel,
      metadata: {
        messageType: message.type,
      },
    });
  }

  await finalizeReservedOutboundMessage({
    messageId: reservedMessage.messageId,
    support,
    deliveryResult,
    message,
    deliveryKey: reservedMessage.deliveryKey,
  });

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
