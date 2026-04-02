import {
  createScopedBot,
  deleteWorkspaceBot,
  findBotById,
  findBotsByUser,
  findBotsByWorkspaceProject,
  updateBotStatus,
  updateWorkspaceBot,
} from "../models/botModel";
import {
  createFlow,
  findAllFlowsByBot,
  findFlowsByBot,
  findSystemFlowsByBot,
  updateFlow,
} from "../models/flowModel";
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
  assertBotWorkspacePermission,
  WORKSPACE_PERMISSIONS,
} from "./workspaceAccessService";
import { query } from "../config/db";
import { logAuditSafe } from "./auditLogService";

function mergeSettingsSources(...sources: any[]) {
  return sources.reduce((acc, source) => {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      return acc;
    }
    return { ...acc, ...source };
  }, {});
}

function deepCloneJson<T>(value: T): T {
  if (value === undefined || value === null) {
    return value;
  }

  return JSON.parse(JSON.stringify(value));
}

function remapFlowReferences(value: any, idMap: Record<string, string>): any {
  if (Array.isArray(value)) {
    return value.map((item) => remapFlowReferences(item, idMap));
  }

  if (!value || typeof value !== "object") {
    if (typeof value === "string" && idMap[String(value)]) {
      return idMap[String(value)];
    }
    return value;
  }

  const next: Record<string, any> = {};
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = String(key || "").toLowerCase();
    if (typeof child === "string" && idMap[child]) {
      if (
        normalizedKey.includes("flowid") ||
        normalizedKey.includes("flow_id") ||
        normalizedKey.includes("targetflow") ||
        normalizedKey.includes("handoffflow") ||
        normalizedKey.includes("csatflow")
      ) {
        next[key] = idMap[child];
        continue;
      }
    }

    next[key] = remapFlowReferences(child, idMap);
  }

  return next;
}

function inferSystemFlowType(flow: any) {
  const flowJson = flow?.flow_json && typeof flow.flow_json === "object" ? flow.flow_json : {};
  const currentType = String(flow?.system_flow_type || flowJson.system_flow_type || flowJson.systemFlowType || "").trim().toLowerCase();
  if (currentType === "handoff" || currentType === "csat") {
    return currentType;
  }

  const currentName = String(flow?.flow_name || flow?.name || flowJson.flow_name || flowJson.name || "").trim().toLowerCase();
  if (currentName.includes("handoff")) {
    return "handoff";
  }
  if (currentName.includes("csat")) {
    return "csat";
  }

  return "";
}

function isSystemFlowRecord(flow: any) {
  const flowJson = flow?.flow_json && typeof flow.flow_json === "object" ? flow.flow_json : {};
  const inferredType = inferSystemFlowType(flow);
  return Boolean(
    flow?.is_system_flow ||
      flowJson.is_global_flow ||
      flowJson.isGlobalFlow ||
      flowJson.global_flow ||
      inferredType
  );
}

function extractDerivedTriggerKeywords(flowJson: any) {
  const nodes = Array.isArray(flowJson?.nodes) ? flowJson.nodes : [];
  const keywords: string[] = [];

  for (const node of nodes) {
    const nodeType = String(node?.type || "").trim().toLowerCase();
    const rawKeywords =
      nodeType === "start"
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

function buildPrimaryFlowBlueprint(botName: string) {
  return {
    layout_left_to_right: true,
    nodes: [
      {
        id: "primary-start",
        type: "start",
        position: { x: 120, y: 100 },
        data: { label: "Start" },
      },
      {
        id: "primary-welcome",
        type: "message",
        position: { x: 120, y: 220 },
        data: {
          label: "Welcome",
          text: `Welcome to ${botName || "your bot"}! I can help qualify a lead, connect you to a human, or recover from an error. Choose an option below to get started.`,
        },
      },
      {
        id: "primary-menu",
        type: "menu",
        position: { x: 120, y: 360 },
        data: {
          label: "Choose Path",
          text: "What would you like to do today?",
          item1: "Sales Lead",
          item2: "Talk to Human",
          item3: "Other / Error",
        },
      },
      {
        id: "primary-name-input",
        type: "input",
        position: { x: 120, y: 520 },
        data: {
          label: "Lead Name",
          text: "What is your full name?",
          variable: "full_name",
          linkedFieldKey: "full_name",
          validation: "text",
        },
      },
      {
        id: "primary-email-input",
        type: "input",
        position: { x: 120, y: 680 },
        data: {
          label: "Lead Email",
          text: "Thanks. What is your email address?",
          variable: "email",
          linkedFieldKey: "email",
          validation: "email",
        },
      },
      {
        id: "primary-email-check",
        type: "condition",
        position: { x: 120, y: 840 },
        data: {
          label: "Validate Email",
          variable: "email",
          operator: "exists",
          value: "",
        },
      },
      {
        id: "primary-lead-status",
        type: "save",
        position: { x: 420, y: 840 },
        data: {
          label: "Mark Qualified",
          variable: "lead_status",
          value: "qualified",
        },
      },
      {
        id: "primary-human-handoff",
        type: "assign_agent",
        position: { x: 120, y: 1000 },
        data: {
          label: "Assign Human",
          text: "A human agent will review your request now.",
        },
      },
      {
        id: "primary-handoff-note",
        type: "message",
        position: { x: 120, y: 1160 },
        data: {
          label: "Handoff Note",
          text: "Thanks. I have forwarded your details to the team. We will continue the conversation from here.",
        },
      },
      {
        id: "primary-error-message",
        type: "message",
        position: { x: 420, y: 520 },
        data: {
          label: "Recovery Message",
          text: "Sorry, I didn't catch that. Please reply with a valid email, choose another option, or type HELP to speak with a human.",
        },
      },
      {
        id: "primary-end",
        type: "end",
        position: { x: 520, y: 860 },
        data: { label: "End" },
      },
    ],
    edges: [
      { id: "primary-e1", source: "primary-start", target: "primary-welcome", sourceHandle: "next" },
      { id: "primary-e2", source: "primary-welcome", target: "primary-menu", sourceHandle: "next" },
      { id: "primary-e3", source: "primary-menu", target: "primary-name-input", sourceHandle: "item1" },
      { id: "primary-e4", source: "primary-menu", target: "primary-human-handoff", sourceHandle: "item2" },
      { id: "primary-e5", source: "primary-menu", target: "primary-error-message", sourceHandle: "item3" },
      { id: "primary-e6", source: "primary-name-input", target: "primary-email-input", sourceHandle: "response" },
      { id: "primary-e7", source: "primary-email-input", target: "primary-email-check", sourceHandle: "response" },
      { id: "primary-e8", source: "primary-email-check", target: "primary-lead-status", sourceHandle: "true" },
      { id: "primary-e9", source: "primary-email-check", target: "primary-error-message", sourceHandle: "false" },
      { id: "primary-e10", source: "primary-lead-status", target: "primary-human-handoff", sourceHandle: "next" },
      { id: "primary-e11", source: "primary-human-handoff", target: "primary-handoff-note", sourceHandle: "response" },
      { id: "primary-e12", source: "primary-handoff-note", target: "primary-end", sourceHandle: "next" },
      { id: "primary-e13", source: "primary-error-message", target: "primary-end", sourceHandle: "next" },
    ],
  };
}

function buildHandoffFlowBlueprint() {
  return {
    system_flow_type: "handoff",
    is_global_flow: true,
    is_system_flow: true,
    layout_left_to_right: true,
    nodes: [
      {
        id: "node_trigger_handoff",
        type: "trigger",
        position: { x: 100, y: 200 },
        data: {
          label: "Support Trigger",
          triggerType: "keyword",
          triggerKeywords: "human, support, agent, help desk",
        },
      },
      {
        id: "node_confirm_handoff",
        type: "menu",
        position: { x: 400, y: 200 },
        data: {
          label: "Confirm Transfer",
          text: "Would you like me to transfer you to a human support agent?",
          item1: "Yes, please",
          item2: "No, I'm good",
          timeout: 86400,
          reminderDelay: 43200,
          reminderText: "Hi there! Just checking in. Did you still want to speak to an agent?",
        },
      },
      {
        id: "node_wait_msg",
        type: "message",
        position: { x: 700, y: 50 },
        data: {
          label: "Wait Message",
          text: "Please wait a moment while I connect you with our next available agent...",
        },
      },
      {
        id: "node_assign_agent",
        type: "assign_agent",
        position: { x: 1000, y: 50 },
        data: { label: "Transfer to Human" },
      },
      {
        id: "node_cancel_msg",
        type: "message",
        position: { x: 700, y: 200 },
        data: {
          label: "Cancel Handoff",
          text: "No problem! Let me know if you need anything else.",
        },
      },
      {
        id: "node_timeout_msg",
        type: "message",
        position: { x: 700, y: 350 },
        data: {
          label: "Timeout Notice",
          text: "This request has timed out due to inactivity. Type 'Help' whenever you need us!",
        },
      },
      {
        id: "node_end_handoff",
        type: "end",
        position: { x: 1300, y: 200 },
        data: { label: "End Session" },
      },
    ],
    edges: [
      { id: "e1", source: "node_trigger_handoff", target: "node_confirm_handoff", sourceHandle: "next" },
      { id: "e2", source: "node_confirm_handoff", target: "node_wait_msg", sourceHandle: "item1" },
      { id: "e3", source: "node_confirm_handoff", target: "node_cancel_msg", sourceHandle: "item2" },
      { id: "e_timeout", source: "node_confirm_handoff", target: "node_timeout_msg", sourceHandle: "timeout" },
      { id: "e4", source: "node_wait_msg", target: "node_assign_agent", sourceHandle: "next" },
      { id: "e5", source: "node_assign_agent", target: "node_end_handoff", sourceHandle: "next" },
      { id: "e6", source: "node_cancel_msg", target: "node_end_handoff", sourceHandle: "next" },
      { id: "e7", source: "node_timeout_msg", target: "node_end_handoff", sourceHandle: "next" },
    ],
  };
}

function buildCsatFlowBlueprint() {
  return {
    system_flow_type: "csat",
    is_global_flow: true,
    is_system_flow: true,
    layout_left_to_right: true,
    nodes: [
      {
        id: "node_resume_csat",
        type: "resume_bot",
        position: { x: 100, y: 200 },
        data: {
          label: "Agent Closed Chat",
          resumeMode: "restart",
          resumeText: "Your support ticket has been closed by the agent.",
        },
      },
      {
        id: "node_csat_menu",
        type: "menu",
        position: { x: 400, y: 200 },
        data: {
          label: "Rate Experience",
          text: "How was your experience with our support team today?",
          item1: "Excellent ??",
          item2: "Average ??",
          item3: "Poor ??",
          timeout: 86400,
          reminderDelay: 43200,
          reminderText: "We'd love to hear your feedback! Please tap a rating above.",
        },
      },
      {
        id: "node_excellent_msg",
        type: "message",
        position: { x: 700, y: 50 },
        data: {
          label: "Thank You",
          text: "That is wonderful to hear! Thank you for reaching out, and have a great day.",
        },
      },
      {
        id: "node_sorry_msg",
        type: "message",
        position: { x: 700, y: 250 },
        data: {
          label: "Apology",
          text: "We are very sorry to hear that we did not meet your expectations.",
        },
      },
      {
        id: "node_capture_issue",
        type: "input",
        position: { x: 1000, y: 250 },
        data: {
          label: "Capture Complaint",
          text: "Please explain your issue below. A senior member from our team will review this.",
          variable: "csat_complaint_text",
          validation: "text",
          timeout: 86400,
          reminderDelay: 43200,
          reminderText: "Are you still there? Please type your issue so our management team can review it.",
        },
      },
      {
        id: "node_save_complaint",
        type: "save",
        position: { x: 1300, y: 250 },
        data: { label: "Save to Lead", variable: "csat_complaint_text", leadField: "escalation_notes" },
      },
      {
        id: "node_end_csat",
        type: "end",
        position: { x: 1600, y: 200 },
        data: { label: "End Session" },
      },
    ],
    edges: [
      { id: "e1", source: "node_resume_csat", target: "node_csat_menu", sourceHandle: "next" },
      { id: "e2", source: "node_csat_menu", target: "node_excellent_msg", sourceHandle: "item1" },
      { id: "e3", source: "node_csat_menu", target: "node_sorry_msg", sourceHandle: "item2" },
      { id: "e4", source: "node_csat_menu", target: "node_sorry_msg", sourceHandle: "item3" },
      { id: "e_timeout1", source: "node_csat_menu", target: "node_end_csat", sourceHandle: "timeout" },
      { id: "e5", source: "node_sorry_msg", target: "node_capture_issue", sourceHandle: "next" },
      { id: "e6", source: "node_capture_issue", target: "node_save_complaint", sourceHandle: "response" },
      { id: "e_timeout2", source: "node_capture_issue", target: "node_end_csat", sourceHandle: "timeout" },
      { id: "e7", source: "node_excellent_msg", target: "node_end_csat", sourceHandle: "next" },
      { id: "e8", source: "node_save_complaint", target: "node_end_csat", sourceHandle: "next" },
    ],
  };
}

function namespaceFlowBlueprint(botId: string, flowType: string, flowJson: any) {
  const normalizedBotId = String(botId || "").trim();
  const normalizedType = String(flowType || "flow").trim().toLowerCase() || "flow";
  const sourceNodes = Array.isArray(flowJson?.nodes) ? flowJson.nodes : [];
  const sourceEdges = Array.isArray(flowJson?.edges) ? flowJson.edges : [];
  const nodeIdMap = new Map<string, string>();

  const nodes = sourceNodes.map((node: any) => {
    const originalId = String(node?.id || "").trim();
    const nextId = originalId ? `${normalizedBotId}-${normalizedType}-${originalId}` : `${normalizedBotId}-${normalizedType}-node`;
    if (originalId) {
      nodeIdMap.set(originalId, nextId);
    }

    return {
      ...node,
      id: nextId,
    };
  });

  const edges = sourceEdges.map((edge: any, index: number) => {
    const source = String(edge?.source || "").trim();
    const target = String(edge?.target || "").trim();
    return {
      ...edge,
      id: String(edge?.id || "").trim() ? `${normalizedBotId}-${normalizedType}-${String(edge.id).trim()}` : `${normalizedBotId}-${normalizedType}-edge-${index + 1}`,
      source: nodeIdMap.get(source) || source,
      target: nodeIdMap.get(target) || target,
    };
  });

  return {
    ...(flowJson && typeof flowJson === "object" ? flowJson : {}),
    nodes,
    edges,
  };
}

function hasSystemFlow(rows: any[], flowType: "handoff" | "csat") {
  return rows.find((row) => {
    return inferSystemFlowType(row) === flowType || Boolean(row?.is_system_flow && inferSystemFlowType(row) === flowType);
  });
}

async function cloneBotFlowsForTargetBot(sourceBot: any, targetBot: any) {
  const sourceFlows = (await findAllFlowsByBot(sourceBot.id).catch(() => []))
    .filter((flow: any) => !isSystemFlowRecord(flow));
  const clonedFlows: Array<{
    sourceFlow: any;
    clonedFlow: any;
  }> = [];

  for (const sourceFlow of sourceFlows) {
    const flowType = inferSystemFlowType(sourceFlow) || "primary";
    const clonedFlow = await createFlow(
      targetBot.id,
      namespaceFlowBlueprint(
        targetBot.id,
        flowType,
        deepCloneJson(sourceFlow.flow_json || { nodes: [], edges: [] })
      ),
      sourceFlow.flow_name || "Primary Flow",
      Boolean(sourceFlow.is_default),
      Boolean(sourceFlow.is_system_flow),
      typeof sourceFlow.is_active === "boolean" ? sourceFlow.is_active : undefined,
      targetBot.workspace_id,
      targetBot.project_id
    );
    clonedFlows.push({ sourceFlow, clonedFlow });
  }

  const idMap = clonedFlows.reduce<Record<string, string>>((acc, entry) => {
    acc[String(entry.sourceFlow.id)] = String(entry.clonedFlow.id);
    return acc;
  }, {});

  for (const entry of clonedFlows) {
    const sourceFlowJson =
      entry.sourceFlow?.flow_json && typeof entry.sourceFlow.flow_json === "object"
        ? entry.sourceFlow.flow_json
        : { nodes: [], edges: [] };
    const remappedJson = remapFlowReferences(deepCloneJson(sourceFlowJson), idMap);

    if (JSON.stringify(remappedJson || {}) !== JSON.stringify(sourceFlowJson || {})) {
      await updateFlow(
        String(entry.clonedFlow.id),
        targetBot.id,
        remappedJson,
        entry.clonedFlow.flow_name || entry.sourceFlow.flow_name || "Primary Flow",
        typeof entry.sourceFlow.is_default === "boolean" ? entry.sourceFlow.is_default : undefined,
        typeof entry.sourceFlow.is_system_flow === "boolean" ? entry.sourceFlow.is_system_flow : undefined,
        typeof entry.sourceFlow.is_active === "boolean" ? entry.sourceFlow.is_active : undefined
      );
    }
  }

  return clonedFlows;
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
    const bots = await findBotsByWorkspaceProject(projectAccess.workspace_id, projectId);
    return enrichBotsWithFlowTriggers(bots);
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
  const mergedSettings = mergeSettingsSources(
    enrichedBot?.settings,
    enrichedBot?.settings_json,
    enrichedBot?.global_settings
  );
  return {
    ...enrichedBot,
    settings: mergedSettings,
    settings_json: mergedSettings,
    global_settings: mergedSettings,
  };
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

export const copyBotService = async (
  id: string,
  userId: string,
  input: {
    name?: string;
    trigger_keywords?: string;
    projectId?: string | null;
    project_id?: string | null;
  } = {}
) => {
  const existingBot = await findBotById(id);
  if (!existingBot) {
    throw { status: 404, message: "Bot not found or unauthorized" };
  }

  const sourceBot = assertWorkspaceScopedBot(existingBot);
  await assertBotWorkspacePermission(userId, sourceBot.id, WORKSPACE_PERMISSIONS.viewBots);

  const requestedProjectId =
    input.projectId !== undefined
      ? String(input.projectId || "").trim() || null
      : input.project_id !== undefined
        ? String(input.project_id || "").trim() || null
        : sourceBot.project_id || null;

  if (!requestedProjectId) {
    throw { status: 400, message: "Target project is required to copy a bot" };
  }

  const targetProject = await findProjectById(requestedProjectId);
  if (!targetProject) {
    throw { status: 404, message: "Project not found" };
  }
  if (String(targetProject.workspace_id || "") !== String(sourceBot.workspace_id || "")) {
    throw { status: 400, message: "Target project must belong to the same workspace" };
  }

  await assertProjectScopedWriteAccess({
    userId,
    projectId: requestedProjectId,
    workspaceId: sourceBot.workspace_id,
    workspacePermission: WORKSPACE_PERMISSIONS.createBots,
    allowedProjectRoles: ["project_admin", "editor"],
  });

  const clonedBot = await createScopedBot({
    userId,
    name:
      input.name !== undefined
        ? String(input.name || "").trim() || `${String(sourceBot.name || "Bot").trim()} Copy`
        : `${String(sourceBot.name || "Bot").trim()} Copy`,
    triggerKeywords:
      input.trigger_keywords !== undefined
        ? String(input.trigger_keywords || "").trim()
        : String(sourceBot.trigger_keywords || "").trim(),
    workspaceId: sourceBot.workspace_id,
    projectId: requestedProjectId,
  });

  const clonedFlows = await cloneBotFlowsForTargetBot(sourceBot, clonedBot).catch((err) => {
    console.error("Failed to clone source bot flows:", err);
    return [];
  });
  const hydratedCopy = await getBotService(clonedBot.id, userId).catch((err) => {
    console.error("Failed to hydrate cloned bot details:", err);
    return clonedBot;
  });

  await logAuditSafe({
    userId,
    workspaceId: sourceBot.workspace_id,
    projectId: requestedProjectId,
    action: "duplicate",
    entity: "bot",
    entityId: clonedBot.id,
    oldData: sourceBot,
    newData: hydratedCopy || clonedBot,
  });

  return hydratedCopy;
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

  const mergedRequestedSettings = mergeSettingsSources(
    bot.settings,
    bot.settings_json,
    bot.global_settings,
    updateData.globalSettings,
    updateData.global_settings,
    updateData.settingsJson,
    updateData.settings_json
  );
  const payloadSettings = mergedRequestedSettings;

  const payload = {
    name: updateData.name ?? bot.name,
    trigger_keywords: updateData.trigger_keywords ?? bot.trigger_keywords,
    status: nextProjectId ? updateData.status ?? bot.status : "inactive",
    workspace_id: nextWorkspaceId,
    project_id: nextProjectId,
    settings: payloadSettings,
    global_settings: payloadSettings,
    settings_json: payloadSettings,
  };

  const effectiveWorkspaceId = nextWorkspaceId || bot.workspace_id;
  if (!effectiveWorkspaceId) {
    throw { status: 400, message: "Workspace context is required" };
  }

  const updateKeys = Object.keys(updateData || {}).filter((key) => updateData[key] !== undefined);
  const isStatusOnlyUpdate =
    updateKeys.length === 1 &&
    updateKeys[0] === "status" &&
    typeof updateData.status === "string";

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

  if (isStatusOnlyUpdate) {
    const updatedStatusBot = await updateBotStatus(id, userId, String(updateData.status).trim());
    await logAuditSafe({
      userId,
      workspaceId: effectiveWorkspaceId,
      projectId: nextProjectId,
      action: "update",
      entity: "bot",
      entityId: id,
      oldData: bot,
      newData: updatedStatusBot || {},
    });
    return updatedStatusBot;
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


