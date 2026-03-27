import { listAuditLogs } from "../models/auditLogModel";
import {
  assertWorkspaceMembership,
  assertWorkspacePermissionAny,
  WORKSPACE_PERMISSIONS,
} from "./workspaceAccessService";
import { assertProjectContextAccess } from "./projectAccessService";

export async function listWorkspaceAuditLogsService(
  workspaceId: string,
  userId: string,
  filters: {
    projectId?: string | null;
    entity?: string | null;
    action?: string | null;
    limit?: number;
  }
) {
  await assertWorkspaceMembership(userId, workspaceId);
  await assertWorkspacePermissionAny(userId, workspaceId, [
    WORKSPACE_PERMISSIONS.manageWorkspace,
    WORKSPACE_PERMISSIONS.manageUsers,
    WORKSPACE_PERMISSIONS.managePermissions,
  ]);

  if (filters.projectId) {
    await assertProjectContextAccess(userId, filters.projectId, workspaceId);
  }

  return listAuditLogs({
    workspaceId,
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.entity ? { entity: filters.entity } : {}),
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.limit !== undefined ? { limit: filters.limit } : {}),
  });
}
