import { findBotById } from "../models/botModel";
import {
  createFlow,
  deleteFlow,
  findFlowById,
  findFlowsByBot,
  findFlowSummariesByBot,
  updateFlow,
} from "../models/flowModel";
import {
  assertBotWorkspacePermission,
  WORKSPACE_PERMISSIONS,
} from "./workspaceAccessService";
import { assertProjectScopedWriteAccess } from "./projectAccessService";
import { logAuditSafe } from "./auditLogService";

// Legacy compatibility layer.
// Runtime message processing lives in flowEngine.ts.

export async function getFlowsByBotService(botId: string, userId: string) {
  const bot = await assertBotWorkspacePermission(
    userId,
    botId,
    WORKSPACE_PERMISSIONS.viewFlows
  );

  return findFlowsByBot(botId);
}

export async function getFlowSummariesByBotService(botId: string, userId: string) {
  const bot = await assertBotWorkspacePermission(
    userId,
    botId,
    WORKSPACE_PERMISSIONS.viewFlows
  );

  return findFlowSummariesByBot(botId);
}

export async function getFlowService(id: string, userId: string) {
  const flow = await findFlowById(id);
  if (!flow) {
    throw { status: 404, message: "Flow not found" };
  }

  const bot = await findBotById(flow.bot_id);
  if (!bot) {
    throw { status: 404, message: "Flow not found" };
  }
  await assertBotWorkspacePermission(userId, bot.id, WORKSPACE_PERMISSIONS.viewFlows);

  return flow;
}

export async function saveFlowService(
  botId: string,
  userId: string,
  flowJson: any,
  flowId?: string,
  flowName?: string
) {
  const bot = await assertBotWorkspacePermission(
    userId,
    botId,
    WORKSPACE_PERMISSIONS.editWorkflow
  );
  await assertProjectScopedWriteAccess({
    userId,
    projectId: String(bot.project_id || ""),
    workspaceId: bot.workspace_id,
    workspacePermission: WORKSPACE_PERMISSIONS.editWorkflow,
    allowedProjectRoles: ["project_admin", "editor"],
  });

  if (flowId) {
    const existing = await findFlowById(flowId);
    if (!existing || existing.bot_id !== botId) {
      throw { status: 404, message: "Flow not found" };
    }

    const updated = await updateFlow(flowId, botId, flowJson, flowName);
    await logAuditSafe({
      userId,
      workspaceId: bot.workspace_id,
      projectId: bot.project_id,
      action: "update",
      entity: "flow",
      entityId: flowId,
      oldData: existing as unknown as Record<string, unknown>,
      newData: updated as unknown as Record<string, unknown>,
    });
    return updated;
  }

  const existingFlows = await findFlowsByBot(botId);
  const defaultFlow = existingFlows.find((flow) => flow.is_default) || existingFlows[0];

  if (defaultFlow) {
    const updated = await updateFlow(defaultFlow.id, botId, flowJson, flowName);
    await logAuditSafe({
      userId,
      workspaceId: bot.workspace_id,
      projectId: bot.project_id,
      action: "update",
      entity: "flow",
      entityId: defaultFlow.id,
      oldData: defaultFlow as unknown as Record<string, unknown>,
      newData: updated as unknown as Record<string, unknown>,
    });
    return updated;
  }

  const created = await createFlow(botId, flowJson, flowName, true);
  await logAuditSafe({
    userId,
    workspaceId: bot.workspace_id,
    projectId: bot.project_id,
    action: "create",
    entity: "flow",
    entityId: created.id,
    newData: created as unknown as Record<string, unknown>,
  });
  return created;
}

export async function createNewFlowService(
  botId: string,
  userId: string,
  flowJson: any,
  flowName?: string,
  isDefault = false
) {
  const bot = await assertBotWorkspacePermission(
    userId,
    botId,
    WORKSPACE_PERMISSIONS.createFlow
  );
  await assertProjectScopedWriteAccess({
    userId,
    projectId: String(bot.project_id || ""),
    workspaceId: bot.workspace_id,
    workspacePermission: WORKSPACE_PERMISSIONS.createFlow,
    allowedProjectRoles: ["project_admin", "editor"],
  });

  const created = await createFlow(botId, flowJson, flowName, isDefault);
  await logAuditSafe({
    userId,
    workspaceId: bot.workspace_id,
    projectId: bot.project_id,
    action: "create",
    entity: "flow",
    entityId: created.id,
    newData: created as unknown as Record<string, unknown>,
  });
  return created;
}

export async function updateFlowService(
  id: string,
  userId: string,
  flowJson: any,
  flowName?: string,
  isDefault?: boolean
) {
  const flow = await findFlowById(id);
  if (!flow) {
    throw { status: 404, message: "Flow not found" };
  }

  const bot = await findBotById(flow.bot_id);
  if (!bot) {
    throw { status: 404, message: "Flow not found" };
  }
  await assertBotWorkspacePermission(userId, bot.id, WORKSPACE_PERMISSIONS.editWorkflow);
  await assertProjectScopedWriteAccess({
    userId,
    projectId: String(bot.project_id || ""),
    workspaceId: bot.workspace_id,
    workspacePermission: WORKSPACE_PERMISSIONS.editWorkflow,
    allowedProjectRoles: ["project_admin", "editor"],
  });

  const updated = await updateFlow(id, bot.id, flowJson, flowName, isDefault);
  await logAuditSafe({
    userId,
    workspaceId: bot.workspace_id,
    projectId: bot.project_id,
    action: "update",
    entity: "flow",
    entityId: id,
    oldData: flow as unknown as Record<string, unknown>,
    newData: updated as unknown as Record<string, unknown>,
  });
  return updated;
}

export async function deleteFlowService(id: string, userId: string) {
  const flow = await findFlowById(id);
  if (!flow) {
    throw { status: 404, message: "Flow not found" };
  }

  const bot = await findBotById(flow.bot_id);
  if (!bot) {
    throw { status: 404, message: "Flow not found" };
  }
  await assertBotWorkspacePermission(userId, bot.id, WORKSPACE_PERMISSIONS.deleteFlow);
  await assertProjectScopedWriteAccess({
    userId,
    projectId: String(bot.project_id || ""),
    workspaceId: bot.workspace_id,
    workspacePermission: WORKSPACE_PERMISSIONS.deleteFlow,
    allowedProjectRoles: ["project_admin"],
  });

  await logAuditSafe({
    userId,
    workspaceId: bot.workspace_id,
    projectId: bot.project_id,
    action: "delete",
    entity: "flow",
    entityId: id,
    oldData: flow as unknown as Record<string, unknown>,
  });
  await deleteFlow(id, bot.id);
}
