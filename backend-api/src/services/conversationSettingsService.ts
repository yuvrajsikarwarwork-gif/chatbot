import { query } from "../config/db";
import {
  findConversationSettingsByWorkspace,
  upsertConversationSettings,
  type ConversationSettingsRecord,
} from "../models/conversationSettingsModel";
import { findLatestSubscriptionByWorkspace } from "../models/planModel";
import { findWorkspaceById } from "../models/workspaceModel";
import {
  assertWorkspaceMembership,
  assertWorkspacePermission,
  WORKSPACE_PERMISSIONS,
} from "./workspaceAccessService";
import { logAuditSafe } from "./auditLogService";

const FALLBACK_ALLOWED_PLATFORMS = ["whatsapp", "website", "facebook", "instagram", "api", "telegram"];
const AGENT_ROLES = new Set(["workspace_admin", "agent"]);

function normalizePlatformList(value: unknown, fallback: string[]) {
  const source = Array.isArray(value) ? value : fallback;
  const normalized = source
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);

  return Array.from(new Set(normalized));
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") {
    return value;
  }

  return fallback;
}

function normalizeId(value: unknown) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function buildDefaultSettings(
  workspaceId: string,
  allowedPlatforms: string[]
): ConversationSettingsRecord {
  return {
    workspace_id: workspaceId,
    auto_assign: false,
    default_agent: null,
    allow_manual_reply: true,
    allow_agent_takeover: true,
    allow_bot_resume: false,
    show_campaign: true,
    show_flow: true,
    show_list: true,
    max_open_chats: 25,
    allowed_platforms: allowedPlatforms,
    default_campaign_id: null,
    default_list_id: null,
  };
}

async function getPlanAllowedPlatforms(workspaceId: string) {
  const subscription = await findLatestSubscriptionByWorkspace(workspaceId);
  const planPlatforms = Array.isArray(subscription?.allowed_platforms)
    ? subscription.allowed_platforms
    : FALLBACK_ALLOWED_PLATFORMS;

  return normalizePlatformList(planPlatforms, FALLBACK_ALLOWED_PLATFORMS);
}

async function assertAgentBelongsToWorkspace(workspaceId: string, agentId: string) {
  const res = await query(
    `SELECT role, status
     FROM workspace_memberships
     WHERE workspace_id = $1
       AND user_id = $2
     LIMIT 1`,
    [workspaceId, agentId]
  );

  const membership = res.rows[0];
  if (!membership || membership.status !== "active" || !AGENT_ROLES.has(String(membership.role))) {
    throw { status: 400, message: "Default agent must be an active workspace agent or workspace admin" };
  }
}

async function assertConversationSettingsEditor(userId: string, workspaceId: string) {
  await assertWorkspacePermission(userId, workspaceId, WORKSPACE_PERMISSIONS.manageWorkspace);
}

async function assertCampaignBelongsToWorkspace(workspaceId: string, campaignId: string) {
  const res = await query(
    `SELECT id
     FROM campaigns
     WHERE id = $1
       AND workspace_id = $2
     LIMIT 1`,
    [campaignId, workspaceId]
  );

  if (!res.rows[0]) {
    throw { status: 400, message: "Default campaign must belong to the active workspace" };
  }
}

async function assertListBelongsToWorkspace(workspaceId: string, listId: string) {
  const res = await query(
    `SELECT l.id
     FROM lists l
     JOIN campaigns c ON c.id = l.campaign_id
     WHERE l.id = $1
       AND c.workspace_id = $2
     LIMIT 1`,
    [listId, workspaceId]
  );

  if (!res.rows[0]) {
    throw { status: 400, message: "Default list must belong to the active workspace" };
  }
}

export async function getConversationSettingsService(workspaceId: string, userId: string) {
  const workspace = await findWorkspaceById(workspaceId, userId);
  if (!workspace) {
    throw { status: 404, message: "Workspace not found" };
  }

  await assertWorkspaceMembership(userId, workspaceId);

  const allowedPlatforms = await getPlanAllowedPlatforms(workspaceId);
  const existing = await findConversationSettingsByWorkspace(workspaceId);

  return {
    ...buildDefaultSettings(workspaceId, allowedPlatforms),
    ...existing,
    allowed_platforms: normalizePlatformList(existing?.allowed_platforms, allowedPlatforms),
  };
}

export async function updateConversationSettingsService(
  workspaceId: string,
  userId: string,
  payload: Record<string, unknown>
) {
  const workspace = await findWorkspaceById(workspaceId, userId);
  if (!workspace) {
    throw { status: 404, message: "Workspace not found" };
  }

  await assertConversationSettingsEditor(userId, workspaceId);

  const planAllowedPlatforms = await getPlanAllowedPlatforms(workspaceId);
  const current = await getConversationSettingsService(workspaceId, userId);

  const nextAllowedPlatforms = normalizePlatformList(
    payload.allowedPlatforms ?? payload.allowed_platforms,
    planAllowedPlatforms
  );

  const disallowedPlatforms = nextAllowedPlatforms.filter(
    (platform) => !planAllowedPlatforms.includes(platform)
  );
  if (disallowedPlatforms.length > 0) {
    throw {
      status: 400,
      message: `Platforms not allowed by current plan: ${disallowedPlatforms.join(", ")}`,
    };
  }

  const defaultAgentId = normalizeId(payload.defaultAgent ?? payload.default_agent);
  const defaultCampaignId = normalizeId(payload.defaultCampaignId ?? payload.default_campaign_id);
  const defaultListId = normalizeId(payload.defaultListId ?? payload.default_list_id);

  if (defaultAgentId) {
    await assertAgentBelongsToWorkspace(workspaceId, defaultAgentId);
  }

  if (defaultCampaignId) {
    await assertCampaignBelongsToWorkspace(workspaceId, defaultCampaignId);
  }

  if (defaultListId) {
    await assertListBelongsToWorkspace(workspaceId, defaultListId);
  }

  const maxOpenChats = Number(payload.maxOpenChats ?? payload.max_open_chats ?? current.max_open_chats);
  if (!Number.isFinite(maxOpenChats) || maxOpenChats < 1 || maxOpenChats > 500) {
    throw { status: 400, message: "maxOpenChats must be between 1 and 500" };
  }

  const saved = await upsertConversationSettings(workspaceId, {
    auto_assign: normalizeBoolean(payload.autoAssign ?? payload.auto_assign, current.auto_assign),
    default_agent: defaultAgentId,
    allow_manual_reply: normalizeBoolean(
      payload.allowManualReply ?? payload.allow_manual_reply,
      current.allow_manual_reply
    ),
    allow_agent_takeover: normalizeBoolean(
      payload.allowAgentTakeover ?? payload.allow_agent_takeover,
      current.allow_agent_takeover
    ),
    allow_bot_resume: normalizeBoolean(
      payload.allowBotResume ?? payload.allow_bot_resume,
      current.allow_bot_resume
    ),
    show_campaign: normalizeBoolean(
      payload.showCampaign ?? payload.show_campaign,
      current.show_campaign
    ),
    show_flow: normalizeBoolean(payload.showFlow ?? payload.show_flow, current.show_flow),
    show_list: normalizeBoolean(payload.showList ?? payload.show_list, current.show_list),
    max_open_chats: maxOpenChats,
    allowed_platforms: nextAllowedPlatforms,
    default_campaign_id: defaultCampaignId,
    default_list_id: defaultListId,
  });
  await logAuditSafe({
    userId,
    workspaceId,
    action: "update",
    entity: "conversation_settings",
    entityId: workspaceId,
    oldData: current as unknown as Record<string, unknown>,
    newData: saved as unknown as Record<string, unknown>,
  });
  return saved;
}
