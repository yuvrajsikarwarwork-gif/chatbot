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

function buildSystemSettingsBackfill(
  currentSettings: any,
  handoffFlowId: string,
  csatFlowId: string
) {
  const currentSystemMessages =
    currentSettings?.system_messages && typeof currentSettings.system_messages === "object"
      ? currentSettings.system_messages
      : {};
  const currentSystemFlows =
    currentSettings?.system_flows && typeof currentSettings.system_flows === "object"
      ? currentSettings.system_flows
      : {};

  const fallbackMessage =
    String(
      currentSystemMessages.fallback_message ||
        currentSystemMessages.fallbackMessage ||
        currentSettings?.fallback_message ||
        currentSettings?.fallbackMessage ||
        ""
    ).trim() || "I didn't quite understand that. Can you rephrase?";
  const optOutMessage =
    String(
      currentSystemMessages.opt_out_message ||
        currentSystemMessages.optOutMessage ||
        currentSettings?.opt_out_message ||
        currentSettings?.optOutMessage ||
        ""
    ).trim() || "You have been unsubscribed and will no longer receive messages.";

  const nextSettings = {
    ...currentSettings,
    system_messages: {
      ...currentSystemMessages,
      fallback_message: fallbackMessage,
      opt_out_message: optOutMessage,
    },
    system_flows: {
      ...currentSystemFlows,
      handoff_flow_id:
        String(currentSystemFlows.handoff_flow_id || currentSystemFlows.handoffFlowId || "").trim() ||
        handoffFlowId ||
        null,
      csat_flow_id:
        String(currentSystemFlows.csat_flow_id || currentSystemFlows.csatFlowId || "").trim() ||
        csatFlowId ||
        null,
      handoff_mode:
        String(
          currentSystemFlows.handoff_mode ||
            currentSystemFlows.handoffMode ||
            currentSettings?.handoff_mode ||
            currentSettings?.handoffMode ||
            ""
        ).trim() || "default",
      csat_mode:
        String(
          currentSystemFlows.csat_mode ||
            currentSystemFlows.csatMode ||
            currentSettings?.csat_mode ||
            currentSettings?.csatMode ||
            ""
        ).trim() || "default",
    },
    keyword_interrupts: Array.isArray(currentSettings?.keyword_interrupts)
      ? currentSettings.keyword_interrupts
      : Array.isArray(currentSettings?.universal_rules)
        ? currentSettings.universal_rules
        : [],
    universal_rules: Array.isArray(currentSettings?.universal_rules)
      ? currentSettings.universal_rules
      : Array.isArray(currentSettings?.keyword_interrupts)
        ? currentSettings.keyword_interrupts
        : [],
    fallback_message: fallbackMessage,
    opt_out_message: optOutMessage,
    handoff_flow_id:
      String(currentSettings?.handoff_flow_id || currentSystemFlows.handoff_flow_id || "").trim() ||
      handoffFlowId ||
      null,
    csat_flow_id:
      String(currentSettings?.csat_flow_id || currentSystemFlows.csat_flow_id || "").trim() ||
      csatFlowId ||
      null,
    handoff_mode:
      String(currentSettings?.handoff_mode || currentSystemFlows.handoff_mode || "").trim() || "default",
    csat_mode:
      String(currentSettings?.csat_mode || currentSystemFlows.csat_mode || "").trim() || "default",
  };

  return nextSettings;
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
      { id: "handoff-start", type: "start", position: { x: 120, y: 100 }, data: { label: "Start" } },
      {
        id: "handoff-ack",
        type: "message",
        position: { x: 120, y: 220 },
        data: { label: "Acknowledgment", text: "No problem. Let me get a human agent to help you out." },
      },
      {
        id: "handoff-assign",
        type: "assign_agent",
        position: { x: 120, y: 360 },
        data: { label: "Assign Agent", text: "Bot paused. An agent will be with you shortly." },
      },
      {
        id: "handoff-set-expectation",
        type: "message",
        position: { x: 120, y: 500 },
        data: {
          label: "Expectation Setting",
          text: "I've notified our team. Someone will review your chat and reply here shortly. Reply 'Cancel' to return to the bot.",
        },
      },
      { id: "handoff-end", type: "end", position: { x: 520, y: 500 }, data: { label: "End" } },
    ],
    edges: [
      { id: "handoff-e1", source: "handoff-start", target: "handoff-ack", sourceHandle: "next" },
      { id: "handoff-e2", source: "handoff-ack", target: "handoff-assign", sourceHandle: "next" },
      { id: "handoff-e3", source: "handoff-assign", target: "handoff-set-expectation", sourceHandle: "response" },
      { id: "handoff-e4", source: "handoff-set-expectation", target: "handoff-end", sourceHandle: "next" },
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
      { id: "csat-start", type: "start", position: { x: 120, y: 100 }, data: { label: "Start" } },
      {
        id: "csat-menu",
        type: "menu",
        position: { x: 120, y: 220 },
        data: {
          label: "CSAT Rating",
          text: "This conversation has been closed. How would you rate the support you received today?",
          item1: "🤩 Great",
          item2: "😐 Okay",
          item3: "😡 Bad",
        },
      },
      {
        id: "csat-save-good",
        type: "save",
        position: { x: 120, y: 360 },
        data: { label: "Save Great", variable: "last_csat_rating", value: "Great" },
      },
      {
        id: "csat-save-ok",
        type: "save",
        position: { x: 380, y: 360 },
        data: { label: "Save Okay", variable: "last_csat_rating", value: "Okay" },
      },
      {
        id: "csat-save-bad",
        type: "save",
        position: { x: 640, y: 360 },
        data: { label: "Save Bad", variable: "last_csat_rating", value: "Bad" },
      },
      { id: "csat-thanks", type: "message", position: { x: 120, y: 500 }, data: { label: "Thanks", text: "Thank you for the feedback! Have a great day." } },
      {
        id: "csat-sorry",
        type: "message",
        position: { x: 640, y: 500 },
        data: {
          label: "Apology",
          text: "We are so sorry to hear that. A manager has been notified and will review your ticket.",
        },
      },
      {
        id: "csat-risk",
        type: "save",
        position: { x: 640, y: 640 },
        data: { label: "Risk Flag", variable: "csat_risk", value: true },
      },
      { id: "csat-end", type: "end", position: { x: 360, y: 700 }, data: { label: "End" } },
    ],
    edges: [
      { id: "csat-e1", source: "csat-start", target: "csat-menu", sourceHandle: "next" },
      { id: "csat-e2", source: "csat-menu", target: "csat-save-good", sourceHandle: "item1" },
      { id: "csat-e3", source: "csat-menu", target: "csat-save-ok", sourceHandle: "item2" },
      { id: "csat-e4", source: "csat-menu", target: "csat-save-bad", sourceHandle: "item3" },
      { id: "csat-e5", source: "csat-save-good", target: "csat-thanks", sourceHandle: "next" },
      { id: "csat-e6", source: "csat-save-ok", target: "csat-thanks", sourceHandle: "next" },
      { id: "csat-e7", source: "csat-save-bad", target: "csat-sorry", sourceHandle: "next" },
      { id: "csat-e8", source: "csat-sorry", target: "csat-risk", sourceHandle: "next" },
      { id: "csat-e9", source: "csat-risk", target: "csat-end", sourceHandle: "next" },
      { id: "csat-e10", source: "csat-thanks", target: "csat-end", sourceHandle: "next" },
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

async function seedDefaultBotFlows(bot: any) {
  const scopedBot = assertWorkspaceScopedBot(bot);
  const handoffBlueprint = namespaceFlowBlueprint(scopedBot.id, "handoff", buildHandoffFlowBlueprint());
  const csatBlueprint = namespaceFlowBlueprint(scopedBot.id, "csat", buildCsatFlowBlueprint());

  const handoffFlow = await createFlow(
    scopedBot.id,
    handoffBlueprint,
    "Default Human Handoff",
    false,
    true,
    undefined,
    scopedBot.workspace_id,
    scopedBot.project_id
  );
  const csatFlow = await createFlow(
    scopedBot.id,
    csatBlueprint,
    "Default CSAT Survey",
    false,
    true,
    undefined,
    scopedBot.workspace_id,
    scopedBot.project_id
  );

  return updateWorkspaceBot(bot.id, {
    settings: {
      system_messages: {
        fallback_message: "I didn't quite understand that. Can you rephrase?",
        opt_out_message: "You have been unsubscribed and will no longer receive messages.",
      },
      system_flows: {
        handoff_flow_id: handoffFlow.id,
        csat_flow_id: csatFlow.id,
        handoff_mode: "default",
        csat_mode: "default",
      },
      keyword_interrupts: [],
    },
    global_settings: {
      system_messages: {
        fallback_message: "I didn't quite understand that. Can you rephrase?",
        opt_out_message: "You have been unsubscribed and will no longer receive messages.",
      },
      system_flows: {
        handoff_flow_id: handoffFlow.id,
        csat_flow_id: csatFlow.id,
        handoff_mode: "default",
        csat_mode: "default",
      },
      keyword_interrupts: [],
    },
    settings_json: {
      system_messages: {
        fallback_message: "I didn't quite understand that. Can you rephrase?",
        opt_out_message: "You have been unsubscribed and will no longer receive messages.",
      },
      system_flows: {
        handoff_flow_id: handoffFlow.id,
        csat_flow_id: csatFlow.id,
        handoff_mode: "default",
        csat_mode: "default",
      },
      keyword_interrupts: [],
    },
  });
}

function hasSystemFlow(rows: any[], flowType: "handoff" | "csat") {
  return rows.find((row) => {
    return inferSystemFlowType(row) === flowType || Boolean(row?.is_system_flow && inferSystemFlowType(row) === flowType);
  });
}

async function ensureDefaultSystemFlowsForBot(bot: any) {
  const scopedBot = assertWorkspaceScopedBot(bot);
  const flows = await findSystemFlowsByBot(scopedBot.id).catch(() => []);
  let handoffFlow = hasSystemFlow(flows, "handoff");
  let csatFlow = hasSystemFlow(flows, "csat");

  if (!handoffFlow) {
    handoffFlow = await createFlow(
      scopedBot.id,
      namespaceFlowBlueprint(scopedBot.id, "handoff", buildHandoffFlowBlueprint()),
      "Default Human Handoff",
      false,
      true,
      undefined,
      scopedBot.workspace_id,
      scopedBot.project_id
    );
  }

  if (!csatFlow) {
    csatFlow = await createFlow(
      scopedBot.id,
      namespaceFlowBlueprint(scopedBot.id, "csat", buildCsatFlowBlueprint()),
      "Default CSAT Survey",
      false,
      true,
      undefined,
      scopedBot.workspace_id,
      scopedBot.project_id
    );
  }

  const currentSettings = mergeSettingsSources(
    scopedBot.settings,
    scopedBot.settings_json,
    scopedBot.global_settings
  );
  const nextSettings = buildSystemSettingsBackfill(
    currentSettings,
    String(handoffFlow?.id || "").trim(),
    String(csatFlow?.id || "").trim()
  );

  if (JSON.stringify(currentSettings || {}) !== JSON.stringify(nextSettings || {})) {
    await updateWorkspaceBot(scopedBot.id, {
      settings: nextSettings,
      global_settings: nextSettings,
      settings_json: nextSettings,
    }).catch((err) => {
      console.error("Failed to backfill default system flow settings:", err);
    });
  }

  return {
    ...scopedBot,
    global_settings: nextSettings,
    settings_json: nextSettings,
  };
}

async function cloneBotFlowsForTargetBot(sourceBot: any, targetBot: any) {
  const sourceFlows = await findAllFlowsByBot(sourceBot.id).catch(() => []);
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
  const seeded = await seedDefaultBotFlows(created).catch((error) => {
    console.error("Failed to seed default bot flows:", error);
    return null;
  });
  await logAuditSafe({
    userId,
    workspaceId: resolvedWorkspaceId,
    projectId,
    action: "create",
    entity: "bot",
    entityId: created.id,
    newData: seeded || created,
  });
  return seeded || created;
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

  const hydratedSourceBot = await ensureDefaultSystemFlowsForBot(sourceBot).catch((err) => {
    console.error("Failed to hydrate source bot before copy:", err);
    return sourceBot;
  });

  const clonedBot = await createScopedBot({
    userId,
    name:
      input.name !== undefined
        ? String(input.name || "").trim() || `${String(hydratedSourceBot.name || sourceBot.name || "Bot").trim()} Copy`
        : `${String(hydratedSourceBot.name || sourceBot.name || "Bot").trim()} Copy`,
    triggerKeywords:
      input.trigger_keywords !== undefined
        ? String(input.trigger_keywords || "").trim()
        : String(hydratedSourceBot.trigger_keywords || sourceBot.trigger_keywords || "").trim(),
    workspaceId: sourceBot.workspace_id,
    projectId: requestedProjectId,
  });

  const clonedFlows = await cloneBotFlowsForTargetBot(hydratedSourceBot, clonedBot).catch((err) => {
    console.error("Failed to clone source bot flows:", err);
    return [];
  });

  const clonedHandoffFlow = clonedFlows.find(({ sourceFlow }) => inferSystemFlowType(sourceFlow) === "handoff");
  const clonedCsatFlow = clonedFlows.find(({ sourceFlow }) => inferSystemFlowType(sourceFlow) === "csat");

  const sourceSettings = mergeSettingsSources(
    hydratedSourceBot.settings,
    hydratedSourceBot.settings_json,
    hydratedSourceBot.global_settings
  );
  const nextSettings = buildSystemSettingsBackfill(
    sourceSettings,
    String(clonedHandoffFlow?.clonedFlow?.id || "").trim(),
    String(clonedCsatFlow?.clonedFlow?.id || "").trim()
  );

  await updateWorkspaceBot(clonedBot.id, {
    settings: nextSettings,
    global_settings: nextSettings,
    settings_json: nextSettings,
  }).catch((err) => {
    console.error("Failed to update cloned bot settings:", err);
  });

  const hydratedCopy = await getBotService(clonedBot.id, userId).catch((err) => {
    console.error("Failed to hydrate cloned bot details:", err);
    return {
      ...clonedBot,
      settings: nextSettings,
      settings_json: nextSettings,
      global_settings: nextSettings,
    };
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
  const hydratedBot = await ensureDefaultSystemFlowsForBot(bot).catch((err) => {
    console.error("Failed to hydrate system flows during bot update:", err);
    return bot;
  });
  const hydratedSettings = mergeSettingsSources(
    hydratedBot.settings,
    hydratedBot.settings_json,
    hydratedBot.global_settings
  );
  const payloadSettings = buildSystemSettingsBackfill(
    mergedRequestedSettings,
    String(hydratedSettings?.system_flows?.handoff_flow_id || hydratedSettings?.handoff_flow_id || "").trim(),
    String(hydratedSettings?.system_flows?.csat_flow_id || hydratedSettings?.csat_flow_id || "").trim()
  );

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
