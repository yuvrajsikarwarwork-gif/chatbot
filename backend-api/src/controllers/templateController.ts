import { Response } from "express";

import { query } from "../config/db";
import { PolicyRequest } from "../middleware/policyMiddleware";
import { routeMessage, GenericMessage } from "../services/messageRouter";
import { applyConversationWorkspacePolicies } from "../services/conversationAssignmentService";
import { findPlatformAccountsByWorkspaceProject } from "../models/platformAccountModel";
import { decryptSecret } from "../utils/encryption";
import { validateTemplateInput } from "../utils/whatsappTemplateSchema";
import {
  normalizeWhatsAppPlatformUserId,
  upsertContactWithIdentity,
} from "../services/contactIdentityService";
import { cancelPendingJobsByConversation, createJob } from "../models/queueJobModel";
import {
  assertProjectScopedWriteAccess,
  type ProjectRole,
} from "../services/projectAccessService";
import {
  assertBotWorkspacePermission,
  assertWorkspacePermission,
  WORKSPACE_PERMISSIONS,
} from "../services/workspaceAccessService";
import { clearUserTimers } from "../services/flowEngine";
import { assertCampaignRunLimit } from "../services/businessValidationService";
import { recordWorkspaceUsage } from "../services/billingService";

const TEMPLATE_OPERATOR_ROLES: ProjectRole[] = ["project_admin", "editor"];
const TEMPLATE_DELETE_ROLES: ProjectRole[] = ["project_admin"];
const SCHEMA_COMPAT_ERROR_CODES = new Set(["42P01", "42703"]);
const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v23.0";
const EMPTY_UUID = "00000000-0000-0000-0000-000000000000";
const FLOW_WAIT_JOB_TYPES = ["flow_wait_reminder", "flow_wait_timeout"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const normalizeTemplateContent = (body: any) => {
  if (body.content && typeof body.content === "object") {
    return {
      header: body.content.header || null,
      body: body.content.body || "",
      footer: body.content.footer || "",
      buttons: Array.isArray(body.content.buttons) ? body.content.buttons : [],
      samples: body.content.samples || {},
    };
  }

  return {
    header:
      body.header_type && body.header_type !== "none"
        ? {
            type: body.header_type || "text",
            text: body.header,
            ...((body.header_asset_url || body.headerAssetUrl) &&
            ["image", "video", "document"].includes(String(body.header_type || "").trim().toLowerCase())
              ? {
                  assetUrl: String(body.header_asset_url || body.headerAssetUrl || "").trim(),
                }
              : {}),
          }
        : null,
    body: body.body || "",
    footer: body.footer || "",
    buttons: body.buttons || [],
    samples: body.samples || {},
  };
};

function getUserId(req: PolicyRequest) {
  return req.user?.id || req.user?.user_id || null;
}

function getWorkspaceId(req: PolicyRequest) {
  return (
    req.activeWorkspaceId ||
    (req.query.workspaceId as string) ||
    (req.headers["x-workspace-id"] as string) ||
    undefined
  );
}

function getProjectId(req: PolicyRequest) {
  return (
    req.activeProjectId ||
    (req.query.projectId as string) ||
    (req.headers["x-project-id"] as string) ||
    undefined
  );
}

function isUuidLike(value: string) {
  return UUID_PATTERN.test(String(value || "").trim());
}

async function assertTemplateScopePermission(input: {
  userId: string;
  workspaceId?: string | null;
  projectId?: string | null;
  workspacePermission: (typeof WORKSPACE_PERMISSIONS)[keyof typeof WORKSPACE_PERMISSIONS];
  allowedProjectRoles: ProjectRole[];
}) {
  const workspaceId = String(input.workspaceId || "").trim() || null;
  const projectId = String(input.projectId || "").trim() || null;

  if (projectId) {
    await assertProjectScopedWriteAccess({
      userId: input.userId,
      projectId,
      workspaceId,
      workspacePermission: input.workspacePermission,
      allowedProjectRoles: input.allowedProjectRoles,
    });
    return;
  }

  if (workspaceId) {
    await assertWorkspacePermission(input.userId, workspaceId, input.workspacePermission);
  }
}

async function findAccessibleBot(botId: string, userId: string) {
  const res = await query(
    `SELECT id, workspace_id, project_id
     FROM bots
     WHERE id = $1
     LIMIT 1`,
    [botId]
  );

  const bot = res.rows[0];
  if (!bot) {
    throw { status: 404, message: "Bot not found" };
  }

  if (bot.workspace_id || bot.project_id) {
    await assertTemplateScopePermission({
      userId,
      workspaceId: bot.workspace_id,
      projectId: bot.project_id,
      workspacePermission: WORKSPACE_PERMISSIONS.createCampaign,
      allowedProjectRoles: TEMPLATE_OPERATOR_ROLES,
    });
  } else {
    await assertBotWorkspacePermission(userId, botId, WORKSPACE_PERMISSIONS.createCampaign);
  }

  return bot;
}

async function findAccessibleCampaign(campaignId: string, userId: string) {
  const normalizedCampaignId = String(campaignId || "").trim();
  if (!normalizedCampaignId || !UUID_PATTERN.test(normalizedCampaignId)) {
    return null;
  }

  const res = await query(
    `SELECT id, workspace_id, project_id
     FROM campaigns
     WHERE id = $1
     LIMIT 1`,
    [normalizedCampaignId]
  );

  const campaign = res.rows[0];
  if (!campaign) {
    throw { status: 404, message: "Campaign not found" };
  }

  await assertTemplateScopePermission({
    userId,
    workspaceId: campaign.workspace_id,
    projectId: campaign.project_id,
    workspacePermission: WORKSPACE_PERMISSIONS.createCampaign,
    allowedProjectRoles: TEMPLATE_OPERATOR_ROLES,
  });

  return campaign;
}

async function resolveTemplateRuntime(
  template: any,
  scope?: {
    workspaceId?: string | null;
    projectId?: string | null;
    preferredBotId?: string | null;
  }
) {
  const normalizedPlatform = String(template.platform_type || "").trim().toLowerCase();
  const scopedWorkspaceId =
    String(template.workspace_id || scope?.workspaceId || "").trim() || null;
  const scopedProjectId =
    String(template.project_id || scope?.projectId || "").trim() || null;
  const preferredBotId = String(scope?.preferredBotId || "").trim() || null;

  const resolveScopedPlatformAccountId = async () => {
    if (!scopedWorkspaceId) {
      return null;
    }

    const scopedAccounts = await findPlatformAccountsByWorkspaceProject(
      scopedWorkspaceId,
      scopedProjectId,
      normalizedPlatform || undefined
    );
    const activeAccount = scopedAccounts.find((account: any) => {
      const status = String(account?.status || "").trim().toLowerCase();
      return status === "active" || status === "";
    });

    return activeAccount?.id || null;
  };

  const resolvePreferredBot = async () => {
    if (!preferredBotId) {
      return null;
    }

    const preferredBotRes = await query(
      `SELECT id, workspace_id, project_id, status
       FROM bots
       WHERE id = $1
       LIMIT 1`,
      [preferredBotId]
    );

    const preferredBot = preferredBotRes.rows[0];
    if (!preferredBot || String(preferredBot.status || "").toLowerCase() !== "active") {
      return null;
    }

    if (
      scopedWorkspaceId &&
      String(preferredBot.workspace_id || "") !== String(scopedWorkspaceId)
    ) {
      return null;
    }

    if (
      scopedProjectId &&
      String(preferredBot.project_id || "") !== String(scopedProjectId)
    ) {
      return null;
    }

    return preferredBot;
  };

  if (template.bot_id) {
    const scopedPlatformAccountId = await resolveScopedPlatformAccountId();
    return {
      botId: template.bot_id,
      workspaceId: scopedWorkspaceId,
      projectId: scopedProjectId,
      platform: template.platform_type,
      channelId: null,
      platformAccountId: scopedPlatformAccountId,
    };
  }

  const preferredBot = await resolvePreferredBot();
  if (preferredBot?.id) {
    const scopedPlatformAccountId = await resolveScopedPlatformAccountId();
    if (normalizedPlatform !== "whatsapp" || scopedPlatformAccountId) {
      return {
        botId: preferredBot.id,
        workspaceId: preferredBot.workspace_id || scopedWorkspaceId,
        projectId: preferredBot.project_id || scopedProjectId,
        platform: normalizedPlatform || "whatsapp",
        channelId: null,
        platformAccountId: scopedPlatformAccountId,
      };
    }
  }

  if (!template.campaign_id) {
    throw { status: 409, message: "Template is not linked to a runtime campaign channel" };
  }

  const channelRes = await query(
    `SELECT cc.id,
            cc.bot_id,
            cc.platform,
            cc.platform_account_id,
            cc.platform_account_ref_id,
            c.workspace_id,
            c.project_id
     FROM campaign_channels cc
     JOIN campaigns c ON c.id = cc.campaign_id
     WHERE cc.campaign_id = $1
       AND cc.status = 'active'
     ORDER BY cc.created_at ASC
     LIMIT 1`,
    [template.campaign_id]
  );

  const channel = channelRes.rows[0];
  if (channel?.bot_id) {
    return {
      botId: channel.bot_id,
      workspaceId: channel.workspace_id || template.workspace_id || null,
      projectId: channel.project_id || template.project_id || null,
      platform: template.platform_type || channel.platform,
      channelId: channel.id,
      platformAccountId: channel.platform_account_ref_id || channel.platform_account_id || null,
    };
  }

  const fallbackWorkspaceId = scopedWorkspaceId;
  const fallbackProjectId = scopedProjectId;

  const fallbackBotsRes = await query(
    `SELECT id, workspace_id, project_id
     FROM bots
     WHERE status = 'active'
       AND COALESCE(project_id, '${EMPTY_UUID}'::uuid) =
           COALESCE($1, '${EMPTY_UUID}'::uuid)
       AND COALESCE(workspace_id, '${EMPTY_UUID}'::uuid) =
           COALESCE($2, '${EMPTY_UUID}'::uuid)
     ORDER BY updated_at DESC NULLS LAST, created_at DESC
     LIMIT 1`,
    [fallbackProjectId, fallbackWorkspaceId]
  );

  const fallbackBot = fallbackBotsRes.rows[0];
  const fallbackAccounts = await findPlatformAccountsByWorkspaceProject(
    fallbackWorkspaceId || "",
    fallbackProjectId,
    normalizedPlatform || undefined
  );
  const fallbackAccount = fallbackAccounts.find((account: any) => {
    const status = String(account?.status || "").trim().toLowerCase();
    return status === "active" || status === "";
  });

  if (fallbackBot?.id && (normalizedPlatform !== "whatsapp" || fallbackAccount?.id)) {
    return {
      botId: fallbackBot.id,
      workspaceId: fallbackBot.workspace_id || fallbackWorkspaceId,
      projectId: fallbackBot.project_id || fallbackProjectId,
      platform: normalizedPlatform || "whatsapp",
      channelId: null,
      platformAccountId: fallbackAccount?.id || null,
    };
  }

  if (!template.campaign_id) {
    throw {
      status: 409,
      message: "Template is not linked to a runtime campaign channel, and no active bot/account fallback was found for this workspace/project.",
    };
  }

  throw {
    status: 409,
    message: "Campaign needs at least one active channel with a bot before sending templates, and no active bot/account fallback was found for this workspace/project.",
  };
}

export async function findAccessibleTemplate(
  templateId: string,
  userId: string,
  workspacePermission: (typeof WORKSPACE_PERMISSIONS)[keyof typeof WORKSPACE_PERMISSIONS] =
    WORKSPACE_PERMISSIONS.viewCampaigns,
  allowedProjectRoles: ProjectRole[] = TEMPLATE_OPERATOR_ROLES,
  fallbackScope?: {
    workspaceId?: string | null;
    projectId?: string | null;
  }
) {
  const columnMap = await getTemplateColumnMap();
  const joins: string[] = [];
  const workspaceScope = [
    columnMap.hasWorkspaceId ? "t.workspace_id" : null,
    columnMap.hasBotId ? "b.workspace_id" : null,
    columnMap.hasCampaignId ? "c.workspace_id" : null,
  ].filter(Boolean).join(", ");
  const projectScope = [
    columnMap.hasProjectId ? "t.project_id" : null,
    columnMap.hasBotId ? "b.project_id" : null,
    columnMap.hasCampaignId ? "c.project_id" : null,
  ].filter(Boolean).join(", ");

  if (columnMap.hasBotId) {
    joins.push(`LEFT JOIN bots b ON b.id = t.bot_id`);
  }

  if (columnMap.hasCampaignId) {
    joins.push(`LEFT JOIN campaigns c ON c.id = t.campaign_id`);
  }

  const res = await query(
    `SELECT t.*,
            ${workspaceScope ? `COALESCE(${workspaceScope})` : "NULL"} AS workspace_id,
            ${projectScope ? `COALESCE(${projectScope})` : "NULL"} AS project_id
     FROM templates t
     ${joins.join("\n")}
     WHERE t.id = $1
     LIMIT 1`,
    [templateId]
  );

  const template = res.rows[0];
  if (!template) {
    throw { status: 404, message: "Template not found" };
  }

  if (template.workspace_id || template.project_id) {
    await assertTemplateScopePermission({
      userId,
      workspaceId: template.workspace_id,
      projectId: template.project_id,
      workspacePermission,
      allowedProjectRoles,
    });
  } else if (template.campaign_id) {
    const campaign = await findAccessibleCampaign(String(template.campaign_id), userId);
    if (!campaign) {
      throw { status: 400, message: "INVALID_CAMPAIGN_ID" };
    }
    template.workspace_id = campaign.workspace_id || null;
    template.project_id = campaign.project_id || null;
  } else if (template.bot_id) {
    await assertBotWorkspacePermission(userId, template.bot_id, workspacePermission);
  } else if (fallbackScope?.workspaceId || fallbackScope?.projectId) {
    await assertTemplateScopePermission({
      userId,
      workspaceId: fallbackScope?.workspaceId ?? null,
      projectId: fallbackScope?.projectId ?? null,
      workspacePermission,
      allowedProjectRoles,
    });
    template.workspace_id = fallbackScope?.workspaceId || null;
    template.project_id = fallbackScope?.projectId || null;
  } else {
    throw { status: 404, message: "Template not found" };
  }

  return template;
}

async function assertTemplateReadScope(
  userId: string,
  workspaceId?: string,
  projectId?: string
) {
  await assertTemplateScopePermission({
    userId,
    workspaceId: workspaceId ?? null,
    projectId: projectId ?? null,
    workspacePermission: WORKSPACE_PERMISSIONS.viewCampaigns,
    allowedProjectRoles: TEMPLATE_OPERATOR_ROLES,
  });
}

async function filterRowsByReadableTemplateScope<
  T extends { workspace_id?: string | null; project_id?: string | null }
>(userId: string, rows: T[]) {
  const accessCache = new Map<string, boolean>();

  const filtered: T[] = [];
  for (const row of rows) {
    const workspaceId = String(row.workspace_id || "").trim();
    const projectId = String(row.project_id || "").trim();
    if (!workspaceId || !projectId) {
      filtered.push(row);
      continue;
    }

    const cacheKey = `${workspaceId}:${projectId}`;
    if (!accessCache.has(cacheKey)) {
      try {
        await assertTemplateScopePermission({
          userId,
          workspaceId,
          projectId,
          workspacePermission: WORKSPACE_PERMISSIONS.viewCampaigns,
          allowedProjectRoles: TEMPLATE_OPERATOR_ROLES,
        });
        accessCache.set(cacheKey, true);
      } catch (err: any) {
        if (err?.status && err.status !== 403) {
          throw err;
        }
        accessCache.set(cacheKey, false);
      }
    }

    if (accessCache.get(cacheKey)) {
      filtered.push(row);
    }
  }

  return filtered;
}

async function getTemplateColumnMap() {
  const res = await query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_name = 'templates'
       AND table_schema = current_schema()`
  );

  const names = new Set<string>(res.rows.map((row: any) => row.column_name));
  return {
    hasBotId: names.has("bot_id"),
    hasWorkspaceId: names.has("workspace_id"),
    hasProjectId: names.has("project_id"),
    hasCampaignId: names.has("campaign_id"),
    hasPlatformType: names.has("platform_type"),
    hasHeaderType: names.has("header_type"),
    hasHeader: names.has("header"),
    hasBody: names.has("body"),
    hasFooter: names.has("footer"),
    hasVariables: names.has("variables"),
    hasContent: names.has("content"),
    hasRejectedReason: names.has("rejected_reason"),
    hasMetaTemplateId: names.has("meta_template_id"),
    hasMetaTemplateName: names.has("meta_template_name"),
    hasMetaLastSyncedAt: names.has("meta_last_synced_at"),
    hasMetaPayload: names.has("meta_payload"),
  };
}

function normalizeMetaTemplateName(input: string) {
  const trimmed = String(input || "").trim().toLowerCase();
  const normalized = trimmed
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || `template_${Date.now()}`;
}

function normalizeTemplateStatus(input: unknown) {
  const status = String(input || "").trim().toLowerCase();
  if (!status) return "pending";
  if (status === "in_review" || status.includes("review")) {
    return "in_review";
  }
  if (
    ["approved", "active", "enabled"].includes(status) ||
    status.includes("quality pending") ||
    status.includes("active")
  ) {
    return "approved";
  }
  if (
    ["rejected", "disabled", "failed"].includes(status) ||
    status.includes("rejected")
  ) {
    return "rejected";
  }
  if (["paused"].includes(status) || status.includes("paused")) return "paused";
  if (["pending", "submitted"].includes(status) || status.includes("pending")) {
    return "pending";
  }
  return status;
}

const SUPPORTED_TEMPLATE_PLATFORMS = new Set([
  "whatsapp",
  "telegram",
  "email",
  "facebook",
  "instagram",
]);

function normalizeTemplatePlatform(input: unknown) {
  const platform = String(input || "").trim().toLowerCase();
  if (!platform) {
    return "whatsapp";
  }
  if (SUPPORTED_TEMPLATE_PLATFORMS.has(platform)) {
    return platform;
  }
  return "whatsapp";
}

function stringifyRejectionReason(input: unknown) {
  if (!input) return null;
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

function isMetaLanguageDeletionError(error: any) {
  const metaError = error?.metaError || {};
  const subcode = String(metaError?.error_subcode || "");
  const userTitle = String(metaError?.error_user_title || "").toLowerCase();
  const userMessage = String(metaError?.error_user_msg || "").toLowerCase();

  return (
    subcode === "2388023" ||
    userTitle.includes("language is being deleted") ||
    userMessage.includes("content can't be added while the existing")
  );
}

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

function isPlaceholderTemplateName(value: unknown) {
  const normalized = normalizeMetaTemplateName(String(value || ""));
  return !normalized || normalized === "imported_template";
}

function getPreferredMetaTemplateName(template: any, requestedName?: unknown) {
  const metaPayload = parseJsonLike(template?.meta_payload) || {};
  const candidates = [
    requestedName,
    template?.meta_template_name,
    metaPayload?.name,
    template?.name,
  ];

  for (const candidate of candidates) {
    const raw = String(candidate || "").trim();
    if (!raw || isPlaceholderTemplateName(raw)) {
      continue;
    }
    return normalizeMetaTemplateName(raw);
  }

  return "";
}

function computeTemplateOrigin(input: {
  template: any;
  metaPayload: any;
}) {
  const hasMetaIdentity = Boolean(
    String(input.template?.meta_template_id || input.metaPayload?.id || "").trim() ||
    String(input.template?.meta_template_name || input.metaPayload?.name || "").trim()
  );
  const hasMetaPayload = Boolean(input.metaPayload && Object.keys(input.metaPayload).length > 0);
  const isPlaceholder = isPlaceholderTemplateName(input.template?.name);

  if (isPlaceholder && hasMetaPayload) {
    return "repaired";
  }
  if (hasMetaIdentity && hasMetaPayload) {
    return "meta_linked";
  }
  if (hasMetaIdentity) {
    return "meta_imported";
  }
  return "local";
}

function computeTemplateRuntimeReadiness(input: {
  platformType: string;
  content: any;
  status: string;
  origin: string;
}) {
  const platform = String(input.platformType || "").trim().toLowerCase();
  const headerType = String(input.content?.header?.type || "").trim().toLowerCase();
  const hasMediaHeader = ["image", "video", "document"].includes(headerType);
  const hasRuntimeAsset = Boolean(
    String(input.content?.header?.assetId || "").trim() ||
    String(input.content?.header?.assetUrl || "").trim()
  );

  if (platform !== "whatsapp") {
    return "ready";
  }
  if (input.origin === "repaired" && !String(input.content?.body || "").trim()) {
    return "broken_meta_link";
  }
  if (hasMediaHeader && !hasRuntimeAsset) {
    return "missing_runtime_asset";
  }
  if (String(input.status || "").trim().toLowerCase() === "in_review") {
    return "in_review";
  }
  return "ready";
}

function normalizeTemplateRecordForResponse(template: any) {
  const metaPayload = parseJsonLike(template?.meta_payload) || {};
  const payloadContent = parseMetaTemplateComponents(metaPayload?.components || []);
  const rawContent = parseJsonLike(template?.content) || {};
  const rawVariables = parseJsonLike(template?.variables) || {};
  const platformType = normalizeTemplatePlatform(template?.platform_type || metaPayload?.platform_type || "whatsapp");
  const content = {
    header:
      rawContent?.header ??
      payloadContent?.header ??
      (template?.header_type && template?.header_type !== "none"
        ? {
            type: template.header_type,
            text: template.header || "",
          }
        : null),
    body: rawContent?.body || payloadContent?.body || template?.body || "",
    footer: rawContent?.footer || payloadContent?.footer || template?.footer || "",
    buttons: Array.isArray(rawContent?.buttons)
      ? rawContent.buttons
      : Array.isArray(payloadContent?.buttons)
        ? payloadContent.buttons
      : Array.isArray(template?.buttons)
        ? template.buttons
        : [],
    samples: rawContent?.samples || payloadContent?.samples || {},
  };
  const normalizedStatus = normalizeTemplateStatus(template?.status || metaPayload?.status || "pending");
  const templateOrigin = computeTemplateOrigin({
    template,
    metaPayload,
  });
  const runtimeReadiness = computeTemplateRuntimeReadiness({
    platformType: template?.platform_type,
    content,
    status: normalizedStatus,
    origin: templateOrigin,
  });

  return {
    ...template,
    platform_type: platformType,
    name:
      !isPlaceholderTemplateName(template?.name) && String(template?.name || "").trim()
        ? template.name
        : String(metaPayload?.name || template?.meta_template_name || template?.name || "Imported Template"),
    meta_template_id: template?.meta_template_id || metaPayload?.id || null,
    meta_template_name: template?.meta_template_name || metaPayload?.name || null,
    status: normalizedStatus,
    template_origin: templateOrigin,
    meta_sync_status: normalizeTemplateStatus(metaPayload?.status || template?.status || "pending"),
    last_meta_sync_status: normalizeTemplateStatus(metaPayload?.status || template?.status || "pending"),
    last_meta_sync_error:
      normalizeTemplateStatus(metaPayload?.status || template?.status || "") === "rejected"
        ? stringifyRejectionReason(template?.rejected_reason || metaPayload?.rejected_reason || metaPayload?.reason)
        : null,
    runtime_readiness: runtimeReadiness,
    content,
    variables: rawVariables,
    header_type: content.header?.type || "none",
    header: content.header?.text || "",
    body: content.body || "",
    footer: content.footer || "",
    buttons: content.buttons,
  };
}

function extractTemplateVariableTokens(contentInput: any) {
  const content = parseJsonLike(contentInput) || contentInput || {};
  const textFields = [
    content?.header?.text,
    content?.body,
    content?.footer,
    ...(Array.isArray(content?.buttons)
      ? content.buttons.flatMap((button: any) => [button?.title, button?.value])
      : []),
  ];
  const tokens = new Set<string>();

  for (const field of textFields) {
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

async function getMetaTemplateConnection(template: any) {
  if (String(template.platform_type || "").toLowerCase() !== "whatsapp") {
    throw { status: 400, message: "Meta template sync is only available for WhatsApp templates" };
  }

  const channelRes = await query(
    `SELECT
       cc.id AS channel_id,
       cc.platform,
       cc.platform_type,
       cc.status,
       cc.platform_account_ref_id,
       pa.id AS platform_account_id,
       pa.token,
       pa.business_id,
       pa.account_id,
       pa.name
     FROM campaign_channels cc
     LEFT JOIN platform_accounts pa ON pa.id = cc.platform_account_ref_id
     WHERE cc.campaign_id = $1
       AND LOWER(COALESCE(NULLIF(TRIM(cc.platform), ''), NULLIF(TRIM(cc.platform_type), ''))) = 'whatsapp'
       AND LOWER(TRIM(COALESCE(cc.status, 'active'))) = 'active'
     ORDER BY cc.created_at ASC
     LIMIT 1`,
    [template.campaign_id]
  );

  const channel = channelRes.rows[0];
  if (!channel) {
    const fallbackAccounts = await findPlatformAccountsByWorkspaceProject(
      String(template.workspace_id || "").trim(),
      String(template.project_id || "").trim() || null,
      "whatsapp"
    );

    const activeAccount = fallbackAccounts.find((account: any) => {
      const status = String(account?.status || "").trim().toLowerCase();
      return status === "active" || status === "";
    });

    if (activeAccount?.id && activeAccount?.token && activeAccount?.business_id) {
      const accessToken = decryptSecret(activeAccount.token);
      if (!accessToken) {
        throw {
          status: 409,
          message: "Connected WhatsApp account token could not be decrypted.",
        };
      }
      return {
        platformAccountId: activeAccount.id,
        accessToken,
        wabaId: activeAccount.business_id,
        phoneNumberId: activeAccount.account_id || null,
      };
    }

    const debugChannels = await query(
      `SELECT id, platform, platform_type, status, platform_account_id, platform_account_ref_id
       FROM campaign_channels
       WHERE campaign_id = $1
       ORDER BY created_at ASC`,
      [template.campaign_id]
    );
    const summary =
      debugChannels.rows.length > 0
        ? debugChannels.rows
            .map(
              (row: any) =>
                `[${row.id}] platform=${row.platform || "null"} platform_type=${row.platform_type || "null"} status=${row.status || "null"} account_ref=${row.platform_account_ref_id || "null"}`
            )
            .join("; ")
        : "no campaign channels found";
    throw {
      status: 409,
      message: `Campaign needs an active WhatsApp channel before Meta template sync can run. Current channels: ${summary}`,
    };
  }

  if (!channel.platform_account_id || !channel.token || !channel.business_id) {
    throw {
      status: 409,
      message: "Connected WhatsApp account is missing Meta business credentials. Make sure the campaign channel uses an account with business ID and access token.",
    };
  }

  const accessToken = decryptSecret(channel.token);
  if (!accessToken) {
    throw {
      status: 409,
      message: "Connected WhatsApp account token could not be decrypted.",
    };
  }

  return {
    platformAccountId: channel.platform_account_id,
    accessToken,
    wabaId: channel.business_id,
    phoneNumberId: channel.account_id || null,
  };
}

function buildMetaTemplateComponents(template: any) {
  const content = normalizeTemplateContent(template);
  const templateVariables = parseJsonLike(template?.variables) || {};
  const components: any[] = [];
  const contentSamples = parseJsonLike(content?.samples) || {};
  const mediaSample =
    String(content.header?.assetId || content.header?.text || "").trim()
      ? [String(content.header?.assetId || content.header?.text || "").trim()]
      : [];
  const previewSampleMap: Record<string, string> = {
    name: "Sample Name",
    full_name: "Sample Name",
    user_name: "Sample Name",
    wa_number: "+910000000000",
    phone: "+910000000000",
    mobile: "+910000000000",
    email: "sample@example.com",
    source: "Sample Source",
  };
  const bodyTokens = Array.from(
    new Set(
      String(content.body || "")
        .match(/{{\s*(\d+)\s*}}/g)
        ?.map((token) => token.replace(/[{}]/g, "").trim()) || []
    )
  );
  const savedBodySamples = Array.isArray(contentSamples?.bodyText)
    ? contentSamples.bodyText.map((value: any) => String(value || "").trim()).filter(Boolean)
    : [];
  const bodyExampleValues =
    savedBodySamples.length >= bodyTokens.length
      ? savedBodySamples.slice(0, bodyTokens.length)
      : bodyTokens.map((token) => {
          const mappedField = String(templateVariables?.[token] || "").trim();
          return previewSampleMap[mappedField] || `sample_${token}`;
        });
  const savedHeaderSamples = Array.isArray(contentSamples?.headerText)
    ? contentSamples.headerText.map((value: any) => String(value || "").trim()).filter(Boolean)
    : [];

  if (content.header?.type === "text" && content.header?.text) {
    components.push({
      type: "HEADER",
      format: "TEXT",
      text: String(content.header.text),
      ...(savedHeaderSamples.length > 0
        ? {
            example: {
              header_text: savedHeaderSamples,
            },
          }
        : {}),
    });
  } else if (content.header?.type === "image") {
    components.push({
      type: "HEADER",
      format: "IMAGE",
      ...(mediaSample.length > 0
        ? {
            example: {
              header_handle: mediaSample,
            },
          }
        : {}),
    });
  } else if (content.header?.type === "video") {
    components.push({
      type: "HEADER",
      format: "VIDEO",
      ...(mediaSample.length > 0
        ? {
            example: {
              header_handle: mediaSample,
            },
          }
        : {}),
    });
  } else if (content.header?.type === "document") {
    components.push({
      type: "HEADER",
      format: "DOCUMENT",
      ...(mediaSample.length > 0
        ? {
            example: {
              header_handle: mediaSample,
            },
          }
        : {}),
    });
  } else if (content.header?.type === "location") {
    components.push({
      type: "HEADER",
      format: "LOCATION",
    });
  }

  components.push({
    type: "BODY",
    text: String(content.body || ""),
    ...(bodyExampleValues.length > 0
      ? {
          example: {
            body_text: [bodyExampleValues],
          },
        }
      : {}),
  });

  if (content.footer) {
    components.push({
      type: "FOOTER",
      text: String(content.footer),
    });
  }

  const buttons = Array.isArray(content.buttons) ? content.buttons : [];
  if (buttons.length > 0) {
    const normalizedButtons = buttons
      .map((button: any) => {
        const type = String(button?.type || "").toLowerCase();
        if (type === "website" || type === "url") {
          const urlMode = String(button?.urlMode || "").trim().toLowerCase();
          const sampleValue = String(button?.sampleValue || "").trim();
          return {
            type: "URL",
            text: String(button?.title || "Open"),
            url: String(button?.value || ""),
            ...((urlMode === "dynamic" || sampleValue) && sampleValue
              ? {
                  example: [sampleValue],
                }
              : {}),
          };
        }
        if (type === "phone") {
          return {
            type: "PHONE_NUMBER",
            text: String(button?.title || "Call"),
            phone_number: String(button?.value || ""),
          };
        }
        if (type === "copy_code") {
          return {
            type: "COPY_CODE",
            text: String(button?.title || "Copy code"),
            example: String(button?.sampleValue || button?.value || ""),
          };
        }
        if (type === "flow") {
          return {
            type: "QUICK_REPLY",
            text: String(button?.title || "Open flow"),
          };
        }
        if (type === "catalog") {
          return {
            type: "QUICK_REPLY",
            text: String(button?.title || "Open catalog"),
          };
        }
        return {
          type: "QUICK_REPLY",
          text: String(button?.title || "Reply"),
        };
      })
      .sort((left: any, right: any) => {
        const rank = (type: string) => (type === "QUICK_REPLY" ? 0 : 1);
        return rank(String(left?.type || "")) - rank(String(right?.type || ""));
      });

    components.push({
      type: "BUTTONS",
      buttons: normalizedButtons.slice(0, 10),
    });
  }

  return components;
}

function parseMetaTemplateComponents(components: any[]) {
  const content = {
    header: null as any,
    body: "",
    footer: "",
    buttons: [] as any[],
    samples: {} as any,
  };

  for (const component of Array.isArray(components) ? components : []) {
    const type = String(component?.type || "").toUpperCase();
    if (type === "HEADER") {
      const format = String(component?.format || "TEXT").toLowerCase();
      if (format === "text") {
        content.header = {
          type: "text",
          text: String(component?.text || ""),
        };
        if (Array.isArray(component?.example?.header_text)) {
          content.samples.headerText = component.example.header_text;
        }
      } else {
        const headerHandle =
          Array.isArray(component?.example?.header_handle) &&
          component.example.header_handle.length > 0
            ? String(component.example.header_handle[0] || "").trim()
            : "";
        content.header = {
          type: format,
          text: "",
          ...(headerHandle ? { assetId: headerHandle } : {}),
        };
      }
    }

    if (type === "BODY") {
      content.body = String(component?.text || "");
      if (
        Array.isArray(component?.example?.body_text) &&
        Array.isArray(component.example.body_text[0])
      ) {
        content.samples.bodyText = component.example.body_text[0];
      }
    }

    if (type === "FOOTER") {
      content.footer = String(component?.text || "");
    }

    if (type === "BUTTONS") {
      const buttons = Array.isArray(component?.buttons) ? component.buttons : [];
      content.buttons = buttons.map((button: any) => {
        const buttonType = String(button?.type || "").toUpperCase();
        if (buttonType === "URL") {
          return {
            type: "url",
            title: String(button?.text || ""),
            value: String(button?.url || ""),
            urlMode:
              /{{\s*\d+\s*}}$/.test(String(button?.url || "")) || Array.isArray(button?.example)
                ? "dynamic"
                : "static",
            sampleValue:
              Array.isArray(button?.example) && button.example.length > 0
                ? String(button.example[0] || "")
                : "",
          };
        }
        if (buttonType === "PHONE_NUMBER") {
          return {
            type: "phone",
            title: String(button?.text || ""),
            value: String(button?.phone_number || ""),
          };
        }
        return {
          type: "quick_reply",
          title: String(button?.text || ""),
          value: String(button?.text || ""),
        };
      });
    }
  }

  return content;
}

async function metaGraphRequest<T>(input: {
  accessToken: string;
  method?: "GET" | "POST";
  path: string;
  body?: Record<string, unknown>;
  query?: Record<string, string | number | boolean | null | undefined>;
}) {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${input.path.replace(/^\/+/, "")}`);
  url.searchParams.set("access_token", input.accessToken);
  for (const [key, value] of Object.entries(input.query || {})) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  const requestInit: RequestInit = {
    method: input.method || "GET",
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (input.method === "POST") {
    requestInit.body = JSON.stringify(input.body || {});
  }

  const response = await fetch(url, requestInit);

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const graphError = data?.error || {};
    const messageParts = [
      graphError?.message || data?.message || `Meta Graph request failed with status ${response.status}`,
      graphError?.type ? `type=${graphError.type}` : null,
      graphError?.code ? `code=${graphError.code}` : null,
      graphError?.error_subcode ? `subcode=${graphError.error_subcode}` : null,
      graphError?.error_data?.details ? `details=${graphError.error_data.details}` : null,
    ].filter(Boolean);
    console.error("[Meta Graph Error]", {
      path: input.path,
      method: input.method || "GET",
      body: input.body || null,
      error: data,
    });
    throw {
      status: 502,
      message: messageParts.join(" | "),
      metaError: graphError,
    };
  }

  return data as T;
}

async function fetchAllMetaTemplateRecords(input: {
  accessToken: string;
  wabaId: string;
}) {
  const records: any[] = [];
  let afterCursor: string | null = null;

  while (true) {
    const response: any = await metaGraphRequest<any>({
      accessToken: input.accessToken,
      path: `${input.wabaId}/message_templates`,
      query: {
        limit: 250,
        fields:
          "id,name,status,category,language,components,rejected_reason,quality_score,previous_category",
        ...(afterCursor ? { after: afterCursor } : {}),
      },
    });

    const batch = Array.isArray(response?.data) ? response.data : [];
    records.push(...batch);

    const nextCursor: string = String(response?.paging?.cursors?.after || "").trim();
    if (!nextCursor || batch.length === 0) {
      break;
    }

    afterCursor = nextCursor;
  }

  return records;
}

async function findMetaTemplateRecord(input: {
  accessToken: string;
  wabaId: string;
  metaTemplateId?: string | null;
  templateName?: string | null;
}) {
  const targetId = String(input.metaTemplateId || "").trim();
  const targetName = normalizeMetaTemplateName(String(input.templateName || ""));
  const records = await fetchAllMetaTemplateRecords({
    accessToken: input.accessToken,
    wabaId: input.wabaId,
  });

  return (
    records.find((row: any) => {
      if (targetId && row?.id && String(row.id) === targetId) {
        return true;
      }
      return targetName
        ? normalizeMetaTemplateName(String(row?.name || "")) === targetName
        : false;
    }) || null
  );
}

async function persistTemplateMetaState(input: {
  templateId: string;
  status?: string | null;
  rejectedReason?: string | null;
  metaTemplateId?: string | null;
  metaTemplateName?: string | null;
  metaPayload?: unknown;
}) {
  const columnMap = await getTemplateColumnMap();
  const assignments: string[] = ["updated_at = CURRENT_TIMESTAMP"];
  const values: any[] = [];

  if (input.status) {
    values.push(normalizeTemplateStatus(input.status));
    assignments.push(`status = $${values.length}`);
  }

  if (columnMap.hasRejectedReason) {
    values.push(input.rejectedReason || null);
    assignments.push(`rejected_reason = $${values.length}`);
  }

  if (columnMap.hasMetaTemplateId) {
    values.push(input.metaTemplateId || null);
    assignments.push(`meta_template_id = COALESCE($${values.length}, meta_template_id)`);
  }

  if (columnMap.hasMetaTemplateName) {
    values.push(input.metaTemplateName || null);
    assignments.push(`meta_template_name = COALESCE($${values.length}, meta_template_name)`);
  }

  if (columnMap.hasMetaLastSyncedAt) {
    assignments.push(`meta_last_synced_at = CURRENT_TIMESTAMP`);
  }

  if (columnMap.hasMetaPayload) {
    values.push(input.metaPayload ? JSON.stringify(input.metaPayload) : null);
    assignments.push(`meta_payload = COALESCE($${values.length}::jsonb, meta_payload)`);
  }

  values.push(input.templateId);
  const result = await query(
    `UPDATE templates
     SET ${assignments.join(", ")}
     WHERE id = $${values.length}
     RETURNING *`,
    values
  );

  return result.rows[0] || null;
}

async function syncLocalTemplateShapeFromMeta(input: {
  templateId: string;
  remote: any;
}) {
  const columnMap = await getTemplateColumnMap();
  const assignments = ["updated_at = CURRENT_TIMESTAMP"];
  const values: any[] = [];
  const existingTemplateRes = await query(
    `SELECT *
     FROM templates
     WHERE id = $1
     LIMIT 1`,
    [input.templateId]
  );
  const existingTemplate = existingTemplateRes.rows[0] || null;
  const existingContent = normalizeTemplateContent(existingTemplate || {});
  const remoteContent = parseMetaTemplateComponents(input.remote?.components || []);
  const remoteHeaderType = String(remoteContent?.header?.type || "").trim().toLowerCase();
  const mergedContent =
    ["image", "video", "document"].includes(remoteHeaderType)
      ? {
          ...remoteContent,
          header: {
            ...(remoteContent?.header || {}),
            ...(String(existingContent?.header?.assetUrl || "").trim()
              ? { assetUrl: String(existingContent.header.assetUrl).trim() }
              : {}),
            ...(String(existingContent?.header?.assetId || "").trim() &&
            !/^https?:\/\//i.test(String(existingContent.header.assetId).trim())
              ? { assetId: String(existingContent.header.assetId).trim() }
              : {}),
          },
        }
      : remoteContent;

  values.push(String(input.remote?.name || "Imported Template"));
  assignments.push(`name = $${values.length}`);

  values.push(String(input.remote?.category || "marketing").toLowerCase());
  assignments.push(`category = $${values.length}`);

  values.push(String(input.remote?.language || "en_US"));
  assignments.push(`language = $${values.length}`);

  if (columnMap.hasContent) {
    values.push(JSON.stringify(mergedContent));
    assignments.push(`content = $${values.length}::jsonb`);
  }

  if (columnMap.hasHeaderType) {
    values.push(mergedContent.header?.type || "none");
    assignments.push(`header_type = $${values.length}`);
  }

  if (columnMap.hasHeader) {
    values.push(mergedContent.header?.text || null);
    assignments.push(`header = $${values.length}`);
  }

  if (columnMap.hasBody) {
    values.push(String(mergedContent.body || ""));
    assignments.push(`body = $${values.length}`);
  }

  if (columnMap.hasFooter) {
    values.push(String(mergedContent.footer || ""));
    assignments.push(`footer = $${values.length}`);
  }

  values.push(input.templateId);
  const result = await query(
    `UPDATE templates
     SET ${assignments.join(", ")}
     WHERE id = $${values.length}
     RETURNING *`,
    values
  );

  return result.rows[0] || null;
}

async function getNormalizedTemplateById(templateId: string) {
  const refreshed = await query(
    `SELECT *
     FROM templates
     WHERE id = $1
     LIMIT 1`,
    [templateId]
  );

  return refreshed.rows[0] ? normalizeTemplateRecordForResponse(refreshed.rows[0]) : null;
}

export async function applyTemplateStatusUpdate(input: {
  externalTemplateId?: string | null;
  templateName?: string | null;
  status?: string | null;
  rejectedReason?: string | null;
  rawPayload?: unknown;
  io?: any;
}) {
  const columnMap = await getTemplateColumnMap();
  const identifier = String(input.externalTemplateId || "").trim();
  const fallbackName = normalizeMetaTemplateName(String(input.templateName || ""));

  if (!identifier && !fallbackName) {
    return null;
  }

  const conditions: string[] = [];
  const values: any[] = [];

  if (identifier && columnMap.hasMetaTemplateId) {
    values.push(identifier);
    conditions.push(`meta_template_id = $${values.length}`);
  }

  if (fallbackName) {
    values.push(fallbackName);
    const field = columnMap.hasMetaTemplateName ? "meta_template_name" : "name";
    conditions.push(`${field} = $${values.length}`);
  }

  if (conditions.length === 0) {
    return null;
  }

  const match = await query(
    `SELECT *
     FROM templates
     WHERE ${conditions.join(" OR ")}
     ORDER BY updated_at DESC
     LIMIT 1`,
    values
  );

  const template = match.rows[0];
  if (!template) {
    return null;
  }

  const updated = await persistTemplateMetaState({
    templateId: template.id,
    status: input.status || null,
    rejectedReason: input.rejectedReason || null,
    metaTemplateId: identifier || null,
    metaTemplateName: fallbackName || null,
    metaPayload: input.rawPayload,
  });

  if (input.io && updated) {
    input.io.emit("template_status_update", {
      templateId: updated.id,
      status: updated.status,
      rejectedReason: updated.rejected_reason || null,
      metaTemplateId: updated.meta_template_id || null,
      metaTemplateName: updated.meta_template_name || null,
      updatedAt: updated.updated_at,
    });
  }

  return updated;
}

export const createTemplate = async (req: PolicyRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const {
      bot_id,
      campaign_id,
      platform_type,
      name,
      category,
      language,
      variables,
      status,
    } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!campaign_id) {
      return res.status(400).json({ error: "campaign_id is required" });
    }

    const campaign = await findAccessibleCampaign(String(campaign_id), userId);
    const content = normalizeTemplateContent(req.body);
    const validation = validateTemplateInput(
      {
        ...req.body,
        content,
        campaign_id: String(campaign_id || "").trim() || null,
      },
      String(status || "").toLowerCase() === "draft" ? "draft" : "publish"
    );
    if (!validation.ok) {
      return res.status(400).json({ error: validation.errors[0] });
    }
    const columnMap = await getTemplateColumnMap();

    const insertColumns = ["platform_type", "name", "category", "language", "status", "updated_at"];
    const insertValues: any[] = [
      platform_type,
      name,
      category,
      language || "en_US",
      normalizeTemplateStatus(status || "pending"),
    ];

    if (columnMap.hasContent) {
      insertColumns.push("content");
      insertValues.push(JSON.stringify(content));
    }

    if (columnMap.hasVariables) {
      insertColumns.push("variables");
      insertValues.push(JSON.stringify(variables || {}));
    }

    if (columnMap.hasHeaderType) {
      insertColumns.push("header_type");
      insertValues.push(content.header?.type || "none");
    }

    if (columnMap.hasHeader) {
      insertColumns.push("header");
      insertValues.push(content.header?.text || null);
    }

    if (columnMap.hasBody) {
      insertColumns.push("body");
      insertValues.push(String(content.body || ""));
    }

    if (columnMap.hasFooter) {
      insertColumns.push("footer");
      insertValues.push(String(content.footer || ""));
    }

    if (columnMap.hasBotId && bot_id) {
      const bot = await findAccessibleBot(String(bot_id), userId);
      insertColumns.unshift("bot_id");
      insertValues.unshift(bot.id);
    }

    if (columnMap.hasWorkspaceId) {
      insertColumns.push("workspace_id");
      insertValues.push(campaign.workspace_id || null);
    }

    if (columnMap.hasProjectId) {
      insertColumns.push("project_id");
      insertValues.push(campaign.project_id || null);
    }

    if (columnMap.hasCampaignId) {
      insertColumns.push("campaign_id");
      insertValues.push(String(campaign_id || "").trim() || null);
    }

    let valueIndex = 0;
    const placeholders = insertColumns.map((columnName) => {
      if (columnName === "updated_at") {
        return "CURRENT_TIMESTAMP";
      }
      valueIndex += 1;
      return `$${valueIndex}`;
    });

    const result = await query(
      `INSERT INTO templates
       (${insertColumns.join(", ")})
       VALUES (${placeholders.join(", ")})
       RETURNING *`,
      insertValues
    );

    res.status(201).json(normalizeTemplateRecordForResponse({
      ...result.rows[0],
      workspace_id: campaign.workspace_id,
      project_id: campaign.project_id,
    }));
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message || "Internal Server Error" });
  }
};

export const getTemplates = async (req: PolicyRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const workspaceId = getWorkspaceId(req);
    const projectId = getProjectId(req);
    const campaignId = (req.query.campaignId as string) || (req.query.campaign_id as string) || undefined;
    const platform = req.query.platform as string | undefined;
    const botId = (req.query.botId as string) || (req.query.bot_id as string) || undefined;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    await assertTemplateReadScope(userId, workspaceId, projectId);

    const columnMap = await getTemplateColumnMap();

    if (columnMap.hasBotId || columnMap.hasCampaignId) {
      const params: any[] = [];
      const conditions: string[] = [];
      const joins: string[] = [];
      const workspaceScope = [
        columnMap.hasWorkspaceId ? "t.workspace_id" : null,
        columnMap.hasBotId ? "b.workspace_id" : null,
        columnMap.hasCampaignId ? "c.workspace_id" : null,
      ].filter(Boolean).join(", ");
      const projectScope = [
        columnMap.hasProjectId ? "t.project_id" : null,
        columnMap.hasBotId ? "b.project_id" : null,
        columnMap.hasCampaignId ? "c.project_id" : null,
      ].filter(Boolean).join(", ");

      if (columnMap.hasBotId) {
        joins.push(`LEFT JOIN bots b ON b.id = t.bot_id`);
      }

      if (columnMap.hasCampaignId) {
        joins.push(`LEFT JOIN campaigns c ON c.id = t.campaign_id`);
      }

      if (workspaceId) {
        params.push(workspaceId);
        conditions.push(`COALESCE(${workspaceScope}) = $${params.length}`);
      }

      if (projectId) {
        params.push(projectId);
        conditions.push(`COALESCE(${projectScope}) = $${params.length}`);
      }

      if (botId && columnMap.hasBotId) {
        params.push(botId);
        conditions.push(`t.bot_id = $${params.length}`);
      }

      if (platform && columnMap.hasPlatformType) {
        params.push(platform);
        conditions.push(`t.platform_type = $${params.length}`);
      }

      if (campaignId && columnMap.hasCampaignId) {
        params.push(campaignId);
        conditions.push(`t.campaign_id = $${params.length}`);
      }

      const result = await query(
        `SELECT t.*,
                ${workspaceScope ? `COALESCE(${workspaceScope})` : "NULL"} AS workspace_id,
                ${projectScope ? `COALESCE(${projectScope})` : "NULL"} AS project_id
         FROM templates t
         ${joins.join("\n")}
         ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
         ORDER BY t.created_at DESC`,
        params
      );

      const readableRows = await filterRowsByReadableTemplateScope(userId, result.rows);
      return res.status(200).json(readableRows.map(normalizeTemplateRecordForResponse));
    }

    const params: any[] = [];
    const conditions: string[] = [];

    if (workspaceId && columnMap.hasWorkspaceId) {
      params.push(workspaceId);
      conditions.push(`t.workspace_id = $${params.length}`);
    }

    if (projectId && columnMap.hasProjectId) {
      params.push(projectId);
      conditions.push(`t.project_id = $${params.length}`);
    }

    if (platform && columnMap.hasPlatformType) {
      params.push(platform);
      conditions.push(`t.platform_type = $${params.length}`);
    }

    if (campaignId && columnMap.hasCampaignId) {
      params.push(campaignId);
      conditions.push(`t.campaign_id = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const fallbackResult = await query(
      `SELECT t.*
       FROM templates t
       ${whereClause}
       ORDER BY t.created_at DESC`,
      params
    );

    const readableRows = await filterRowsByReadableTemplateScope(userId, fallbackResult.rows);
    return res.status(200).json(readableRows.map(normalizeTemplateRecordForResponse));
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message || "Internal Server Error" });
  }
};

export const getTemplateById = async (req: PolicyRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const workspaceId = getWorkspaceId(req);
    const projectId = getProjectId(req);

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const template = await findAccessibleTemplate(id, userId, WORKSPACE_PERMISSIONS.viewCampaigns, TEMPLATE_OPERATOR_ROLES, {
      workspaceId: workspaceId || null,
      projectId: projectId || null,
    });
    return res.status(200).json(normalizeTemplateRecordForResponse(template));
  } catch (error: any) {
    return res.status(error.status || 500).json({ error: error.message || "Internal Server Error" });
  }
};

export const updateTemplate = async (req: PolicyRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { variables, campaign_id, status } = req.body;
    const workspaceId = getWorkspaceId(req);
    const projectId = getProjectId(req);

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    if (!campaign_id) {
      return res.status(400).json({ error: "campaign_id is required" });
    }

    const campaign = await findAccessibleCampaign(String(campaign_id), userId);
    const template = await findAccessibleTemplate(
      id,
      userId,
      WORKSPACE_PERMISSIONS.editCampaign,
      TEMPLATE_OPERATOR_ROLES,
      {
        workspaceId: workspaceId || campaign.workspace_id || null,
        projectId: projectId || campaign.project_id || null,
      }
    );
    if (template.status === "approved") {
      return res.status(403).json({ error: "Approved templates cannot be edited." });
    }

    const content = normalizeTemplateContent(req.body);
    const validation = validateTemplateInput(
      {
        ...req.body,
        content,
        campaign_id: String(campaign_id || "").trim() || null,
      },
      String(status || "").toLowerCase() === "draft" ? "draft" : "publish"
    );
    if (!validation.ok) {
      return res.status(400).json({ error: validation.errors[0] });
    }
    const columnMap = await getTemplateColumnMap();
    const assignments = [`updated_at = CURRENT_TIMESTAMP`];
    const values: any[] = [];

    if (columnMap.hasContent) {
      values.push(JSON.stringify(content));
      assignments.push(`content = $${values.length}::jsonb`);
    }

    if (columnMap.hasVariables) {
      values.push(JSON.stringify(variables || {}));
      assignments.push(`variables = $${values.length}::jsonb`);
    }

    values.push(normalizeTemplateStatus(status || "pending"));
    assignments.push(`status = $${values.length}`);

    if (columnMap.hasHeaderType) {
      values.push(content.header?.type || "none");
      assignments.push(`header_type = $${values.length}`);
    }

    if (columnMap.hasHeader) {
      values.push(content.header?.text || null);
      assignments.push(`header = $${values.length}`);
    }

    if (columnMap.hasBody) {
      values.push(String(content.body || ""));
      assignments.push(`body = $${values.length}`);
    }

    if (columnMap.hasFooter) {
      values.push(String(content.footer || ""));
      assignments.push(`footer = $${values.length}`);
    }

    if (columnMap.hasCampaignId) {
      values.push(String(campaign_id || "").trim() || null);
      assignments.push(`campaign_id = $${values.length}`);
    }

    if (columnMap.hasWorkspaceId) {
      values.push(campaign.workspace_id || null);
      assignments.push(`workspace_id = $${values.length}`);
    }

    if (columnMap.hasProjectId) {
      values.push(campaign.project_id || null);
      assignments.push(`project_id = $${values.length}`);
    }

    values.push(id);
    const result = await query(
      `UPDATE templates
       SET ${assignments.join(", ")}
       WHERE id = $${values.length}
       RETURNING *`,
      values
    );

    res.status(200).json(normalizeTemplateRecordForResponse({
      ...result.rows[0],
      workspace_id: campaign.workspace_id,
      project_id: campaign.project_id,
    }));
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message || "Internal Server Error" });
  }
};

export const approveTemplate = async (req: PolicyRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { status, rejected_reason } = req.body;
    const workspaceId = getWorkspaceId(req);
    const projectId = getProjectId(req);

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const template = await findAccessibleTemplate(
      id,
      userId,
      WORKSPACE_PERMISSIONS.editCampaign,
      TEMPLATE_OPERATOR_ROLES,
      {
        workspaceId: workspaceId || null,
        projectId: projectId || null,
      }
    );
    const result = await query(
      `UPDATE templates
       SET status = $1,
           rejected_reason = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [normalizeTemplateStatus(status), rejected_reason || null, id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Template not found" });
    }

    res.status(200).json(result.rows[0]);
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message || "Internal Server Error" });
  }
};

export const submitTemplateToMeta = async (req: PolicyRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const workspaceId = getWorkspaceId(req);
    const projectId = getProjectId(req);

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const template = await findAccessibleTemplate(
      id,
      userId,
      WORKSPACE_PERMISSIONS.editCampaign,
      TEMPLATE_OPERATOR_ROLES,
      {
        workspaceId: workspaceId || null,
        projectId: projectId || null,
      }
    );

    if (String(template.platform_type || "").toLowerCase() !== "whatsapp") {
      return res.status(400).json({ error: "Meta submission is only available for WhatsApp templates" });
    }

    const connection = await getMetaTemplateConnection(template);
    const requestedMetaTemplateName = String(req.body?.metaTemplateName || "").trim();
    const metaTemplateName = getPreferredMetaTemplateName(template, requestedMetaTemplateName);
    if (!metaTemplateName) {
      return res.status(400).json({
        error: "Template has no usable Meta template name yet. Rename the template with a real WhatsApp template name before submitting it to Meta.",
      });
    }
    const existingRemote = await findMetaTemplateRecord({
      accessToken: connection.accessToken,
      wabaId: connection.wabaId,
      metaTemplateId: template.meta_template_id || null,
      templateName: metaTemplateName,
    });

    if (existingRemote) {
      await syncLocalTemplateShapeFromMeta({
        templateId: template.id,
        remote: existingRemote,
      });
      const updated = await persistTemplateMetaState({
        templateId: template.id,
        status: existingRemote?.status || "pending",
        rejectedReason: stringifyRejectionReason(
          existingRemote?.rejected_reason || existingRemote?.reason
        ),
        metaTemplateId: existingRemote?.id || null,
        metaTemplateName: existingRemote?.name || metaTemplateName,
        metaPayload: existingRemote,
      });

      const io = req.app.get("io");
      if (io && updated) {
        io.emit("template_status_update", {
          templateId: updated.id,
          status: updated.status,
          rejectedReason: updated.rejected_reason || null,
          metaTemplateId: updated.meta_template_id || null,
          metaTemplateName: updated.meta_template_name || null,
          updatedAt: updated.updated_at,
        });
      }

      return res.status(200).json({
        template: (await getNormalizedTemplateById(template.id)) || normalizeTemplateRecordForResponse(updated || template),
        meta: existingRemote,
        reusedExisting: true,
      });
    }

    const payload = {
      name: metaTemplateName,
      language: template.language || "en_US",
      category: String(template.category || "MARKETING").toUpperCase(),
      components: buildMetaTemplateComponents(template),
    };

    let metaResponse: any;
    try {
      metaResponse = await metaGraphRequest<any>({
        accessToken: connection.accessToken,
        method: "POST",
        path: `${connection.wabaId}/message_templates`,
        body: payload,
      });
    } catch (error: any) {
      const existingAfterFailure = await findMetaTemplateRecord({
        accessToken: connection.accessToken,
        wabaId: connection.wabaId,
        metaTemplateId: template.meta_template_id || null,
        templateName: metaTemplateName,
      });

      if (existingAfterFailure) {
        await syncLocalTemplateShapeFromMeta({
          templateId: template.id,
          remote: existingAfterFailure,
        });
        const updated = await persistTemplateMetaState({
          templateId: template.id,
          status: existingAfterFailure?.status || "pending",
          rejectedReason: stringifyRejectionReason(
            existingAfterFailure?.rejected_reason || existingAfterFailure?.reason
          ),
          metaTemplateId: existingAfterFailure?.id || null,
          metaTemplateName: existingAfterFailure?.name || metaTemplateName,
          metaPayload: existingAfterFailure,
        });

        const io = req.app.get("io");
        if (io && updated) {
          io.emit("template_status_update", {
            templateId: updated.id,
            status: updated.status,
            rejectedReason: updated.rejected_reason || null,
            metaTemplateId: updated.meta_template_id || null,
            metaTemplateName: updated.meta_template_name || null,
            updatedAt: updated.updated_at,
          });
        }

        return res.status(200).json({
          template: (await getNormalizedTemplateById(template.id)) || normalizeTemplateRecordForResponse(updated || template),
          meta: existingAfterFailure,
          reusedExisting: true,
        });
      }

      if (isMetaLanguageDeletionError(error)) {
        const waitMessage =
          String(error?.metaError?.error_user_msg || "").trim() ||
          "Meta is still deleting the previous language version of this template. Wait about 1 minute, then click Sync Status or Sync All From Meta.";
        const updated = await persistTemplateMetaState({
          templateId: template.id,
          status: "pending",
          rejectedReason: waitMessage,
          metaTemplateName,
        });

        const io = req.app.get("io");
        if (io && updated) {
          io.emit("template_status_update", {
            templateId: updated.id,
            status: updated.status,
            rejectedReason: updated.rejected_reason || null,
            metaTemplateId: updated.meta_template_id || null,
            metaTemplateName: updated.meta_template_name || null,
            updatedAt: updated.updated_at,
          });
        }

        return res.status(409).json({
          error: `${waitMessage} Try Sync Status in about 1 minute.`,
          template: (await getNormalizedTemplateById(template.id)) || normalizeTemplateRecordForResponse(updated || template),
          retryable: true,
        });
      }

      throw error;
    }

    await syncLocalTemplateShapeFromMeta({
      templateId: template.id,
      remote: metaResponse,
    });
    const updated = await persistTemplateMetaState({
      templateId: template.id,
      status: metaResponse?.status || "pending",
      metaTemplateId: metaResponse?.id || null,
      metaTemplateName,
      metaPayload: metaResponse,
    });

    const io = req.app.get("io");
    if (io && updated) {
      io.emit("template_status_update", {
        templateId: updated.id,
        status: updated.status,
        rejectedReason: updated.rejected_reason || null,
        metaTemplateId: updated.meta_template_id || null,
        metaTemplateName: updated.meta_template_name || null,
        updatedAt: updated.updated_at,
      });
    }

    return res.status(200).json({
      template: (await getNormalizedTemplateById(template.id)) || normalizeTemplateRecordForResponse(updated || template),
      meta: metaResponse,
    });
  } catch (error: any) {
    return res.status(error.status || 500).json({ error: error.message || "Internal Server Error" });
  }
};

export const syncTemplateFromMeta = async (req: PolicyRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const workspaceId = getWorkspaceId(req);
    const projectId = getProjectId(req);

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const template = await findAccessibleTemplate(
      id,
      userId,
      WORKSPACE_PERMISSIONS.viewCampaigns,
      TEMPLATE_OPERATOR_ROLES,
      {
        workspaceId: workspaceId || null,
        projectId: projectId || null,
      }
    );

    if (String(template.platform_type || "").toLowerCase() !== "whatsapp") {
      return res.status(400).json({ error: "Meta sync is only available for WhatsApp templates" });
    }

    const connection = await getMetaTemplateConnection(template);
    const metaPayload = parseJsonLike(template?.meta_payload) || {};
    const templateName = getPreferredMetaTemplateName(template, req.body?.metaTemplateName);
    if (!template.meta_template_id && !templateName) {
      return res.status(409).json({
        error: "Template has no Meta identity yet. Submit it to Meta first or run Sync All From Meta into this campaign.",
      });
    }

    const remote = await findMetaTemplateRecord({
      accessToken: connection.accessToken,
      wabaId: connection.wabaId,
      metaTemplateId: template.meta_template_id || metaPayload?.id || null,
      templateName,
    });

    if (!remote) {
      return res.status(404).json({
        error: `Template was not found in Meta for this WhatsApp business account. Looked for meta_template_id='${String(template.meta_template_id || "").trim() || "n/a"}' and name='${templateName || "n/a"}'.`,
      });
    }

    await syncLocalTemplateShapeFromMeta({
      templateId: template.id,
      remote,
    });
    const updated = await persistTemplateMetaState({
      templateId: template.id,
      status: remote?.status || "pending",
      rejectedReason: stringifyRejectionReason(remote?.rejected_reason || remote?.reason),
      metaTemplateId: remote?.id || null,
      metaTemplateName: remote?.name || templateName,
      metaPayload: remote,
    });

    const io = req.app.get("io");
    if (io && updated) {
      io.emit("template_status_update", {
        templateId: updated.id,
        status: updated.status,
        rejectedReason: updated.rejected_reason || null,
        metaTemplateId: updated.meta_template_id || null,
        metaTemplateName: updated.meta_template_name || null,
        updatedAt: updated.updated_at,
      });
    }

    return res.status(200).json({
      template: (await getNormalizedTemplateById(template.id)) || normalizeTemplateRecordForResponse(updated || template),
      meta: remote,
    });
  } catch (error: any) {
    return res.status(error.status || 500).json({ error: error.message || "Internal Server Error" });
  }
};

export const previewMetaTemplates = async (req: PolicyRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const campaignId = String(req.body?.campaign_id || req.body?.campaignId || "").trim();
    console.log("Incoming Campaign ID:", campaignId);

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!campaignId) {
      return res.status(400).json({ error: "campaign_id is required" });
    }

    if (!isUuidLike(campaignId)) {
      return res.status(400).json({ error: "campaign_id must be a valid UUID" });
    }

    const campaign = await findAccessibleCampaign(campaignId, userId);
    if (!campaign) {
      return res.status(400).json({ error: "campaign_id must be a valid UUID" });
    }
    let connection;
    try {
      connection = await getMetaTemplateConnection({
        campaign_id: campaign.id,
        platform_type: "whatsapp",
      });
    } catch (error: any) {
      if (Number(error?.status) === 409) {
        return res.status(400).json({
          error: "This campaign does not have a fully configured WhatsApp channel. Please connect a channel first.",
        });
      }
      throw error;
    }

    const templates = await fetchAllMetaTemplateRecords({
      accessToken: connection.accessToken,
      wabaId: connection.wabaId,
    });

    return res.status(200).json({ templates });
  } catch (error: any) {
    return res.status(error.status || 500).json({ error: error.message || "Internal Server Error" });
  }
};

export const importTemplatesFromMeta = async (req: PolicyRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const campaignId = String(req.body?.campaign_id || req.body?.campaignId || "").trim();
    const selectedTemplateIds = Array.isArray(req.body?.selectedTemplateIds)
      ? req.body.selectedTemplateIds.map((id: any) => String(id || "").trim()).filter(Boolean)
      : [];

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!campaignId) {
      return res.status(400).json({ error: "campaign_id is required" });
    }

    if (!isUuidLike(campaignId)) {
      return res.status(400).json({ error: "campaign_id must be a valid UUID" });
    }

    const campaign = await findAccessibleCampaign(campaignId, userId);
    if (!campaign) {
      return res.status(400).json({ error: "campaign_id must be a valid UUID" });
    }
    const connection = await getMetaTemplateConnection({
      campaign_id: campaign.id,
      platform_type: "whatsapp",
    });
    const remoteTemplates = await fetchAllMetaTemplateRecords({
      accessToken: connection.accessToken,
      wabaId: connection.wabaId,
    });
    const selectedTemplateIdSet = new Set(selectedTemplateIds);
    const filteredRemoteTemplates =
      selectedTemplateIdSet.size > 0
        ? remoteTemplates.filter((remote) => selectedTemplateIdSet.has(String(remote?.id || "").trim()))
        : remoteTemplates;
    const columnMap = await getTemplateColumnMap();
    const imported: any[] = [];

    for (const remote of filteredRemoteTemplates) {
      const metaTemplateId = String(remote?.id || "").trim();
      const metaTemplateName = normalizeMetaTemplateName(String(remote?.name || ""));
      const localName = String(remote?.name || metaTemplateName || "Imported Template");
      const content = parseMetaTemplateComponents(remote?.components || []);
      const status = normalizeTemplateStatus(remote?.status || "pending");
      const rejectedReason = stringifyRejectionReason(remote?.rejected_reason || remote?.reason);

      const existingParams: any[] = [];
      const existingConditions: string[] = [];
      if (columnMap.hasMetaTemplateId && metaTemplateId) {
        existingParams.push(metaTemplateId);
        existingConditions.push(`meta_template_id = $${existingParams.length}`);
      }
      existingParams.push(metaTemplateName);
      existingConditions.push(`${columnMap.hasMetaTemplateName ? "meta_template_name" : "name"} = $${existingParams.length}`);
      const scopeField = columnMap.hasCampaignId
        ? "campaign_id"
        : columnMap.hasProjectId
          ? "project_id"
          : columnMap.hasWorkspaceId
            ? "workspace_id"
            : null;
      const scopeValue =
        scopeField === "project_id"
          ? campaign.project_id
          : scopeField === "workspace_id"
            ? campaign.workspace_id
            : scopeField === "campaign_id"
              ? campaign.id
              : null;

      const existingRes = await query(
        `SELECT *
         FROM templates
         WHERE (${existingConditions.join(" OR ")})
         ${scopeField ? `AND ${scopeField} = $${existingParams.length + 1}` : ""}
         ORDER BY updated_at DESC
         LIMIT 1`,
        scopeField ? [...existingParams, scopeValue] : existingParams
      );

      if (existingRes.rows[0]) {
        const updated = await persistTemplateMetaState({
          templateId: existingRes.rows[0].id,
          status,
          rejectedReason,
          metaTemplateId: metaTemplateId || null,
          metaTemplateName,
          metaPayload: remote,
        });

        const updateAssignments = [
          "name = $1",
          "category = $2",
          "language = $3",
          "updated_at = CURRENT_TIMESTAMP",
        ];
        const updateValues: any[] = [
          localName,
          String(remote?.category || "marketing").toLowerCase(),
          String(remote?.language || "en_US"),
        ];

        if (columnMap.hasContent) {
          updateValues.push(JSON.stringify(content));
          updateAssignments.push(`content = $${updateValues.length}::jsonb`);
        }
        if (columnMap.hasHeaderType) {
          updateValues.push(content.header?.type || "none");
          updateAssignments.push(`header_type = $${updateValues.length}`);
        }
        if (columnMap.hasHeader) {
          updateValues.push(content.header?.text || null);
          updateAssignments.push(`header = $${updateValues.length}`);
        }
        if (columnMap.hasBody) {
          updateValues.push(String(content.body || ""));
          updateAssignments.push(`body = $${updateValues.length}`);
        }
        if (columnMap.hasFooter) {
          updateValues.push(String(content.footer || ""));
          updateAssignments.push(`footer = $${updateValues.length}`);
        }

        updateValues.push(existingRes.rows[0].id);
        await query(
          `UPDATE templates
           SET ${updateAssignments.join(", ")}
           WHERE id = $${updateValues.length}`,
          updateValues
        );
        imported.push((await getNormalizedTemplateById(existingRes.rows[0].id)) || normalizeTemplateRecordForResponse(updated || existingRes.rows[0]));
        continue;
      }

      const orphanWhereParts = [
        `platform_type = 'whatsapp'`,
        scopeField ? `${scopeField} = $1` : null,
        columnMap.hasMetaTemplateId
          ? `(meta_template_id IS NULL OR TRIM(COALESCE(meta_template_id, '')) = '')`
          : null,
        columnMap.hasMetaTemplateName
          ? `(meta_template_name IS NULL OR TRIM(COALESCE(meta_template_name, '')) = '')`
          : null,
        `(LOWER(TRIM(COALESCE(name, ''))) IN ('imported template', 'imported_template') OR TRIM(COALESCE(body, '')) = '')`,
      ].filter(Boolean);

      const orphanRes = await query(
        `SELECT *
         FROM templates
         WHERE ${orphanWhereParts.join(" AND ")}
         ORDER BY updated_at DESC NULLS LAST, created_at DESC
         LIMIT 1`,
        scopeField ? [scopeValue] : []
      );

      if (orphanRes.rows[0]) {
        const orphan = orphanRes.rows[0];
        const repairAssignments = [
          "name = $1",
          "category = $2",
          "language = $3",
          "status = $4",
          "updated_at = CURRENT_TIMESTAMP",
        ];
        const repairValues: any[] = [
          localName,
          String(remote?.category || "marketing").toLowerCase(),
          String(remote?.language || "en_US"),
          status,
        ];

        if (columnMap.hasContent) {
          repairValues.push(JSON.stringify(content));
          repairAssignments.push(`content = $${repairValues.length}::jsonb`);
        }
        if (columnMap.hasVariables) {
          repairValues.push(JSON.stringify({}));
          repairAssignments.push(`variables = $${repairValues.length}::jsonb`);
        }
        if (columnMap.hasHeaderType) {
          repairValues.push(content.header?.type || "none");
          repairAssignments.push(`header_type = $${repairValues.length}`);
        }
        if (columnMap.hasHeader) {
          repairValues.push(content.header?.text || null);
          repairAssignments.push(`header = $${repairValues.length}`);
        }
        if (columnMap.hasBody) {
          repairValues.push(String(content.body || ""));
          repairAssignments.push(`body = $${repairValues.length}`);
        }
        if (columnMap.hasFooter) {
          repairValues.push(String(content.footer || ""));
          repairAssignments.push(`footer = $${repairValues.length}`);
        }
        if (columnMap.hasMetaTemplateId) {
          repairValues.push(metaTemplateId || null);
          repairAssignments.push(`meta_template_id = $${repairValues.length}`);
        }
        if (columnMap.hasMetaTemplateName) {
          repairValues.push(metaTemplateName || null);
          repairAssignments.push(`meta_template_name = $${repairValues.length}`);
        }
        if (columnMap.hasRejectedReason) {
          repairValues.push(rejectedReason || null);
          repairAssignments.push(`rejected_reason = $${repairValues.length}`);
        }
        if (columnMap.hasMetaLastSyncedAt) {
          repairAssignments.push(`meta_last_synced_at = CURRENT_TIMESTAMP`);
        }
        if (columnMap.hasMetaPayload) {
          repairValues.push(JSON.stringify(remote));
          repairAssignments.push(`meta_payload = $${repairValues.length}::jsonb`);
        }

        repairValues.push(orphan.id);
        await query(
          `UPDATE templates
           SET ${repairAssignments.join(", ")}
           WHERE id = $${repairValues.length}`,
          repairValues
        );

        imported.push((await getNormalizedTemplateById(orphan.id)) || normalizeTemplateRecordForResponse(orphan));
        continue;
      }

      const insertColumns = ["platform_type", "name", "category", "language", "content", "variables", "status", "updated_at"];
      const insertValues: any[] = [
        "whatsapp",
        localName,
        String(remote?.category || "marketing").toLowerCase(),
        String(remote?.language || "en_US"),
        JSON.stringify(content),
        JSON.stringify({}),
        status,
      ];

      if (columnMap.hasHeaderType) {
        insertColumns.push("header_type");
        insertValues.push(content.header?.type || "none");
      }
      if (columnMap.hasHeader) {
        insertColumns.push("header");
        insertValues.push(content.header?.text || null);
      }
      if (columnMap.hasBody) {
        insertColumns.push("body");
        insertValues.push(String(content.body || ""));
      }
      if (columnMap.hasFooter) {
        insertColumns.push("footer");
        insertValues.push(String(content.footer || ""));
      }

      if (columnMap.hasWorkspaceId) {
        insertColumns.push("workspace_id");
        insertValues.push(campaign.workspace_id || null);
      }
      if (columnMap.hasProjectId) {
        insertColumns.push("project_id");
        insertValues.push(campaign.project_id || null);
      }
      if (columnMap.hasCampaignId) {
        insertColumns.push("campaign_id");
        insertValues.push(campaign.id);
      }
      if (columnMap.hasMetaTemplateId) {
        insertColumns.push("meta_template_id");
        insertValues.push(metaTemplateId || null);
      }
      if (columnMap.hasMetaTemplateName) {
        insertColumns.push("meta_template_name");
        insertValues.push(metaTemplateName || null);
      }
      if (columnMap.hasRejectedReason) {
        insertColumns.push("rejected_reason");
        insertValues.push(rejectedReason || null);
      }
      if (columnMap.hasMetaLastSyncedAt) {
        insertColumns.push("meta_last_synced_at");
      }
      if (columnMap.hasMetaPayload) {
        insertColumns.push("meta_payload");
        insertValues.push(JSON.stringify(remote));
      }

      let valueIndex = 0;
      const placeholders = insertColumns.map((columnName) => {
        if (columnName === "updated_at" || columnName === "meta_last_synced_at") {
          return "CURRENT_TIMESTAMP";
        }
        valueIndex += 1;
        return `$${valueIndex}`;
      });

      const insertResult = await query(
        `INSERT INTO templates (${insertColumns.join(", ")})
         VALUES (${placeholders.join(", ")})
         RETURNING *`,
        insertValues
      );

      imported.push(normalizeTemplateRecordForResponse(insertResult.rows[0]));
    }

    const io = req.app.get("io");
    if (io) {
      for (const template of imported) {
        io.emit("template_status_update", {
          templateId: template.id,
          status: template.status,
          rejectedReason: template.rejected_reason || null,
          metaTemplateId: template.meta_template_id || null,
          metaTemplateName: template.meta_template_name || null,
          updatedAt: template.updated_at,
        });
      }
    }

    return res.status(200).json({
      importedCount: imported.length,
      templates: imported,
    });
  } catch (error: any) {
    return res.status(error.status || 500).json({ error: error.message || "Internal Server Error" });
  }
};

export const deleteTemplate = async (req: PolicyRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const columnMap = await getTemplateColumnMap();
    const joins: string[] = [];
    const workspaceScope = [
      columnMap.hasWorkspaceId ? "t.workspace_id" : null,
      columnMap.hasBotId ? "b.workspace_id" : null,
      columnMap.hasCampaignId ? "c.workspace_id" : null,
    ]
      .filter(Boolean)
      .join(", ");
    const projectScope = [
      columnMap.hasProjectId ? "t.project_id" : null,
      columnMap.hasBotId ? "b.project_id" : null,
      columnMap.hasCampaignId ? "c.project_id" : null,
    ]
      .filter(Boolean)
      .join(", ");

    if (columnMap.hasBotId) {
      joins.push(`LEFT JOIN bots b ON b.id = t.bot_id`);
    }

    if (columnMap.hasCampaignId) {
      joins.push(`LEFT JOIN campaigns c ON c.id = t.campaign_id`);
    }

    const templateRes = await query(
      `SELECT t.*,
              ${workspaceScope ? `COALESCE(${workspaceScope})` : "NULL"} AS workspace_id,
              ${projectScope ? `COALESCE(${projectScope})` : "NULL"} AS project_id
       FROM templates t
       ${joins.join("\n")}
       WHERE t.id = $1
       LIMIT 1`,
      [id]
    );

    const template = templateRes.rows[0];
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }

    if (template.workspace_id || template.project_id) {
      await assertTemplateScopePermission({
        userId,
        workspaceId: template.workspace_id,
        projectId: template.project_id,
        workspacePermission: WORKSPACE_PERMISSIONS.deleteCampaign,
        allowedProjectRoles: TEMPLATE_DELETE_ROLES,
      });
    } else if (template.bot_id) {
      try {
        await assertBotWorkspacePermission(
          userId,
          template.bot_id,
          WORKSPACE_PERMISSIONS.deleteCampaign
        );
      } catch (error: any) {
        if (error?.status !== 404) {
          throw error;
        }

        const fallbackWorkspaceId = getWorkspaceId(req) || null;
        const fallbackProjectId = getProjectId(req) || null;
        if (!fallbackWorkspaceId && !fallbackProjectId) {
          throw { status: 404, message: "Template not found" };
        }

        await assertTemplateScopePermission({
          userId,
          workspaceId: fallbackWorkspaceId,
          projectId: fallbackProjectId,
          workspacePermission: WORKSPACE_PERMISSIONS.deleteCampaign,
          allowedProjectRoles: TEMPLATE_DELETE_ROLES,
        });
      }
    }

    await query(`DELETE FROM templates WHERE id = $1`, [id]);
    res.status(200).json({ message: "Template deleted successfully" });
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message || "Internal Server Error" });
  }
};

export const launchCampaign = async (req: PolicyRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { templateId, campaignName } = req.body;
    const scheduleAt = String(req.body?.scheduleAt || "").trim() || null;
    const contactIds = Array.isArray(req.body.contactIds) ? req.body.contactIds : [];
    const leadIds = Array.isArray(req.body.leadIds) ? req.body.leadIds : [];
    const io = req.app.get("io");
    const workspaceId = getWorkspaceId(req);
    const projectId = getProjectId(req);
    const preferredBotId = String(req.headers["x-bot-id"] || "").trim() || null;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const template = await findAccessibleTemplate(
      String(templateId || ""),
      userId,
      WORKSPACE_PERMISSIONS.createCampaign,
      TEMPLATE_OPERATOR_ROLES,
      {
        workspaceId: workspaceId || null,
        projectId: projectId || null,
      }
    );
    if (String(template.status || "").trim().toLowerCase() !== "approved") {
      return res.status(400).json({ error: "Only approved templates can be launched." });
    }
    const runtime = await resolveTemplateRuntime(template, {
      workspaceId: workspaceId || null,
      projectId: projectId || null,
      preferredBotId,
    });

    const scheduledAtMs = scheduleAt ? new Date(scheduleAt).getTime() : null;
    if (scheduledAtMs && Number.isFinite(scheduledAtMs) && scheduledAtMs > Date.now()) {
      const scheduledAtDate = new Date(scheduleAt as string);
      const job = await createJob(
        "template_campaign_launch",
        {
          templateId: template.id,
          campaignName,
          contactIds: contactIds.length > 0 ? contactIds : null,
          leadIds: leadIds.length > 0 ? leadIds : null,
          workspaceId: runtime.workspaceId || null,
          projectId: runtime.projectId || null,
          preferredBotId,
          scheduleAt,
          requestedByUserId: userId,
        },
        {
          availableAt: scheduledAtDate.toISOString(),
          maxRetries: 3,
        }
      );

      return res.status(202).json({
        success: true,
        scheduled: true,
        jobId: job.id,
        scheduleAt: scheduledAtDate.toISOString(),
      });
    }

    let resolvedContactIds = contactIds;
    if (resolvedContactIds.length === 0 && leadIds.length > 0) {
      const leadContactsRes = await query(
        `SELECT c.*
         FROM contacts c
         JOIN leads l
           ON l.contact_id = c.id
         WHERE l.id = ANY($1)
           AND l.bot_id = $2
           AND COALESCE(l.project_id, '00000000-0000-0000-0000-000000000000'::uuid) =
               COALESCE($3, '00000000-0000-0000-0000-000000000000'::uuid)`,
        [leadIds, runtime.botId, runtime.projectId || null]
      );
      resolvedContactIds = leadContactsRes.rows.map((contact: any) => contact.id);
    }

    if (resolvedContactIds.length === 0) {
      return res.status(400).json({ error: "contactIds or leadIds are required" });
    }

    if (runtime.workspaceId) {
      await assertCampaignRunLimit(runtime.workspaceId);
    }

    const contactsRes = await query(
      `SELECT *
       FROM contacts
       WHERE id = ANY($1)
         AND bot_id = $2`,
      [resolvedContactIds, runtime.botId]
    );
    const contacts = contactsRes.rows;

    let successCount = 0;
    let failCount = 0;

    for (const contact of contacts) {
      try {
        const payload: GenericMessage = {
          type: "template",
          templateName: template.name,
          languageCode: template.language,
          templateContent: template.content,
          templateVariables: template.variables,
          metaTemplateId: template.meta_template_id || null,
          metaTemplateName: template.meta_template_name || null,
          text: `[Campaign: ${campaignName}] ${template.name}`,
          pricingCategory: String(template.category || "marketing").trim().toLowerCase(),
          entryKind: "campaign_run",
        };

        const convRes = await query(
          `SELECT id
           FROM conversations
           WHERE contact_id = $1
             AND bot_id = $2
             AND channel = $3
           AND COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid) =
                 COALESCE($4, '00000000-0000-0000-0000-000000000000'::uuid)
           ORDER BY updated_at DESC
           LIMIT 1`,
          [contact.id, runtime.botId, runtime.platform, runtime.projectId || null]
        );

        let convId = convRes.rows[0]?.id;

        if (!convId) {
          const newConv = await query(
            `INSERT INTO conversations (bot_id, workspace_id, project_id, contact_id, channel, platform, platform_account_id, channel_id, campaign_id, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
             RETURNING id`,
            [
              runtime.botId,
              runtime.workspaceId || null,
              runtime.projectId || null,
              contact.id,
              runtime.platform,
              runtime.platform,
              runtime.platformAccountId,
              runtime.channelId,
              template.campaign_id || null,
            ]
          );
          convId = newConv.rows[0].id;
          await applyConversationWorkspacePolicies(convId);
        }

        await routeMessage(convId, payload, io);
        successCount++;
      } catch (err) {
        console.error(`Failed to send to contact ${contact.id}:`, err);
        failCount++;
      }
    }

    try {
      await query(
        `INSERT INTO template_logs
         (bot_id, campaign_name, template_name, platform, total_leads, success_count, fail_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          runtime.botId,
          campaignName,
          template.name,
          runtime.platform,
          contacts.length,
          successCount,
          failCount,
        ]
      );
    } catch (err: any) {
      if (SCHEMA_COMPAT_ERROR_CODES.has(String(err?.code || ""))) {
        console.warn("Template launch log insert skipped because template_logs schema is unavailable");
      } else {
        throw err;
      }
    }

    if (runtime.workspaceId) {
      await recordWorkspaceUsage({
        workspaceId: runtime.workspaceId,
        projectId: runtime.projectId || null,
        metricKey: "campaign_runs",
        metadata: {
          campaignName,
          templateId: template.id,
          totalRecipients: contacts.length,
          successCount,
          failCount,
        },
      });
    }

    res.status(200).json({ success: true, successCount, failCount, total: contacts.length });
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message || "Internal Server Error" });
  }
};

export const sendTemplateOnce = async (req: PolicyRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const templateId = String(req.params.id || "").trim();
    const workspaceId = getWorkspaceId(req);
    const projectId = getProjectId(req);
    const recipientInput = String(req.body?.recipient || req.body?.phone || req.body?.email || "").trim();
    const recipientName = String(req.body?.recipientName || req.body?.name || "Recipient").trim() || "Recipient";
    const recipientEmail = String(req.body?.recipientEmail || req.body?.email || "").trim();
    const variableValuesInput =
      req.body?.variableValues && typeof req.body.variableValues === "object"
        ? req.body.variableValues
        : {};
    const io = req.app.get("io");
    const preferredBotId = String(req.headers["x-bot-id"] || "").trim() || null;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const template = await findAccessibleTemplate(
      templateId,
      userId,
      WORKSPACE_PERMISSIONS.createCampaign,
      TEMPLATE_OPERATOR_ROLES,
      {
        workspaceId: workspaceId || null,
        projectId: projectId || null,
      }
    );

    if (String(template.status || "").trim().toLowerCase() !== "approved") {
      return res.status(400).json({ error: "Only approved templates can be sent." });
    }

    const runtime = await resolveTemplateRuntime(template, {
      workspaceId: workspaceId || null,
      projectId: projectId || null,
      preferredBotId,
    });
    const channel = String(runtime.platform || template.platform_type || "").trim().toLowerCase();
    const normalizedRecipientInput =
      channel === "whatsapp"
        ? normalizeWhatsAppPlatformUserId(recipientInput) || recipientInput
        : recipientInput;
    const recipientIdentifier =
      channel === "email"
        ? recipientEmail || recipientInput
        : normalizedRecipientInput;

    if (!recipientIdentifier) {
      return res.status(400).json({ error: channel === "email" ? "Recipient email is required." : "Recipient phone or platform id is required." });
    }

    const content = normalizeTemplateContent(template);
    const variableTokens = extractTemplateVariableTokens(content);
    const manualVariableMap: Record<string, string> = {};
    const manualConversationVariables: Record<string, string> = {};

    for (const token of variableTokens) {
      const rawValue = variableValuesInput?.[token];
      const value = String(rawValue ?? "").trim();
      if (!value) {
        return res.status(400).json({ error: `Value for variable {{${token}}} is required.` });
      }
      const variableKey = `manual_${token}`;
      manualVariableMap[token] = variableKey;
      manualConversationVariables[variableKey] = value;
    }

    const phoneValue = channel === "email" ? "" : recipientIdentifier;
    const emailValue = channel === "email" ? recipientIdentifier : recipientEmail;
    const contact = await upsertContactWithIdentity({
      botId: runtime.botId,
      workspaceId: runtime.workspaceId || null,
      platform: channel,
      platformUserId: recipientIdentifier,
      name: recipientName,
      email: emailValue || null,
      phone: phoneValue || null,
    });

    const contactId = contact?.id;
    if (!contactId) {
      throw { status: 500, message: "Failed to create or update recipient contact." };
    }

    const conversationRes = await query(
      `SELECT id, variables
       FROM conversations
       WHERE contact_id = $1
         AND bot_id = $2
         AND channel = $3
       ORDER BY
         CASE WHEN status IN ('active', 'agent_pending') THEN 0 ELSE 1 END,
         CASE WHEN current_node IS NOT NULL THEN 0 ELSE 1 END,
         updated_at DESC
       LIMIT 1`,
      [contactId, runtime.botId, channel]
    );

    let conversationId = conversationRes.rows[0]?.id;
    const existingConversationVariables = parseJsonLike(conversationRes.rows[0]?.variables) || {};
    const mergedConversationVariables = {
      ...existingConversationVariables,
      ...manualConversationVariables,
    };

    if (!conversationId) {
      const newConversation = await query(
        `INSERT INTO conversations
           (bot_id, workspace_id, project_id, contact_id, channel, platform, platform_account_id, channel_id, campaign_id, status, variables)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10::jsonb)
         RETURNING id`,
        [
          runtime.botId,
          runtime.workspaceId || null,
          runtime.projectId || null,
          contactId,
          channel,
          channel,
          runtime.platformAccountId || null,
          runtime.channelId || null,
          template.campaign_id || null,
          JSON.stringify(mergedConversationVariables),
        ]
      );
      conversationId = newConversation.rows[0]?.id;
      if (conversationId) {
        await applyConversationWorkspacePolicies(conversationId);
      }
    } else {
      await query(
        `UPDATE conversations
         SET
           variables = $2::jsonb,
           workspace_id = COALESCE(workspace_id, $3),
           project_id = COALESCE(project_id, $4),
           platform_account_id = COALESCE(platform_account_id, $5),
           channel_id = COALESCE(channel_id, $6),
           campaign_id = COALESCE(campaign_id, $7),
           status = 'active',
           updated_at = NOW()
         WHERE id = $1`,
        [
          conversationId,
          JSON.stringify(mergedConversationVariables),
          runtime.workspaceId || null,
          runtime.projectId || null,
          runtime.platformAccountId || null,
          runtime.channelId || null,
          template.campaign_id || null,
        ]
      );
    }

    if (!conversationId) {
      throw { status: 500, message: "Failed to prepare a conversation for this recipient." };
    }

    const normalizedHeaderType = String(content?.header?.type || "").trim().toLowerCase();
    const savedHeaderAsset = String(content?.header?.assetUrl || content?.header?.assetId || "").trim();
    const headerMediaUrl = String(
      req.body?.headerMediaUrl || req.body?.headerMedia || savedHeaderAsset || ""
    ).trim();

    if (["image", "video", "document"].includes(normalizedHeaderType) && !headerMediaUrl) {
      return res.status(400).json({
        error: `A ${normalizedHeaderType} header asset is required for this template.`,
      });
    }

    const runtimeTemplateContent =
      ["image", "video", "document"].includes(normalizedHeaderType)
        ? {
            ...content,
            header: {
              ...(content?.header || {}),
              ...( /^https?:\/\//i.test(String(headerMediaUrl || "").trim())
                ? {
                    assetUrl: headerMediaUrl,
                    ...(content?.header?.assetId ? { assetId: content.header.assetId } : {}),
                  }
                : {
                    assetId: headerMediaUrl,
                    ...(content?.header?.assetUrl ? { assetUrl: content.header.assetUrl } : {}),
                  }),
            },
          }
        : content;

    const payload: GenericMessage = {
      type: "template",
      templateName: template.name,
      languageCode: template.language,
      templateContent: runtimeTemplateContent,
      templateVariables: manualVariableMap,
      metaTemplateId: template.meta_template_id || null,
      metaTemplateName: template.meta_template_name || null,
      text: `[Single Send] ${template.name}`,
      pricingCategory: String(template.category || "marketing").trim().toLowerCase(),
      entryKind: "manual_reply",
    };

    await routeMessage(conversationId, payload, io);
    await cancelPendingJobsByConversation(conversationId, FLOW_WAIT_JOB_TYPES);
    clearUserTimers(runtime.botId, recipientIdentifier);
    await query(
      `UPDATE conversations
       SET current_node = NULL,
           retry_count = 0,
           status = 'agent_pending',
           updated_at = NOW()
       WHERE id = $1`,
      [conversationId]
    );

    return res.status(200).json({
      success: true,
      conversationId,
      template: normalizeTemplateRecordForResponse(template),
      recipient: {
        id: contactId,
        identifier: recipientIdentifier,
        name: recipientName,
      },
    });
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message || "Internal Server Error" });
  }
};

export const getTemplateLogs = async (req: PolicyRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const workspaceId = getWorkspaceId(req);
    const projectId = getProjectId(req);
    const platform = req.query.platform as string | undefined;
    const botId = (req.query.botId as string) || (req.query.bot_id as string) || undefined;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    await assertTemplateReadScope(userId, workspaceId, projectId);

    const params: any[] = [userId];
    const conditions = [
      `(b.user_id = $1 OR (
         b.workspace_id IS NOT NULL
         AND b.workspace_id IN (
           SELECT workspace_id
           FROM workspace_memberships
           WHERE user_id = $1
             AND status = 'active'
         )
       ))`,
    ];

    if (workspaceId) {
      params.push(workspaceId);
      conditions.push(`b.workspace_id = $${params.length}`);
    }

    if (projectId) {
      params.push(projectId);
      conditions.push(`b.project_id = $${params.length}`);
    }

    if (botId) {
      params.push(botId);
      conditions.push(`tl.bot_id = $${params.length}`);
    }

    if (platform) {
      params.push(platform);
      conditions.push(`tl.platform = $${params.length}`);
    }

    try {
      const result = await query(
        `SELECT tl.*, b.workspace_id, b.project_id
         FROM template_logs tl
         JOIN bots b ON b.id = tl.bot_id
         WHERE ${conditions.join(" AND ")}
         ORDER BY tl.created_at DESC`,
        params
      );

      res.status(200).json(await filterRowsByReadableTemplateScope(userId, result.rows));
    } catch (error: any) {
      if (SCHEMA_COMPAT_ERROR_CODES.has(String(error?.code || ""))) {
        res.status(200).json([]);
        return;
      }
      throw error;
    }
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message || "Internal Server Error" });
  }
};
