import { findBotById } from "../models/botModel";
import {
  createFlow,
  deleteFlow,
  findFlowById,
  findFlowsByBot,
  findFlowSummariesByBot,
  findSystemFlowSummariesByBot,
  patchFlowNode,
  updateFlow,
} from "../models/flowModel";
import {
  assertBotWorkspacePermission,
  getUserPlatformRole,
  WORKSPACE_PERMISSIONS,
  resolveWorkspaceMembership,
  resolveWorkspacePermissionMap,
} from "./workspaceAccessService";
import { assertProjectScopedWriteAccess } from "./projectAccessService";
import { logAuditSafe } from "./auditLogService";
import { getEffectiveWorkspaceBilling, resolveWorkspacePlanLimit } from "./billingService";
import { getAiProvidersSettingsService } from "./platformSettingsService";
import { updateWorkspaceBot } from "../models/botModel";

// Legacy compatibility layer.
// Runtime message processing lives in flowEngine.ts.

function mergeSettingsSources(...sources: any[]) {
  return sources.reduce((acc, source) => {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      return acc;
    }
    return { ...acc, ...source };
  }, {});
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

function normalizeLegacyNodeData(nodeType: string, nodeData: any, sourceType?: string) {
  const normalizedType = String(nodeType || "").trim().toLowerCase();
  const originalType = String(sourceType || "").trim().toLowerCase();
  const data = nodeData && typeof nodeData === "object" && !Array.isArray(nodeData) ? { ...nodeData } : {};

  if (normalizedType === "input") {
    const normalizedLeadFormId = String(
      data.linkedFormId ||
        data.leadFormId ||
        data.formId ||
        data.lead_form_id ||
        ""
    ).trim();
    const normalizedFieldKey = String(
      data.linkedFieldKey ||
        data.leadField ||
        data.field ||
        ""
    ).trim();
    const isLinkedToLeadForm = Boolean(data.linkLeadForm || normalizedLeadFormId);

    if (isLinkedToLeadForm) {
      data.linkLeadForm = true;
      if (normalizedLeadFormId) {
        data.linkedFormId = normalizedLeadFormId;
        data.leadFormId = normalizedLeadFormId;
        data.formId = normalizedLeadFormId;
        data.lead_form_id = normalizedLeadFormId;
      }
      if (normalizedFieldKey) {
        data.linkedFieldKey = normalizedFieldKey;
        data.leadField = normalizedFieldKey;
        data.field = normalizedFieldKey;
      }
      if (!String(data.variable || "").trim() && normalizedFieldKey) {
        data.variable = normalizedFieldKey;
      }
    } else {
      data.linkLeadForm = false;
      if (!String(data.variable || "").trim() && normalizedFieldKey) {
        data.variable = normalizedFieldKey;
      }
      data.linkedFormId = "";
      data.leadFormId = "";
      data.formId = "";
      data.lead_form_id = "";
      data.linkedFieldKey = "";
      data.leadField = "";
      data.field = "";
    }

    data.validation = String(data.validation || "text").trim().toLowerCase() || "text";
    data.onInvalidMessage = String(data.onInvalidMessage || data.invalidMessage || "").trim();
    data.maxRetries = Number.isFinite(Number(data.maxRetries)) ? Number(data.maxRetries) : 3;
    data.timeout = Number.isFinite(Number(data.timeout)) ? Number(data.timeout) : 900;
    data.reminderDelay = Number.isFinite(Number(data.reminderDelay)) ? Number(data.reminderDelay) : 300;
    data.reminderText = String(data.reminderText || "").trim();
    data.timeoutFallback = String(data.timeoutFallback || "").trim();
    data.text = String(data.text || data.prompt || data.question || "").trim();
    return data;
  }

  if (normalizedType === "message") {
    const messageType = String(
      data.messageType ||
        data.contentType ||
        (originalType === "msg_media" ? "image" : "text")
    ).trim().toLowerCase();
    data.messageType = messageType || "text";
    if (!data.contentType) {
      data.contentType = data.messageType;
    }
    if (!String(data.text || "").trim() && String(data.caption || "").trim()) {
      data.text = String(data.caption).trim();
    }
    return data;
  }

  if (normalizedType === "menu") {
    data.menuMode = String(data.menuMode || data.menuStyle || "").trim() || "auto";
    data.buttonText = String(data.buttonText || data.button_text || "").trim();
    data.sectionTitle = String(data.sectionTitle || data.section_title || "").trim();
    for (let index = 1; index <= 10; index += 1) {
      const key = `item${index}`;
      data[key] = String(data[key] || data[`option${index}`] || "").trim();
    }
    data.timeout = Number.isFinite(Number(data.timeout)) ? Number(data.timeout) : 900;
    data.reminderDelay = Number.isFinite(Number(data.reminderDelay)) ? Number(data.reminderDelay) : 300;
    data.reminderText = String(data.reminderText || "").trim();
    data.timeoutFallback = String(data.timeoutFallback || "").trim();
    return data;
  }

  if (normalizedType === "save") {
    const variable = String(data.variable || data.field || data.leadField || data.targetVariable || "").trim();
    const leadField = String(data.leadField || data.field || data.variable || "").trim();
    data.variable = variable;
    data.leadField = leadField;
    data.field = leadField || variable;
    data.value = data.value ?? data.output ?? "";
    return data;
  }

  if (normalizedType === "condition") {
    data.variable = String(data.variable || data.field || "").trim();
    data.operator = String(data.operator || data.compareOperator || "equals").trim().toLowerCase() || "equals";
    if (data.value === undefined && data.compareValue !== undefined) {
      data.value = data.compareValue;
    }
    return data;
  }

  if (normalizedType === "api") {
    data.method = String(data.method || data.httpMethod || "GET").trim().toUpperCase() || "GET";
    data.url = String(data.url || data.endpoint || data.apiUrl || "").trim();
    data.saveTo = String(data.saveTo || data.save_to || "").trim();
    data.statusSaveTo = String(data.statusSaveTo || data.status_save_to || "").trim();
    data.timeoutMs = Number.isFinite(Number(data.timeoutMs)) ? Number(data.timeoutMs) : 10000;
    return data;
  }

  if (normalizedType === "goto") {
    data.gotoType = String(data.gotoType || data.goto_type || "node").trim().toLowerCase() || "node";
    data.targetNode = String(data.targetNode || data.target_node || "").trim();
    data.targetFlowId = String(data.targetFlowId || data.target_flow_id || "").trim();
    data.targetBotId = String(data.targetBotId || data.target_bot_id || "").trim();
    return data;
  }

  if (normalizedType === "ai_generate") {
    data.provider = String(data.provider || data.aiProvider || "auto").trim().toLowerCase() || "auto";
    data.model = String(data.model || data.aiModel || "").trim();
    data.prompt = String(data.prompt || data.text || "").trim();
    data.saveTo = String(data.saveTo || data.outputVariable || "ai_output").trim() || "ai_output";
    data.style = String(data.style || data.tone || "").trim();
    return data;
  }

  if (normalizedType === "business_hours") {
    data.timezone = String(data.timezone || "Asia/Kolkata").trim() || "Asia/Kolkata";
    data.days = String(data.days || data.daysCsv || "mon,tue,wed,thu,fri").trim();
    data.startTime = String(data.startTime || data.openTime || "09:00").trim();
    data.endTime = String(data.endTime || data.closeTime || "17:00").trim();
    data.closedMessage = String(data.closedMessage || data.closed_message || "").trim();
    return data;
  }

  if (normalizedType === "split_traffic") {
    data.percentA = Number.isFinite(Number(data.percentA)) ? Number(data.percentA) : 50;
    data.percentB = Number.isFinite(Number(data.percentB)) ? Number(data.percentB) : 50;
    data.routeALabel = String(data.routeALabel || data.variantALabel || "Variant A").trim() || "Variant A";
    data.routeBLabel = String(data.routeBLabel || data.variantBLabel || "Variant B").trim() || "Variant B";
    return data;
  }

  return data;
}

function looksLikeLegacyInputNode(nodeType: string, nodeData: any) {
  const normalizedType = String(nodeType || "").trim().toLowerCase();
  const data = nodeData && typeof nodeData === "object" && !Array.isArray(nodeData) ? nodeData : {};
  const promptText = String(
    data.prompt ||
      data.question ||
      data.text ||
      data.questionLabel ||
      ""
  ).trim();
  const hasSaveValue = Boolean(String(data.value || data.output || "").trim());
  const hasLeadLink = Boolean(
    data.linkLeadForm ||
      data.linkedFormId ||
      data.leadFormId ||
      data.formId ||
      data.lead_form_id ||
      data.linkedFieldKey ||
      data.leadField ||
      data.field
  );

  return (
    normalizedType === "lead_form" ||
    (normalizedType === "save" && !hasSaveValue && (promptText.length > 0 || hasLeadLink))
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

  return {
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
}

const FLOW_NODE_TYPES = new Set([
  "start",
  "message",
  "msg_text",
  "msg_media",
  "send_template",
  "input",
  "menu",
  "menu_button",
  "menu_list",
  "knowledge_lookup",
  "ai_generate",
  "condition",
  "split_traffic",
  "business_hours",
  "api",
  "save",
  "reminder",
  "delay",
  "assign_agent",
  "goto",
  "end",
]);

function normalizeNodeType(type: unknown, nodeData?: any) {
  const normalized = String(type || "").trim().toLowerCase();
  if (["message", "msg_text", "msg_media"].includes(normalized)) {
    return "message";
  }
  if (["menu", "menu_button", "menu_list"].includes(normalized)) {
    return "menu";
  }
  if (looksLikeLegacyInputNode(normalized, nodeData)) {
    return "input";
  }
  return normalized;
}

export function normalizeFlowJson(flowJson: any) {
  const nodes = Array.isArray(flowJson?.nodes)
    ? flowJson.nodes.map((node: any) => {
        const normalizedType = normalizeNodeType(node?.type, node?.data);
        return {
          ...node,
          type: normalizedType,
          data: normalizeLegacyNodeData(normalizedType, node?.data, node?.type),
        };
    })
    : [];

  return {
    ...(flowJson && typeof flowJson === "object" ? flowJson : {}),
    nodes,
    edges: Array.isArray(flowJson?.edges) ? flowJson.edges : [],
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

async function ensureDefaultSystemFlowsForBot(bot: any) {
  const flows = await findFlowsByBot(bot.id).catch(() => []);
  const findExisting = (flowType: "handoff" | "csat") =>
    flows.find((row: any) => {
      return inferSystemFlowType(row) === flowType;
    });

  const currentSettings = mergeSettingsSources(bot.settings, bot.settings_json, bot.global_settings);

  let handoffFlow = findExisting("handoff");
  let csatFlow = findExisting("csat");

  if (!handoffFlow) {
    handoffFlow = await createFlow(
      bot.id,
      namespaceFlowBlueprint(bot.id, "handoff", {
        system_flow_type: "handoff",
        is_global_flow: true,
        is_system_flow: true,
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
      }),
      "Default Human Handoff",
      false,
      true,
      undefined,
      bot.workspace_id,
      bot.project_id
    );
  }

  if (!csatFlow) {
    csatFlow = await createFlow(
      bot.id,
      namespaceFlowBlueprint(bot.id, "csat", {
        system_flow_type: "csat",
        is_global_flow: true,
        is_system_flow: true,
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
      }),
      "Default CSAT Survey",
      false,
      true,
      undefined,
      bot.workspace_id,
      bot.project_id
    );
  }

  const nextSettings = buildSystemSettingsBackfill(
    currentSettings,
    String(handoffFlow?.id || "").trim(),
    String(csatFlow?.id || "").trim()
  );

  if (JSON.stringify(currentSettings || {}) !== JSON.stringify(nextSettings || {})) {
    await updateWorkspaceBot(bot.id, {
      settings: nextSettings,
      global_settings: nextSettings,
      settings_json: nextSettings,
    }).catch((err) => {
      console.error("Failed to backfill default system flow settings from flow service:", err);
    });
  }

  return {
    ...bot,
    global_settings: nextSettings,
    settings_json: nextSettings,
  };
}

async function validateGotoNodeConfiguration(botId: string, node: any) {
  const gotoType = String(node?.data?.gotoType || "node").trim().toLowerCase();
  if (gotoType === "node") {
    return;
  }

  if (gotoType === "flow") {
    const targetFlowId = String(node?.data?.targetFlowId || "").trim();
    if (!targetFlowId) {
      throw {
        status: 400,
        message: "Go To flow nodes require a target flow.",
      };
    }

    const targetFlow = await findFlowById(targetFlowId);
    if (!targetFlow || String(targetFlow.bot_id) !== String(botId)) {
      throw {
        status: 400,
        message: "Go To flow targets must belong to the same bot.",
      };
    }

    return;
  }

  if (gotoType === "bot") {
    const targetBotId = String(node?.data?.targetBotId || "").trim();
    if (!targetBotId) {
      throw {
        status: 400,
        message: "Go To bot nodes require a target bot.",
      };
    }

    const currentBot = await findBotById(botId);
    const targetBot = await findBotById(targetBotId);
    if (!currentBot || !targetBot) {
      throw {
        status: 400,
        message: "Go To bot target could not be found.",
      };
    }

    if (String(currentBot.workspace_id || "") !== String(targetBot.workspace_id || "")) {
      throw {
        status: 400,
        message: "Go To bot targets must stay inside the same workspace.",
      };
    }

    const targetFlowId = String(node?.data?.targetFlowId || "").trim();
    if (targetFlowId) {
      const targetFlow = await findFlowById(targetFlowId);
      if (!targetFlow || String(targetFlow.bot_id) !== String(targetBotId)) {
        throw {
          status: 400,
          message: "Selected handoff flow does not belong to the target bot.",
        };
      }
    }

    return;
  }

  throw {
    status: 400,
    message: `Unsupported Go To routing mode '${gotoType}'.`,
  };
}

async function getFlowBuilderCapabilitiesInternal(botId: string, userId: string) {
  const bot = await findBotById(botId);
  if (!bot) {
    throw { status: 404, message: "Bot not found" };
  }

  await assertBotWorkspacePermission(userId, bot.id, WORKSPACE_PERMISSIONS.viewFlows);

  const workspaceId = String(bot.workspace_id || "").trim();
  const membership = workspaceId
    ? await resolveWorkspaceMembership(userId, workspaceId)
    : null;
  const permissionMap =
    workspaceId && membership
      ? await resolveWorkspacePermissionMap(userId, workspaceId, membership.role, membership)
      : {};
  const platformRole = await getUserPlatformRole(userId);
  const hasExplicitAiPermission = Object.prototype.hasOwnProperty.call(
    permissionMap,
    WORKSPACE_PERMISSIONS.useAiNodes
  );
  const canUseAiNodesByPermission = hasExplicitAiPermission
    ? Boolean((permissionMap as Record<string, boolean>)[WORKSPACE_PERMISSIONS.useAiNodes])
    : platformRole === "developer" || platformRole === "super_admin"
      ? true
    : Boolean(
        (permissionMap as Record<string, boolean>)[WORKSPACE_PERMISSIONS.editWorkflow] ||
          (permissionMap as Record<string, boolean>)[WORKSPACE_PERMISSIONS.createFlow]
      );

  const aiProviders = await getAiProvidersSettingsService().catch(() => null);
  const aiConfigured = Boolean(
    aiProviders?.status?.openaiConfigured || aiProviders?.status?.geminiConfigured
  );
  const billing = workspaceId ? await getEffectiveWorkspaceBilling(workspaceId).catch(() => null) : null;
  const aiReplyLimit = billing
    ? resolveWorkspacePlanLimit(
        billing.workspace,
        billing.plan,
        billing.subscription,
        "ai_reply_limit",
        null
      )
    : null;

  const disabledReasons: Record<string, string> = {};
  const allowedNodeTypes = new Set(FLOW_NODE_TYPES);

  if (!canUseAiNodesByPermission) {
    allowedNodeTypes.delete("knowledge_lookup");
    disabledReasons.knowledge_lookup = "AI node permission is disabled for this workspace role";
    allowedNodeTypes.delete("ai_generate");
    disabledReasons.ai_generate = "AI node permission is disabled for this workspace role";
  } else if (!aiConfigured) {
    allowedNodeTypes.delete("knowledge_lookup");
    disabledReasons.knowledge_lookup = "AI provider settings are not configured yet";
    allowedNodeTypes.delete("ai_generate");
    disabledReasons.ai_generate = "AI provider settings are not configured yet";
  } else if (aiReplyLimit !== null && Number(aiReplyLimit) <= 0) {
    allowedNodeTypes.delete("knowledge_lookup");
    disabledReasons.knowledge_lookup = "This workspace plan does not include AI reply usage";
    allowedNodeTypes.delete("ai_generate");
    disabledReasons.ai_generate = "This workspace plan does not include AI reply usage";
  }

  return {
    botId,
    workspaceId: workspaceId || null,
    allowedNodeTypes: [...allowedNodeTypes],
    disabledReasons,
    flags: {
      aiConfigured,
      canUseAiNodesByPermission,
      aiReplyLimit,
    },
  };
}

async function validateFlowJsonAgainstCapabilities(
  flowJson: any,
  botId: string,
  capabilities: { allowedNodeTypes: string[]; disabledReasons: Record<string, string> }
) {
  const normalized = normalizeFlowJson(flowJson);
  const allowedNodeTypes = new Set(capabilities.allowedNodeTypes);

  for (const node of normalized.nodes) {
    const type = normalizeNodeType(node?.type, node?.data);
    if (!FLOW_NODE_TYPES.has(type)) {
      throw { status: 400, message: `Unsupported workflow node type '${type || "unknown"}'.` };
    }
    if (type === "goto") {
      await validateGotoNodeConfiguration(botId, node);
    }
    if (!allowedNodeTypes.has(type)) {
      throw {
        status: 403,
        message:
          capabilities.disabledReasons[type] ||
          `Workflow node '${type}' is not available for this workspace.`,
      };
    }
  }

  return normalized;
}

export async function getFlowBuilderCapabilitiesService(botId: string, userId: string) {
  return getFlowBuilderCapabilitiesInternal(botId, userId);
}

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
  return findFlowSummariesByBot(botId).then((rows) =>
    rows.map((row: any) => {
      const flowJson = row?.flow_json && typeof row.flow_json === "object" ? row.flow_json : {};
      const systemFlowType = inferSystemFlowType(row) || null;
      return {
        ...row,
        system_flow_type: systemFlowType,
        is_system_flow: Boolean(
          row?.is_system_flow ||
            systemFlowType ||
            flowJson.is_global_flow ||
            flowJson.isGlobalFlow ||
            flowJson.global_flow
        ),
        is_global_flow: Boolean(
          systemFlowType ||
            flowJson.is_global_flow ||
            flowJson.isGlobalFlow ||
            flowJson.global_flow
        ),
      };
    })
  );
}

export async function getSystemFlowSummariesByBotService(botId: string, userId: string) {
  const bot = await assertBotWorkspacePermission(
    userId,
    botId,
    WORKSPACE_PERMISSIONS.viewFlows
  );
  return findSystemFlowSummariesByBot(botId).then((rows) =>
    rows.map((row: any) => {
      const flowJson = row?.flow_json && typeof row.flow_json === "object" ? row.flow_json : {};
      const systemFlowType = inferSystemFlowType(row) || null;
      return {
        ...row,
        system_flow_type: systemFlowType,
        is_system_flow: Boolean(
          row?.is_system_flow ||
            systemFlowType ||
            flowJson.is_global_flow ||
            flowJson.isGlobalFlow ||
            flowJson.global_flow
        ),
        is_global_flow: Boolean(
          systemFlowType ||
            flowJson.is_global_flow ||
            flowJson.isGlobalFlow ||
            flowJson.global_flow
        ),
      };
    })
  );
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

  const flowJson = flow?.flow_json && typeof flow.flow_json === "object" ? flow.flow_json : {};
  const systemFlowType = inferSystemFlowType(flow) || null;
  return {
    ...flow,
    system_flow_type: systemFlowType,
    is_system_flow: Boolean(
      flow?.is_system_flow ||
        systemFlowType ||
        flowJson.is_global_flow ||
        flowJson.isGlobalFlow ||
        flowJson.global_flow
    ),
    is_global_flow: Boolean(
      systemFlowType ||
        flowJson.is_global_flow ||
        flowJson.isGlobalFlow ||
        flowJson.global_flow
    ),
  };
}

export async function saveFlowService(
  botId: string,
  userId: string,
  flowJson: any,
  flowId?: string,
  flowName?: string
) {
  const capabilities = await getFlowBuilderCapabilitiesInternal(botId, userId);
  const normalizedFlowJson = await validateFlowJsonAgainstCapabilities(flowJson, botId, capabilities);
  const bot = await assertBotWorkspacePermission(
    userId,
    botId,
    WORKSPACE_PERMISSIONS.editWorkflow
  );
  if (bot.project_id) {
    await assertProjectScopedWriteAccess({
      userId,
      projectId: String(bot.project_id || ""),
      workspaceId: bot.workspace_id,
      workspacePermission: WORKSPACE_PERMISSIONS.editWorkflow,
      allowedProjectRoles: ["project_admin", "editor"],
    });
  }

  if (flowId) {
    const existing = await findFlowById(flowId);
    if (!existing || existing.bot_id !== botId) {
      throw { status: 404, message: "Flow not found" };
    }

    const updated = await updateFlow(flowId, botId, normalizedFlowJson, flowName);
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
    const updated = await updateFlow(defaultFlow.id, botId, normalizedFlowJson, flowName);
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

  return null;
}

export async function createNewFlowService(
  botId: string,
  userId: string,
  flowJson: any,
  flowName?: string,
  isDefault = false
) {
  const capabilities = await getFlowBuilderCapabilitiesInternal(botId, userId);
  const normalizedFlowJson = await validateFlowJsonAgainstCapabilities(flowJson, botId, capabilities);
  const bot = await assertBotWorkspacePermission(
    userId,
    botId,
    WORKSPACE_PERMISSIONS.createFlow
  );
  if (bot.project_id) {
    await assertProjectScopedWriteAccess({
      userId,
      projectId: String(bot.project_id || ""),
      workspaceId: bot.workspace_id,
      workspacePermission: WORKSPACE_PERMISSIONS.createFlow,
      allowedProjectRoles: ["project_admin", "editor"],
    });
  }

  const created = await createFlow(
    botId,
    normalizedFlowJson,
    flowName,
    isDefault,
    false,
    undefined,
    bot.workspace_id,
    bot.project_id
  );
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

  const capabilities = await getFlowBuilderCapabilitiesInternal(flow.bot_id, userId);
  const normalizedFlowJson = await validateFlowJsonAgainstCapabilities(flowJson, flow.bot_id, capabilities);

  const bot = await findBotById(flow.bot_id);
  if (!bot) {
    throw { status: 404, message: "Flow not found" };
  }
  await assertBotWorkspacePermission(userId, bot.id, WORKSPACE_PERMISSIONS.editWorkflow);
  if (bot.project_id) {
    await assertProjectScopedWriteAccess({
      userId,
      projectId: String(bot.project_id || ""),
      workspaceId: bot.workspace_id,
      workspacePermission: WORKSPACE_PERMISSIONS.editWorkflow,
      allowedProjectRoles: ["project_admin", "editor"],
    });
  }

  const updated = await updateFlow(id, bot.id, normalizedFlowJson, flowName, isDefault);
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

export async function patchFlowNodeService(
  flowId: string,
  userId: string,
  nodeId: string,
  nodeData: any,
  requestId = "unknown"
) {
  console.info(`[NodeSave][Service][${requestId}] loading-flow`, {
    flowId,
    nodeId,
    userId,
  });
  const flow = await findFlowById(flowId);
  if (!flow) {
    throw { status: 404, message: "Flow not found" };
  }

  const bot = await findBotById(flow.bot_id);
  if (!bot) {
    throw { status: 404, message: "Flow not found" };
  }

  await assertBotWorkspacePermission(userId, bot.id, WORKSPACE_PERMISSIONS.editWorkflow);
  if (bot.project_id) {
    await assertProjectScopedWriteAccess({
      userId,
      projectId: String(bot.project_id || ""),
      workspaceId: bot.workspace_id,
      workspacePermission: WORKSPACE_PERMISSIONS.editWorkflow,
      allowedProjectRoles: ["project_admin", "editor"],
    });
  }

  const rawFlowJson = flow?.flow_json && typeof flow.flow_json === "object" ? flow.flow_json : {};
  const rawNodes = Array.isArray(rawFlowJson.nodes) ? rawFlowJson.nodes : [];
  const nodeIndex = rawNodes.findIndex((node: any) => String(node?.id || "") === String(nodeId));

  const flowJson = normalizeFlowJson(rawFlowJson);
  const normalizedNodeIndex = Array.isArray(flowJson.nodes)
    ? flowJson.nodes.findIndex((node: any) => String(node?.id || "") === String(nodeId))
    : -1;

  if (nodeIndex < 0 || normalizedNodeIndex < 0) {
    throw { status: 404, message: "Node not found" };
  }

  const currentNode = flowJson.nodes[normalizedNodeIndex] || {};
  const rawCurrentNode = rawNodes[nodeIndex] || currentNode;
  const incomingPatch =
    nodeData && typeof nodeData === "object" && !Array.isArray(nodeData)
      ? nodeData
      : {};
  const isWholeNodePatch = Boolean(
    incomingPatch &&
      typeof incomingPatch === "object" &&
      !Array.isArray(incomingPatch) &&
      ("data" in incomingPatch ||
        "position" in incomingPatch ||
        "type" in incomingPatch ||
        "id" in incomingPatch)
  );
  const currentNodeData =
    currentNode?.data && typeof currentNode.data === "object" && !Array.isArray(currentNode.data)
      ? currentNode.data
      : {};
  const incomingNodeData = isWholeNodePatch
    ? incomingPatch?.data && typeof incomingPatch.data === "object" && !Array.isArray(incomingPatch.data)
      ? incomingPatch.data
      : {}
    : incomingPatch;
  const mergedNodeData = {
    ...currentNodeData,
    ...incomingNodeData,
  };
  const nextNodeType = normalizeNodeType(
    (isWholeNodePatch ? incomingPatch.type : undefined) || currentNode.type,
    mergedNodeData
  );
  const nextNode = {
    ...currentNode,
    ...(isWholeNodePatch ? incomingPatch : {}),
    id: String(nodeId),
    type: nextNodeType,
    data: normalizeLegacyNodeData(
      nextNodeType,
      mergedNodeData,
      rawCurrentNode?.type || currentNode.type
    ),
  };

  console.info(`[NodeSave][Service][${requestId}] normalized-node-ready`, {
    flowId,
    nodeId,
    currentType: currentNode?.type || null,
    nextType: nextNodeType,
    isWholeNodePatch,
    mergedDataKeys: Object.keys(mergedNodeData || {}),
    label: nextNode?.data?.label || null,
  });

  const updated = await patchFlowNode(flowId, nodeId, nextNode, flow.flow_name, requestId);
  console.info(`[NodeSave][Service][${requestId}] database-patch-succeeded`, {
    flowId,
    nodeId,
    savedFlowId: updated?.id || null,
  });

  await logAuditSafe({
    userId,
    workspaceId: bot.workspace_id,
    projectId: bot.project_id,
    action: "update",
    entity: "flow_node",
    entityId: `${flowId}:${nodeId}`,
    oldData: currentNode as unknown as Record<string, unknown>,
    newData: nextNode as unknown as Record<string, unknown>,
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
  if (bot.project_id) {
    await assertProjectScopedWriteAccess({
      userId,
      projectId: String(bot.project_id || ""),
      workspaceId: bot.workspace_id,
      workspacePermission: WORKSPACE_PERMISSIONS.deleteFlow,
      allowedProjectRoles: ["project_admin"],
    });
  }

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
