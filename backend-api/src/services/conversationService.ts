import {
  findConversationById,
  findConversationDetailById,
  findConversationsByBot,
  findConversationsByFilters,
  findMessagesForConversation,
  mergeConversationContextById,
  touchConversationAfterReply,
  updateConversationListById,
  updateConversationStatusById,
} from "../models/conversationModel";
import { query } from "../config/db";
import { findBotById } from "../models/botModel";
import { createConversationEvent } from "../models/conversationEventModel";
import { routeMessage } from "./messageRouter";
import { createSupportSurvey } from "../models/supportSurveyModel";
import { getBotSystemFlowId } from "./botSettingsService";
import { triggerFlowExternally } from "./flowEngine";
import {
  assertWorkspaceMembership,
  getMembershipAgentScope,
  normalizeWorkspaceRole,
} from "./workspaceAccessService";
import { findConversationSettingsByWorkspace } from "../models/conversationSettingsModel";
import {
  assertProjectContextAccess,
  assertProjectMembership,
  resolveVisibleProjectIdsForWorkspace,
} from "./projectAccessService";
import {
  createConversationNote,
  createConversationTag,
  deleteConversationTag,
  listConversationNotes,
  listConversationTags,
} from "../models/conversationMetaModel";
import { normalizePlatform } from "../utils/platform";

let templateColumnSupport:
  | {
      botId: boolean;
      workspaceId: boolean;
      projectId: boolean;
      campaignId: boolean;
      content: boolean;
      platformType: boolean;
      metaTemplateId: boolean;
      metaTemplateName: boolean;
      status: boolean;
    }
  | null = null;

let contactIdentityTableSupport: boolean | null = null;

function parseJsonLike(value: any) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
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
    content: columns.has("content"),
    platformType: columns.has("platform_type"),
    metaTemplateId: columns.has("meta_template_id"),
    metaTemplateName: columns.has("meta_template_name"),
    status: columns.has("status"),
  };

  return templateColumnSupport;
}

async function hasContactIdentityTable() {
  if (contactIdentityTableSupport !== null) {
    return contactIdentityTableSupport;
  }

  const res = await query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = 'contact_identities'
     LIMIT 1`
  );

  contactIdentityTableSupport = Boolean((res.rowCount || 0) > 0);
  return contactIdentityTableSupport;
}

function normalizeTemplateStatus(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "pending";
  if (normalized.includes("approved") || normalized.includes("active") || normalized.includes("quality pending")) {
    return "approved";
  }
  if (normalized.includes("reject")) return "rejected";
  if (normalized.includes("pause")) return "paused";
  if (normalized.includes("draft")) return "draft";
  return normalized;
}

function extractTemplateTokens(contentInput: any) {
  const content = parseJsonLike(contentInput) || contentInput || {};
  const fields = [
    content?.header?.text,
    content?.body,
    content?.footer,
    ...(Array.isArray(content?.buttons)
      ? content.buttons.flatMap((button: any) => [button?.title, button?.value])
      : []),
  ];
  const tokens = new Set<string>();

  for (const field of fields) {
    const source = String(field || "");
    const matches = source.matchAll(/{{\s*(\d+)\s*}}/g);
    for (const match of matches) {
      const token = String(match?.[1] || "").trim();
      if (token) {
        tokens.add(token);
      }
    }
  }

  return Array.from(tokens).sort((left, right) => Number(left) - Number(right));
}

function assertProjectScopedRuntimeBot(bot: any) {
  if (!bot?.workspace_id || !bot?.project_id) {
    throw {
      status: 409,
      message:
        "Legacy personal bot runtime is no longer supported. Move this bot into a workspace project.",
    };
  }

  return bot;
}

async function logConversationEventSafe(input: {
  conversationId: string;
  workspaceId?: string | null;
  actorUserId?: string | null;
  eventType: string;
  eventPayload?: Record<string, unknown>;
}) {
  try {
    await createConversationEvent(input);
  } catch (err) {
    console.warn("Conversation event logging skipped", err);
  }
}

async function assertConversationAccess(conversationId: string, userId: string) {
  const conversation = await findConversationById(conversationId);
  if (!conversation) {
    throw { status: 404, message: "Conversation not found" };
  }

  if (conversation.project_id) {
    await assertProjectMembership(userId, conversation.project_id);
  }

  if (conversation.workspace_id) {
    const membership = await assertWorkspaceMembership(userId, conversation.workspace_id);
    const role = normalizeWorkspaceRole(String(membership?.role || "viewer"));
    if (role === "workspace_admin") {
      return conversation;
    }

    if (role !== "agent") {
      throw { status: 403, message: "Forbidden" };
    }

    const settings = await findConversationSettingsByWorkspace(conversation.workspace_id);
    const canSeeUnassigned = Boolean(settings?.allow_agent_takeover);

    if (conversation.assigned_to === userId) {
      const scope = getMembershipAgentScope(membership);
      if (
        (scope.projectIds.length > 0 && !scope.projectIds.includes(String(conversation.project_id || ""))) ||
        (scope.campaignIds.length > 0 && !scope.campaignIds.includes(String(conversation.campaign_id || ""))) ||
        (scope.platforms.length > 0 &&
          !scope.platforms.includes(String(conversation.platform || conversation.channel || "").trim().toLowerCase())) ||
        (scope.channelIds.length > 0 && !scope.channelIds.includes(String(conversation.channel_id || "")))
      ) {
        throw { status: 403, message: "Forbidden" };
      }
      return conversation;
    }

    if (!conversation.assigned_to && canSeeUnassigned) {
      const scope = getMembershipAgentScope(membership);
      if (
        (scope.projectIds.length > 0 && !scope.projectIds.includes(String(conversation.project_id || ""))) ||
        (scope.campaignIds.length > 0 && !scope.campaignIds.includes(String(conversation.campaign_id || ""))) ||
        (scope.platforms.length > 0 &&
          !scope.platforms.includes(String(conversation.platform || conversation.channel || "").trim().toLowerCase())) ||
        (scope.channelIds.length > 0 && !scope.channelIds.includes(String(conversation.channel_id || "")))
      ) {
        throw { status: 403, message: "Forbidden" };
      }
      return conversation;
    }

    throw { status: 403, message: "Forbidden" };
    return conversation;
  }

  const bot = assertProjectScopedRuntimeBot(await findBotById(conversation.bot_id));
  await assertWorkspaceMembership(userId, bot.workspace_id);
  await assertProjectMembership(userId, bot.project_id);
  return conversation;
}

async function assertConversationWorkspaceAccess(conversationId: string, userId: string) {
  const conversation = await assertConversationAccess(conversationId, userId);
  if (!conversation.workspace_id) {
    throw { status: 400, message: "Workspace conversation is required" };
  }

  return conversation;
}

async function validateReplyRoutingForConversation(conversation: any) {
  const normalizedPlatform = normalizePlatform(conversation.platform || conversation.channel);

  if (!["whatsapp", "website", "email"].includes(normalizedPlatform)) {
    throw {
      status: 400,
      message: `Replies are not supported yet for platform '${normalizedPlatform || "unknown"}'`,
    };
  }

  const validatePlatformAccountShape = async (expectedPlatform: string) => {
    if (!conversation.platform_account_id) {
      return null;
    }

    const accountRes = await query(
      `SELECT id, workspace_id, project_id, platform_type, status, metadata
       FROM platform_accounts
       WHERE id = $1
       LIMIT 1`,
      [conversation.platform_account_id]
    );

    const account = accountRes.rows[0];
    if (!account) {
      throw {
        status: 400,
        message: `${expectedPlatform} replies require a platform account that still exists`,
      };
    }

    if (String(account.platform_type || "").toLowerCase() !== expectedPlatform) {
      throw {
        status: 400,
        message: `The conversation platform account must be a ${expectedPlatform} account`,
      };
    }

    if (String(account.status || "").toLowerCase() !== "active") {
      throw {
        status: 400,
        message: `The ${expectedPlatform} platform account is inactive`,
      };
    }

    if (conversation.workspace_id && account.workspace_id && account.workspace_id !== conversation.workspace_id) {
      throw {
        status: 400,
        message: "The conversation platform account belongs to a different workspace",
      };
    }

    if (conversation.project_id && account.project_id && account.project_id !== conversation.project_id) {
      throw {
        status: 400,
        message: "The conversation platform account belongs to a different project",
      };
    }

    return account;
  };

  if (normalizedPlatform === "website") {
    await validatePlatformAccountShape("website");
    return normalizedPlatform;
  }

  const recipient = String(
    conversation.contact_phone ||
      conversation.contact_phone_resolved ||
      conversation.external_id ||
      conversation.platform_user_id ||
      ""
  ).trim();

  if (normalizedPlatform === "email") {
    if (!recipient || !recipient.includes("@")) {
      throw {
        status: 400,
        message: "Email replies require a valid recipient email address on the conversation",
      };
    }

    const account = await validatePlatformAccountShape("email");
    if (account) {
      const metadata = account.metadata && typeof account.metadata === "object" ? account.metadata : {};
      const host = typeof metadata.host === "string" ? metadata.host : "";
      const user = typeof metadata.user === "string" ? metadata.user : "";
      if (!host || !user || !account.token) {
        throw {
          status: 400,
          message: "The email platform account is missing SMTP credentials",
        };
      }
    }

    return normalizedPlatform;
  }

  if (!conversation.platform_account_id) {
    throw {
      status: 400,
      message: "WhatsApp replies require a valid platform_account_id on the conversation",
    };
  }

  await validatePlatformAccountShape("whatsapp");

  return normalizedPlatform;
}

export async function getConversationsService(botId: string, userId: string) {
  const bot = assertProjectScopedRuntimeBot(await findBotById(botId));
  await assertWorkspaceMembership(userId, bot.workspace_id);
  await assertProjectMembership(userId, bot.project_id);

  return findConversationsByBot(botId);
}

export async function getWorkspaceConversationsService(
  filters: Record<string, string | undefined>,
  userId: string
) {
  let workspaceId = filters.workspaceId || null;
  let projectId = filters.projectId || null;
  let workspaceMembership: Awaited<ReturnType<typeof assertWorkspaceMembership>> | null = null;

  if (!workspaceId && !projectId && !filters.botId) {
    return [];
  }

  if (filters.botId) {
    const bot = assertProjectScopedRuntimeBot(await findBotById(filters.botId));
    workspaceMembership = await assertWorkspaceMembership(userId, bot.workspace_id);
    await assertProjectMembership(userId, bot.project_id);
    workspaceId = bot.workspace_id;
    projectId = projectId || bot.project_id;
  } else if (workspaceId) {
    workspaceMembership = await assertWorkspaceMembership(userId, workspaceId);
  }

  if (projectId) {
    await assertProjectContextAccess(userId, projectId, workspaceId);
  }

  if (!workspaceId && projectId) {
    const projectAccess = await assertProjectContextAccess(userId, projectId, null);
    workspaceId = String(projectAccess?.workspace_id || workspaceId || "");
    workspaceMembership = await assertWorkspaceMembership(userId, workspaceId);
  }

  let visibleAgentId: string | null = null;
  let includeVisibleUnassigned = false;
  let allowedProjectIds: string[] | null = null;
  let allowedCampaignIds: string[] | null = null;
  let allowedPlatforms: string[] | null = null;
  let allowedChannelIds: string[] | null = null;

  if (workspaceId && !projectId) {
    allowedProjectIds = await resolveVisibleProjectIdsForWorkspace(userId, workspaceId);
  }

  if (workspaceId && workspaceMembership) {
    const role = normalizeWorkspaceRole(String(workspaceMembership.role || "viewer"));
    if (role === "agent") {
      const settings = await findConversationSettingsByWorkspace(workspaceId);
      includeVisibleUnassigned = Boolean(settings?.allow_agent_takeover);
      visibleAgentId = userId;
      const scope = getMembershipAgentScope(workspaceMembership);

      if (
        filters.agentId &&
        filters.agentId !== "unassigned" &&
        filters.agentId !== userId
      ) {
        throw { status: 403, message: "Agents can only filter their own assignments" };
      }

      if (filters.agentId === "unassigned" && !includeVisibleUnassigned) {
        return [];
      }

      if (scope.projectIds.length > 0) {
        allowedProjectIds =
          allowedProjectIds === null
            ? scope.projectIds
            : allowedProjectIds.filter((projectId) => scope.projectIds.includes(projectId));
      }
      if (scope.campaignIds.length > 0) {
        allowedCampaignIds = scope.campaignIds;
      }
      if (scope.platforms.length > 0) {
        allowedPlatforms = scope.platforms;
      }
      if (scope.channelIds.length > 0) {
        allowedChannelIds = scope.channelIds;
      }
    } else if (role !== "workspace_admin" && role !== "editor" && role !== "viewer") {
      throw { status: 403, message: "Forbidden" };
    }
  }

  return findConversationsByFilters({
    workspaceId,
    projectId,
    botId: filters.botId || null,
    campaignId: filters.campaignId || null,
    channelId: filters.channelId || null,
    platform: filters.platform || null,
    platformAccountId: filters.platformAccountId || null,
    flowId: filters.flowId || null,
    listId: filters.listId || null,
    agentId: filters.agentId || null,
    status: filters.status || null,
    search: filters.search || null,
    dateFrom: filters.dateFrom || null,
    dateTo: filters.dateTo || null,
    visibleAgentId,
    includeVisibleUnassigned,
    allowedProjectIds,
    allowedCampaignIds,
    allowedPlatforms,
    allowedChannelIds,
  });
}

export async function getConversationService(id: string, userId: string) {
  await assertConversationAccess(id, userId);
  return findConversationDetailById(id);
}

export async function getConversationMessagesService(id: string, userId: string) {
  await assertConversationAccess(id, userId);
  return findMessagesForConversation(id);
}

export async function getConversationTimelineService(id: string, userId: string) {
  const conversation = await assertConversationAccess(id, userId);
  const contactId = String(conversation.contact_id || "").trim();
  if (!contactId) {
    return {
      conversation,
      contact: null,
      identities: [],
      timeline: [],
    };
  }

  const contactRes = await query(
    `SELECT c.id, c.name, c.phone, c.email, c.platform_user_id, c.created_at, c.updated_at
     FROM contacts c
     WHERE c.id = $1
     LIMIT 1`,
    [contactId]
  );
  const contact = contactRes.rows[0] || null;

  const includeIdentityEvents = await hasContactIdentityTable();
  const identitiesRes = includeIdentityEvents
    ? await query(
        `SELECT ci.id, ci.platform, ci.identity_type, ci.identity_value, ci.metadata, ci.created_at, ci.updated_at
         FROM contact_identities ci
         WHERE ci.contact_id = $1
         ORDER BY ci.created_at DESC NULLS LAST, ci.updated_at DESC NULLS LAST`,
        [contactId]
      )
    : { rows: [] };

  const timelineSql = `
    WITH convo_events AS (
      SELECT
        'conversation' AS event_type,
        c.id::text AS event_id,
        c.id::text AS source_id,
        COALESCE(NULLIF(c.channel, ''), NULLIF(c.platform, ''), 'conversation') AS source_type,
        COALESCE(NULLIF(c.contact_name, ''), NULLIF(ct.name, ''), 'Conversation') AS title,
        COALESCE(c.status, 'active') AS status,
        c.created_at AS created_at,
        c.updated_at AS updated_at,
        c.last_message_at AS happened_at,
        jsonb_build_object(
          'botId', c.bot_id,
          'campaignId', c.campaign_id,
          'channelId', c.channel_id,
          'entryPointId', c.entry_point_id,
          'flowId', c.flow_id,
          'listId', c.list_id,
          'platform', c.platform,
          'unreadCount', c.unread_count
        ) AS payload
      FROM conversations c
      LEFT JOIN contacts ct ON ct.id = c.contact_id
      WHERE c.contact_id = $1
    ),
    lead_events AS (
      SELECT
        'lead' AS event_type,
        l.id::text AS event_id,
        l.id::text AS source_id,
        COALESCE(NULLIF(l.platform, ''), 'lead') AS source_type,
        COALESCE(NULLIF(l.name, ''), NULLIF(l.company_name, ''), 'Lead') AS title,
        COALESCE(l.status, 'new') AS status,
        l.created_at AS created_at,
        l.updated_at AS updated_at,
        l.updated_at AS happened_at,
        jsonb_build_object(
          'campaignId', l.campaign_id,
          'channelId', l.channel_id,
          'entryPointId', l.entry_point_id,
          'flowId', l.flow_id,
          'listId', l.list_id,
          'leadFormId', l.lead_form_id,
          'source', l.source,
          'companyName', l.company_name,
          'email', l.email,
          'phone', l.phone
        ) AS payload
      FROM leads l
      WHERE l.contact_id = $1
        AND l.deleted_at IS NULL
    ),
    message_events AS (
      SELECT
        'message' AS event_type,
        m.id::text AS event_id,
        m.id::text AS source_id,
        COALESCE(NULLIF(m.channel, ''), 'message') AS source_type,
        COALESCE(
          NULLIF(m.content->>'text', ''),
          NULLIF(m.text, ''),
          NULLIF(m.message, ''),
          COALESCE(m.content->>'type', 'message')
        ) AS title,
        COALESCE(m.sender_type, m.sender, 'user') AS status,
        m.created_at AS created_at,
        m.created_at AS updated_at,
        m.created_at AS happened_at,
        jsonb_build_object(
          'conversationId', m.conversation_id,
          'sender', COALESCE(m.sender_type, m.sender, 'user'),
          'messageType', COALESCE(m.message_type, m.content->>'type', 'text'),
          'deliveryStatus', COALESCE(m.status, m.content->>'deliveryStatus', NULL)
        ) AS payload
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.contact_id = $1
    ),
    ${includeIdentityEvents ? `
    identity_events AS (
      SELECT
        'identity' AS event_type,
        ci.id::text AS event_id,
        ci.id::text AS source_id,
        COALESCE(NULLIF(ci.platform, ''), 'identity') AS source_type,
        COALESCE(ci.identity_type, 'identity') AS title,
        ci.identity_value AS status,
        ci.created_at AS created_at,
        ci.updated_at AS updated_at,
        ci.created_at AS happened_at,
        jsonb_build_object(
          'platform', ci.platform,
          'metadata', ci.metadata
        ) AS payload
      FROM contact_identities ci
      WHERE ci.contact_id = $1
    )
    ` : ``}
    SELECT *
    FROM (
      SELECT * FROM convo_events
      UNION ALL
      SELECT * FROM lead_events
      UNION ALL
      SELECT * FROM message_events
      ${includeIdentityEvents ? `UNION ALL
      SELECT * FROM identity_events` : ``}
    ) timeline
    ORDER BY COALESCE(happened_at, updated_at, created_at) DESC NULLS LAST, event_type ASC
    LIMIT 200
    `;

  let timelineRows: any[] = [];
  try {
    const timelineRes = await query(timelineSql, [contactId]);
    timelineRows = timelineRes.rows;
  } catch (error) {
    console.warn("[Conversation Timeline Warning]", {
      conversationId: id,
      contactId,
      includeIdentityEvents,
      error: (error as any)?.message || error,
    });
  }

  return {
    conversation,
    contact,
    identities: identitiesRes.rows,
    timeline: timelineRows,
  };
}

export async function updateConversationStatusService(
  id: string,
  status: string,
  userId: string,
  io?: any
) {
  const normalized = String(status || "").trim().toLowerCase();
  const allowed = new Set([
    "active",
    "closed",
    "agent_pending",
    "open",
    "pending",
    "resolved",
    "bot",
    "agent",
  ]);

  if (!allowed.has(normalized)) {
    throw { status: 400, message: "Invalid status" };
  }

  await assertConversationAccess(id, userId);

  const mappedStatus =
    normalized === "pending"
      ? "agent_pending"
      : normalized === "bot"
        ? "active"
        : normalized;

  const updated = await updateConversationStatusById(id, mappedStatus);
  if (!updated) {
    throw { status: 404, message: "Conversation not found" };
  }

  if (normalized === "resolved") {
    await mergeConversationContextById(id, {
      csat_pending: true,
      csat_requested_at: new Date().toISOString(),
      csat_requested_by: userId,
    });

    await routeMessage(
      id,
      {
        type: "interactive",
        text: "Your ticket has been resolved. How would you rate your support experience today?",
        buttons: [
          { id: "csat_good", title: "Great" },
          { id: "csat_okay", title: "Okay" },
          { id: "csat_bad", title: "Bad" },
        ],
      },
      io
    );

    await createSupportSurvey({
      conversationId: id,
      workspaceId: updated.workspace_id || null,
      projectId: updated.project_id || null,
      botId: updated.bot_id || null,
      rating: "requested",
      source: "status_resolved",
      rawPayload: {
        actorUserId: userId,
      },
    });

    const mappedFlowId = updated.bot_id
      ? await getBotSystemFlowId(String(updated.bot_id), "conversation_close")
      : null;
    if (mappedFlowId) {
      const result = await triggerFlowExternally({
        botId: String(updated.bot_id),
        flowId: mappedFlowId,
        conversationId: id,
        platform: String(updated.platform || updated.channel || "").trim() || null,
        channel: String(updated.channel || updated.platform || "").trim() || null,
        io,
      });

      for (const action of result.actions || []) {
        await routeMessage(id, action, io);
      }
    } else {
      await routeMessage(
        id,
        {
          type: "interactive",
          text: "Your ticket has been resolved. How would you rate your support experience today?",
          buttons: [
            { id: "csat_good", title: "Great" },
            { id: "csat_okay", title: "Okay" },
            { id: "csat_bad", title: "Bad" },
          ],
        },
        io
      );
    }
  }

  await logConversationEventSafe({
    conversationId: id,
    workspaceId: updated.workspace_id || null,
    actorUserId: userId,
    eventType: "status_updated",
    eventPayload: {
      status: mappedStatus,
    },
  });

  return findConversationDetailById(id);
}

export async function replyToConversationService(
  id: string,
  payload: {
    text?: string;
    type?: string;
    templateName?: string;
    languageCode?: string;
    templateVariableValues?: Record<string, string>;
    mediaUrl?: string;
    buttons?: Array<{ id?: string; title?: string }>;
  },
  userId: string,
  io?: any
) {
  const conversation = await assertConversationAccess(id, userId);
  const replyPlatform = await validateReplyRoutingForConversation(conversation);
  if (conversation.workspace_id) {
    const settings = await findConversationSettingsByWorkspace(conversation.workspace_id);
    if (settings && !settings.allow_manual_reply) {
      throw { status: 403, message: "Manual reply is disabled for this workspace" };
    }
  }
  const type = String(payload.type || "text").trim().toLowerCase();

  if (type === "template" && !payload.templateName) {
    throw { status: 400, message: "templateName is required" };
  }

  if (
    type !== "template" &&
    type !== "interactive" &&
    type !== "button" &&
    type !== "list" &&
    !["image", "video", "audio", "document", "media"].includes(type) &&
    !String(payload.text || "").trim()
  ) {
    throw { status: 400, message: "Message text is required" };
  }

  if (["image", "video", "audio", "document", "media"].includes(type) && !String(payload.mediaUrl || "").trim()) {
    throw { status: 400, message: "mediaUrl is required" };
  }

  if (["interactive", "button", "list"].includes(type)) {
    const buttons = Array.isArray(payload.buttons)
      ? payload.buttons
          .map((button, index) => ({
            id: String(button?.id || `option_${index + 1}`),
            title: String(button?.title || "").trim(),
          }))
          .filter((button) => button.title)
      : [];

    if (buttons.length === 0) {
      throw { status: 400, message: "buttons are required for interactive replies" };
    }

    const message = {
      type: "interactive" as const,
      text: String(payload.text || "").trim() || "Choose an option",
      buttons,
      entryKind: "manual_reply",
      pricingCategory: "service",
    };

    await routeMessage(id, message, io);
    const updated = await touchConversationAfterReply(id, {
      text: message.text,
      type: "interactive",
      buttons,
    });

    await logConversationEventSafe({
      conversationId: id,
      workspaceId: conversation.workspace_id || null,
      actorUserId: userId,
      eventType: "reply_sent",
      eventPayload: updated.messageSummary,
    });

    return {
      conversation: await findConversationDetailById(id),
      messages: await findMessagesForConversation(id),
    };
  }

  const message =
    type === "template"
      ? {
          type: "template" as const,
          templateName: String(payload.templateName),
          ...(payload.languageCode ? { languageCode: payload.languageCode } : {}),
        }
      : ["image", "video", "audio", "document", "media"].includes(type)
        ? {
            type: type as "image" | "video" | "audio" | "document" | "media",
            mediaUrl: String(payload.mediaUrl || "").trim(),
            ...(String(payload.text || "").trim()
              ? { text: String(payload.text || "").trim() }
              : {}),
          }
      : {
          type: "text" as const,
          text: String(payload.text || "").trim(),
        };

  if (type === "template") {
    const templateName = String(payload.templateName || "").trim();
    const platform = normalizePlatform(String(conversation.platform || conversation.channel || "").trim());
    const templateSupport = await getTemplateColumnSupport();
    const params: any[] = [templateName, platform];
    const scopeConditions: string[] = [];
    const orderParts: string[] = [];
    let platformCondition = "";

    if (templateSupport.platformType) {
      platformCondition = `AND (LOWER(COALESCE(NULLIF(TRIM(t.platform_type), ''), $2)) = $2 OR t.platform_type IS NULL)`;
    }
    if (templateSupport.campaignId && conversation.campaign_id) {
      params.push(conversation.campaign_id);
      scopeConditions.push(`t.campaign_id = $${params.length}`);
    }
    if (templateSupport.projectId && conversation.project_id) {
      params.push(conversation.project_id);
      scopeConditions.push(`t.project_id = $${params.length}`);
    }
    if (templateSupport.workspaceId && conversation.workspace_id) {
      params.push(conversation.workspace_id);
      scopeConditions.push(`t.workspace_id = $${params.length}`);
    }
    if (templateSupport.botId && conversation.bot_id) {
      params.push(conversation.bot_id);
      scopeConditions.push(`t.bot_id = $${params.length}`);
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

    const templateRes = await query(
      `SELECT t.*
       FROM templates t
       WHERE t.name = $1
         ${platformCondition}
         ${scopeConditions.length ? `AND (${scopeConditions.join(" OR ")})` : ""}
       ORDER BY
         ${orderParts.join(", ")}${orderParts.length ? "," : ""}
         t.created_at DESC
       LIMIT 1`,
      params
    );

    const template = templateRes.rows[0];
    if (!template) {
      throw { status: 404, message: "Approved template not found for this conversation scope." };
    }

    if (normalizeTemplateStatus(template.status) !== "approved") {
      throw { status: 400, message: "Only approved templates can be sent from the inbox." };
    }

    const variableValues =
      payload.templateVariableValues && typeof payload.templateVariableValues === "object"
        ? payload.templateVariableValues
        : {};
    const tokens = extractTemplateTokens(template.content);
    const existingVariables = parseJsonLike(conversation.variables) || {};
    const manualTemplateVariables: Record<string, string> = {};

    for (const token of tokens) {
      const value = String(variableValues[token] ?? "").trim();
      if (!value) {
        throw { status: 400, message: `Value for variable {{${token}}} is required.` };
      }
      const variableKey = `manual_${token}`;
      manualTemplateVariables[token] = variableKey;
      existingVariables[variableKey] = value;
    }

    await query(
      `UPDATE conversations
       SET variables = $2::jsonb, updated_at = NOW()
       WHERE id = $1`,
      [id, JSON.stringify(existingVariables)]
    );

    Object.assign(message, {
      languageCode: String(template.language || payload.languageCode || "en_US"),
      templateContent: template.content,
      templateVariables: manualTemplateVariables,
      metaTemplateId: template.meta_template_id || null,
      metaTemplateName: template.meta_template_name || null,
      pricingCategory: String(template.category || "marketing").trim().toLowerCase(),
      entryKind: "manual_reply",
    });
  } else {
    Object.assign(message, {
      entryKind: "manual_reply",
      pricingCategory: "service",
    });
  }

  await routeMessage(id, message, io);
  const updated = await touchConversationAfterReply(id, {
    text: payload.text || null,
    type,
    templateName: payload.templateName || null,
    languageCode: payload.languageCode || null,
  });

  await logConversationEventSafe({
    conversationId: id,
    workspaceId: conversation.workspace_id || null,
    actorUserId: userId,
    eventType: type === "template" ? "reply_template_sent" : "reply_sent",
    eventPayload: {
      ...updated.messageSummary,
      platform: replyPlatform,
    },
  });

  return {
    conversation: await findConversationDetailById(id),
    messages: await findMessagesForConversation(id),
  };
}

export async function addConversationNoteService(
  id: string,
  payload: { note?: string },
  userId: string
) {
  const conversation = await assertConversationWorkspaceAccess(id, userId);
  const note = String(payload.note || "").trim();
  if (!note) {
    throw { status: 400, message: "Note is required" };
  }

  await createConversationNote({
    conversationId: id,
    workspaceId: conversation.workspace_id,
    authorUserId: userId,
    note,
  });

  await logConversationEventSafe({
    conversationId: id,
    workspaceId: conversation.workspace_id,
    actorUserId: userId,
    eventType: "note_added",
    eventPayload: { note },
  });

  return {
    notes: await listConversationNotes(id),
    conversation: await findConversationDetailById(id),
  };
}

export async function addConversationTagService(
  id: string,
  payload: { tag?: string },
  userId: string
) {
  const conversation = await assertConversationWorkspaceAccess(id, userId);
  const tag = String(payload.tag || "").trim().toLowerCase();
  if (!tag) {
    throw { status: 400, message: "Tag is required" };
  }

  await createConversationTag({
    conversationId: id,
    workspaceId: conversation.workspace_id,
    createdBy: userId,
    tag,
  });

  await logConversationEventSafe({
    conversationId: id,
    workspaceId: conversation.workspace_id,
    actorUserId: userId,
    eventType: "tag_added",
    eventPayload: { tag },
  });

  return {
    tags: await listConversationTags(id),
    conversation: await findConversationDetailById(id),
  };
}

export async function deleteConversationTagService(id: string, tag: string, userId: string) {
  const conversation = await assertConversationWorkspaceAccess(id, userId);
  const normalizedTag = String(tag || "").trim().toLowerCase();
  if (!normalizedTag) {
    throw { status: 400, message: "Tag is required" };
  }

  const deleted = await deleteConversationTag(id, normalizedTag);
  if (!deleted) {
    throw { status: 404, message: "Tag not found" };
  }

  await logConversationEventSafe({
    conversationId: id,
    workspaceId: conversation.workspace_id,
    actorUserId: userId,
    eventType: "tag_removed",
    eventPayload: { tag: normalizedTag },
  });

  return {
    tags: await listConversationTags(id),
    conversation: await findConversationDetailById(id),
  };
}

export async function updateConversationListService(
  id: string,
  payload: { listId?: string | null },
  userId: string
) {
  const conversation = await assertConversationWorkspaceAccess(id, userId);
  const nextListId = payload.listId ? String(payload.listId).trim() : null;

  if (nextListId) {
    const params: any[] = [nextListId, conversation.workspace_id];
    let projectClause = "";
    if (conversation.project_id) {
      params.push(conversation.project_id);
      projectClause = `AND COALESCE(l.project_id, c.project_id) = $${params.length}`;
    }

    const res = await query(
      `SELECT l.id
       FROM lists l
       JOIN campaigns c ON c.id = l.campaign_id
       WHERE l.id = $1
         AND c.workspace_id = $2
         ${projectClause}
       LIMIT 1`,
      params
    );
    if (!res.rows[0]) {
      throw { status: 400, message: "List must belong to the same workspace project" };
    }
  }

  await updateConversationListById(id, nextListId);

  await logConversationEventSafe({
    conversationId: id,
    workspaceId: conversation.workspace_id,
    actorUserId: userId,
    eventType: "list_updated",
    eventPayload: { listId: nextListId },
  });

  return findConversationDetailById(id);
}

export async function updateConversationContextService(
  id: string,
  payload: { context?: Record<string, unknown> },
  userId: string
) {
  const conversation = await assertConversationWorkspaceAccess(id, userId);
  const context = payload.context;
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    throw { status: 400, message: "context must be an object" };
  }

  await mergeConversationContextById(id, context);

  await logConversationEventSafe({
    conversationId: id,
    workspaceId: conversation.workspace_id,
    actorUserId: userId,
    eventType: "context_updated",
    eventPayload: context,
  });

  return findConversationDetailById(id);
}
