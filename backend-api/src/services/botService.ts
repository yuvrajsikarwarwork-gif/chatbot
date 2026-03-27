import {
  createScopedBot,
  deleteWorkspaceBot,
  findBotById,
  findBotsByUser,
  findBotsByWorkspaceProject,
  updateWorkspaceBot,
} from "../models/botModel";
import { findProjectById } from "../models/projectModel";
import { assertBotQuota } from "./businessValidationService";
import {
  assertProjectContextAccess,
  assertProjectMembership,
  assertProjectScopedWriteAccess,
  resolveVisibleProjectIdsForWorkspace,
} from "./projectAccessService";
import {
  assertWorkspaceMembership,
  assertWorkspacePermission,
  WORKSPACE_PERMISSIONS,
} from "./workspaceAccessService";
import { query } from "../config/db";
import { logAuditSafe } from "./auditLogService";

function extractDerivedTriggerKeywords(flowJson: any) {
  const nodes = Array.isArray(flowJson?.nodes) ? flowJson.nodes : [];
  const keywords: string[] = [];

  for (const node of nodes) {
    const nodeType = String(node?.type || "").trim().toLowerCase();
    const rawKeywords =
      nodeType === "trigger"
        ? String(node?.data?.keywords || "")
        : nodeType === "start"
          ? String(node?.data?.keywords || node?.data?.text || "")
          : "";

    if (!rawKeywords) {
      continue;
    }

    for (const keyword of rawKeywords.split(",")) {
      const normalized = keyword.trim();
      if (normalized) {
        keywords.push(normalized);
      }
    }
  }

  return keywords;
}

async function enrichBotsWithFlowTriggers(bots: any[]) {
  if (!Array.isArray(bots) || bots.length === 0) {
    return bots;
  }

  const botIds = bots.map((bot) => String(bot.id));
  const flowRes = await query(
    `SELECT bot_id, flow_json
     FROM flows
     WHERE bot_id = ANY($1::uuid[])
       AND COALESCE(is_active, true) = true
     ORDER BY COALESCE(is_default, false) DESC, updated_at DESC NULLS LAST, created_at DESC`,
    [botIds]
  );

  const keywordMap = new Map<string, string[]>();
  for (const row of flowRes.rows) {
    const botId = String(row.bot_id);
    const nextKeywords = extractDerivedTriggerKeywords(row.flow_json);
    if (nextKeywords.length === 0) {
      continue;
    }

    const existing = keywordMap.get(botId) || [];
    keywordMap.set(botId, [...existing, ...nextKeywords]);
  }

  return bots.map((bot) => {
    const derived = keywordMap.get(String(bot.id)) || [];
    const stored = String(bot.trigger_keywords || "")
      .split(",")
      .map((keyword) => keyword.trim())
      .filter(Boolean);
    const merged = Array.from(new Set([...stored, ...derived]));

    return {
      ...bot,
      trigger_keywords: merged.join(", "),
      derived_trigger_keywords: derived,
    };
  });
}

function assertWorkspaceScopedBot(bot: any) {
  if (!bot?.workspace_id) {
    throw {
      status: 409,
      message:
        "Legacy personal bots are no longer supported. Recreate or migrate this bot inside a workspace project.",
    };
  }

  return bot;
}

export const getBotsService = async (
  userId: string,
  workspaceId?: string | null,
  projectId?: string | null
) => {
  if (projectId) {
    const projectAccess = await assertProjectContextAccess(userId, projectId, workspaceId || null);
    if (!projectAccess?.workspace_id) {
      throw { status: 400, message: "Project workspace context is required" };
    }
    return enrichBotsWithFlowTriggers(
      await findBotsByWorkspaceProject(projectAccess.workspace_id, projectId)
    );
  }

  if (workspaceId) {
    await assertWorkspaceMembership(userId, workspaceId);
    const rows = await findBotsByWorkspaceProject(workspaceId);
    const visibleProjectIds = await resolveVisibleProjectIdsForWorkspace(userId, workspaceId);
    if (visibleProjectIds === null) {
      return enrichBotsWithFlowTriggers(rows);
    }

    return enrichBotsWithFlowTriggers(rows.filter((row: any) => {
      const rowProjectId = String(row.project_id || "").trim();
      return !rowProjectId || visibleProjectIds.includes(rowProjectId);
    }));
  }

  return enrichBotsWithFlowTriggers(await findBotsByUser(userId));
};

export const getBotService = async (id: string, userId: string) => {
  const bot = await findBotById(id);
  if (!bot) {
    throw { status: 404, message: "Bot not found" };
  }

  const scopedBot = assertWorkspaceScopedBot(bot);
  await assertWorkspaceMembership(userId, scopedBot.workspace_id);
  if (scopedBot.project_id) {
    await assertProjectMembership(userId, scopedBot.project_id);
  }
  const [enrichedBot] = await enrichBotsWithFlowTriggers([scopedBot]);
  return enrichedBot;
};

export const createBotService = async (
  userId: string,
  input: {
    name: string;
    trigger_keywords?: string;
    workspaceId?: string | null;
    projectId?: string | null;
  }
) => {
  const name = String(input.name || "").trim();
  const triggerKeywords = String(input.trigger_keywords || "").trim();
  const workspaceId = input.workspaceId ? String(input.workspaceId).trim() : null;
  let projectId = input.projectId ? String(input.projectId).trim() : null;

  if (!workspaceId && !projectId) {
    throw { status: 400, message: "Bots must be created inside a workspace project" };
  }

  if (projectId && !workspaceId) {
    const project = await findProjectById(projectId);
    if (!project) {
      throw { status: 404, message: "Project not found" };
    }
    projectId = project.id;
    input.workspaceId = project.workspace_id;
  }

  const resolvedWorkspaceId = input.workspaceId ? String(input.workspaceId).trim() : null;
  if (!resolvedWorkspaceId) {
    throw { status: 400, message: "Workspace context is required for project bots" };
  }
  if (!projectId) {
    throw { status: 400, message: "Project context is required for workspace bots" };
  }

  await assertProjectScopedWriteAccess({
    userId,
    projectId,
    workspaceId: resolvedWorkspaceId,
    workspacePermission: WORKSPACE_PERMISSIONS.createBots,
    allowedProjectRoles: ["project_admin", "editor"],
  });
  await assertBotQuota(resolvedWorkspaceId, projectId);

  await assertProjectContextAccess(userId, projectId, resolvedWorkspaceId);

  const created = await createScopedBot({
    userId,
    name,
    triggerKeywords,
    workspaceId: resolvedWorkspaceId,
    projectId,
  });
  await logAuditSafe({
    userId,
    workspaceId: resolvedWorkspaceId,
    projectId,
    action: "create",
    entity: "bot",
    entityId: created.id,
    newData: created,
  });
  return created;
};

export const updateBotService = async (id: string, userId: string, updateData: any) => {
  const existingBot = await findBotById(id);

  if (!existingBot) {
    throw { status: 404, message: "Bot not found or unauthorized" };
  }
  const bot = assertWorkspaceScopedBot(existingBot);

  const nextWorkspaceId =
    updateData.workspaceId !== undefined
      ? String(updateData.workspaceId || "").trim() || null
      : updateData.workspace_id !== undefined
        ? String(updateData.workspace_id || "").trim() || null
        : bot.workspace_id || null;
  const nextProjectId =
    updateData.projectId !== undefined
      ? String(updateData.projectId || "").trim() || null
      : updateData.project_id !== undefined
        ? String(updateData.project_id || "").trim() || null
        : bot.project_id || null;

  const payload = {
    name: updateData.name ?? bot.name,
    trigger_keywords: updateData.trigger_keywords ?? bot.trigger_keywords,
    status: nextProjectId ? updateData.status ?? bot.status : "inactive",
    workspace_id: nextWorkspaceId,
    project_id: nextProjectId,
  };

  const effectiveWorkspaceId = nextWorkspaceId || bot.workspace_id;
  if (!effectiveWorkspaceId) {
    throw { status: 400, message: "Workspace context is required" };
  }

  if (nextProjectId) {
    await assertProjectScopedWriteAccess({
      userId,
      projectId: nextProjectId,
      workspaceId: effectiveWorkspaceId,
      workspacePermission: WORKSPACE_PERMISSIONS.editBots,
      allowedProjectRoles: ["project_admin", "editor"],
    });
  } else if (bot.project_id) {
    await assertProjectScopedWriteAccess({
      userId,
      projectId: bot.project_id,
      workspaceId: effectiveWorkspaceId,
      workspacePermission: WORKSPACE_PERMISSIONS.editBots,
      allowedProjectRoles: ["project_admin", "editor"],
    });
  } else {
    await assertWorkspacePermission(userId, effectiveWorkspaceId, WORKSPACE_PERMISSIONS.editBots);
  }

  const updated = await updateWorkspaceBot(id, payload);
  await logAuditSafe({
    userId,
    workspaceId: effectiveWorkspaceId,
    projectId: nextProjectId,
    action: "update",
    entity: "bot",
    entityId: id,
    oldData: bot,
    newData: updated || {},
  });
  return updated;
};

export const deleteBotService = async (id: string, userId: string) => {
  const existingBot = await findBotById(id);
  if (!existingBot) {
    return;
  }
  const bot = assertWorkspaceScopedBot(existingBot);

  if (bot.project_id) {
    await assertProjectScopedWriteAccess({
      userId,
      projectId: bot.project_id,
      workspaceId: bot.workspace_id,
      workspacePermission: WORKSPACE_PERMISSIONS.deleteBots,
      allowedProjectRoles: ["project_admin"],
    });
  } else {
    await assertWorkspacePermission(userId, bot.workspace_id, WORKSPACE_PERMISSIONS.deleteBots);
  }
  await logAuditSafe({
    userId,
    workspaceId: bot.workspace_id,
    projectId: bot.project_id,
    action: "delete",
    entity: "bot",
    entityId: id,
    oldData: bot,
  });
  await deleteWorkspaceBot(id);
};

export const activateBotService = async (id: string, userId: string) => {
  const existingBot = await findBotById(id);
  if (!existingBot) {
    throw { status: 404, message: "Bot not found" };
  }
  const bot = assertWorkspaceScopedBot(existingBot);
  if (!bot.project_id) {
    throw {
      status: 409,
      message: "Disconnected bots cannot go live until they are linked to a project.",
    };
  }

  await assertProjectScopedWriteAccess({
    userId,
    projectId: bot.project_id,
    workspaceId: bot.workspace_id,
    workspacePermission: WORKSPACE_PERMISSIONS.editBots,
    allowedProjectRoles: ["project_admin", "editor"],
  });

  const result = await query(`UPDATE bots SET updated_at = NOW() WHERE id = $1 RETURNING *`, [id]);
  return result.rows[0];
};
