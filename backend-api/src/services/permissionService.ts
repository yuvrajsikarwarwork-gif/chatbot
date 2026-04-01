import {
  replaceRolePermissions,
  replaceWorkspaceUserPermissions,
} from "../models/permissionModel";
import { findWorkspaceMembership } from "../models/workspaceMembershipModel";
import { findUserById } from "../models/userModel";
import { findActiveSupportAccess } from "../models/supportAccessModel";
import { findWorkspaceById } from "../models/workspaceModel";
import { logAuditSafe } from "./auditLogService";
import {
  assertPlatformRoles,
  assertWorkspaceMembership,
  assertWorkspacePermission,
  getUserPlatformRole,
  listUserWorkspaceMembershipsService,
  normalizeWorkspaceRole,
  resolveRolePermissionMap,
  resolveWorkspacePermissionMap,
  resolveWorkspacePermissionOverrides,
  WORKSPACE_PERMISSIONS,
} from "./workspaceAccessService";
import { buildResolvedAccessSnapshot } from "./appAccessService";
import {
  assertProjectContextAccess,
  listUserProjectAccessService,
} from "./projectAccessService";

function getActiveWorkspaceFromMemberships(
  memberships: any[],
  workspaceId?: string | null
) {
  if (!Array.isArray(memberships) || memberships.length === 0) {
    return null;
  }

  if (workspaceId) {
    return memberships.find((membership) => membership.workspace_id === workspaceId) || null;
  }

  return memberships[0] || null;
}

const PERMISSION_STORAGE_ALIASES: Record<string, string> = {
  create_campaign: "can_create_campaign",
  manage_project: "edit_projects",
  view_analytics: "view_workspace",
  manage_plan: "manage_workspace",
  manage_integrations: "can_manage_platform_accounts",
  edit_bot: "edit_bots",
  view_conversations: "view_conversation",
  reply_conversation: "view_conversation",
};

const VALID_ROLE_PERMISSION_KEYS = new Set<string>(Object.values(WORKSPACE_PERMISSIONS));

function normalizePermissionPatch(input: Record<string, boolean>) {
  const normalized = new Map<string, boolean>();
  for (const [rawKey, rawValue] of Object.entries(input || {})) {
    if (typeof rawValue !== "boolean") {
      continue;
    }

    const key = PERMISSION_STORAGE_ALIASES[rawKey] || rawKey;
    if (VALID_ROLE_PERMISSION_KEYS.has(key)) {
      normalized.set(key, rawValue);
    }

    if (rawKey === "manage_project") {
      ["view_projects", "create_projects", "edit_projects", "delete_projects", "manage_workspace"].forEach((permissionKey) => {
        if (VALID_ROLE_PERMISSION_KEYS.has(permissionKey)) {
          normalized.set(permissionKey, rawValue);
        }
      });
    }
  }

  return Object.fromEntries(normalized);
}

async function buildResolvedWorkspaceAccess(
  userId: string,
  workspaceId: string,
  membership?: any
) {
  const resolvedMembership = membership || (await assertWorkspaceMembership(userId, workspaceId));
  if (!resolvedMembership) {
    return null;
  }

  return {
    ...resolvedMembership,
    effective_permissions: await resolveWorkspacePermissionMap(
      userId,
      workspaceId,
      resolvedMembership.role,
      resolvedMembership
    ),
    permission_overrides: await resolveWorkspacePermissionOverrides(userId, workspaceId),
  };
}

async function buildSyntheticPlatformWorkspaceAccess(input: {
  userId: string;
  workspaceId: string;
}) {
  const workspace = await findWorkspaceById(input.workspaceId, input.userId).catch(() => null);
  const supportAccess = await findActiveSupportAccess(input.workspaceId, input.userId).catch(
    () => null
  );
  if (!supportAccess) {
    return null;
  }

  const workspacePermissions = await resolveRolePermissionMap("workspace_admin");

  return {
    workspace_id: input.workspaceId,
    workspace_name: workspace?.name || workspace?.workspace_name || null,
    role: "workspace_admin",
    status: String(workspace?.status || "active"),
    permissions_json: {
      support_mode: true,
      support_access_id: supportAccess.id,
      support_expires_at: supportAccess.expires_at,
    },
    effective_permissions: {
      ...workspacePermissions,
      support_access: true,
      support_mode: true,
    },
    permission_overrides: {},
  };
}

export async function getMyPermissionsService(input: {
  userId: string;
  workspaceId?: string | null;
  projectId?: string | null;
}) {
  const user = await findUserById(input.userId);
  const platformRole = await getUserPlatformRole(input.userId);
  const isPlatformOperator =
    platformRole === "super_admin" || platformRole === "developer";
  const memberships = await listUserWorkspaceMembershipsService(input.userId);
  const workspaceId = String(input.workspaceId || "").trim() || null;
  let activeWorkspace = null;
  if (workspaceId) {
    if (isPlatformOperator) {
      activeWorkspace = await buildSyntheticPlatformWorkspaceAccess({
        userId: input.userId,
        workspaceId,
      });
    } else {
      activeWorkspace = await buildResolvedWorkspaceAccess(input.userId, workspaceId);
    }
  } else {
    activeWorkspace = getActiveWorkspaceFromMemberships(memberships, input.workspaceId);
  }

  const resolvedWorkspaceId = String(activeWorkspace?.workspace_id || workspaceId || "").trim() || null;
  const projectAccesses = await listUserProjectAccessService(input.userId, resolvedWorkspaceId).catch(() => []);
  const activeProject = input.projectId
    ? await assertProjectContextAccess(input.userId, input.projectId, resolvedWorkspaceId)
    : null;

  return {
    user: user
      ? {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          workspace_id: user.workspace_id || null,
        }
      : null,
    userId: input.userId,
    platformRole,
    memberships,
    projectAccesses,
    activeWorkspace: activeWorkspace || null,
    activeProject: activeProject || null,
    effectivePermissions: activeWorkspace?.effective_permissions || {},
    permissionOverrides: activeWorkspace?.permission_overrides || {},
    resolvedAccess: buildResolvedAccessSnapshot({
      platformRole,
      activeWorkspace: activeWorkspace || null,
      activeProject: activeProject || null,
      projectAccesses,
    }),
  };
}

export async function getRolePermissionsService(input: {
  actorUserId: string;
  role: string;
  workspaceId?: string | null;
}) {
  const normalizedRole = normalizeWorkspaceRole(input.role);
  const workspaceId = String(input.workspaceId || "").trim();
  const platformRole = await getUserPlatformRole(input.actorUserId);
  const isPlatformOperator =
    platformRole === "super_admin" || platformRole === "developer";

  if (workspaceId) {
    if (!isPlatformOperator) {
      await assertWorkspacePermission(
        input.actorUserId,
        workspaceId,
        WORKSPACE_PERMISSIONS.manageUsers
      );
    }
  } else {
    await assertPlatformRoles(input.actorUserId, ["developer", "super_admin"]);
  }

  return {
    role: normalizedRole,
    permissions: await resolveRolePermissionMap(normalizedRole),
  };
}

export async function updateRolePermissionsService(input: {
  actorUserId: string;
  role: string;
  permissions: Record<string, boolean>;
}) {
  await assertPlatformRoles(input.actorUserId, ["developer", "super_admin"]);

  const role = normalizeWorkspaceRole(input.role);
  const normalizedPermissions = Object.fromEntries(
    Object.entries(input.permissions || {}).filter(([, value]) => typeof value === "boolean")
  ) as Record<string, boolean>;
  const permissionPatch = normalizePermissionPatch(normalizedPermissions);

  await replaceRolePermissions(role, permissionPatch);
  const resolved = await resolveRolePermissionMap(role);

  await logAuditSafe({
    userId: input.actorUserId,
    action: "update",
    entity: "role_permission",
    entityId: role,
    newData: {
      role,
      permissions: resolved,
    },
  });

  return {
    role,
    permissions: resolved,
  };
}

export async function updateUserPermissionsService(input: {
  actorUserId: string;
  workspaceId: string;
  userId: string;
  permissions: Record<string, boolean>;
}) {
  await assertWorkspacePermission(
    input.actorUserId,
    input.workspaceId,
    WORKSPACE_PERMISSIONS.managePermissions
  );

  const membership = await findWorkspaceMembership(input.workspaceId, input.userId);
  if (!membership) {
    throw { status: 404, message: "Workspace member not found" };
  }

  const normalizedPermissions = Object.fromEntries(
    Object.entries(input.permissions || {}).filter(([, value]) => typeof value === "boolean")
  ) as Record<string, boolean>;
  const permissionPatch = normalizePermissionPatch(normalizedPermissions);

  await replaceWorkspaceUserPermissions(input.userId, input.workspaceId, permissionPatch);

  const resolvedMembership = await buildResolvedWorkspaceAccess(
    input.userId,
    input.workspaceId,
    membership
  );

  await logAuditSafe({
    userId: input.actorUserId,
    workspaceId: input.workspaceId,
    action: "update",
    entity: "user_permission",
    entityId: `${input.workspaceId}:${input.userId}`,
    newData: {
      userId: input.userId,
      permissions: resolvedMembership?.permission_overrides || {},
    },
  });

  return {
    workspaceId: input.workspaceId,
    userId: input.userId,
    role: membership.role,
    permissions: resolvedMembership?.effective_permissions || {},
    permission_overrides: resolvedMembership?.permission_overrides || {},
  };
}
