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
import { mergeSettingsSources } from "../utils/settingsUtils";

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

  if (normalizedType === "ai_intent") {
    const normalizeHandle = (value: any) =>
      String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");

    const rawIntents = Array.isArray(data.intents) ? data.intents : [];
    const seenHandles = new Set<string>();
    data.intents = rawIntents
      .map((intent: any, index: number) => {
        const handle = normalizeHandle(intent?.handle || intent?.value || `intent_${index + 1}`);
        if (!handle || seenHandles.has(handle)) {
          return null;
        }
        seenHandles.add(handle);
        return {
          handle,
          label: String(intent?.label || intent?.name || handle).trim(),
          description: String(intent?.description || intent?.prompt || "").trim(),
        };
      })
      .filter(Boolean);
    data.provider = String(data.provider || data.aiProvider || "auto").trim().toLowerCase() || "auto";
    data.model = String(data.model || data.aiModel || "").trim();
    data.prompt = String(data.prompt || data.systemPrompt || data.instructions || "").trim();
    data.saveTo = String(data.saveTo || data.outputVariable || "detected_intent").trim() || "detected_intent";
    data.fallback = normalizeHandle(data.fallback || data.fallbackHandle || "fallback") || "fallback";
    data.text = String(data.text || "Thinking...").trim();
    return data;
  }

  if (normalizedType === "ai_extract") {
    const normalizeField = (field: any) => ({
      key: String(field?.key || field?.name || "").trim(),
      type: String(field?.type || "string").trim().toLowerCase() || "string",
      description: String(field?.description || field?.prompt || "").trim(),
    });

    const normalizeFieldList = (fields: any[]) =>
      (Array.isArray(fields) ? fields : [])
        .map(normalizeField)
        .filter((field) => Boolean(field.key));

    const requiredFields = normalizeFieldList(data.requiredFields);
    const optionalFields = normalizeFieldList(data.optionalFields);
    const fallbackFields = requiredFields.length + optionalFields.length > 0 ? [] : normalizeFieldList(data.fields);
    const seen = new Set<string>();
    const dedupe = (fields: Array<{ key: string; type: string; description: string }>) =>
      fields.filter((field) => {
        const key = String(field.key || "").trim();
        if (!key || seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });

    const normalizedRequiredFields = dedupe(requiredFields);
    const normalizedOptionalFields = dedupe(optionalFields);
    const normalizedFallbackFields = dedupe(fallbackFields);

    data.requiredFields = normalizedRequiredFields.length > 0 ? normalizedRequiredFields.map((field) => ({ ...field, required: true })) : normalizedFallbackFields.map((field) => ({ ...field, required: true }));
    data.optionalFields = normalizedOptionalFields.map((field) => ({ ...field, required: false }));
    data.fields = dedupe([...normalizedRequiredFields, ...normalizedOptionalFields, ...normalizedFallbackFields]);
    data.provider = String(data.provider || data.aiProvider || "auto").trim().toLowerCase() || "auto";
    data.model = String(data.model || data.aiModel || "").trim();
    data.prompt = String(data.prompt || data.systemPrompt || data.instructions || "").trim();
    data.text = String(data.text || "Updating...").trim();
    data.minConfidence = Number.isFinite(Number(data.minConfidence)) ? Number(data.minConfidence) : 0.7;
    data.onIncomplete = String(data.onIncomplete || "incomplete").trim().toLowerCase() || "incomplete";
    data.saveConfidenceTo = String(data.saveConfidenceTo || data.confidenceVariable || "").trim();
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
  "ai_intent",
  "ai_extract",
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
  "trigger",
  "error_handler",
  "resume_bot",
  "timeout",
  "lead_form",
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

function validateFlowTopology(flowJson: any) {
  const nodes = Array.isArray(flowJson?.nodes) ? flowJson.nodes : [];
  const edges = Array.isArray(flowJson?.edges) ? flowJson.edges : [];
  const incomingByNode = new Map<string, any[]>();
  const outgoingByNode = new Map<string, any[]>();

  for (const node of nodes) {
    const nodeId = String(node?.id || "").trim();
    if (!nodeId) continue;
    incomingByNode.set(nodeId, []);
    outgoingByNode.set(nodeId, []);
  }

  for (const edge of edges) {
    const sourceId = String(edge?.source || "").trim();
    const targetId = String(edge?.target || "").trim();
    if (sourceId && outgoingByNode.has(sourceId)) {
      outgoingByNode.get(sourceId)!.push(edge);
    }
    if (targetId && incomingByNode.has(targetId)) {
      incomingByNode.get(targetId)!.push(edge);
    }
  }

  const markInvalid = (nodeId: string, reason: string) => {
    const error = new Error(reason) as any;
    error.status = 400;
    error.message = reason;
    error.nodeId = nodeId;
    throw error;
  };

  const hasOutgoingHandle = (nodeId: string, handleId: string) =>
    (outgoingByNode.get(nodeId) || []).some((edge) => String(edge?.sourceHandle || "") === handleId);

  const visibleMenuOptions = (node: any) =>
    Array.from({ length: 10 }, (_, index) => {
      const num = index + 1;
      return String(node?.data?.[`item${num}`] || "").trim();
    }).filter(Boolean);

  const startNodes = nodes.filter((node: any) => normalizeNodeType(node?.type, node?.data) === "start");
  if (startNodes.length > 1) {
    markInvalid(String(startNodes[1]?.id || ""), "Flows can only have one Start node.");
  }

  for (const node of nodes) {
    const nodeId = String(node?.id || "").trim();
    if (!nodeId) continue;

    const nodeType = normalizeNodeType(node?.type, node?.data);
    if (["reminder", "timeout", "error_handler"].includes(nodeType)) {
      continue;
    }

    const incomingCount = (incomingByNode.get(nodeId) || []).length;
    const outgoingCount = (outgoingByNode.get(nodeId) || []).length;

    if (nodeType === "start") {
      if (incomingCount > 0) {
        markInvalid(nodeId, "Start nodes cannot have incoming connections.");
      }
      if (outgoingCount !== 1) {
        markInvalid(nodeId, "Start nodes must have exactly one outgoing connection.");
      }
      continue;
    }

    if (nodeType === "trigger") {
      if (incomingCount > 0) {
        markInvalid(nodeId, "Trigger nodes cannot have incoming connections.");
      }
      if (outgoingCount !== 1) {
        markInvalid(nodeId, "Trigger nodes must have exactly one outgoing connection.");
      }
      continue;
    }

    if (nodeType === "end") {
      if (incomingCount === 0) {
        markInvalid(nodeId, "End nodes need an incoming connection.");
      }
      if (outgoingCount > 0) {
        markInvalid(nodeId, "End nodes cannot have outgoing connections.");
      }
      continue;
    }

    if (nodeType === "condition") {
      if (incomingCount === 0) {
        markInvalid(nodeId, "Condition nodes need an incoming connection.");
      }
      const missingBranches = ["true", "false"].filter((handleId) => !hasOutgoingHandle(nodeId, handleId));
      if (missingBranches.length > 0) {
        markInvalid(nodeId, "Condition nodes need both True and False branches.");
      }
      continue;
    }

    if (nodeType === "menu") {
      if (incomingCount === 0) {
        markInvalid(nodeId, "Menu nodes need an incoming connection.");
      }
      const options = visibleMenuOptions(node);
      if (options.length === 0) {
        markInvalid(nodeId, "Menu nodes need at least one option.");
      }
      const missingItems = options
        .map((_, index) => `item${index + 1}`)
        .filter((handleId) => !hasOutgoingHandle(nodeId, handleId));
      if (missingItems.length > 0) {
        markInvalid(nodeId, "Connect every visible menu option before saving.");
      }
      continue;
    }

    if (nodeType === "input") {
      if (incomingCount === 0) {
        markInvalid(nodeId, "Input nodes need an incoming connection.");
      }
      if (!hasOutgoingHandle(nodeId, "response")) {
        markInvalid(nodeId, "Input nodes need a Response connection.");
      }
      continue;
    }

    if (nodeType === "business_hours") {
      if (incomingCount === 0) {
        markInvalid(nodeId, "Business hours nodes need an incoming connection.");
      }
      const missing = ["open", "closed"].filter((handleId) => !hasOutgoingHandle(nodeId, handleId));
      if (missing.length > 0) {
        markInvalid(nodeId, "Business hours nodes need Open and Closed outputs.");
      }
      continue;
    }

    if (nodeType === "split_traffic") {
      if (incomingCount === 0) {
        markInvalid(nodeId, "Split traffic nodes need an incoming connection.");
      }
      const missing = ["a", "b"].filter((handleId) => !hasOutgoingHandle(nodeId, handleId));
      if (missing.length > 0) {
        markInvalid(nodeId, "Split traffic nodes need both Variant A and Variant B outputs.");
      }
      continue;
    }

    if (nodeType === "api") {
      if (incomingCount === 0) {
        markInvalid(nodeId, "API nodes need an incoming connection.");
      }
      const missing = ["success", "error"].filter((handleId) => !hasOutgoingHandle(nodeId, handleId));
      if (missing.length > 0) {
        markInvalid(nodeId, "API nodes need both Success and Error outputs.");
      }
      continue;
    }

    if (nodeType === "ai_generate") {
      if (incomingCount === 0) {
        markInvalid(nodeId, "AI generate nodes need an incoming connection.");
      }
      if (outgoingCount === 0) {
        markInvalid(nodeId, "AI generate nodes need an outgoing connection.");
      }
      continue;
    }

    if (nodeType === "ai_intent") {
      if (incomingCount === 0) {
        markInvalid(nodeId, "AI intent nodes need an incoming connection.");
        continue;
      }

      const intents = Array.isArray(node?.data?.intents) ? node.data.intents : [];
      const normalizeHandle = (value: any) =>
        String(value || "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "_")
          .replace(/[^a-z0-9_]/g, "")
          .replace(/_+/g, "_")
          .replace(/^_+|_+$/g, "");

      const handles = intents
        .map((intent: any, index: number) => normalizeHandle(intent?.handle || intent?.value || `intent_${index + 1}`))
        .filter(Boolean);
      const uniqueHandles = Array.from(new Set(handles));
      const fallbackHandle = normalizeHandle(node?.data?.fallback || "fallback") || "fallback";

      if (uniqueHandles.length === 0) {
        markInvalid(nodeId, "AI intent nodes need at least one intent branch.");
        continue;
      }

      if (uniqueHandles.length !== handles.length) {
        markInvalid(nodeId, "AI intent handles must be unique.");
        continue;
      }

      for (const handle of uniqueHandles) {
        if (!hasOutgoingHandle(nodeId, String(handle))) {
          markInvalid(nodeId, "Connect every AI intent branch before saving.");
          break;
        }
      }

      if (fallbackHandle && !hasOutgoingHandle(nodeId, String(fallbackHandle))) {
        markInvalid(nodeId, "AI intent nodes need a fallback connection.");
      }
      continue;
    }

    if (nodeType === "ai_extract") {
      if (incomingCount === 0) {
        markInvalid(nodeId, "AI extract nodes need an incoming connection.");
        continue;
      }

      const requiredFields = Array.isArray(node?.data?.requiredFields) && node.data.requiredFields.length
        ? node.data.requiredFields
        : Array.isArray(node?.data?.fields)
          ? node.data.fields
          : [];
      const optionalFields = Array.isArray(node?.data?.optionalFields) ? node.data.optionalFields : [];
      const allFields = [...requiredFields, ...optionalFields];
      const seenKeys = new Set<string>();
      const normalizeKey = (value: any) =>
        String(value || "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "_")
          .replace(/[^a-z0-9_]/g, "")
          .replace(/_+/g, "_")
          .replace(/^_+|_+$/g, "");

      const uniqueKeys = allFields
        .map((field: any, index: number) => normalizeKey(field?.key || field?.name || `field_${index + 1}`))
        .filter(Boolean);
      const duplicateKeys = uniqueKeys.filter((key) => {
        if (seenKeys.has(key)) {
          return true;
        }
        seenKeys.add(key);
        return false;
      });

      if (uniqueKeys.length === 0) {
        markInvalid(nodeId, "AI extract nodes need at least one field.");
        continue;
      }

      if (duplicateKeys.length > 0) {
        markInvalid(nodeId, "AI extract field keys must be unique.");
        continue;
      }

      if (!hasOutgoingHandle(nodeId, "next")) {
        markInvalid(nodeId, "AI extract nodes need a success connection.");
      }

      const incompleteHandle = String(node?.data?.onIncomplete || "incomplete").trim().toLowerCase() || "incomplete";
      if (!hasOutgoingHandle(nodeId, incompleteHandle)) {
        markInvalid(nodeId, "AI extract nodes need an incomplete connection.");
      }
      continue;
    }

    if (incomingCount === 0) {
      markInvalid(nodeId, `${String(node?.data?.label || node?.data?.text || node?.type || nodeId).trim()} needs an incoming connection.`);
    }
    if (outgoingCount === 0) {
      markInvalid(nodeId, `${String(node?.data?.label || node?.data?.text || node?.type || nodeId).trim()} needs an outgoing connection.`);
    }
  }
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
    allowedNodeTypes.delete("ai_intent");
    disabledReasons.ai_intent = "AI node permission is disabled for this workspace role";
    allowedNodeTypes.delete("ai_extract");
    disabledReasons.ai_extract = "AI node permission is disabled for this workspace role";
  } else if (!aiConfigured) {
    allowedNodeTypes.delete("knowledge_lookup");
    disabledReasons.knowledge_lookup = "AI provider settings are not configured yet";
    allowedNodeTypes.delete("ai_generate");
    disabledReasons.ai_generate = "AI provider settings are not configured yet";
    allowedNodeTypes.delete("ai_intent");
    disabledReasons.ai_intent = "AI provider settings are not configured yet";
    allowedNodeTypes.delete("ai_extract");
    disabledReasons.ai_extract = "AI provider settings are not configured yet";
  } else if (aiReplyLimit !== null && Number(aiReplyLimit) <= 0) {
    allowedNodeTypes.delete("knowledge_lookup");
    disabledReasons.knowledge_lookup = "This workspace plan does not include AI reply usage";
    allowedNodeTypes.delete("ai_generate");
    disabledReasons.ai_generate = "This workspace plan does not include AI reply usage";
    allowedNodeTypes.delete("ai_intent");
    disabledReasons.ai_intent = "This workspace plan does not include AI reply usage";
    allowedNodeTypes.delete("ai_extract");
    disabledReasons.ai_extract = "This workspace plan does not include AI reply usage";
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

  validateFlowTopology(normalized);

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

  const created = await createFlow(
    botId,
    normalizedFlowJson,
    flowName || "Primary Flow",
    true,
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

  const updated = await patchFlowNode(flowId, nodeId, nextNode, flow.flow_name, requestId);

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

