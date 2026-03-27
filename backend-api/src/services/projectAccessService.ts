import { query } from "../config/db";
import {
  deleteProjectAccess,
  findProjectAccessByUserAndProject,
  findProjectAccessesByUser,
  findWorkspaceProjectAccesses,
  type ProjectAccessRecord,
  upsertProjectAccess,
} from "../models/projectAccessModel";
import {
  findDefaultProjectByWorkspace,
  findProjectById,
} from "../models/projectModel";
import {
  assertWorkspaceMembership,
  assertWorkspacePermission,
  resolveWorkspaceMembership,
  normalizeWorkspaceRole,
  isPlatformInternalOperator,
  WORKSPACE_PERMISSIONS,
} from "./workspaceAccessService";
import { findActiveSupportAccess } from "../models/supportAccessModel";
import { logAuditSafe } from "./auditLogService";

export const PROJECT_ROLES = [
  "project_admin",
  "editor",
  "workspace_owner",
  "admin",
  "user",
  "agent",
  "viewer",
] as const;

export type ProjectRole = (typeof PROJECT_ROLES)[number];

type ProjectAccessResult = {
  scope: "workspace" | "project";
  workspaceId: string;
  projectId: string;
  projectAccess: any;
};

export function normalizeProjectRole(role?: string): ProjectRole {
  const raw = String(role || "editor").trim().toLowerCase();
  const normalized =
    raw === "workspace_owner" || raw === "admin"
      ? "project_admin"
      : raw === "user"
        ? "editor"
        : raw;
  const cast = normalized as ProjectRole;
  if (!PROJECT_ROLES.includes(cast)) {
    throw { status: 400, message: `Unsupported project role '${role}'` };
  }

  return cast;
}

export async function listUserProjectAccessService(userId: string, workspaceId?: string | null) {
  return findProjectAccessesByUser(userId, workspaceId);
}

export async function resolveVisibleProjectIdsForWorkspace(
  userId: string,
  workspaceId: string
) {
  const membership = await assertWorkspaceMembership(userId, workspaceId);
  const workspaceRole = normalizeWorkspaceRole(String(membership?.role || "viewer"));
  if (workspaceRole === "workspace_admin") {
    return null;
  }

  const accesses = await findProjectAccessesByUser(userId, workspaceId);
  return Array.from(
    new Set(
      accesses
        .filter((access) => String(access.status || "").toLowerCase() === "active")
        .map((access) => String(access.project_id || "").trim())
        .filter(Boolean)
    )
  );
}

export async function listWorkspaceProjectAccessService(workspaceId: string, userId: string) {
  await assertWorkspaceManagerAccess(userId, workspaceId);
  return findWorkspaceProjectAccesses(workspaceId);
}

export async function assertWorkspaceManagerAccess(userId: string, workspaceId: string) {
  try {
    return await assertWorkspacePermission(
      userId,
      workspaceId,
      WORKSPACE_PERMISSIONS.manageUsers
    );
  } catch (err) {
    return assertWorkspacePermission(
      userId,
      workspaceId,
      WORKSPACE_PERMISSIONS.manageWorkspace
    );
  }
}

export async function assertProjectRoleAccess(
  userId: string,
  projectId: string,
  allowedRoles: ProjectRole[],
  workspaceId?: string | null
) {
  const access = await assertProjectContextAccess(userId, projectId, workspaceId || null);
  const role = normalizeProjectRole(access?.role);
  if (!allowedRoles.includes(role)) {
    throw { status: 403, message: "Forbidden: Insufficient project permissions" };
  }

  return access;
}

export async function assertProjectScopedWriteAccess(input: {
  userId: string;
  projectId: string;
  workspaceId?: string | null;
  workspacePermission: typeof WORKSPACE_PERMISSIONS[keyof typeof WORKSPACE_PERMISSIONS];
  allowedProjectRoles: ProjectRole[];
}): Promise<ProjectAccessResult> {
  const project = await findProjectById(input.projectId);
  if (!project) {
    throw { status: 404, message: "Project not found" };
  }

  const workspaceId = input.workspaceId || project.workspace_id;
  try {
    await assertWorkspacePermission(input.userId, workspaceId, input.workspacePermission);
    const access = await assertProjectContextAccess(input.userId, input.projectId, workspaceId);
    return {
      scope: "workspace",
      workspaceId,
      projectId: input.projectId,
      projectAccess: access,
    };
  } catch (err: any) {
    if (err?.status && err.status !== 403) {
      throw err;
    }
  }

  const access = await assertProjectRoleAccess(
    input.userId,
    input.projectId,
    input.allowedProjectRoles,
    workspaceId
  );

  return {
    scope: "project",
    workspaceId,
    projectId: input.projectId,
    projectAccess: access,
  };
}

export async function assertProjectScopedUserManagementAccess(
  userId: string,
  projectId: string,
  workspaceId?: string | null
) {
  return assertProjectScopedWriteAccess({
    userId,
    projectId,
    workspaceId: workspaceId ?? null,
    workspacePermission: WORKSPACE_PERMISSIONS.manageUsers,
    allowedProjectRoles: ["project_admin"],
  });
}

export async function resolveProjectAccess(userId: string, projectId: string) {
  const project = await findProjectById(projectId);
  if (!project) {
    return null;
  }

  const direct = await findProjectAccessByUserAndProject(userId, projectId);
  if (direct?.status === "active") {
    return direct;
  }

  const ownerRes = await query(
    `SELECT id
     FROM workspaces
     WHERE id = $1
       AND owner_user_id = $2
     LIMIT 1`,
    [project.workspace_id, userId]
  );
  if (ownerRes.rows[0]) {
    return {
      workspace_id: project.workspace_id,
      user_id: userId,
      project_id: projectId,
      role: "project_admin",
      is_all_projects: true,
      status: "active",
    } satisfies Partial<ProjectAccessRecord>;
  }

  const workspaceMembership = await resolveWorkspaceMembership(userId, project.workspace_id);
  if (workspaceMembership && normalizeWorkspaceRole(workspaceMembership.role) === "workspace_admin") {
    return {
      workspace_id: project.workspace_id,
      user_id: userId,
      project_id: projectId,
      role: "project_admin",
      is_all_projects: true,
      status: "active",
    } satisfies Partial<ProjectAccessRecord>;
  }

  if (await isPlatformInternalOperator(userId)) {
    const supportAccess = await findActiveSupportAccess(project.workspace_id, userId);
    if (!supportAccess) {
      return null;
    }

    return {
      workspace_id: project.workspace_id,
      user_id: userId,
      project_id: projectId,
      role: "project_admin",
      is_all_projects: true,
      status: "active",
    } satisfies Partial<ProjectAccessRecord>;
  }

  const allProjectsAccess = await query(
    `SELECT *
     FROM project_users
     WHERE workspace_id = $1
       AND user_id = $2
       AND status = 'active'
     ORDER BY created_at ASC
     LIMIT 1`,
    [project.workspace_id, userId]
  );

  return (allProjectsAccess.rows[0] as ProjectAccessRecord | undefined) || null;
}

export async function resolveProjectRole(userId: string, projectId: string) {
  const access = await resolveProjectAccess(userId, projectId);
  return access ? normalizeProjectRole(access.role) : null;
}

export async function hasProjectAccess(userId: string, projectId: string) {
  return Boolean(await resolveProjectAccess(userId, projectId));
}

export async function assertProjectMembership(userId: string, projectId?: string | null) {
  if (!projectId) {
    return null;
  }

  const project = await findProjectById(projectId);
  if (!project) {
    throw { status: 404, message: "Project not found" };
  }

  await assertWorkspaceMembership(userId, project.workspace_id);

  const access = await resolveProjectAccess(userId, projectId);
  if (!access) {
    throw { status: 403, message: "You do not have access to this project" };
  }

  return access;
}

export async function assertProjectContextAccess(
  userId: string,
  projectId?: string | null,
  workspaceId?: string | null
) {
  if (!projectId) {
    if (workspaceId) {
      await assertWorkspaceMembership(userId, workspaceId);
    }
    return null;
  }

  const project = await findProjectById(projectId);
  if (!project) {
    throw { status: 404, message: "Project not found" };
  }

  if (workspaceId && project.workspace_id !== workspaceId) {
    throw { status: 400, message: "Project does not belong to the active workspace" };
  }

  await assertWorkspaceMembership(userId, project.workspace_id);
  return assertProjectMembership(userId, projectId);
}

export async function resolveUserDefaultProject(userId: string, workspaceId: string) {
  const defaultProject = await findDefaultProjectByWorkspace(workspaceId);
  if (!defaultProject) {
    return null;
  }

  const access = await resolveProjectAccess(userId, defaultProject.id);
  if (access) {
    return defaultProject;
  }

  const firstAccessible = await query(
    `SELECT p.*
     FROM projects p
     JOIN project_users pu ON pu.project_id = p.id
     WHERE p.workspace_id = $1
       AND pu.user_id = $2
       AND pu.status = 'active'
     ORDER BY p.is_default DESC, p.created_at ASC
     LIMIT 1`,
    [workspaceId, userId]
  );

  return firstAccessible.rows[0] || null;
}

export async function resolveCurrentProjectForWorkspace(userId: string, workspaceId: string) {
  await assertWorkspaceMembership(userId, workspaceId);
  return resolveUserDefaultProject(userId, workspaceId);
}

export async function assignProjectUserService(
  projectId: string,
  actorUserId: string,
  payload: { userId: string; role?: string; status?: string }
) {
  const project = await findProjectById(projectId);
  if (!project) {
    throw { status: 404, message: "Project not found" };
  }
  const access = await assertProjectScopedUserManagementAccess(
    actorUserId,
    projectId,
    project.workspace_id
  );

  const userId = String(payload.userId || "").trim();
  if (!userId) {
    throw { status: 400, message: "userId is required" };
  }

  const role = normalizeProjectRole(payload.role);
  if (access.scope !== "workspace" && role === "project_admin") {
    throw {
      status: 403,
      message: "Project admins can only assign editor, agent, or viewer access",
    };
  }
  const status = String(payload.status || "active").trim().toLowerCase();
  if (!["active", "inactive", "invited"].includes(status)) {
    throw { status: 400, message: "Unsupported project membership status" };
  }

  const assignedAccess = await upsertProjectAccess({
    workspaceId: project.workspace_id,
    userId,
    projectId,
    role,
    status,
    createdBy: actorUserId,
  });

  await logAuditSafe({
    userId: actorUserId,
    workspaceId: project.workspace_id,
    projectId,
    action: "assign",
    entity: "project_user",
    entityId: `${projectId}:${userId}`,
    newData: assignedAccess as unknown as Record<string, unknown>,
  });

  return assignedAccess;
}

export async function revokeProjectUserService(
  projectId: string,
  actorUserId: string,
  targetUserId: string
) {
  const project = await findProjectById(projectId);
  if (!project) {
    throw { status: 404, message: "Project not found" };
  }
  const access = await assertProjectScopedUserManagementAccess(
    actorUserId,
    projectId,
    project.workspace_id
  );

  const existingAccess = await findProjectAccessByUserAndProject(targetUserId, projectId);
  if (
    access.scope !== "workspace" &&
    normalizeProjectRole(String(existingAccess?.role || "viewer")) === "project_admin"
  ) {
    throw {
      status: 403,
      message: "Project admins cannot revoke another project admin",
    };
  }

  const removed = await deleteProjectAccess(project.workspace_id, targetUserId, projectId);
  await logAuditSafe({
    userId: actorUserId,
    workspaceId: project.workspace_id,
    projectId,
    action: "revoke",
    entity: "project_user",
    entityId: `${projectId}:${targetUserId}`,
    oldData: (removed || {}) as Record<string, unknown>,
  });

  return removed;
}
