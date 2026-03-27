import {
  createPlatformAccount,
  deletePlatformAccount,
  findPlatformAccountById,
  findPlatformAccountsByUser,
  updatePlatformAccount,
} from "../models/platformAccountModel";
import { assertRecord } from "../utils/assertRecord";
import {
  assertPlatformAccountQuota,
  assertPlatformAllowedByPlan,
  validateWorkspaceContext,
} from "./businessValidationService";
import { findProjectById } from "../models/projectModel";
import { normalizePlatform } from "../utils/platform";
import { encryptSecret } from "../utils/encryption";
import {
  assertProjectContextAccess,
  assertProjectScopedWriteAccess,
  resolveVisibleProjectIdsForWorkspace,
} from "./projectAccessService";
import {
  assertWorkspacePermission,
  WORKSPACE_PERMISSIONS,
} from "./workspaceAccessService";
import { logAuditSafe } from "./auditLogService";

async function filterPlatformAccountsByProjectScope<
  T extends { workspace_id?: string | null; project_id?: string | null }
>(userId: string, rows: T[]) {
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

function normalizeStatus(status?: string) {
  const value = String(status || "active").trim().toLowerCase();
  const allowed = new Set(["active", "inactive", "paused"]);
  if (!allowed.has(value)) {
    throw { status: 400, message: `Unsupported platform account status '${status}'` };
  }
  return value;
}

function sanitizeSecret(value?: string | null) {
  if (!value || !String(value).trim()) {
    return null;
  }
  return JSON.stringify(encryptSecret(String(value).trim()));
}

function normalizeMetadata(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? ({ ...(value as Record<string, unknown>) } as Record<string, unknown>)
    : {};
}

export async function listPlatformAccountsService(
  userId: string,
  platformType?: string,
  workspaceId?: string | null,
  projectId?: string | null
) {
  const normalizedPlatform = platformType ? normalizePlatform(platformType) : undefined;

  if (projectId) {
    const projectAccess = await assertProjectContextAccess(userId, projectId, workspaceId || null);
    return findPlatformAccountsByUser(
      userId,
      normalizedPlatform,
      projectAccess?.workspace_id || workspaceId || null,
      projectId
    );
  }

  if (workspaceId) {
    await assertWorkspacePermission(
      userId,
      workspaceId,
      WORKSPACE_PERMISSIONS.viewPlatformAccounts
    );
  }

  const rows = await findPlatformAccountsByUser(userId, normalizedPlatform, workspaceId, null);
  return filterPlatformAccountsByProjectScope(userId, rows);
}

export async function createPlatformAccountService(userId: string, payload: any) {
  if (!payload.platformType || !payload.name) {
    throw { status: 400, message: "platformType and name are required" };
  }

  const projectId = String(payload.projectId || payload.project_id || "").trim();
  if (!projectId) {
    throw { status: 400, message: "projectId is required for platform accounts" };
  }

  const project = assertRecord(await findProjectById(projectId), "Project not found");
  await assertProjectScopedWriteAccess({
    userId,
    projectId,
    workspaceId: project.workspace_id,
    workspacePermission: WORKSPACE_PERMISSIONS.managePlatformAccounts,
    allowedProjectRoles: ["project_admin"],
  });
  const platformType = normalizePlatform(payload.platformType);
  await assertPlatformAllowedByPlan(platformType, project.workspace_id);
  await validateWorkspaceContext(project.workspace_id);
  await assertPlatformAccountQuota(userId, project.workspace_id);

  const created = await createPlatformAccount({
    userId,
    workspaceId: project.workspace_id,
    projectId,
    platformType,
    name: payload.name,
    phoneNumber: payload.phoneNumber || null,
    accountId: payload.accountId || null,
    token: sanitizeSecret(payload.token),
    businessId: payload.businessId || null,
    status: normalizeStatus(payload.status),
    metadata: normalizeMetadata(payload.metadata),
  });
  await logAuditSafe({
    userId,
    workspaceId: project.workspace_id,
    projectId,
    action: "create",
    entity: "integration",
    entityId: created.id,
    newData: created,
  });
  return created;
}

export async function updatePlatformAccountService(
  id: string,
  userId: string,
  payload: any
) {
  const existing = assertRecord(
    await findPlatformAccountById(id, userId),
    "Platform account not found"
  );
  const nextProjectId =
    payload.projectId !== undefined || payload.project_id !== undefined
      ? String(payload.projectId || payload.project_id || "").trim() || null
      : existing.project_id || null;
  if (!nextProjectId) {
    throw { status: 400, message: "projectId is required for platform accounts" };
  }

  const project = assertRecord(await findProjectById(nextProjectId), "Project not found");
  await assertProjectScopedWriteAccess({
    userId,
    projectId: nextProjectId,
    workspaceId: project.workspace_id,
    workspacePermission: WORKSPACE_PERMISSIONS.managePlatformAccounts,
    allowedProjectRoles: ["project_admin"],
  });

  const updatePayload: Record<string, unknown> = {
    workspaceId: project.workspace_id,
    projectId: nextProjectId,
    name: payload.name,
    phoneNumber: payload.phoneNumber,
    accountId: payload.accountId,
    businessId: payload.businessId,
    metadata:
      payload.metadata !== undefined
        ? {
            ...normalizeMetadata(existing.metadata),
            ...normalizeMetadata(payload.metadata),
          }
        : undefined,
  };

  if (payload.platformType) {
    const platformType = normalizePlatform(payload.platformType);
    await assertPlatformAllowedByPlan(platformType, project.workspace_id);
    updatePayload.platformType = platformType;
  }

  if (payload.status !== undefined) {
    updatePayload.status = normalizeStatus(payload.status);
  }

  if (payload.token !== undefined) {
    updatePayload.token = sanitizeSecret(payload.token);
  }

  const updated = await updatePlatformAccount(id, userId, {
    workspaceId:
      updatePayload.workspaceId !== undefined
        ? (updatePayload.workspaceId as string | null)
        : project.workspace_id,
    projectId:
      updatePayload.projectId !== undefined
        ? (updatePayload.projectId as string | null)
        : nextProjectId,
    platformType:
      updatePayload.platformType !== undefined
        ? (updatePayload.platformType as string)
        : existing.platform_type,
    name:
      updatePayload.name !== undefined
        ? (updatePayload.name as string)
        : existing.name,
    phoneNumber:
      updatePayload.phoneNumber !== undefined
        ? (updatePayload.phoneNumber as string | null)
        : existing.phone_number,
    accountId:
      updatePayload.accountId !== undefined
        ? (updatePayload.accountId as string | null)
        : existing.account_id,
    token:
      updatePayload.token !== undefined
        ? (updatePayload.token as string | null)
        : existing.token,
    businessId:
      updatePayload.businessId !== undefined
        ? (updatePayload.businessId as string | null)
        : existing.business_id,
    status:
      updatePayload.status !== undefined
        ? (updatePayload.status as string)
        : existing.status,
    metadata:
      updatePayload.metadata !== undefined
        ? (updatePayload.metadata as Record<string, unknown>)
        : existing.metadata,
  });
  await logAuditSafe({
    userId,
    workspaceId: project.workspace_id,
    projectId: nextProjectId,
    action: "update",
    entity: "integration",
    entityId: id,
    oldData: existing,
    newData: updated || {},
  });
  return updated;
}

export async function deletePlatformAccountService(id: string, userId: string) {
  const existing = assertRecord(
    await findPlatformAccountById(id, userId),
    "Platform account not found"
  );
  if (!existing.project_id) {
    throw {
      status: 409,
      message: "Legacy workspace-level accounts must be migrated to a project before deletion.",
    };
  }
  await assertProjectScopedWriteAccess({
    userId,
    projectId: existing.project_id,
    workspaceId: existing.workspace_id,
    workspacePermission: WORKSPACE_PERMISSIONS.managePlatformAccounts,
    allowedProjectRoles: ["project_admin"],
  });
  await logAuditSafe({
    userId,
    workspaceId: existing.workspace_id,
    projectId: existing.project_id,
    action: "delete",
    entity: "integration",
    entityId: id,
    oldData: existing,
  });
  await deletePlatformAccount(id, userId);
}
