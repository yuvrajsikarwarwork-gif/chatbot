import {
  deleteLead,
  findLeadById,
  findLeadListSummariesByUser,
  findLeadsByUser,
} from "../models/leadModel";
import {
  assertProjectContextAccess,
  resolveVisibleProjectIdsForWorkspace,
} from "./projectAccessService";
import {
  assertWorkspacePermission,
  WORKSPACE_PERMISSIONS,
} from "./workspaceAccessService";
import { logAuditSafe } from "./auditLogService";

async function filterProjectScopedRows<T extends { workspace_id?: string | null; resolved_project_id?: string | null; project_id?: string | null }>(
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
    const projectId = String(row.resolved_project_id || row.project_id || "").trim();
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

export async function listLeadsService(userId: string, filters: any) {
  if (filters.workspaceId) {
    await assertWorkspacePermission(
      userId,
      String(filters.workspaceId),
      WORKSPACE_PERMISSIONS.viewLeads
    );
  }

  const rows = await findLeadsByUser(userId, {
    workspaceId: filters.workspaceId,
    projectId: filters.projectId,
    campaignId: filters.campaignId,
    channelId: filters.channelId,
    entryPointId: filters.entryPointId,
    flowId: filters.flowId,
    listId: filters.listId,
    platform: filters.platform,
    status: filters.status,
    botId: filters.botId,
    search: filters.search,
  });

  return filterProjectScopedRows(userId, rows);
}

export async function getLeadService(id: string, userId: string) {
  const lead = await findLeadById(id, userId);
  if (!lead) {
    throw { status: 404, message: "Lead not found" };
  }

  if (lead.workspace_id) {
    await assertWorkspacePermission(
      userId,
      String(lead.workspace_id),
      WORKSPACE_PERMISSIONS.viewLeads
    );
  }

  if (lead.resolved_project_id && lead.workspace_id) {
    await assertProjectContextAccess(
      userId,
      String(lead.resolved_project_id),
      String(lead.workspace_id)
    );
  }

  return lead;
}

export async function deleteLeadService(id: string, userId: string) {
  const lead = await findLeadById(id, userId);
  if (!lead) {
    throw { status: 404, message: "Lead not found" };
  }

  if (lead.workspace_id) {
    await assertWorkspacePermission(
      userId,
      String(lead.workspace_id),
      WORKSPACE_PERMISSIONS.deleteLeads
    );
  }

  if (lead.resolved_project_id && lead.workspace_id) {
    await assertProjectContextAccess(
      userId,
      String(lead.resolved_project_id),
      String(lead.workspace_id)
    );
  }

  await logAuditSafe({
    userId,
    workspaceId: lead.workspace_id,
    projectId: lead.project_id,
    action: "delete",
    entity: "lead",
    entityId: id,
    oldData: lead as unknown as Record<string, unknown>,
  });
  await deleteLead(id, userId);
}

export async function listLeadListsService(
  userId: string,
  campaignId?: string,
  workspaceId?: string,
  projectId?: string
) {
  if (workspaceId) {
    await assertWorkspacePermission(
      userId,
      workspaceId,
      WORKSPACE_PERMISSIONS.viewLeads
    );
  }

  const rows = await findLeadListSummariesByUser(userId, campaignId, workspaceId, projectId);
  return filterProjectScopedRows(userId, rows);
}
