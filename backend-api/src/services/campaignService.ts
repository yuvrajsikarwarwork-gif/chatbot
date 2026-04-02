import { findBotById } from "../models/botModel";
import { findFlowById, findFlowSummariesByBot } from "../models/flowModel";
import {
  createCampaign,
  createCampaignChannel,
  createEntryPoint,
  clearDefaultEntryPointsForChannel,
  createList,
  deleteCampaign,
  deleteCampaignChannel,
  deleteEntryPoint,
  deleteList,
  findCampaignById,
  findCampaignBySlug,
  findCampaignChannelById,
  findCampaignChannelByCampaignBotAndPlatform,
  findCampaignChannelsByCampaign,
  findCampaignsByWorkspaceProject,
  findCampaignsByUser,
  findEntryPointById,
  findEntryPointByChannelAndKey,
  findEntryPointByChannelAndSourceRef,
  findEntryPointsByCampaign,
  findListById,
  findListByCampaignAndKey,
  findListsByCampaign,
  updateCampaign,
  updateCampaignByWorkspaceProject,
  updateCampaignChannel,
  updateEntryPoint,
  updateList,
} from "../models/campaignModel";
import { findPlatformAccountById } from "../models/platformAccountModel";
import {
  assertCampaignQuota,
  assertPlatformAllowedByPlan,
  validateWorkspaceContext,
} from "./businessValidationService";
import {
  assertProjectContextAccess,
  assertProjectScopedWriteAccess,
  resolveVisibleProjectIdsForWorkspace,
} from "./projectAccessService";
import {
  assertBotWorkspacePermission,
  assertWorkspacePermission,
  WORKSPACE_PERMISSIONS,
} from "./workspaceAccessService";
import { isSupportedPlatform, normalizePlatform } from "../utils/platform";
import { encryptSecret } from "../utils/encryption";
import { recordAnalyticsEvent } from "./runtimeAnalyticsService";
import { logAuditSafe } from "./auditLogService";
import { DEFAULT_CSAT_FLOW, DEFAULT_HANDOFF_FLOW } from "../config/systemFlowTemplates";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function deepCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function mergeSettingsSources(...sources: any[]) {
  return sources.reduce((acc, source) => {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      return acc;
    }
    return { ...acc, ...source };
  }, {});
}

function buildCampaignSystemFlows(currentSettings: any) {
  const settings = currentSettings && typeof currentSettings === "object" && !Array.isArray(currentSettings)
    ? currentSettings
    : {};
  const currentSystemFlows =
    settings.system_flows && typeof settings.system_flows === "object"
      ? settings.system_flows
      : {};

  return {
    handoff:
      currentSystemFlows.handoff && typeof currentSystemFlows.handoff === "object"
        ? currentSystemFlows.handoff
        : deepCloneJson(DEFAULT_HANDOFF_FLOW),
    csat:
      currentSystemFlows.csat && typeof currentSystemFlows.csat === "object"
        ? currentSystemFlows.csat
        : deepCloneJson(DEFAULT_CSAT_FLOW),
  };
}

function getDefaultHandoffKeywords() {
  const triggerNode = Array.isArray(DEFAULT_HANDOFF_FLOW.nodes)
    ? (DEFAULT_HANDOFF_FLOW.nodes as any[]).find((node: any) => String(node?.type || "").trim().toLowerCase() === "trigger")
    : null;
  return String(triggerNode?.data?.triggerKeywords || "").trim();
}

function buildCampaignSystemFlowRules(currentSettings: any) {
  const settings = currentSettings && typeof currentSettings === "object" && !Array.isArray(currentSettings)
    ? currentSettings
    : {};
  const currentRules =
    settings.system_flow_rules && typeof settings.system_flow_rules === "object"
      ? settings.system_flow_rules
      : {};

  return {
    handoff_keywords:
      String(
        currentRules.handoff_keywords ||
          currentRules.keywords ||
          currentRules.trigger_keywords ||
          getDefaultHandoffKeywords()
      ).trim(),
    handoff_flow_id:
      String(currentRules.handoff_flow_id || "handoff").trim() || "handoff",
    csat_enabled:
      currentRules.csat_enabled !== undefined ? Boolean(currentRules.csat_enabled) : true,
    csat_flow_id:
      String(currentRules.csat_flow_id || "csat").trim() || "csat",
  };
}

function ensureRecord<T>(record: T | undefined, message: string): T {
  if (!record) {
    throw { status: 404, message };
  }

  return record;
}

async function ensureBotOwnership(botId: string, userId: string) {
  const bot = await assertBotWorkspacePermission(
    userId,
    botId,
    WORKSPACE_PERMISSIONS.createFlow
  );
  if (!bot.project_id || !bot.workspace_id) {
    throw { status: 409, message: "Bot must belong to a project" };
  }
  await assertProjectScopedWriteAccess({
    userId,
    projectId: bot.project_id,
    workspaceId: bot.workspace_id,
    workspacePermission: WORKSPACE_PERMISSIONS.createFlow,
    allowedProjectRoles: ["project_admin", "editor"],
  });
  return bot;
}

async function ensureFlowOwnership(flowId: string, botId: string, userId: string) {
  const flow = await findFlowById(flowId);
  if (!flow || flow.bot_id !== botId) {
    throw { status: 404, message: "Flow not found" };
  }

  const bot = await ensureBotOwnership(botId, userId);
  if (bot.id !== flow.bot_id) {
    throw { status: 403, message: "Flow does not belong to this bot" };
  }

  return flow;
}

async function ensureCampaignOwnership(campaignId: string, userId: string) {
  const campaign = ensureRecord(
    await findCampaignById(campaignId, userId),
    "Campaign not found"
  );

  if (campaign.project_id && campaign.workspace_id) {
    await assertProjectContextAccess(userId, campaign.project_id, campaign.workspace_id);
  } else if (campaign.workspace_id) {
    await assertWorkspacePermission(
      userId,
      campaign.workspace_id,
      WORKSPACE_PERMISSIONS.viewCampaigns
    );
  }

  return campaign;
}

export async function ensureCampaignSystemFlows(campaignId: string, userId: string) {
  const campaign = await ensureCampaignOwnership(campaignId, userId);
  const currentSettings = mergeSettingsSources(campaign.settings_json);
  const nextSettings = buildCampaignSettings({ settingsJson: currentSettings }, currentSettings);

  if (JSON.stringify(currentSettings || {}) !== JSON.stringify(nextSettings || {})) {
    const updated = await updateCampaignByWorkspaceProject(
      campaign.id,
      campaign.workspace_id,
      campaign.project_id,
      { settingsJson: nextSettings }
    ).catch((err) => {
      console.error("Failed to seed campaign system flows:", err);
      return null;
    });

    if (updated) {
      return updated;
    }
  }

  const existingChannels = await findCampaignChannelsByCampaign(campaign.id, userId).catch((err) => {
    console.error("Failed to inspect campaign channels while ensuring system flows:", err);
    return [];
  });

  if (existingChannels.length === 0 && campaign.default_flow_id) {
    const defaultFlow = await findFlowById(campaign.default_flow_id).catch((err) => {
      console.error("Failed to load default flow while backfilling campaign channel:", err);
      return null;
    });

    if (defaultFlow) {
      const defaultBot = await ensureBotOwnership(defaultFlow.bot_id, userId).catch((err) => {
        console.error("Failed to resolve default bot while backfilling campaign channel:", err);
        return null;
      });

      if (defaultBot) {
        const seededChannel = await createCampaignChannel({
          campaignId: campaign.id,
          userId,
          botId: defaultBot.id,
          projectId: campaign.project_id,
          platform: "whatsapp",
          platformType: "whatsapp",
          platformAccountId: null,
          platformAccountRefId: null,
          name: `${defaultBot.name} / WhatsApp`,
          status: "active",
          defaultFlowId: campaign.default_flow_id,
          flowId: campaign.default_flow_id,
          listId: null,
          settingsJson: buildChannelSettings(
            { settingsJson: campaign.settings_json || {} },
            campaign.settings_json || {}
          ),
          config: {},
        }).catch((err) => {
          console.error("Failed to backfill campaign channel while ensuring system flows:", err);
          return null;
        });

        if (seededChannel) {
          await logAuditSafe({
            userId,
            workspaceId: campaign.workspace_id,
            projectId: campaign.project_id,
            action: "update",
            entity: "campaign_channel",
            entityId: seededChannel.id,
            oldData: {},
            newData: seededChannel,
          }).catch((err) => {
            console.error("Failed to audit backfilled campaign channel:", err);
          });
        }
      }
    }
  }

  return {
    ...campaign,
    settings_json: nextSettings,
  };
}

async function filterCampaignRowsByProjectScope<T extends { workspace_id?: string | null; project_id?: string | null }>(
  userId: string,
  rows: T[]
) {
  const projectScopeCache = new Map<string, string[] | null>();

  const resolveScope = async (workspaceId: string) => {
    if (!projectScopeCache.has(workspaceId)) {
      projectScopeCache.set(
        workspaceId,
        await resolveVisibleProjectIdsForWorkspace(userId, workspaceId)
      );
    }

    return projectScopeCache.get(workspaceId) ?? [];
  };

  const filtered: T[] = [];
  for (const row of rows) {
    const workspaceId = String(row.workspace_id || "").trim();
    const projectId = String(row.project_id || "").trim();
    if (!workspaceId || !projectId) {
      filtered.push(row);
      continue;
    }

    const visibleProjectIds = await resolveScope(workspaceId);
    if (visibleProjectIds === null || visibleProjectIds.includes(projectId)) {
      filtered.push(row);
    }
  }

  return filtered;
}

function ensureChannelBelongsToCampaign(channel: any, campaign: any) {
  if (channel.campaign_id !== campaign.id) {
    throw {
      status: 400,
      message: "Campaign channel must belong to the selected campaign",
    };
  }
}

function ensureEntryPointBelongsToCampaign(entryPoint: any, campaign: any) {
  if (entryPoint.campaign_id !== campaign.id) {
    throw {
      status: 400,
      message: "Entry point must belong to the selected campaign",
    };
  }
}

function ensureListBelongsToCampaign(list: any, campaignId: string) {
  if (list.campaign_id !== campaignId) {
    throw { status: 400, message: "List must belong to the selected campaign" };
  }
}

async function resolvePlatformAccountBinding(options: {
  userId: string;
  workspaceId?: string | null;
  projectId?: string | null;
  platform: string;
  platformAccountId?: string | null;
}) {
  const rawValue = String(options.platformAccountId || "").trim();
  const looksLikeUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      rawValue
    );
  if (!rawValue) {
    return {
      platformAccountId: null,
      platformAccountRefId: null,
    };
  }

  const linkedAccount = looksLikeUuid
    ? await findPlatformAccountById(rawValue, options.userId)
    : null;
  if (!linkedAccount) {
    return {
      platformAccountId: rawValue,
      platformAccountRefId: null,
    };
  }

  if (
    options.workspaceId &&
    linkedAccount.workspace_id &&
    linkedAccount.workspace_id !== options.workspaceId
  ) {
    throw {
      status: 400,
      message: "Platform account must belong to the selected workspace",
    };
  }

  if (
    options.projectId &&
    linkedAccount.project_id &&
    linkedAccount.project_id !== options.projectId
  ) {
    throw {
      status: 400,
      message: "Platform account must belong to the selected project",
    };
  }

  if (linkedAccount.platform_type !== options.platform) {
    throw {
      status: 400,
      message: "Platform account type must match the channel platform",
    };
  }

  return {
    platformAccountId:
      linkedAccount.account_id || linkedAccount.phone_number || linkedAccount.id,
    platformAccountRefId: linkedAccount.id,
  };
}

function buildListKey(
  campaignSlug: string,
  platform: string,
  entryKey?: string | null
) {
  return [campaignSlug, platform, entryKey || "default"].filter(Boolean).join("__");
}

function normalizeEntryKey(value: string) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:/-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!normalized) {
    throw { status: 400, message: "Entry key is invalid" };
  }

  return normalized;
}

function normalizeOptionalText(value?: string | null) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeEntryType(value?: string) {
  const normalized = String(value || "generic").trim().toLowerCase();
  const allowed = new Set(["generic", "qr", "link", "widget", "api", "webhook", "ad"]);
  if (!allowed.has(normalized)) {
    throw { status: 400, message: `Unsupported entry type '${value}'` };
  }

  return normalized;
}

function normalizeLandingUrl(value?: string | null) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("/")) {
    return normalized;
  }

  try {
    const parsed = new URL(normalized);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("invalid protocol");
    }
    return parsed.toString();
  } catch {
    throw { status: 400, message: "Landing URL must be an absolute http(s) URL or a relative path" };
  }
}

function normalizeListKey(value: string) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:/-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!normalized) {
    throw { status: 400, message: "List key is invalid" };
  }

  return normalized;
}

function normalizeListSourceType(value?: string) {
  const normalized = String(value || "manual").trim().toLowerCase();
  const allowed = new Set(["manual", "entry_point", "campaign", "import", "segment", "suppression"]);
  if (!allowed.has(normalized)) {
    throw { status: 400, message: `Unsupported list source type '${value}'` };
  }

  return normalized;
}

function requirePlatform(platform: string) {
  const normalizedPlatform = normalizePlatform(platform);
  if (!isSupportedPlatform(normalizedPlatform)) {
    throw { status: 400, message: `Unsupported platform '${platform}'` };
  }

  return normalizedPlatform;
}

function normalizeCampaignStatus(status?: string) {
  const value = String(status || "draft").trim().toLowerCase();
  const allowed = new Set(["draft", "active", "paused", "completed"]);
  if (!allowed.has(value)) {
    throw { status: 400, message: `Unsupported campaign status '${status}'` };
  }

  return value;
}

function buildCampaignSettings(payload: any, currentSettings?: Record<string, unknown>) {
  const base = {
    allow_multiple_platforms:
      payload.allowMultiplePlatforms ?? payload.settingsJson?.allow_multiple_platforms ?? true,
    auto_assign_agent:
      payload.autoAssignAgent ?? payload.settingsJson?.auto_assign_agent ?? false,
    allow_restart:
      payload.allowRestart ?? payload.settingsJson?.allow_restart ?? true,
    track_leads: payload.trackLeads ?? payload.settingsJson?.track_leads ?? true,
  };

  const merged = mergeSettingsSources(currentSettings, payload.settingsJson, base);
  return {
    ...merged,
    system_flows: buildCampaignSystemFlows(merged),
    system_flow_rules: buildCampaignSystemFlowRules(merged),
  };
}

const CHANNEL_SECRET_KEYS = new Set([
  "accessToken",
  "verifyToken",
  "apiKey",
  "botToken",
  "appSecret",
]);

function serializeChannelConfig(config: Record<string, unknown> | undefined) {
  const entries = Object.entries(config || {}).filter(
    ([, value]) => value !== undefined && value !== null && String(value).trim() !== ""
  );

  return Object.fromEntries(
    entries.map(([key, value]) => [
      key,
      CHANNEL_SECRET_KEYS.has(key) && typeof value === "string"
        ? encryptSecret(value)
        : value,
    ])
  );
}

function mergeChannelConfig(
  existingConfig: Record<string, unknown> | undefined,
  incomingConfig: Record<string, unknown> | undefined
) {
  const merged = {
    ...(existingConfig || {}),
    ...(incomingConfig || {}),
  };

  return serializeChannelConfig(merged);
}

function buildChannelSettings(payload: any, existingSettings?: Record<string, unknown>) {
  return {
    allow_restart:
      payload.allowRestart ?? payload.settingsJson?.allow_restart ?? existingSettings?.allow_restart ?? true,
    allow_multiple_leads:
      payload.allowMultipleLeads ??
      payload.settingsJson?.allow_multiple_leads ??
      existingSettings?.allow_multiple_leads ??
      false,
    require_phone:
      payload.requirePhone ?? payload.settingsJson?.require_phone ?? existingSettings?.require_phone ?? true,
  };
}

async function ensureSystemListForEntry(options: {
  campaign: any;
  channel: any;
  entryPoint: any;
  userId: string;
}) {
  const existingLists = await findListsByCampaign(options.campaign.id, options.userId);
  const matching = existingLists.find(
    (list: any) => list.entry_point_id === options.entryPoint.id
  );

  if (matching) {
    return matching;
  }

  return createList({
    userId: options.userId,
    botId: options.channel.bot_id,
    campaignId: options.campaign.id,
    channelId: options.channel.id,
    entryPointId: options.entryPoint.id,
    platform: options.channel.platform,
    name: `${options.channel.platform.toUpperCase()} / ${options.entryPoint.name}`,
    listKey: buildListKey(
      options.campaign.slug,
      options.channel.platform,
      options.entryPoint.entry_key
    ),
    sourceType: "entry_point",
    isSystem: true,
    filters: {
      campaignId: options.campaign.id,
      channelId: options.channel.id,
      entryPointId: options.entryPoint.id,
      platform: options.channel.platform,
    },
    metadata: {
      generatedBy: "campaign_service",
    },
  });
}

export async function listCampaignsService(
  userId: string,
  workspaceId?: string | null,
  projectId?: string | null
) {
  if (projectId) {
    const projectAccess = await assertProjectContextAccess(userId, projectId, workspaceId || null);
    return findCampaignsByWorkspaceProject(
      projectAccess?.workspace_id || workspaceId || "",
      projectId
    );
  }

  if (workspaceId) {
    await assertWorkspacePermission(
      userId,
      workspaceId,
      WORKSPACE_PERMISSIONS.viewCampaigns
    );
    const rows = await findCampaignsByWorkspaceProject(workspaceId);
    return filterCampaignRowsByProjectScope(userId, rows);
  }

  const rows = await findCampaignsByUser(userId);
  return filterCampaignRowsByProjectScope(userId, rows);
}

export async function getCampaignDetailService(id: string, userId: string) {
  const campaign = await ensureCampaignSystemFlows(id, userId);
  const [channels, entryPoints, lists] = await Promise.all([
    findCampaignChannelsByCampaign(id, userId),
    findEntryPointsByCampaign(id, userId),
    findListsByCampaign(id, userId),
  ]);

  return {
    ...campaign,
    channels,
    entryPoints,
    lists,
  };
}

export async function createCampaignService(userId: string, payload: any) {
  if (!payload.name) {
    throw { status: 400, message: "Campaign name is required" };
  }

  const projectId = String(payload.projectId || payload.project_id || "").trim();
  if (!projectId) {
    throw { status: 400, message: "Project is required before creating a campaign" };
  }

  const projectAccess = await assertProjectContextAccess(
    userId,
    projectId,
    payload.workspaceId || null
  );
  const workspaceId = projectAccess?.workspace_id || String(payload.workspaceId || "").trim();

  await validateWorkspaceContext(workspaceId || null, { userId });
  await assertProjectScopedWriteAccess({
    userId,
    projectId,
    workspaceId: workspaceId || null,
    workspacePermission: WORKSPACE_PERMISSIONS.createCampaign,
    allowedProjectRoles: ["project_admin", "editor"],
  });
  await assertCampaignQuota(userId, workspaceId || null);

  const slug = slugify(payload.slug || payload.name);
  if (!slug) {
    throw { status: 400, message: "Campaign slug is invalid" };
  }

  const existing = await findCampaignBySlug(userId, slug, workspaceId || null);
  if (existing) {
    throw { status: 409, message: "A campaign with this slug already exists" };
  }

  if (payload.defaultFlowId) {
    const flow = await findFlowById(payload.defaultFlowId);
    if (!flow) {
      throw { status: 404, message: "Default flow not found" };
    }
    const bot = await ensureBotOwnership(flow.bot_id, userId);
    if (bot.workspace_id !== workspaceId || bot.project_id !== projectId) {
      throw {
        status: 400,
        message: "Default flow must belong to a bot in the selected project",
      };
    }
  }

  if (
    payload.startDate &&
    payload.endDate &&
    new Date(payload.endDate).getTime() < new Date(payload.startDate).getTime()
  ) {
    throw { status: 400, message: "End date must be on or after start date" };
  }

  const createdCampaign = await createCampaign(userId, {
    name: payload.name,
    slug,
    description: payload.description || null,
    status: normalizeCampaignStatus(payload.status),
    workspaceId: workspaceId || null,
    projectId,
    createdBy: userId,
    startDate: payload.startDate || null,
    endDate: payload.endDate || null,
    defaultFlowId: payload.defaultFlowId || null,
    settingsJson: buildCampaignSettings(payload),
    metadata: payload.metadata || {},
  });

  if (payload.defaultFlowId) {
    const defaultFlow = await findFlowById(payload.defaultFlowId);
    if (defaultFlow) {
      const defaultBot = await ensureBotOwnership(defaultFlow.bot_id, userId);
      const seededChannel = await createCampaignChannel({
        campaignId: createdCampaign.id,
        userId,
        botId: defaultBot.id,
        projectId: createdCampaign.project_id,
        platform: "whatsapp",
        platformType: "whatsapp",
        platformAccountId: null,
        platformAccountRefId: null,
        name: `${defaultBot.name} / WhatsApp`,
        status: "active",
        defaultFlowId: payload.defaultFlowId,
        flowId: payload.defaultFlowId,
        listId: null,
        settingsJson: buildChannelSettings(payload),
        config: {},
      }).catch((err) => {
        console.error("Failed to seed default campaign channel on create:", err);
        return null;
      });

      if (seededChannel) {
        await logAuditSafe({
          userId,
          workspaceId: createdCampaign.workspace_id,
          projectId,
          action: "create",
          entity: "campaign_channel",
          entityId: seededChannel.id,
          newData: seededChannel,
        });
      }
    }
  }

  const seededCampaign = await ensureCampaignSystemFlows(createdCampaign.id, userId).catch((err) => {
    console.error("Failed to seed campaign system flows on create:", err);
    return createdCampaign;
  });

  await recordAnalyticsEvent({
    workspaceId: createdCampaign.workspace_id,
    campaignId: createdCampaign.id,
    actorUserId: userId,
    eventType: "campaign",
    eventName: "campaign_created",
    payload: {
      status: createdCampaign.status,
      allowMultiplePlatforms: createdCampaign.settings_json?.allow_multiple_platforms,
    },
  });
  await logAuditSafe({
    userId,
    workspaceId: createdCampaign.workspace_id,
    projectId,
    action: "create",
    entity: "campaign",
    entityId: createdCampaign.id,
    newData: createdCampaign,
  });

  return seededCampaign || createdCampaign;
}

export async function updateCampaignService(id: string, userId: string, payload: any) {
  const campaign = await ensureCampaignSystemFlows(id, userId);
  const nextProjectId =
    payload.projectId !== undefined || payload.project_id !== undefined
      ? String(payload.projectId || payload.project_id || "").trim() || null
      : campaign.project_id || null;
  if (!nextProjectId) {
    throw { status: 400, message: "Campaign must remain attached to a project" };
  }

  const projectAccess = await assertProjectContextAccess(
    userId,
    nextProjectId,
    payload.workspaceId !== undefined ? payload.workspaceId || null : campaign.workspace_id || null
  );
  const nextWorkspaceId =
    projectAccess?.workspace_id ||
    (payload.workspaceId !== undefined ? payload.workspaceId || null : campaign.workspace_id || null);

  await assertProjectScopedWriteAccess({
    userId,
    projectId: nextProjectId,
    workspaceId: nextWorkspaceId,
    workspacePermission: WORKSPACE_PERMISSIONS.editCampaign,
    allowedProjectRoles: ["project_admin", "editor"],
  });

  await validateWorkspaceContext(nextWorkspaceId || null, { userId });

  const nextSlug =
    payload.slug !== undefined
      ? slugify(payload.slug)
      : payload.name
        ? slugify(payload.name)
        : undefined;

  if (nextSlug !== undefined) {
    const existing = await findCampaignBySlug(
        userId,
        nextSlug,
      nextWorkspaceId
    );
    if (existing && existing.id !== campaign.id) {
      throw { status: 409, message: "A campaign with this slug already exists" };
    }
  }

  const updatePayload: Record<string, unknown> = {};
  if (payload.name !== undefined) updatePayload.name = payload.name;
  if (nextSlug !== undefined) updatePayload.slug = nextSlug;
  if (payload.description !== undefined) updatePayload.description = payload.description;
  if (payload.status !== undefined) {
    updatePayload.status = normalizeCampaignStatus(payload.status);
  }
  updatePayload.workspaceId = nextWorkspaceId;
  updatePayload.projectId = nextProjectId;
  if (payload.startDate !== undefined) updatePayload.startDate = payload.startDate;
  if (payload.endDate !== undefined) updatePayload.endDate = payload.endDate;
  if (payload.defaultFlowId !== undefined) {
    if (payload.defaultFlowId) {
      const flow = await findFlowById(payload.defaultFlowId);
      if (!flow) {
        throw { status: 404, message: "Default flow not found" };
      }
      const bot = await ensureBotOwnership(flow.bot_id, userId);
      if (bot.workspace_id !== nextWorkspaceId || bot.project_id !== nextProjectId) {
        throw {
          status: 400,
          message: "Default flow must belong to a bot in the selected project",
        };
      }
    }
    updatePayload.defaultFlowId = payload.defaultFlowId;
  }
  if (
    (payload.startDate !== undefined || payload.endDate !== undefined) &&
    new Date(String(payload.endDate ?? campaign.end_date ?? "")).getTime() <
      new Date(String(payload.startDate ?? campaign.start_date ?? "")).getTime()
  ) {
    throw { status: 400, message: "End date must be on or after start date" };
  }
  if (
    payload.allowMultiplePlatforms !== undefined ||
    payload.autoAssignAgent !== undefined ||
    payload.allowRestart !== undefined ||
    payload.trackLeads !== undefined ||
    payload.settingsJson !== undefined
  ) {
    updatePayload.settingsJson = buildCampaignSettings(
      {
        settingsJson: campaign.settings_json || {},
        ...payload,
      },
      campaign.settings_json || {}
    );
  }
  if (payload.metadata !== undefined) updatePayload.metadata = payload.metadata;

  const updated = await updateCampaign(id, userId, updatePayload);
  await ensureCampaignSystemFlows(id, userId).catch((err) => {
    console.error("Failed to re-seed campaign system flows after update:", err);
  });
  await logAuditSafe({
    userId,
    workspaceId: nextWorkspaceId,
    projectId: nextProjectId,
    action: "update",
    entity: "campaign",
    entityId: id,
    oldData: campaign,
    newData: updated || {},
  });
  return updated;
}

export async function deleteCampaignService(id: string, userId: string) {
  const campaign = await ensureCampaignOwnership(id, userId);
  await assertProjectScopedWriteAccess({
    userId,
    projectId: campaign.project_id,
    workspaceId: campaign.workspace_id,
    workspacePermission: WORKSPACE_PERMISSIONS.deleteCampaign,
    allowedProjectRoles: ["project_admin"],
  });
  await logAuditSafe({
    userId,
    workspaceId: campaign.workspace_id,
    projectId: campaign.project_id,
    action: "delete",
    entity: "campaign",
    entityId: id,
    oldData: campaign,
  });
  await deleteCampaign(id, userId);
}

export async function createCampaignChannelService(userId: string, payload: any) {
  const campaign = await ensureCampaignOwnership(payload.campaignId, userId);
  if (!campaign.project_id) {
    throw { status: 409, message: "Campaign must belong to a project before channels can be added" };
  }
  await assertProjectScopedWriteAccess({
    userId,
    projectId: campaign.project_id,
    workspaceId: campaign.workspace_id,
    workspacePermission: WORKSPACE_PERMISSIONS.editCampaign,
    allowedProjectRoles: ["project_admin", "editor"],
  });
  const bot = await assertBotWorkspacePermission(
    userId,
    payload.botId,
    WORKSPACE_PERMISSIONS.createFlow
  );
  if (bot.workspace_id !== campaign.workspace_id || bot.project_id !== campaign.project_id) {
    throw { status: 400, message: "Bot must belong to the same workspace project as the campaign" };
  }

  if (!payload.platform || !payload.name) {
    throw { status: 400, message: "platform and name are required" };
  }

  const platform = requirePlatform(payload.platform);
    await assertPlatformAllowedByPlan(platform, campaign.workspace_id, userId);

  if (
    campaign.settings_json?.allow_multiple_platforms === false &&
    (await findCampaignChannelsByCampaign(campaign.id, userId)).some(
      (channel: any) => channel.platform !== platform
    )
  ) {
    throw {
      status: 400,
      message:
        "This campaign does not allow multiple platforms. Remove the existing platform first or enable multi-platform support.",
    };
  }

  if (payload.defaultFlowId) {
    await ensureFlowOwnership(payload.defaultFlowId, bot.id, userId);
  }

  if (payload.flowId) {
    await ensureFlowOwnership(payload.flowId, bot.id, userId);
  }

  if (payload.listId) {
    const list = await ensureRecord(
      await findListById(payload.listId, userId),
      "List not found"
    );
    if (list.campaign_id !== campaign.id) {
      throw { status: 400, message: "List must belong to the selected campaign" };
    }
  }

  const accountBinding = await resolvePlatformAccountBinding({
    userId,
    workspaceId: campaign.workspace_id,
    projectId: campaign.project_id,
    platform,
    platformAccountId: payload.platformAccountId || null,
  });

  const existingChannel = await findCampaignChannelByCampaignBotAndPlatform(
    campaign.id,
    bot.id,
    platform
  );

  if (existingChannel) {
    const updated = await updateCampaignChannel(existingChannel.id, userId, {
      botId: bot.id,
      platform,
      platformType: platform,
      platformAccountId: accountBinding.platformAccountId,
      platformAccountRefId: accountBinding.platformAccountRefId,
      name: payload.name,
      status: payload.status || existingChannel.status || "active",
      defaultFlowId: payload.defaultFlowId || existingChannel.default_flow_id || null,
      flowId: payload.flowId || payload.defaultFlowId || existingChannel.flow_id || null,
      listId: payload.listId || existingChannel.list_id || null,
      settingsJson: buildChannelSettings(payload),
      config: serializeChannelConfig(payload.config || {}),
    });
    await logAuditSafe({
      userId,
      workspaceId: campaign.workspace_id,
      projectId: campaign.project_id,
      action: "update",
      entity: "campaign_channel",
      entityId: existingChannel.id,
      oldData: existingChannel,
      newData: updated || {},
    });
    return updated;
  }

  const created = await createCampaignChannel({
    campaignId: campaign.id,
    userId,
    botId: bot.id,
    projectId: campaign.project_id,
    platform,
    platformType: platform,
    platformAccountId: accountBinding.platformAccountId,
    platformAccountRefId: accountBinding.platformAccountRefId,
    name: payload.name,
    status: payload.status || "active",
    defaultFlowId: payload.defaultFlowId || null,
    flowId: payload.flowId || payload.defaultFlowId || null,
    listId: payload.listId || null,
    settingsJson: buildChannelSettings(payload),
    config: serializeChannelConfig(payload.config || {}),
  });
  await logAuditSafe({
    userId,
    workspaceId: campaign.workspace_id,
    projectId: campaign.project_id,
    action: "create",
    entity: "campaign_channel",
    entityId: created.id,
    newData: created,
  });
  return created;
}

export async function updateCampaignChannelService(id: string, userId: string, payload: any) {
  const channel = await ensureRecord(
    await findCampaignChannelById(id, userId),
    "Campaign channel not found"
  );
  const campaign = await ensureCampaignOwnership(channel.campaign_id, userId);
  await assertProjectScopedWriteAccess({
    userId,
    projectId: campaign.project_id,
    workspaceId: campaign.workspace_id,
    workspacePermission: WORKSPACE_PERMISSIONS.editCampaign,
    allowedProjectRoles: ["project_admin", "editor"],
  });

  if (payload.botId) {
    await assertBotWorkspacePermission(
      userId,
      payload.botId,
      WORKSPACE_PERMISSIONS.createFlow
    );
  }

  if (payload.defaultFlowId) {
    await ensureFlowOwnership(
      payload.defaultFlowId,
      payload.botId || channel.bot_id,
      userId
    );
  }

  if (payload.flowId) {
    await ensureFlowOwnership(
      payload.flowId,
      payload.botId || channel.bot_id,
      userId
    );
  }

  if (payload.listId) {
    const list = await ensureRecord(
      await findListById(payload.listId, userId),
      "List not found"
    );
    if (list.campaign_id !== channel.campaign_id) {
      throw { status: 400, message: "List must belong to the selected campaign" };
    }
  }

  const channelUpdatePayload: Record<string, unknown> = {
    botId: payload.botId,
    name: payload.name,
    status: payload.status,
    defaultFlowId: payload.defaultFlowId,
    flowId: payload.flowId,
    listId: payload.listId,
  };

  if (payload.platform) {
    const platform = requirePlatform(payload.platform);
    await assertPlatformAllowedByPlan(platform, campaign.workspace_id, userId);
    if (
      campaign.settings_json?.allow_multiple_platforms === false &&
      platform !== channel.platform &&
      (await findCampaignChannelsByCampaign(campaign.id, userId)).some(
        (item: any) => item.id !== channel.id && item.platform !== platform
      )
    ) {
      throw {
        status: 400,
        message:
          "This campaign does not allow multiple platforms. Remove the existing platform first or enable multi-platform support.",
      };
    }
    channelUpdatePayload.platform = platform;
    channelUpdatePayload.platformType = platform;
  } else {
    await assertPlatformAllowedByPlan(channel.platform, campaign.workspace_id, userId);
  }

  if (payload.platformAccountId !== undefined) {
    const accountBinding = await resolvePlatformAccountBinding({
      userId,
      workspaceId: campaign.workspace_id,
      projectId: campaign.project_id,
      platform:
        (channelUpdatePayload.platform as string | undefined) || channel.platform,
      platformAccountId: payload.platformAccountId || null,
    });
    channelUpdatePayload.platformAccountId = accountBinding.platformAccountId;
    channelUpdatePayload.platformAccountRefId = accountBinding.platformAccountRefId;
  }

  if (payload.config) {
    channelUpdatePayload.config = mergeChannelConfig(channel.config, payload.config);
  }

  if (
    payload.allowRestart !== undefined ||
    payload.allowMultipleLeads !== undefined ||
    payload.requirePhone !== undefined ||
    payload.settingsJson !== undefined
  ) {
    channelUpdatePayload.settingsJson = buildChannelSettings(
      payload,
      channel.settings_json || {}
    );
  }

  const updated = await updateCampaignChannel(id, userId, channelUpdatePayload);
  await logAuditSafe({
    userId,
    workspaceId: campaign.workspace_id,
    projectId: campaign.project_id,
    action: "update",
    entity: "campaign_channel",
    entityId: id,
    oldData: channel,
    newData: updated || {},
  });
  return updated;
}

export async function deleteCampaignChannelService(id: string, userId: string) {
  const channel = await ensureRecord(
    await findCampaignChannelById(id, userId),
    "Campaign channel not found"
  );
  const campaign = await ensureCampaignOwnership(channel.campaign_id, userId);
  await assertProjectScopedWriteAccess({
    userId,
    projectId: campaign.project_id,
    workspaceId: campaign.workspace_id,
    workspacePermission: WORKSPACE_PERMISSIONS.deleteCampaign,
    allowedProjectRoles: ["project_admin"],
  });
  await logAuditSafe({
    userId,
    workspaceId: campaign.workspace_id,
    projectId: campaign.project_id,
    action: "delete",
    entity: "campaign_channel",
    entityId: channel.id,
    oldData: channel,
  });
  await deleteCampaignChannel(channel.id, userId);
}

export async function createEntryPointService(userId: string, payload: any) {
  const campaign = await ensureCampaignOwnership(payload.campaignId, userId);
  await assertProjectScopedWriteAccess({
    userId,
    projectId: campaign.project_id,
    workspaceId: campaign.workspace_id,
    workspacePermission: WORKSPACE_PERMISSIONS.editCampaign,
    allowedProjectRoles: ["project_admin", "editor"],
  });
  const channel = await ensureRecord(
    await findCampaignChannelById(payload.channelId, userId),
    "Campaign channel not found"
  );
  ensureChannelBelongsToCampaign(channel, campaign);

  const botId = payload.botId || channel.bot_id;
  const bot = await ensureBotOwnership(botId, userId);
  if (bot.workspace_id !== campaign.workspace_id || bot.project_id !== campaign.project_id) {
    throw { status: 400, message: "Bot must belong to the same workspace project as the campaign" };
  }

  if (!payload.flowId) {
    const availableFlows = await findFlowSummariesByBot(botId);
    const fallbackFlow = availableFlows.find((flow: any) => flow.is_default) || availableFlows[0];
    if (!fallbackFlow) {
      throw { status: 400, message: "No flow is available for this bot" };
    }
    payload.flowId = fallbackFlow.id;
  }

  await ensureFlowOwnership(payload.flowId, botId, userId);

  if (!payload.name || !payload.entryKey) {
    throw { status: 400, message: "name and entryKey are required" };
  }
  const entryKey = normalizeEntryKey(payload.entryKey);
  const sourceRef = normalizeOptionalText(payload.sourceRef);
  const landingUrl = normalizeLandingUrl(payload.landingUrl);
  const entryType = normalizeEntryType(payload.entryType);

  const entryPlatform = payload.platform
    ? requirePlatform(payload.platform)
    : requirePlatform(channel.platform);
  if (entryPlatform !== requirePlatform(channel.platform)) {
    throw {
      status: 400,
      message: "Entry point platform must match the selected campaign channel",
    };
  }

  if (payload.listId) {
    const list = await ensureRecord(
      await findListById(payload.listId, userId),
      "List not found"
    );
    ensureListBelongsToCampaign(list, campaign.id);
  }

  const existingByKey = await findEntryPointByChannelAndKey(channel.id, entryKey, userId);
  if (existingByKey) {
    throw { status: 409, message: "An entry point with this key already exists on the selected channel" };
  }

  if (sourceRef) {
    const existingBySource = await findEntryPointByChannelAndSourceRef(
      channel.id,
      sourceRef,
      userId
    );
    if (existingBySource) {
      throw { status: 409, message: "An entry point with this source ref already exists on the selected channel" };
    }
  }

  if (payload.isDefault) {
    await clearDefaultEntryPointsForChannel(channel.id, userId);
  }

  const entryPoint = await createEntryPoint({
    campaignId: campaign.id,
    channelId: channel.id,
    userId,
    botId,
    flowId: payload.flowId,
    projectId: campaign.project_id || null,
    platform: entryPlatform,
    name: payload.name,
    entryKey,
    entryType,
    sourceRef,
    landingUrl,
    isDefault: Boolean(payload.isDefault),
    isActive: payload.isActive !== false,
    metadata: payload.metadata || {},
    listId: payload.listId || null,
  });

  const list = await ensureSystemListForEntry({
    campaign,
    channel,
    entryPoint,
    userId,
  });

  await recordAnalyticsEvent({
    botId,
    workspaceId: campaign.workspace_id,
    campaignId: campaign.id,
    channelId: channel.id,
    entryPointId: entryPoint.id,
    flowId: payload.flowId,
    listId: list.id,
    actorUserId: userId,
    platform: entryPlatform,
    eventType: "entry_point",
    eventName: "entry_point_created",
    payload: {
      entryKey,
      sourceRef,
      isDefault: Boolean(payload.isDefault),
      isActive: payload.isActive !== false,
    },
  });

  const updated = await updateEntryPoint(entryPoint.id, userId, { listId: list.id });
  await logAuditSafe({
    userId,
    workspaceId: campaign.workspace_id,
    projectId: campaign.project_id,
    action: "create",
    entity: "entry_point",
    entityId: entryPoint.id,
    newData: updated || entryPoint,
  });
  return updated;
}

export async function updateEntryPointService(id: string, userId: string, payload: any) {
  const entryPoint = await ensureRecord(
    await findEntryPointById(id, userId),
    "Entry point not found"
  );
  const campaign = await ensureCampaignOwnership(entryPoint.campaign_id, userId);
  await assertProjectScopedWriteAccess({
    userId,
    projectId: campaign.project_id,
    workspaceId: campaign.workspace_id,
    workspacePermission: WORKSPACE_PERMISSIONS.editCampaign,
    allowedProjectRoles: ["project_admin", "editor"],
  });
  const channel = await ensureRecord(
    await findCampaignChannelById(entryPoint.channel_id, userId),
    "Campaign channel not found"
  );
  ensureChannelBelongsToCampaign(channel, campaign);
  ensureEntryPointBelongsToCampaign(entryPoint, campaign);

  if (payload.flowId) {
    await ensureFlowOwnership(payload.flowId, entryPoint.bot_id, userId);
  }
  const nextEntryKey =
    payload.entryKey !== undefined
      ? normalizeEntryKey(payload.entryKey)
      : entryPoint.entry_key;
  const nextSourceRef =
    payload.sourceRef !== undefined
      ? normalizeOptionalText(payload.sourceRef)
      : entryPoint.source_ref;
  const nextLandingUrl =
    payload.landingUrl !== undefined
      ? normalizeLandingUrl(payload.landingUrl)
      : entryPoint.landing_url;
  const nextEntryType =
    payload.entryType !== undefined
      ? normalizeEntryType(payload.entryType)
      : entryPoint.entry_type;

  if (payload.listId) {
    const list = await ensureRecord(
      await findListById(payload.listId, userId),
      "List not found"
    );
    ensureListBelongsToCampaign(list, campaign.id);
  }

  if (payload.platform) {
    const platform = requirePlatform(payload.platform);
    if (platform !== requirePlatform(channel.platform)) {
      throw {
        status: 400,
        message: "Entry point platform must match the selected campaign channel",
      };
    }
  }

  const duplicateKey = await findEntryPointByChannelAndKey(
    channel.id,
    nextEntryKey,
    userId
  );
  if (duplicateKey && duplicateKey.id !== entryPoint.id) {
    throw { status: 409, message: "An entry point with this key already exists on the selected channel" };
  }

  if (nextSourceRef) {
    const duplicateSource = await findEntryPointByChannelAndSourceRef(
      channel.id,
      nextSourceRef,
      userId
    );
    if (duplicateSource && duplicateSource.id !== entryPoint.id) {
      throw { status: 409, message: "An entry point with this source ref already exists on the selected channel" };
    }
  }

  const nextDefault =
    typeof payload.isDefault === "boolean" ? payload.isDefault : entryPoint.is_default;
  if (nextDefault) {
    await clearDefaultEntryPointsForChannel(channel.id, userId, entryPoint.id);
  }

  const entryPointUpdatePayload: Record<string, unknown> = {
    flowId: payload.flowId,
    name: payload.name,
    entryKey: nextEntryKey,
    entryType: nextEntryType,
    sourceRef: nextSourceRef,
    landingUrl: nextLandingUrl,
    isDefault:
      typeof payload.isDefault === "boolean" ? payload.isDefault : undefined,
    isActive: typeof payload.isActive === "boolean" ? payload.isActive : undefined,
    metadata: payload.metadata,
    listId: payload.listId,
  };

  if (payload.platform) {
    entryPointUpdatePayload.platform = requirePlatform(payload.platform);
  }

  const updated = await updateEntryPoint(id, userId, entryPointUpdatePayload);
  await logAuditSafe({
    userId,
    workspaceId: campaign.workspace_id,
    projectId: campaign.project_id,
    action: "update",
    entity: "entry_point",
    entityId: id,
    oldData: entryPoint,
    newData: updated || {},
  });
  return updated;
}

export async function deleteEntryPointService(id: string, userId: string) {
  const entryPoint = await ensureRecord(
    await findEntryPointById(id, userId),
    "Entry point not found"
  );
  const campaign = await ensureCampaignOwnership(entryPoint.campaign_id, userId);
  await assertProjectScopedWriteAccess({
    userId,
    projectId: campaign.project_id,
    workspaceId: campaign.workspace_id,
    workspacePermission: WORKSPACE_PERMISSIONS.deleteCampaign,
    allowedProjectRoles: ["project_admin"],
  });

  await logAuditSafe({
    userId,
    workspaceId: campaign.workspace_id,
    projectId: campaign.project_id,
    action: "delete",
    entity: "entry_point",
    entityId: entryPoint.id,
    oldData: entryPoint,
  });
  await deleteEntryPoint(entryPoint.id, userId);
}

export async function createListService(userId: string, payload: any) {
  const campaign = await ensureCampaignOwnership(payload.campaignId, userId);
  await assertProjectScopedWriteAccess({
    userId,
    projectId: campaign.project_id,
    workspaceId: campaign.workspace_id,
    workspacePermission: WORKSPACE_PERMISSIONS.editCampaign,
    allowedProjectRoles: ["project_admin", "editor"],
  });
  const botId = payload.botId;

  if (!botId || !payload.platform || !payload.name || !payload.listKey) {
    throw {
      status: 400,
      message: "botId, platform, name, and listKey are required",
    };
  }

  const platform = requirePlatform(payload.platform);
  const listKey = normalizeListKey(payload.listKey);
  const sourceType = normalizeListSourceType(payload.sourceType);
  const isSystem = payload.isSystem === true;

  const bot = await ensureBotOwnership(botId, userId);
  if (bot.workspace_id !== campaign.workspace_id || bot.project_id !== campaign.project_id) {
    throw { status: 400, message: "Bot must belong to the same workspace project as the campaign" };
  }

  if (payload.channelId) {
    const channel = await ensureRecord(
      await findCampaignChannelById(payload.channelId, userId),
      "Campaign channel not found"
    );
    ensureChannelBelongsToCampaign(channel, campaign);
  }

  if (payload.entryPointId) {
    const entryPoint = await ensureRecord(
      await findEntryPointById(payload.entryPointId, userId),
      "Entry point not found"
    );
    ensureEntryPointBelongsToCampaign(entryPoint, campaign);
    if (sourceType !== "entry_point") {
      throw {
        status: 400,
        message: "Lists linked to an entry point must use source type 'entry_point'",
      };
    }
  } else if (isSystem) {
    throw {
      status: 400,
      message: "System lists must be attached to an entry point",
    };
  }

  const duplicateList = await findListByCampaignAndKey(campaign.id, listKey, userId);
  if (duplicateList) {
    throw { status: 409, message: "A list with this key already exists in the selected campaign" };
  }

  const created = await createList({
    userId,
    botId: bot.id,
    campaignId: campaign.id,
    projectId: campaign.project_id || null,
    channelId: payload.channelId || null,
    entryPointId: payload.entryPointId || null,
    platform,
    name: payload.name,
    listKey,
    sourceType,
    isSystem,
    filters: payload.filters || {},
    metadata: payload.metadata || {},
  });
  await logAuditSafe({
    userId,
    workspaceId: campaign.workspace_id,
    projectId: campaign.project_id,
    action: "create",
    entity: "list",
    entityId: created.id,
    newData: created,
  });
  return created;
}

export async function updateListService(id: string, userId: string, payload: any) {
  const list = await ensureRecord(await findListById(id, userId), "List not found");
  const campaign = await ensureCampaignOwnership(list.campaign_id, userId);
  await assertProjectScopedWriteAccess({
    userId,
    projectId: campaign.project_id,
    workspaceId: campaign.workspace_id,
    workspacePermission: WORKSPACE_PERMISSIONS.editCampaign,
    allowedProjectRoles: ["project_admin", "editor"],
  });

  const listUpdatePayload: Record<string, unknown> = {
    name: payload.name,
    listKey:
      payload.listKey !== undefined ? normalizeListKey(payload.listKey) : undefined,
    sourceType:
      payload.sourceType !== undefined
        ? normalizeListSourceType(payload.sourceType)
        : undefined,
    isSystem:
      typeof payload.isSystem === "boolean" ? payload.isSystem : undefined,
    filters: payload.filters,
    metadata: payload.metadata,
  };

  const nextListKey =
    (listUpdatePayload.listKey as string | undefined) || list.list_key;
  const duplicateList = await findListByCampaignAndKey(campaign.id, nextListKey, userId);
  if (duplicateList && duplicateList.id !== list.id) {
    throw { status: 409, message: "A list with this key already exists in the selected campaign" };
  }

  const nextSourceType =
    (listUpdatePayload.sourceType as string | undefined) || list.source_type;
  const nextIsSystem =
    typeof listUpdatePayload.isSystem === "boolean"
      ? (listUpdatePayload.isSystem as boolean)
      : list.is_system;
  if (nextIsSystem && !list.entry_point_id) {
    throw { status: 400, message: "System lists must remain attached to an entry point" };
  }
  if (list.entry_point_id && nextSourceType !== "entry_point") {
    throw {
      status: 400,
      message: "Lists linked to an entry point must use source type 'entry_point'",
    };
  }

  if (payload.platform) {
    listUpdatePayload.platform = requirePlatform(payload.platform);
  }

  const updated = await updateList(id, userId, listUpdatePayload);
  await logAuditSafe({
    userId,
    workspaceId: campaign.workspace_id,
    projectId: campaign.project_id,
    action: "update",
    entity: "list",
    entityId: id,
    oldData: list,
    newData: updated || {},
  });
  return updated;
}

export async function deleteListService(id: string, userId: string) {
  const list = await ensureRecord(await findListById(id, userId), "List not found");
  const campaign = await ensureCampaignOwnership(list.campaign_id, userId);
  await assertProjectScopedWriteAccess({
    userId,
    projectId: campaign.project_id,
    workspaceId: campaign.workspace_id,
    workspacePermission: WORKSPACE_PERMISSIONS.deleteCampaign,
    allowedProjectRoles: ["project_admin"],
  });
  await logAuditSafe({
    userId,
    workspaceId: campaign.workspace_id,
    projectId: campaign.project_id,
    action: "delete",
    entity: "list",
    entityId: id,
    oldData: list,
  });
  await deleteList(id, userId);
}
