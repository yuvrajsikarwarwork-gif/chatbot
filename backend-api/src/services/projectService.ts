import {
  createInboundQuarantineRow,
  type InboundQuarantineInput,
} from "../models/inboundQuarantineModel";
import {
  findProjectSettingsByProject,
  upsertProjectSettings,
  type ProjectSettingsRecord,
} from "../models/projectSettingsModel";
import {
  createProject,
  deleteProject,
  findDefaultProjectByWorkspace,
  findProjectById,
  findProjectsByUser,
  findProjectsByWorkspace,
  updateProject,
} from "../models/projectModel";
import { db, query } from "../config/db";
import { assertRecord } from "../utils/assertRecord";
import { assertProjectQuota } from "./businessValidationService";
import {
  assertProjectMembership,
  assertProjectScopedWriteAccess,
  resolveCurrentProjectForWorkspace,
} from "./projectAccessService";
import {
  assertWorkspaceMembership,
  assertWorkspacePermission,
  WORKSPACE_PERMISSIONS,
} from "./workspaceAccessService";
import { logAuditSafe } from "./auditLogService";

function toAuditRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return { ...(value as Record<string, unknown>) };
}

function normalizeProjectStatus(status?: string) {
  const value = String(status || "active").trim().toLowerCase();
  const allowed = new Set(["active", "archived", "inactive"]);
  if (!allowed.has(value)) {
    throw { status: 400, message: `Unsupported project status '${status}'` };
  }

  return value;
}

function normalizePlatformList(value: unknown) {
  const source = Array.isArray(value) ? value : [];
  return Array.from(
    new Set(
      source
        .map((item) => String(item || "").trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function buildDefaultProjectSettings(projectId: string): ProjectSettingsRecord {
  return {
    project_id: projectId,
    auto_assign: false,
    assignment_mode: "manual",
    default_agent_id: null,
    max_open_per_agent: 25,
    allow_takeover: true,
    allow_manual_reply: true,
    allow_bot_resume: false,
    show_campaign: true,
    show_flow: true,
    show_list: true,
    allowed_platforms: [],
    default_campaign_id: null,
    default_list_id: null,
  };
}

export async function listProjectsByWorkspaceService(workspaceId: string, userId: string) {
  await assertWorkspaceMembership(userId, workspaceId);

  try {
    await assertWorkspacePermission(userId, workspaceId, WORKSPACE_PERMISSIONS.viewProjects);
    return findProjectsByWorkspace(workspaceId);
  } catch (error: any) {
    if (error?.status && error.status !== 403) {
      throw error;
    }
  }

  return listProjectsByUserService(userId, workspaceId);
}

export async function listProjectsByUserService(userId: string, workspaceId?: string | null) {
  if (workspaceId) {
    await assertWorkspaceMembership(userId, workspaceId);
  }
  return findProjectsByUser(userId, workspaceId);
}

export async function getProjectByIdService(projectId: string, userId: string) {
  await assertProjectMembership(userId, projectId);
  return assertRecord(await findProjectById(projectId), "Project not found");
}

export async function createProjectService(userId: string, payload: Record<string, unknown>) {
  const workspaceId = String(payload.workspaceId || "").trim();
  const name = String(payload.name || "").trim();

  if (!workspaceId || !name) {
    throw { status: 400, message: "workspaceId and name are required" };
  }

  await assertWorkspacePermission(userId, workspaceId, WORKSPACE_PERMISSIONS.createProjects);
  await assertProjectQuota(workspaceId);

  const input = {
    workspaceId,
    name,
    description: String(payload.description || "").trim() || null,
    status: normalizeProjectStatus(String(payload.status || "active")),
    isDefault: Boolean(payload.isDefault),
    isInternal: Boolean(payload.isInternal),
    onboardingComplete: Boolean(payload.onboardingComplete),
  };

  if (!input.isDefault) {
    const created = await createProject(input);
    await logAuditSafe({
      userId,
      workspaceId,
      projectId: created.id,
      action: "create",
      entity: "project",
      entityId: created.id,
      newData: toAuditRecord(created),
    });
    return created;
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE projects
       SET is_default = false,
           updated_at = NOW()
       WHERE workspace_id = $1
         AND is_default = true`,
      [workspaceId]
    );
    const res = await client.query(
      `INSERT INTO projects
         (workspace_id, name, description, status, is_default, is_internal, onboarding_complete)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.workspaceId,
        input.name,
        input.description,
        input.status,
        true,
        input.isInternal,
        input.onboardingComplete,
      ]
    );
    await client.query("COMMIT");
    await logAuditSafe({
      userId,
      workspaceId,
      projectId: res.rows[0]?.id,
      action: "create",
      entity: "project",
      entityId: res.rows[0]?.id,
      newData: toAuditRecord(res.rows[0]),
    });
    return res.rows[0];
  } catch (err: any) {
    await client.query("ROLLBACK");
    if (err?.code === "23505") {
      throw { status: 409, message: "Another default project already exists for this workspace" };
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function updateProjectService(
  projectId: string,
  userId: string,
  payload: Record<string, unknown>
) {
  const project = assertRecord(await findProjectById(projectId), "Project not found");
  const access = await assertProjectScopedWriteAccess({
    userId,
    projectId,
    workspaceId: project.workspace_id,
    workspacePermission: WORKSPACE_PERMISSIONS.editProjects,
    allowedProjectRoles: ["project_admin"],
  });

  if (
    access.scope !== "workspace" &&
    (payload.isDefault !== undefined || payload.isInternal !== undefined)
  ) {
    throw {
      status: 403,
      message: "Only workspace admins can change default or internal project flags",
    };
  }

  const updatePayload: Parameters<typeof updateProject>[1] = {};
  if (payload.name !== undefined) {
    updatePayload.name = String(payload.name || "").trim();
  }
  if (payload.description !== undefined) {
    updatePayload.description = String(payload.description || "").trim() || null;
  }
  if (payload.status !== undefined) {
    updatePayload.status = normalizeProjectStatus(String(payload.status));
  }
  if (payload.isDefault !== undefined) {
    updatePayload.isDefault = Boolean(payload.isDefault);
  }
  if (payload.isInternal !== undefined) {
    updatePayload.isInternal = Boolean(payload.isInternal);
  }
  if (payload.onboardingComplete !== undefined) {
    updatePayload.onboardingComplete = Boolean(payload.onboardingComplete);
  }

  if (updatePayload.isDefault === true) {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE projects
         SET is_default = false,
             updated_at = NOW()
         WHERE workspace_id = $1
           AND id <> $2
           AND is_default = true`,
        [project.workspace_id, projectId]
      );
      const res = await client.query(
        `UPDATE projects
         SET
           name = COALESCE($1, name),
           description = CASE WHEN $2::text IS NULL THEN description ELSE $2 END,
           status = COALESCE($3, status),
           is_default = COALESCE($4, is_default),
           is_internal = COALESCE($5, is_internal),
           onboarding_complete = COALESCE($6, onboarding_complete),
           updated_at = NOW()
         WHERE id = $7
         RETURNING *`,
        [
          updatePayload.name || null,
          updatePayload.description === undefined ? null : updatePayload.description,
          updatePayload.status || null,
          true,
          typeof updatePayload.isInternal === "boolean" ? updatePayload.isInternal : null,
          typeof updatePayload.onboardingComplete === "boolean"
            ? updatePayload.onboardingComplete
            : null,
          projectId,
        ]
      );
      await client.query("COMMIT");
      await logAuditSafe({
        userId,
        workspaceId: project.workspace_id,
        projectId: res.rows[0]?.id,
        action: "update",
        entity: "project",
        entityId: res.rows[0]?.id,
        oldData: toAuditRecord(project),
        newData: toAuditRecord(res.rows[0]),
      });
      return res.rows[0];
    } catch (err: any) {
      await client.query("ROLLBACK");
      if (err?.code === "23505") {
        throw { status: 409, message: "Another default project already exists for this workspace" };
      }
      throw err;
    } finally {
      client.release();
    }
  }

  const updated = await updateProject(projectId, updatePayload);
  await logAuditSafe({
    userId,
    workspaceId: project.workspace_id,
    projectId,
    action: "update",
    entity: "project",
    entityId: projectId,
    oldData: toAuditRecord(project),
    newData: toAuditRecord(updated),
  });
  return updated;
}

export async function archiveProjectService(projectId: string, userId: string) {
  const project = assertRecord(await findProjectById(projectId), "Project not found");
  await assertWorkspacePermission(
    userId,
    project.workspace_id,
    WORKSPACE_PERMISSIONS.editProjects
  );

  const archived = await updateProject(projectId, { status: "archived" });
  await logAuditSafe({
    userId,
    workspaceId: project.workspace_id,
    projectId,
    action: "archive",
    entity: "project",
    entityId: projectId,
    oldData: toAuditRecord(project),
    newData: toAuditRecord(archived),
  });
  return archived;
}

export async function deleteProjectService(projectId: string, userId: string) {
  const project = assertRecord(await findProjectById(projectId), "Project not found");
  await assertWorkspacePermission(
    userId,
    project.workspace_id,
    WORKSPACE_PERMISSIONS.deleteProjects
  );

  if (project.is_default) {
    throw { status: 409, message: "Default projects cannot be deleted" };
  }

  const dependencyRes = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM bots WHERE project_id = $1) AS bot_count,
       (SELECT COUNT(*)::int FROM flows WHERE project_id = $1) AS flow_count,
       (SELECT COUNT(*)::int FROM campaigns WHERE project_id = $1) AS campaign_count,
       (SELECT COUNT(*)::int FROM platform_accounts WHERE project_id = $1) AS platform_account_count,
       (SELECT COUNT(*)::int FROM conversations WHERE project_id = $1) AS conversation_count`,
    [projectId]
  );

  const dependency = dependencyRes.rows[0];
  const botCount = Number(dependency?.bot_count || 0);
  const flowCount = Number(dependency?.flow_count || 0);
  const campaignCount = Number(dependency?.campaign_count || 0);
  const integrationCount = Number(dependency?.platform_account_count || 0);
  const conversationCount = Number(dependency?.conversation_count || 0);
  const blockingCount =
    botCount + flowCount + campaignCount + integrationCount + conversationCount;

  if (blockingCount > 0) {
    const remaining = [
      botCount ? `${botCount} bot${botCount === 1 ? "" : "s"}` : null,
      flowCount ? `${flowCount} flow${flowCount === 1 ? "" : "s"}` : null,
      campaignCount ? `${campaignCount} campaign${campaignCount === 1 ? "" : "s"}` : null,
      integrationCount
        ? `${integrationCount} integration${integrationCount === 1 ? "" : "s"}`
        : null,
      conversationCount
        ? `${conversationCount} conversation${conversationCount === 1 ? "" : "s"}`
        : null,
    ]
      .filter(Boolean)
      .join(", ");

    throw {
      status: 409,
      message: `Project cannot be deleted yet. Remove: ${remaining}.`,
    };
  }

  await query(`DELETE FROM project_users WHERE project_id = $1`, [projectId]);
  await query(`DELETE FROM user_project_access WHERE project_id = $1`, [projectId]);
  await query(`DELETE FROM project_settings WHERE project_id = $1`, [projectId]);
  const deleted = await deleteProject(projectId);
  await logAuditSafe({
    userId,
    workspaceId: project.workspace_id,
    projectId,
    action: "delete",
    entity: "project",
    entityId: projectId,
    oldData: toAuditRecord(project),
  });
  return deleted;
}

export async function resolveWorkspaceProjectService(workspaceId: string, userId: string) {
  return resolveCurrentProjectForWorkspace(userId, workspaceId);
}

export async function getDefaultProjectByWorkspaceService(workspaceId: string, userId: string) {
  await assertWorkspaceMembership(userId, workspaceId);
  return findDefaultProjectByWorkspace(workspaceId);
}

export async function getProjectSettingsService(projectId: string, userId: string) {
  await assertProjectMembership(userId, projectId);
  const current = await findProjectSettingsByProject(projectId);
  return {
    ...buildDefaultProjectSettings(projectId),
    ...current,
    allowed_platforms: normalizePlatformList(current?.allowed_platforms),
  };
}

export async function updateProjectSettingsService(
  projectId: string,
  userId: string,
  payload: Record<string, unknown>
) {
  const project = assertRecord(await findProjectById(projectId), "Project not found");
  await assertProjectScopedWriteAccess({
    userId,
    projectId,
    workspaceId: project.workspace_id,
    workspacePermission: WORKSPACE_PERMISSIONS.editProjects,
    allowedProjectRoles: ["project_admin"],
  });

  const current = await getProjectSettingsService(projectId, userId);
  const defaultAgentId =
    payload.defaultAgentId !== undefined
      ? String(payload.defaultAgentId || "").trim() || null
      : payload.default_agent_id !== undefined
        ? String(payload.default_agent_id || "").trim() || null
        : current.default_agent_id;
  const defaultCampaignId =
    payload.defaultCampaignId !== undefined
      ? String(payload.defaultCampaignId || "").trim() || null
      : payload.default_campaign_id !== undefined
        ? String(payload.default_campaign_id || "").trim() || null
        : current.default_campaign_id;
  const defaultListId =
    payload.defaultListId !== undefined
      ? String(payload.defaultListId || "").trim() || null
      : payload.default_list_id !== undefined
        ? String(payload.default_list_id || "").trim() || null
        : current.default_list_id;
  const maxOpenPerAgent = Number(
    payload.maxOpenPerAgent ?? payload.max_open_per_agent ?? current.max_open_per_agent
  );
  if (!Number.isFinite(maxOpenPerAgent) || maxOpenPerAgent < 1 || maxOpenPerAgent > 500) {
    throw { status: 400, message: "maxOpenPerAgent must be between 1 and 500" };
  }

  await Promise.all([
    validateProjectAgentReference(project.workspace_id, projectId, defaultAgentId),
    validateProjectCampaignReference(project.workspace_id, projectId, defaultCampaignId),
    validateProjectListReference(project.workspace_id, projectId, defaultListId),
  ]);

  const saved = await upsertProjectSettings(projectId, {
    auto_assign: payload.autoAssign !== undefined
      ? Boolean(payload.autoAssign)
      : payload.auto_assign !== undefined
        ? Boolean(payload.auto_assign)
        : current.auto_assign,
    assignment_mode: String(
      payload.assignmentMode ?? payload.assignment_mode ?? current.assignment_mode
    ).trim() || "manual",
    default_agent_id: defaultAgentId,
    max_open_per_agent: maxOpenPerAgent,
    allow_takeover:
      payload.allowTakeover !== undefined
        ? Boolean(payload.allowTakeover)
        : payload.allow_takeover !== undefined
          ? Boolean(payload.allow_takeover)
          : current.allow_takeover,
    allow_manual_reply:
      payload.allowManualReply !== undefined
        ? Boolean(payload.allowManualReply)
        : payload.allow_manual_reply !== undefined
          ? Boolean(payload.allow_manual_reply)
          : current.allow_manual_reply,
    allow_bot_resume:
      payload.allowBotResume !== undefined
        ? Boolean(payload.allowBotResume)
        : payload.allow_bot_resume !== undefined
          ? Boolean(payload.allow_bot_resume)
          : current.allow_bot_resume,
    show_campaign:
      payload.showCampaign !== undefined
        ? Boolean(payload.showCampaign)
        : payload.show_campaign !== undefined
          ? Boolean(payload.show_campaign)
          : current.show_campaign,
    show_flow:
      payload.showFlow !== undefined
        ? Boolean(payload.showFlow)
        : payload.show_flow !== undefined
          ? Boolean(payload.show_flow)
          : current.show_flow,
    show_list:
      payload.showList !== undefined
        ? Boolean(payload.showList)
        : payload.show_list !== undefined
          ? Boolean(payload.show_list)
          : current.show_list,
    allowed_platforms: normalizePlatformList(
      payload.allowedPlatforms ?? payload.allowed_platforms ?? current.allowed_platforms
    ),
    default_campaign_id: defaultCampaignId,
    default_list_id: defaultListId,
  });
  await logAuditSafe({
    userId,
    workspaceId: project.workspace_id,
    projectId,
    action: "update",
    entity: "project_settings",
    entityId: projectId,
    oldData: toAuditRecord(current),
    newData: toAuditRecord(saved),
  });
  return saved;
}

export async function createInboundQuarantineService(
  userId: string,
  input: InboundQuarantineInput
) {
  if (input.attemptedProjectId) {
    await assertProjectMembership(userId, input.attemptedProjectId);
  } else if (input.attemptedWorkspaceId) {
    await assertWorkspaceMembership(userId, input.attemptedWorkspaceId);
  }

  return createInboundQuarantineRow(input);
}

async function validateProjectAgentReference(
  workspaceId: string,
  projectId: string,
  agentId: string | null
) {
  if (!agentId) {
    return;
  }

  const res = await query(
    `SELECT u.id
     FROM users u
     JOIN workspace_memberships wm
       ON wm.user_id = u.id
      AND wm.workspace_id = $2
      AND wm.status = 'active'
     WHERE u.id = $1
       AND (
         EXISTS (
           SELECT 1
           FROM project_users pu
           WHERE pu.user_id = u.id
             AND pu.workspace_id = $2
             AND pu.status = 'active'
             AND pu.project_id = $3
         )
         OR EXISTS (
           SELECT 1
           FROM workspaces w
           WHERE w.id = $2
             AND w.owner_user_id = u.id
         )
       )
     LIMIT 1`,
    [agentId, workspaceId, projectId]
  );

  if (!res.rows[0]) {
    throw { status: 400, message: "Default agent must belong to the same workspace and project" };
  }
}

async function validateProjectCampaignReference(
  workspaceId: string,
  projectId: string,
  campaignId: string | null
) {
  if (!campaignId) {
    return;
  }

  const res = await query(
    `SELECT id
     FROM campaigns
     WHERE id = $1
       AND workspace_id = $2
       AND (project_id = $3 OR project_id IS NULL)
     LIMIT 1`,
    [campaignId, workspaceId, projectId]
  );

  if (!res.rows[0]) {
    throw { status: 400, message: "Default campaign must belong to the same workspace and project" };
  }
}

async function validateProjectListReference(
  workspaceId: string,
  projectId: string,
  listId: string | null
) {
  if (!listId) {
    return;
  }

  const res = await query(
    `SELECT l.id
     FROM lists l
     JOIN campaigns c ON c.id = l.campaign_id
     WHERE l.id = $1
       AND c.workspace_id = $2
       AND (
         COALESCE(l.project_id, c.project_id) = $3
         OR (l.project_id IS NULL AND c.project_id IS NULL)
       )
     LIMIT 1`,
    [listId, workspaceId, projectId]
  );

  if (!res.rows[0]) {
    throw { status: 400, message: "Default list must belong to the same workspace and project" };
  }
}
