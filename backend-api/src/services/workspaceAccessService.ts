import { query } from "../config/db";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import {
  findWorkspaceMembership,
  findWorkspaceMembers,
  findWorkspaceMembershipsByUser,
  upsertWorkspaceMembership,
} from "../models/workspaceMembershipModel";
import { replaceAgentScope } from "../models/agentScopeModel";
import {
  listRolePermissions,
  listUserPermissions,
  replaceWorkspaceUserPermissions,
} from "../models/permissionModel";
import { findActiveSupportAccess } from "../models/supportAccessModel";
import { findWorkspaceById } from "../models/workspaceModel";
import { findBotById } from "../models/botModel";
import { createWorkspaceInviteService } from "./inviteService";
import { recordAnalyticsEvent } from "./runtimeAnalyticsService";
import { logAuditSafe } from "./auditLogService";
import { assertUserQuota } from "./businessValidationService";

export const WORKSPACE_ROLES = [
  "workspace_admin",
  "editor",
  "workspace_owner",
  "admin",
  "user",
  "agent",
  "viewer",
] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const WORKSPACE_PERMISSIONS = {
  viewWorkspace: "view_workspace",
  manageWorkspace: "manage_workspace",
  manageUsers: "manage_users",
  managePermissions: "manage_permissions",
  viewProjects: "view_projects",
  createProjects: "create_projects",
  editProjects: "edit_projects",
  deleteProjects: "delete_projects",
  viewCampaigns: "view_campaigns",
  createCampaign: "can_create_campaign",
  editCampaign: "edit_campaign",
  deleteCampaign: "delete_campaign",
  viewFlows: "view_flows",
  createFlow: "can_create_flow",
  editWorkflow: "edit_workflow",
  deleteFlow: "delete_flow",
  viewBots: "view_bots",
  createBots: "create_bots",
  editBots: "edit_bots",
  deleteBots: "delete_bots",
  viewPlatformAccounts: "view_platform_accounts",
  managePlatformAccounts: "can_manage_platform_accounts",
  viewLeads: "view_leads",
  deleteLeads: "delete_leads",
  exportData: "export_data",
  assignConversation: "assign_conversation",
  viewConversation: "view_conversation",
} as const;

export type WorkspacePermission =
  (typeof WORKSPACE_PERMISSIONS)[keyof typeof WORKSPACE_PERMISSIONS];

type PermissionAwareMembership = {
  workspace_id: string;
  user_id?: string | null;
  role: string;
  permissions_json?: Record<string, unknown> | null;
  agent_scope?: {
    projectIds?: string[];
    campaignIds?: string[];
    platforms?: string[];
    channelIds?: string[];
  };
  agent_skills?: string[];
};

const ROLE_PERMISSIONS: Record<string, WorkspacePermission[]> = {
  workspace_admin: [
    WORKSPACE_PERMISSIONS.viewWorkspace,
    WORKSPACE_PERMISSIONS.manageWorkspace,
    WORKSPACE_PERMISSIONS.manageUsers,
    WORKSPACE_PERMISSIONS.managePermissions,
    WORKSPACE_PERMISSIONS.viewProjects,
    WORKSPACE_PERMISSIONS.createProjects,
    WORKSPACE_PERMISSIONS.editProjects,
    WORKSPACE_PERMISSIONS.deleteProjects,
    WORKSPACE_PERMISSIONS.viewCampaigns,
    WORKSPACE_PERMISSIONS.createCampaign,
    WORKSPACE_PERMISSIONS.editCampaign,
    WORKSPACE_PERMISSIONS.deleteCampaign,
    WORKSPACE_PERMISSIONS.viewFlows,
    WORKSPACE_PERMISSIONS.createFlow,
    WORKSPACE_PERMISSIONS.editWorkflow,
    WORKSPACE_PERMISSIONS.deleteFlow,
    WORKSPACE_PERMISSIONS.viewBots,
    WORKSPACE_PERMISSIONS.createBots,
    WORKSPACE_PERMISSIONS.editBots,
    WORKSPACE_PERMISSIONS.deleteBots,
    WORKSPACE_PERMISSIONS.viewPlatformAccounts,
    WORKSPACE_PERMISSIONS.managePlatformAccounts,
    WORKSPACE_PERMISSIONS.viewLeads,
    WORKSPACE_PERMISSIONS.deleteLeads,
    WORKSPACE_PERMISSIONS.exportData,
    WORKSPACE_PERMISSIONS.assignConversation,
    WORKSPACE_PERMISSIONS.viewConversation,
  ],
  editor: [
    WORKSPACE_PERMISSIONS.viewWorkspace,
    WORKSPACE_PERMISSIONS.viewProjects,
    WORKSPACE_PERMISSIONS.viewCampaigns,
    WORKSPACE_PERMISSIONS.createCampaign,
    WORKSPACE_PERMISSIONS.editCampaign,
    WORKSPACE_PERMISSIONS.viewFlows,
    WORKSPACE_PERMISSIONS.createFlow,
    WORKSPACE_PERMISSIONS.editWorkflow,
    WORKSPACE_PERMISSIONS.viewBots,
    WORKSPACE_PERMISSIONS.createBots,
    WORKSPACE_PERMISSIONS.editBots,
    WORKSPACE_PERMISSIONS.viewLeads,
    WORKSPACE_PERMISSIONS.viewConversation,
  ],
  agent: [
    WORKSPACE_PERMISSIONS.viewWorkspace,
    WORKSPACE_PERMISSIONS.viewLeads,
    WORKSPACE_PERMISSIONS.assignConversation,
    WORKSPACE_PERMISSIONS.viewConversation,
  ],
  viewer: [
    WORKSPACE_PERMISSIONS.viewWorkspace,
    WORKSPACE_PERMISSIONS.viewProjects,
    WORKSPACE_PERMISSIONS.viewCampaigns,
    WORKSPACE_PERMISSIONS.viewFlows,
    WORKSPACE_PERMISSIONS.viewBots,
    WORKSPACE_PERMISSIONS.viewPlatformAccounts,
    WORKSPACE_PERMISSIONS.viewLeads,
    WORKSPACE_PERMISSIONS.viewConversation,
  ],
};

function applyPermissionAliases(permissionMap: Record<string, boolean>): Record<string, boolean> {
  const read = (key: string) => Boolean(permissionMap[key]);
  return {
    ...permissionMap,
    create_campaign: read(WORKSPACE_PERMISSIONS.createCampaign),
    manage_project:
      read(WORKSPACE_PERMISSIONS.manageWorkspace) ||
      read(WORKSPACE_PERMISSIONS.createProjects) ||
      read(WORKSPACE_PERMISSIONS.editProjects) ||
      read(WORKSPACE_PERMISSIONS.deleteProjects),
    manage_integrations: read(WORKSPACE_PERMISSIONS.managePlatformAccounts),
    edit_bot: read(WORKSPACE_PERMISSIONS.editBots),
    view_conversations: read(WORKSPACE_PERMISSIONS.viewConversation),
    reply_conversation: read(WORKSPACE_PERMISSIONS.viewConversation),
    view_analytics:
      read(WORKSPACE_PERMISSIONS.viewWorkspace) ||
      read(WORKSPACE_PERMISSIONS.manageWorkspace),
    manage_plan: read(WORKSPACE_PERMISSIONS.manageWorkspace),
    support_access: Boolean(permissionMap.support_mode),
  };
}

export function getDefaultWorkspacePermissions(role: WorkspaceRole) {
  const normalized = normalizeWorkspaceRole(role);
  return [...(ROLE_PERMISSIONS[normalized] || [])];
}

export async function resolveWorkspacePermissionMap(
  userId: string,
  workspaceId: string,
  roleInput: string,
  membership?: { permissions_json?: Record<string, unknown> | null } | null
) {
  const role = normalizeWorkspaceRole(roleInput);
  const permissionMap = new Map<string, boolean>();

  const rolePermissions = await listRolePermissions(role);
  for (const row of rolePermissions) {
    permissionMap.set(String(row.permission_key), Boolean(row.allowed));
  }

  if (permissionMap.size === 0) {
    for (const item of ROLE_PERMISSIONS[role] || []) {
      permissionMap.set(item, true);
    }
  }

  const userPermissionRows = await listUserPermissions(userId, workspaceId);
  for (const row of userPermissionRows) {
    permissionMap.set(String(row.permission_key), Boolean(row.allowed));
  }

  const hasWorkspaceScopedUserPermissions = userPermissionRows.some(
    (row) => String(row.workspace_id || "") === workspaceId
  );

  if (!hasWorkspaceScopedUserPermissions) {
    for (const [key, value] of Object.entries(membership?.permissions_json || {})) {
      if (typeof value === "boolean") {
        permissionMap.set(key, value);
      }
    }
  }

  return applyPermissionAliases(Object.fromEntries(permissionMap));
}

export async function resolveWorkspacePermissionOverrides(userId: string, workspaceId: string) {
  const overrides = new Map<string, boolean>();
  const userPermissionRows = await listUserPermissions(userId, workspaceId);

  for (const row of userPermissionRows) {
    if (String(row.workspace_id || "") !== workspaceId) {
      continue;
    }

    overrides.set(String(row.permission_key), Boolean(row.allowed));
  }

  return Object.fromEntries(overrides);
}

export async function resolveRolePermissionMap(roleInput: string) {
  const role = normalizeWorkspaceRole(roleInput);
  const permissionMap = new Map<string, boolean>();
  const rolePermissions = await listRolePermissions(role);

  for (const row of rolePermissions) {
    permissionMap.set(String(row.permission_key), Boolean(row.allowed));
  }

  if (permissionMap.size === 0) {
    for (const item of ROLE_PERMISSIONS[role] || []) {
      permissionMap.set(item, true);
    }
  }

  return applyPermissionAliases(Object.fromEntries(permissionMap));
}

async function attachEffectivePermissions<T extends PermissionAwareMembership>(membership: T) {
  const targetUserId = String(membership.user_id || "").trim();
  if (!targetUserId) {
    return membership;
  }

  const agentScope = getMembershipAgentScope(membership);
  const agentSkills = getMembershipAgentSkills(membership);

  return {
    ...membership,
    agent_scope: agentScope,
    agent_skills: agentSkills,
    effective_permissions: await resolveWorkspacePermissionMap(
      targetUserId,
      membership.workspace_id,
      membership.role,
      membership
    ),
    permission_overrides: await resolveWorkspacePermissionOverrides(
      targetUserId,
      membership.workspace_id
    ),
  };
}

function canonicalWorkspaceRole(role?: string) {
  const normalized = String(role || "editor").trim().toLowerCase();
  if (normalized === "workspace_owner" || normalized === "admin") {
    return "workspace_admin";
  }
  if (normalized === "user") {
    return "editor";
  }
  return normalized;
}

function normalizeScopeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
}

function normalizeSkillString(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

export function normalizeAgentScope(input: unknown) {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    projectIds: normalizeScopeStringArray(source.projectIds || source.project_ids),
    campaignIds: normalizeScopeStringArray(source.campaignIds || source.campaign_ids),
    platforms: normalizeScopeStringArray(source.platforms).map((item) => item.toLowerCase()),
    channelIds: normalizeScopeStringArray(source.channelIds || source.channel_ids),
  };
}

export function normalizeAgentSkills(input: unknown) {
  if (!Array.isArray(input)) {
    return [] as string[];
  }

  return Array.from(
    new Set(
      input
        .map(normalizeSkillString)
        .filter(Boolean)
    )
  );
}

export function getMembershipAgentScope(
  membership: { permissions_json?: Record<string, unknown> | null } | null | undefined
) {
  return normalizeAgentScope(membership?.permissions_json?.agent_scope);
}

export function getMembershipAgentSkills(
  membership: { permissions_json?: Record<string, unknown> | null } | null | undefined
) {
  return normalizeAgentSkills(
    membership?.permissions_json?.agent_skills ||
      membership?.permissions_json?.skills ||
      []
  );
}

export async function getUserPlatformRole(userId: string) {
  const res = await query(`SELECT role FROM users WHERE id = $1 LIMIT 1`, [userId]);
  return String(res.rows[0]?.role || "user").trim().toLowerCase();
}

export async function isPlatformInternalOperator(userId: string) {
  const role = await getUserPlatformRole(userId);
  return role === "super_admin" || role === "developer";
}

export async function isPlatformSuperAdmin(userId: string) {
  return (await getUserPlatformRole(userId)) === "super_admin";
}

export async function assertPlatformRoles(userId: string, allowedRoles: string[]) {
  const role = await getUserPlatformRole(userId);
  if (!allowedRoles.includes(role)) {
    throw { status: 403, message: "Forbidden: Insufficient platform permissions" };
  }

  return role;
}

export function normalizeWorkspaceRole(role?: string): WorkspaceRole {
  const normalized = canonicalWorkspaceRole(role) as WorkspaceRole;
  if (!WORKSPACE_ROLES.includes(normalized)) {
    throw { status: 400, message: `Unsupported workspace role '${role}'` };
  }

  return normalized;
}

function normalizeMembershipStatus(status?: string) {
  const normalized = String(status || "active").trim().toLowerCase();
  const allowed = new Set(["active", "inactive", "invited"]);
  if (!allowed.has(normalized)) {
    throw { status: 400, message: `Unsupported membership status '${status}'` };
  }

  return normalized;
}

export async function resolveWorkspaceMembership(userId: string, workspaceId: string) {
  const membership = await findWorkspaceMembership(workspaceId, userId);
  if (membership && membership.status === "active") {
    return membership;
  }

  const fallback = await query(
    `SELECT id
     FROM users
     WHERE id = $1
       AND workspace_id = $2
     LIMIT 1`,
    [userId, workspaceId]
  );

  if (!fallback.rows[0]) {
    return null;
  }

  return upsertWorkspaceMembership({
    workspaceId,
    userId,
    role: "editor",
    status: "active",
    createdBy: userId,
  });
}

export async function assertWorkspaceMembership(userId: string, workspaceId?: string | null) {
  if (!workspaceId) {
    return null;
  }

  const directMembership = await resolveWorkspaceMembership(userId, workspaceId);
  if (directMembership) {
    return directMembership;
  }

  if (await isPlatformInternalOperator(userId)) {
    const supportAccess = await findActiveSupportAccess(workspaceId, userId);
    if (!supportAccess) {
      throw {
        status: 403,
        message: "Workspace access requires active support access for platform operators",
      };
    }

    return {
      workspace_id: workspaceId,
      user_id: userId,
      role: "workspace_admin",
      status: "active",
      permissions_json: {
        support_mode: true,
      },
    };
  }

  const workspace = await findWorkspaceById(workspaceId, userId);
  if (workspace) {
    return resolveWorkspaceMembership(userId, workspaceId);
  }

  if (!directMembership) {
    throw { status: 403, message: "You do not have access to this workspace" };
  }

  return directMembership;
}

export async function assertWorkspacePermission(
  userId: string,
  workspaceId: string | null | undefined,
  permission: WorkspacePermission
) {
  if (!workspaceId) {
    return null;
  }

  const directMembership = await resolveWorkspaceMembership(userId, workspaceId);
  if (directMembership) {
    const permissionMap = await resolveWorkspacePermissionMap(
      userId,
      workspaceId,
      directMembership.role,
      directMembership
    );

    if (!permissionMap[permission]) {
      throw { status: 403, message: "Forbidden: Insufficient workspace permissions" };
    }

    return directMembership;
  }

  if (await isPlatformInternalOperator(userId)) {
    const supportAccess = await findActiveSupportAccess(workspaceId, userId);
    if (!supportAccess) {
      throw {
        status: 403,
        message: "Workspace permission checks require active support access for platform operators",
      };
    }

    return {
      workspace_id: workspaceId,
      user_id: userId,
      role: "workspace_admin",
      status: "active",
      permissions_json: {
        [permission]: true,
        support_mode: true,
      },
    };
  }

  return null;
}

export async function assertWorkspacePermissionAny(
  userId: string,
  workspaceId: string | null | undefined,
  permissions: WorkspacePermission[]
) {
  let lastError: unknown = null;

  for (const permission of permissions) {
    try {
      return await assertWorkspacePermission(userId, workspaceId, permission);
    } catch (err: any) {
      if (err?.status && err.status !== 403) {
        throw err;
      }
      lastError = err;
    }
  }

  throw lastError || { status: 403, message: "Forbidden: Insufficient workspace permissions" };
}

export async function assertBotWorkspacePermission(
  userId: string,
  botId: string,
  permission: WorkspacePermission
) {
  const bot = await findBotById(botId);
  if (!bot) {
    throw { status: 404, message: "Bot not found" };
  }

  if (!bot.workspace_id) {
    if (bot.user_id !== userId) {
      throw { status: 403, message: "Forbidden" };
    }
    return bot;
  }

  await assertWorkspacePermission(userId, bot.workspace_id, permission);
  return bot;
}

export async function listWorkspaceMembersService(workspaceId: string, userId: string) {
  await assertWorkspacePermissionAny(userId, workspaceId, [
    WORKSPACE_PERMISSIONS.manageUsers,
    WORKSPACE_PERMISSIONS.managePermissions,
  ]);
  const members = await findWorkspaceMembers(workspaceId);
  return Promise.all(members.map((membership) => attachEffectivePermissions(membership)));
}

export async function assignWorkspaceMemberService(
  workspaceId: string,
  actorUserId: string,
  payload: {
    userId?: string;
    email?: string;
    role?: string;
    status?: string;
    permissionsJson?: Record<string, unknown>;
    agentScope?: {
      projectIds?: string[];
      campaignIds?: string[];
      platforms?: string[];
      channelIds?: string[];
    };
  }
) {
  const actorMembership = await assertWorkspacePermission(
    actorUserId,
    workspaceId,
    WORKSPACE_PERMISSIONS.manageUsers
  );
  const requestedPermissions =
    payload.permissionsJson && typeof payload.permissionsJson === "object"
      ? payload.permissionsJson
      : {};
  const requestedPermissionSelections = Object.fromEntries(
    Object.entries(requestedPermissions).filter(([, value]) => typeof value === "boolean")
  ) as Record<string, boolean>;
  if (Object.keys(requestedPermissionSelections).length > 0) {
    await assertWorkspacePermission(
      actorUserId,
      workspaceId,
      WORKSPACE_PERMISSIONS.managePermissions
    );
  }
  const nextRole = normalizeWorkspaceRole(payload.role);
  const rolePermissionMap = await resolveRolePermissionMap(nextRole);
  const requestedPermissionOverrides = Object.fromEntries(
    Object.entries(requestedPermissionSelections).filter(
      ([permissionKey, allowed]) => Boolean(rolePermissionMap[permissionKey]) !== Boolean(allowed)
    )
  ) as Record<string, boolean>;
  const membershipMetadata = Object.fromEntries(
    Object.entries(requestedPermissions).filter(([, value]) => typeof value !== "boolean")
  ) as Record<string, unknown>;

  let targetUserId = payload.userId || null;
  let provisionedCredentials:
    | {
        email: string;
        temporaryPassword: string;
      }
    | null = null;
  if (!targetUserId && payload.email) {
    const userRes = await query(`SELECT id FROM users WHERE email = $1 LIMIT 1`, [
      payload.email,
    ]);
    targetUserId = userRes.rows[0]?.id || null;
  }

  if (!targetUserId) {
    const email = String(payload.email || "").trim().toLowerCase();
    if (!email) {
      throw { status: 404, message: "Target user not found" };
    }

    const temporaryPassword = crypto.randomBytes(6).toString("base64url");
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const derivedName =
      email.split("@")[0]?.replace(/[._-]+/g, " ").trim() || "Workspace User";

    const createdUserRes = await query(
      `INSERT INTO users (id, email, password_hash, name, role)
       VALUES (gen_random_uuid(), $1, $2, $3, 'user')
       RETURNING id`,
      [email, passwordHash, derivedName]
    );

    targetUserId = createdUserRes.rows[0]?.id || null;
    provisionedCredentials = {
      email,
      temporaryPassword,
    };
  }

  if (
    !((await isPlatformInternalOperator(actorUserId))) &&
    normalizeWorkspaceRole(String(actorMembership?.role || "viewer")) !== "workspace_admin" &&
    nextRole === "workspace_admin"
  ) {
    throw {
      status: 403,
      message: "Only workspace admins can grant workspace admin access",
    };
  }

  if (!targetUserId) {
    throw { status: 500, message: "Failed to provision workspace user" };
  }

  const existingMembership = await findWorkspaceMembership(workspaceId, targetUserId);
  if (!existingMembership || String(existingMembership.status || "").toLowerCase() !== "active") {
    await assertUserQuota(workspaceId);
  }

  const requestedStatus = normalizeMembershipStatus(payload.status);
  const membershipStatus = provisionedCredentials
    ? "invited"
    : requestedStatus;

  const membership = await upsertWorkspaceMembership({
    workspaceId,
    userId: targetUserId,
    role: nextRole,
    status: membershipStatus,
    permissionsJson: {
      ...membershipMetadata,
      agent_scope: undefined,
    },
    createdBy: actorUserId,
  });
  await replaceWorkspaceUserPermissions(
    targetUserId,
    workspaceId,
    requestedPermissionOverrides
  );

  const nextAgentScope = payload.agentScope || normalizeAgentScope(requestedPermissions?.agent_scope);
  await replaceAgentScope({
    workspaceId,
    userId: targetUserId,
    projectIds: nextAgentScope.projectIds || [],
    campaignIds: nextAgentScope.campaignIds || [],
    platforms: nextAgentScope.platforms || [],
    channelIds: nextAgentScope.channelIds || [],
  });

  await recordAnalyticsEvent({
    workspaceId,
    actorUserId: actorUserId,
    eventType: "permission",
    eventName: "workspace_member_permissions_updated",
    payload: {
      targetUserId,
      role: nextRole,
      status: membershipStatus,
      permissionsJson: requestedPermissions,
    },
  });
  await logAuditSafe({
    userId: actorUserId,
    workspaceId,
    action: existingMembership ? "update" : "create",
    entity: "workspace_member",
    entityId: targetUserId,
    oldData: existingMembership || {},
    newData: {
      role: nextRole,
      status: membershipStatus,
      permissionsJson: requestedPermissions,
      agentScope: nextAgentScope,
    },
  });

  await query(`UPDATE users SET workspace_id = COALESCE(workspace_id, $1) WHERE id = $2`, [
    workspaceId,
    targetUserId,
  ]);

  const shouldSendInvite =
    Boolean(provisionedCredentials) ||
    requestedStatus === "invited" ||
    (!existingMembership && membershipStatus === "invited");

  const inviteDetails = shouldSendInvite
    ? await (async () => {
        const workspace = await findWorkspaceById(workspaceId, actorUserId);
        return createWorkspaceInviteService({
          userId: targetUserId!,
          email: provisionedCredentials?.email || String(payload.email || "").trim().toLowerCase(),
          workspaceId,
          workspaceName: workspace?.name || "Workspace",
          role: nextRole,
          createdBy: actorUserId,
        });
      })()
    : null;

  return provisionedCredentials
    ? {
        ...membership,
        provisioned_user_email: provisionedCredentials.email,
        temporary_password: provisionedCredentials.temporaryPassword,
        invite_link: inviteDetails?.inviteLink,
        invite_expires_at: inviteDetails?.expiresAt,
      }
    : inviteDetails
      ? {
        ...membership,
        invite_link: inviteDetails.inviteLink,
        invite_expires_at: inviteDetails.expiresAt,
      }
      : membership;
}

export async function listUserWorkspaceMembershipsService(userId: string) {
  const memberships = await findWorkspaceMembershipsByUser(userId);
  return Promise.all(memberships.map((membership) => attachEffectivePermissions(membership)));
}
