import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/router";
import { startTransition } from "react";
import ReactFlow, { 
  useNodesState, useEdgesState, addEdge, Connection, Node, Edge, 
  Background, Controls, SelectionMode, Panel, ReactFlowProvider, useReactFlow
} from "reactflow";
import "reactflow/dist/style.css";
import { X, ShieldAlert, Headset, MessageCircle, ListTodo, Smile } from "lucide-react";

import NodeEditor from "../components/flow/NodeEditor";
import NodeComponent from "../components/flow/NodeComponent";
import FlowPortal from "../components/flow/FlowPortal";
import FlowHeader from "../components/flow/FlowHeader";
import FlowSidebar from "../components/flow/FlowSidebar";
import GlobalRulesInfoPanel from "../components/flow/GlobalRulesInfoPanel";
import RequirePermission from "../components/access/RequirePermission";
import { useVisibility } from "../hooks/useVisibility";
import { flowService } from "../services/flowService";
import { campaignService } from "../services/campaignService";
import { projectService } from "../services/projectService";
import { workspaceService } from "../services/workspaceService";
import { extractApiErrorInfo, notifyApiError } from "../services/apiError";
import { leadFormService, type LeadFormRecord } from "../services/leadFormService";
import { botService } from "../services/botService";
import apiClient from "../services/apiClient";
import { useAuthStore } from "../store/authStore";
import { useBotStore } from "../store/botStore";
import { confirmAction, notify } from "../store/uiStore";
import { NODE_CATEGORIES, AUTO_SAVE_DELAY, formatDefaultLabel } from "../config/flowConstants";
import { useFlowHistory } from "../hooks/useFlowHistory";
import { FlowValidationProvider } from "../components/flow/FlowValidationContext";

const staticNodeTypes = {
  default: NodeComponent,
  message: NodeComponent,
  start: NodeComponent,
  input: NodeComponent,
  menu: NodeComponent,
  send_template: NodeComponent,
  ai_generate: NodeComponent,
  business_hours: NodeComponent,
  split_traffic: NodeComponent,
  api: NodeComponent,
  delay: NodeComponent,
  assign_agent: NodeComponent,
  end: NodeComponent,
  goto: NodeComponent,
  condition: NodeComponent,
  knowledge_lookup: NodeComponent,
  save: NodeComponent,
  trigger: NodeComponent,
  resume_bot: NodeComponent,
} as const;

type FlowValidationResult = {
  invalidNodeIds: string[];
  invalidNodeReasons: Record<string, string>;
  invalidNodes: Array<{ id: string; label: string; reason: string }>;
  isValid: boolean;
};

function getNodeDisplayLabel(node: any) {
  return String(node?.data?.label || node?.data?.text || node?.type || node?.id || "Node").trim();
}

type FlowDraftSnapshot = {
  botId: string;
  flowId: string;
  flowName: string;
  savedAt: string;
  nodes: Node[];
  edges: Edge[];
  layoutLeftToRight: boolean;
};

function getFlowDraftStorageKey(entityId: string, flowId?: string | null, flowName?: string | null) {
  const safeBotId = String(entityId || "").trim();
  const safeFlowId = String(flowId || "").trim();
  const safeFlowName = String(flowName || "").trim();
  if (!safeBotId) return "";
  return `flow-draft:${safeBotId}:${safeFlowId || safeFlowName || "new-flow"}`;
}

function readFlowDraftSnapshot(storageKey: string): FlowDraftSnapshot | null {
  if (typeof window === "undefined" || !storageKey) return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    return parsed as FlowDraftSnapshot;
  } catch {
    return null;
  }
}

function writeFlowDraftSnapshot(storageKey: string, snapshot: FlowDraftSnapshot) {
  if (typeof window === "undefined" || !storageKey) return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
  } catch (error) {
    console.warn("Failed to store flow draft locally:", error);
  }
}

function clearFlowDraftSnapshot(storageKey: string) {
  if (typeof window === "undefined" || !storageKey) return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // ignore
  }
}

function looksLikeLegacyInputNode(type: any, data: any) {
  const normalized = String(type || "").trim().toLowerCase();
  if (normalized === "save") {
    return false;
  }
  const nodeData = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  const promptText = String(
    nodeData.prompt ||
      nodeData.question ||
      nodeData.text ||
      nodeData.questionLabel ||
      ""
  ).trim();
  const hasSaveValue = Boolean(String(nodeData.value || nodeData.output || "").trim());
  const hasLeadLink = Boolean(
    nodeData.linkLeadForm ||
      nodeData.linkedFormId ||
      nodeData.leadFormId ||
      nodeData.formId ||
      nodeData.lead_form_id ||
      nodeData.linkedFieldKey ||
      nodeData.leadField ||
      nodeData.field
  );

  return (
    normalized === "lead_form" ||
    (normalized === "save" && !hasSaveValue && (promptText.length > 0 || hasLeadLink))
  );
}

function normalizeCanvasNodeType(type: any, data?: any) {
  const normalized = String(type || "").trim().toLowerCase();
  if (["msg_text", "msg_media", "message"].includes(normalized)) {
    return "message";
  }
  if (["menu_button", "menu_list", "menu"].includes(normalized)) {
    return "menu";
  }
  if (normalized === "save") {
    return "save";
  }
  if (looksLikeLegacyInputNode(normalized, data)) {
    return "input";
  }
  return normalized;
}

function normalizeCanvasNodeData(type: any, data: any) {
  const normalizedType = normalizeCanvasNodeType(type, data);
  const next = data && typeof data === "object" && !Array.isArray(data) ? { ...data } : {};

  if (normalizedType === "input") {
    const normalizedLeadFormId = String(
      next.linkedFormId ||
        next.leadFormId ||
        next.formId ||
        next.lead_form_id ||
        ""
    ).trim();
    const normalizedFieldKey = String(
      next.linkedFieldKey ||
        next.leadField ||
        next.field ||
        ""
    ).trim();
    const questionText = String(
      next.text ||
        next.prompt ||
        next.question ||
        next.questionLabel ||
        ""
    ).trim();
    const hasLeadFieldKey = Boolean(normalizedFieldKey);

    if (questionText) {
      next.text = questionText;
      next.prompt = questionText;
      next.question = questionText;
      next.questionLabel = next.questionLabel || questionText;
    }

    if (normalizedLeadFormId || next.linkLeadForm || hasLeadFieldKey) {
      next.linkLeadForm = true;
      if (normalizedLeadFormId) {
        next.linkedFormId = normalizedLeadFormId;
        next.leadFormId = normalizedLeadFormId;
        next.formId = normalizedLeadFormId;
        next.lead_form_id = normalizedLeadFormId;
      }
      if (normalizedFieldKey) {
        next.linkedFieldKey = normalizedFieldKey;
        next.leadField = normalizedFieldKey;
        next.field = normalizedFieldKey;
        if (!String(next.variable || "").trim()) {
          next.variable = normalizedFieldKey;
        }
      }
    } else {
      next.linkLeadForm = false;
      if (!String(next.variable || "").trim() && normalizedFieldKey) {
        next.variable = normalizedFieldKey;
      }
      next.linkedFormId = "";
      next.leadFormId = "";
      next.formId = "";
      next.lead_form_id = "";
      next.linkedFieldKey = "";
      next.leadField = "";
      next.field = "";
    }

    if (!String(next.validation || "").trim()) {
      next.validation = "text";
    }
    if (!String(next.onInvalidMessage || "").trim() && String(next.invalidMessage || "").trim()) {
      next.onInvalidMessage = String(next.invalidMessage).trim();
    }
    next.maxRetries = Number.isFinite(Number(next.maxRetries)) ? Number(next.maxRetries) : 3;
    next.timeout = Number.isFinite(Number(next.timeout)) ? Number(next.timeout) : 900;
    next.reminderDelay = Number.isFinite(Number(next.reminderDelay)) ? Number(next.reminderDelay) : 300;
    next.reminderText = String(next.reminderText || "").trim();
    next.timeoutFallback = String(next.timeoutFallback || "").trim();
  }

  return next;
}

function getVisibleMenuOptionCount(node: any) {
  const explicitMode = String(node?.data?.menuMode || node?.data?.menuStyle || "").trim().toLowerCase();
  const maxOptions = explicitMode === "buttons" ? 4 : explicitMode === "list" ? 10 : 10;
  const filledItems = Array.from({ length: maxOptions }, (_, index) => {
    const num = index + 1;
    return String(node?.data?.[`item${num}`] || "").trim();
  }).filter(Boolean);

  return filledItems.length > 0 ? filledItems.length : 0;
}

function sanitizeClipboardNode(node: Node) {
  const {
    selected,
    dragging,
    positionAbsolute,
    resizing,
    draggingHandle,
    width,
    height,
    measured,
    ...rest
  } = node as any;

  return {
    ...rest,
    position: {
      x: Number(node.position?.x || 0),
      y: Number(node.position?.y || 0),
    },
    data: node.data && typeof node.data === "object" && !Array.isArray(node.data) ? { ...node.data } : {},
    width: Number.isFinite(Number(width)) ? width : undefined,
    height: Number.isFinite(Number(height)) ? height : undefined,
  };
}

function sanitizeClipboardEdge(edge: Edge) {
  const { selected, animated, hidden, labelStyle, ...rest } = edge as any;
  const nextEdge: any = { ...rest };
  const normalizeHandle = (value: any) => {
    const text = String(value ?? "").trim();
    if (!text || text === "undefined" || text === "null") {
      return undefined;
    }
    return text;
  };

  const sourceHandle = normalizeHandle(nextEdge.sourceHandle);
  const targetHandle = normalizeHandle(nextEdge.targetHandle);

  if (sourceHandle) {
    nextEdge.sourceHandle = sourceHandle;
  } else {
    delete nextEdge.sourceHandle;
  }

  if (targetHandle) {
    nextEdge.targetHandle = targetHandle;
  } else {
    delete nextEdge.targetHandle;
  }

  return nextEdge as Edge;
}

function validateFlowGraph(nodes: Node[], edges: Edge[]): FlowValidationResult {
  const normalizedNodes = Array.isArray(nodes) ? nodes : [];
  const normalizedEdges = Array.isArray(edges) ? edges : [];
  const incomingByNode = new Map<string, Edge[]>();
  const outgoingByNode = new Map<string, Edge[]>();

  for (const node of normalizedNodes) {
    const nodeId = String(node?.id || "");
    if (!nodeId) continue;
    incomingByNode.set(nodeId, []);
    outgoingByNode.set(nodeId, []);
  }

  for (const edge of normalizedEdges) {
    const sourceId = String(edge?.source || "");
    const targetId = String(edge?.target || "");
    if (sourceId && outgoingByNode.has(sourceId)) {
      outgoingByNode.get(sourceId)!.push(edge);
    }
    if (targetId && incomingByNode.has(targetId)) {
      incomingByNode.get(targetId)!.push(edge);
    }
  }

  const invalidNodeReasons: Record<string, string> = {};
  const invalidNodesById = new Map<string, { id: string; label: string; reason: string }>();

  const markInvalid = (nodeId: string, reason: string) => {
    if (!invalidNodeReasons[nodeId]) {
      invalidNodeReasons[nodeId] = reason;
    }
    if (!invalidNodesById.has(nodeId)) {
      const match = normalizedNodes.find((node: any) => String(node?.id || "") === nodeId);
      invalidNodesById.set(nodeId, {
        id: nodeId,
        label: getNodeDisplayLabel(match),
        reason,
      });
    }
  };

  const hasOutgoingHandle = (nodeId: string, handleId: string) =>
    (outgoingByNode.get(nodeId) || []).some((edge) => String(edge?.sourceHandle || "") === handleId);

  const getOutboundEdges = (nodeId: string) => outgoingByNode.get(nodeId) || [];
  const hasNextConnection = (nodeId: string) =>
    getOutboundEdges(nodeId).some((edge) => {
      const handle = edge?.sourceHandle;
      return (
        handle === null ||
        handle === undefined ||
        !String(handle || "").trim() ||
        String(handle || "").trim() === "next"
      );
    });
  const isMessageTerminalSafe = (nodeId: string) =>
    getOutboundEdges(nodeId).some((edge) => {
      const targetNode = normalizedNodes.find((node: any) => String(node?.id || "") === String(edge?.target || ""));
      return normalizeCanvasNodeType(targetNode?.type, targetNode?.data) === "end";
    });

  const hasOutgoing = (nodeId: string) => (outgoingByNode.get(nodeId) || []).length > 0;
  const outgoingHandleCount = (nodeId: string, handleId: string) =>
    (outgoingByNode.get(nodeId) || []).filter((edge) => String(edge?.sourceHandle || "") === handleId).length;

  const rootNodeTypes = new Set(["start", "trigger", "resume_bot"]);

  for (const node of normalizedNodes) {
    const nodeId = String(node?.id || "");
    if (!nodeId) continue;

    const nodeType = normalizeCanvasNodeType(node?.type, node?.data);
    if (["reminder", "timeout", "error_handler"].includes(nodeType)) {
      continue;
    }
    const incomingCount = (incomingByNode.get(nodeId) || []).length;
    const outgoingCount = (outgoingByNode.get(nodeId) || []).length;
    const visibleMenuItems = Array.from({ length: nodeType === "menu" ? 10 : 0 }, (_, index) => {
      const num = index + 1;
      return {
        num,
        label: String(node?.data?.[`item${num}`] || "").trim(),
      };
    }).filter((item) => Boolean(item.label));

    if (rootNodeTypes.has(nodeType)) {
      if (incomingCount > 0) {
        markInvalid(
          nodeId,
          nodeType === "resume_bot"
            ? "Resume bot nodes cannot have incoming connections."
            : nodeType === "trigger"
              ? "Trigger nodes cannot have incoming connections."
              : "Start nodes cannot have incoming connections."
        );
      } else if (outgoingCount !== 1) {
        markInvalid(
          nodeId,
          nodeType === "resume_bot"
            ? "Resume bot nodes must have exactly one outgoing connection."
            : nodeType === "trigger"
              ? "Trigger nodes must have exactly one outgoing connection."
              : "Start nodes must have exactly one outgoing connection."
        );
      }
      continue;
    }

    if (nodeType === "end") {
      if (incomingCount === 0) {
        markInvalid(nodeId, "This terminal node needs an incoming connection.");
      } else if (outgoingCount > 0) {
        markInvalid(nodeId, "This terminal node cannot have outgoing connections.");
      }
      continue;
    }

    if (nodeType === "goto") {
      continue;
    }

    if (nodeType === "condition") {
      if (incomingCount === 0) {
        markInvalid(nodeId, "Condition nodes need an incoming connection.");
      } else {
        const missingBranches = ["true", "false"].filter((handleId) => !hasOutgoingHandle(nodeId, handleId));
        if (missingBranches.length > 0) {
          markInvalid(nodeId, `Condition nodes need both True and False branches.`);
        }
      }
      continue;
    }

    if (nodeType === "menu") {
      if (incomingCount === 0) {
        markInvalid(nodeId, "Menu nodes need an incoming connection.");
        continue;
      }

      if (visibleMenuItems.length === 0) {
        markInvalid(nodeId, "Menu nodes need at least one option.");
        continue;
      }

      const missingItems = visibleMenuItems
        .map((item) => `item${item.num}`)
        .filter((handleId) => !hasOutgoingHandle(nodeId, handleId));

      if (missingItems.length > 0) {
        markInvalid(nodeId, "Connect every visible menu option before saving.");
      }
      continue;
    }

    if (nodeType === "input") {
      if (incomingCount === 0) {
        markInvalid(nodeId, "Input nodes need an incoming connection.");
      } else if (!hasOutgoingHandle(nodeId, "response")) {
        markInvalid(nodeId, "Input nodes need a Response connection.");
      }
      continue;
    }

    if (nodeType === "save") {
      if (incomingCount === 0) {
        markInvalid(nodeId, "Save nodes need an incoming connection.");
      } else if (!getOutboundEdges(nodeId).length) {
        markInvalid(nodeId, "Save nodes need exactly one Next connection.");
      }
      continue;
    }

    if (nodeType === "message") {
      if (incomingCount === 0) {
        markInvalid(nodeId, "Message nodes need an incoming connection.");
      } else if (isMessageTerminalSafe(nodeId)) {
        continue;
      } else if (!getOutboundEdges(nodeId).length) {
        markInvalid(nodeId, "Message nodes need exactly one Next connection.");
      }
      continue;
    }

    if (nodeType === "delay") {
      if (incomingCount === 0) {
        markInvalid(nodeId, "Delay nodes need an incoming connection.");
      } else if (outgoingCount !== 1 || outgoingHandleCount(nodeId, "next") !== 1) {
        markInvalid(nodeId, "Delay nodes need exactly one Next connection.");
      }
      continue;
    }

    if (nodeType === "assign_agent") {
      if (incomingCount === 0) {
        markInvalid(nodeId, "Assign agent nodes need an incoming connection.");
      } else if (!getOutboundEdges(nodeId).length) {
        markInvalid(nodeId, "Assign agent nodes need exactly one Next connection.");
      }
      continue;
    }

    if (nodeType === "business_hours") {
      if (incomingCount === 0) {
        markInvalid(nodeId, "Business hours nodes need an incoming connection.");
      } else {
        const missing = ["open", "closed"].filter((handleId) => !hasOutgoingHandle(nodeId, handleId));
        if (missing.length > 0) {
          markInvalid(nodeId, "Business hours nodes need Open and Closed outputs.");
        }
      }
      continue;
    }

    if (nodeType === "split_traffic") {
      if (incomingCount === 0) {
        markInvalid(nodeId, "Split traffic nodes need an incoming connection.");
      } else {
        const missing = ["a", "b"].filter((handleId) => !hasOutgoingHandle(nodeId, handleId));
        if (missing.length > 0) {
          markInvalid(nodeId, "Split traffic nodes need both Variant A and Variant B outputs.");
        }
      }
      continue;
    }

    if (nodeType === "api") {
      if (incomingCount === 0) {
        markInvalid(nodeId, "API nodes need an incoming connection.");
      } else {
        const missing = ["success", "error"].filter((handleId) => !hasOutgoingHandle(nodeId, handleId));
        if (missing.length > 0) {
          markInvalid(nodeId, "API nodes need both Success and Error outputs.");
        }
      }
      continue;
    }

    if (nodeType === "ai_generate") {
      if (incomingCount === 0) {
        markInvalid(nodeId, "AI generate nodes need an incoming connection.");
      } else if (!hasOutgoing(nodeId)) {
        markInvalid(nodeId, "AI generate nodes need an outgoing connection.");
      }
      continue;
    }

    if (incomingCount === 0) {
      markInvalid(nodeId, `${getNodeDisplayLabel(node)} needs an incoming connection.`);
      continue;
    }

    if (!hasOutgoing(nodeId)) {
      markInvalid(nodeId, `${getNodeDisplayLabel(node)} needs an outgoing connection.`);
    }
  }

  return {
    invalidNodeIds: Object.keys(invalidNodeReasons),
    invalidNodeReasons,
    invalidNodes: Array.from(invalidNodesById.values()),
    isValid: Object.keys(invalidNodeReasons).length === 0,
  };
}

function sanitizeFlowGraphEdges(nodes: Node[], edges: Edge[]) {
  const normalizedNodes = Array.isArray(nodes) ? nodes : [];
  const normalizedEdges = Array.isArray(edges) ? edges : [];
  const validNodeIds = new Set(
    normalizedNodes.map((node) => String(node?.id || "").trim()).filter(Boolean)
  );
  const startNodeTypes = new Set(["start", "trigger", "resume_bot"]);
  const startNodeIds = new Set(
    normalizedNodes
      .filter((node) => startNodeTypes.has(String(node?.type || "").trim().toLowerCase()))
      .map((node) => String(node?.id || "").trim())
      .filter(Boolean)
  );
  let removedInvalidEdges = 0;

  const sanitizedEdges = normalizedEdges.filter((edge) => {
    const sourceId = String(edge?.source || "").trim();
    const targetId = String(edge?.target || "").trim();

    if (!sourceId || !targetId) {
      removedInvalidEdges += 1;
      return false;
    }

    if (!validNodeIds.has(sourceId) || !validNodeIds.has(targetId)) {
      removedInvalidEdges += 1;
      return false;
    }

    if (startNodeIds.has(targetId)) {
      removedInvalidEdges += 1;
      return false;
    }

    return true;
  });

  return { nodes: normalizedNodes, edges: sanitizedEdges, removedInvalidEdges };
}

function buildBlankFlowCanvas() {
  return {
    nodes: [
      {
        id: "node_start",
        type: "start",
        position: { x: 120, y: 120 },
        data: { label: "Start" },
      },
    ],
    edges: [],
  };
}

function inferSystemFlowType(flow: any) {
  const flowJson = flow?.flow_json && typeof flow.flow_json === "object" ? flow.flow_json : {};
  const currentType = String(
    flow?.system_flow_type || flowJson.system_flow_type || flowJson.systemFlowType || ""
  )
    .trim()
    .toLowerCase();
  if (currentType === "handoff" || currentType === "csat") {
    return currentType;
  }

  return "";
}

function readFlowLayoutLeftToRight(flowJson: any) {
  const explicitValue =
    flowJson?.layout_left_to_right ??
    flowJson?.layoutLeftToRight ??
    flowJson?.left_to_right ??
    flowJson?.leftToRight;

  if (typeof explicitValue === "boolean") {
    return { isLeftToRight: explicitValue, hasExplicitValue: true };
  }

  if (typeof explicitValue === "string") {
    const normalized = explicitValue.trim().toLowerCase();
    if (["true", "1", "yes", "lr", "left-to-right", "lefttoright", "horizontal"].includes(normalized)) {
      return { isLeftToRight: true, hasExplicitValue: true };
    }
    if (["false", "0", "no", "td", "top-down", "toptobottom", "vertical"].includes(normalized)) {
      return { isLeftToRight: false, hasExplicitValue: true };
    }
  }

  const nodes = Array.isArray(flowJson?.nodes) ? flowJson.nodes : [];
  const xs = nodes.map((node: any) => Number(node?.position?.x || 0));
  const ys = nodes.map((node: any) => Number(node?.position?.y || 0));
  const width = xs.length > 0 ? Math.max(...xs) - Math.min(...xs) : 0;
  const height = ys.length > 0 ? Math.max(...ys) - Math.min(...ys) : 0;

  if (nodes.length >= 2 && (width > 0 || height > 0)) {
    return { isLeftToRight: width >= height, hasExplicitValue: false };
  }

  return { isLeftToRight: true, hasExplicitValue: false };
}

function layoutFlowNodes(flowJson: any, isLeftToRight: boolean) {
  const originalNodes = Array.isArray(flowJson?.nodes) ? flowJson.nodes : [];
  const edges = Array.isArray(flowJson?.edges) ? flowJson.edges : [];

  const nodeOrder = new Map<string, number>();
  const incomingCount = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  originalNodes.forEach((node: any, index: number) => {
    const nodeId = String(node?.id || index);
    nodeOrder.set(nodeId, index);
    incomingCount.set(nodeId, 0);
    outgoing.set(nodeId, []);
  });

  edges.forEach((edge: any) => {
    const sourceId = String(edge?.source || "");
    const targetId = String(edge?.target || "");
    if (!sourceId || !targetId) return;
    if (!outgoing.has(sourceId)) outgoing.set(sourceId, []);
    if (!incomingCount.has(sourceId)) incomingCount.set(sourceId, 0);
    if (!incomingCount.has(targetId)) incomingCount.set(targetId, 0);
    outgoing.get(sourceId)!.push(targetId);
    incomingCount.set(targetId, (incomingCount.get(targetId) || 0) + 1);
  });

  const roots = originalNodes
    .filter((node: any) => {
      const nodeId = String(node?.id || "");
      const nodeType = String(node?.type || "").trim().toLowerCase();
      return nodeType === "start" || nodeType === "trigger" || nodeType === "resume_bot" || (incomingCount.get(nodeId) || 0) === 0;
    })
    .sort((a: any, b: any) => (nodeOrder.get(String(a?.id || "")) || 0) - (nodeOrder.get(String(b?.id || "")) || 0));

  const levels = new Map<string, number>();
  const queue = roots.map((node: any) => String(node.id));
  roots.forEach((node: any) => levels.set(String(node.id), 0));

  while (queue.length > 0) {
    const nodeId = queue.shift() as string;
    const currentLevel = levels.get(nodeId) || 0;
    const targets = outgoing.get(nodeId) || [];
    targets.forEach((targetId) => {
      const nextLevel = currentLevel + 1;
      if (!levels.has(targetId)) {
        levels.set(targetId, nextLevel);
        queue.push(targetId);
      }
    });
  }

  originalNodes.forEach((node: any) => {
    const nodeId = String(node?.id || "");
    if (!levels.has(nodeId)) {
      levels.set(nodeId, 0);
    }
  });

  const groupedIds = new Map<number, string[]>();
  originalNodes.forEach((node: any) => {
    const nodeId = String(node?.id || "");
    const level = levels.get(nodeId) || 0;
    if (!groupedIds.has(level)) groupedIds.set(level, []);
    groupedIds.get(level)!.push(nodeId);
  });

  const horizontalGap = 320;
  const verticalGap = 200;
  const crossGap = 220;
  const baseX = 120;
  const baseY = 120;

  return {
    ...(flowJson && typeof flowJson === "object" ? flowJson : {}),
    layout_left_to_right: isLeftToRight,
    layoutLeftToRight: isLeftToRight,
    nodes: originalNodes.map((node: any) => {
      const nodeId = String(node?.id || "");
      const level = levels.get(nodeId) || 0;
      const group = groupedIds.get(level) || [];
      const indexInLevel = Math.max(0, group.indexOf(nodeId));

      return {
        ...node,
        position: isLeftToRight
          ? { x: baseX + level * horizontalGap, y: baseY + indexInLevel * verticalGap }
          : { x: baseX + indexInLevel * horizontalGap, y: baseY + level * crossGap },
      };
    }),
    edges,
  };
}

function normalizeImportedFlowGraph(flowJson: any) {
  const source = flowJson && typeof flowJson === "object" ? flowJson : {};
  const rawNodes = Array.isArray(source.nodes) ? source.nodes : [];
  const rawEdges = Array.isArray(source.edges) ? source.edges : [];
  const nodeIdMap = new Map<string, string>();
  const usedIds = new Set<string>();

  const nodes = rawNodes.map((node: any, index: number) => {
    const incomingId = String(node?.id || "").trim();
    const fallbackId = `imported-node-${index + 1}`;
    let nextId = incomingId || fallbackId;

    while (usedIds.has(nextId)) {
      nextId = `${fallbackId}-${usedIds.size + 1}`;
    }

    if (incomingId) {
      nodeIdMap.set(incomingId, nextId);
    }

    usedIds.add(nextId);

    return {
      ...node,
      id: nextId,
      type: normalizeCanvasNodeType(node?.type, node?.data),
      data: normalizeCanvasNodeData(node?.type, node?.data),
    };
  });

  const edges = rawEdges.map((edge: any, index: number) => {
    const rawSource = String(edge?.source || edge?.from || "").trim();
    const rawTarget = String(edge?.target || edge?.to || "").trim();
    const resolvedSource = rawSource ? (nodeIdMap.get(rawSource) || rawSource) : rawSource;
    const resolvedTarget = rawTarget ? (nodeIdMap.get(rawTarget) || rawTarget) : rawTarget;

    return {
      ...edge,
      id: String(edge?.id || "").trim() || `imported-edge-${index + 1}`,
      source: resolvedSource,
      target: resolvedTarget,
    };
  });

  return {
    ...source,
    nodes,
    edges,
  };
}

function buildSystemFlowBlueprint(flowType: "handoff" | "csat") {
  if (flowType === "handoff") {
    return {
      system_flow_type: "handoff",
      is_global_flow: true,
      is_system_flow: true,
      layout_left_to_right: true,
      nodes: [
        {
          id: "handoff-trigger",
          type: "trigger",
          position: { x: 120, y: 100 },
          data: {
            label: "Support Trigger",
            triggerType: "keyword",
            triggerKeywords: "human, support, agent, help desk",
            entryKey: "human",
          },
        },
        {
          id: "handoff-confirm",
          type: "menu",
          position: { x: 420, y: 100 },
          data: {
            label: "Confirm Transfer",
            text: "Would you like me to transfer you to a human support agent?",
            item1: "Yes, please",
            item2: "No, I'm good",
            timeout: 86400,
            reminderDelay: 43200,
            reminderText: "Hi there! Just checking in. Did you still want to speak to an agent?",
            timeoutFallback: "This request has timed out due to inactivity. Type 'Help' whenever you need us!",
          },
        },
        {
          id: "handoff-wait",
          type: "message",
          position: { x: 720, y: 20 },
          data: {
            label: "Wait Message",
            text: "Please wait a moment while I connect you with our next available agent...",
          },
        },
        {
          id: "handoff-assign",
          type: "assign_agent",
          position: { x: 1020, y: 20 },
          data: {
            label: "Transfer to Human",
            text: "Bot paused. An agent will be with you shortly.",
          },
        },
        {
          id: "handoff-cancel",
          type: "message",
          position: { x: 720, y: 190 },
          data: {
            label: "Cancel Handoff",
            text: "No problem! Let me know if you need anything else.",
          },
        },
        {
          id: "handoff-timeout",
          type: "message",
          position: { x: 720, y: 360 },
          data: {
            label: "Timeout Notice",
            text: "This request has timed out due to inactivity. Type 'Help' whenever you need us!",
          },
        },
        { id: "handoff-end", type: "end", position: { x: 1320, y: 100 }, data: { label: "End Session" } },
      ],
      edges: [
        { id: "handoff-e1", source: "handoff-trigger", target: "handoff-confirm", sourceHandle: "next" },
        { id: "handoff-e2", source: "handoff-confirm", target: "handoff-wait", sourceHandle: "item1" },
        { id: "handoff-e3", source: "handoff-confirm", target: "handoff-cancel", sourceHandle: "item2" },
        { id: "handoff-e4", source: "handoff-confirm", target: "handoff-timeout", sourceHandle: "timeout" },
        { id: "handoff-e5", source: "handoff-wait", target: "handoff-assign", sourceHandle: "next" },
        { id: "handoff-e6", source: "handoff-assign", target: "handoff-end", sourceHandle: "next" },
        { id: "handoff-e7", source: "handoff-cancel", target: "handoff-end", sourceHandle: "next" },
        { id: "handoff-e8", source: "handoff-timeout", target: "handoff-end", sourceHandle: "next" },
      ],
    };
  }

    return {
    system_flow_type: "csat",
    is_global_flow: true,
    is_system_flow: true,
    layout_left_to_right: true,
    nodes: [
      { id: "csat-resume", type: "resume_bot", position: { x: 120, y: 100 }, data: { label: "Resume Bot" } },
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
      { id: "csat-e1", source: "csat-resume", target: "csat-menu", sourceHandle: "next" },
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

function buildLeadQualificationFlowBlueprint(botName?: string) {
  return {
    layout_left_to_right: true,
    nodes: [],
    edges: [],
  };
}

function FlowBuilderCanvas() {
  const router = useRouter();
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const setActiveWorkspace = useAuthStore((state) => state.setActiveWorkspace);
  const setActiveProject = useAuthStore((state) => state.setActiveProject);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);
  const getProjectRole = useAuthStore((state) => state.getProjectRole);
  const { isReadOnly, isPlatformOperator } = useVisibility();
  
  const botId = router.query.botId as string;
  const campaignId = typeof router.query.campaignId === "string" ? router.query.campaignId.trim() : "";
  const requestedFlowId =
    typeof router.query.flowId === "string" ? router.query.flowId.trim().toLowerCase() : "";
  const requestedSystemFlowType =
    typeof router.query.systemFlowType === "string"
      ? router.query.systemFlowType.trim().toLowerCase()
      : "";
  const isCampaignSystemFlowEditor = Boolean(campaignId);
  const { unlockedBotIds } = useBotStore();
  const isUnlocked = isCampaignSystemFlowEditor ? true : unlockedBotIds.includes(botId);
  const permissionsReady =
    !!activeWorkspace?.workspace_id && !!activeProject?.id;
  const canEditWorkflow = hasWorkspacePermission(activeWorkspace?.workspace_id, "edit_workflow");
  const canDeleteFlowAction = hasWorkspacePermission(activeWorkspace?.workspace_id, "delete_flow");
  const projectRole = getProjectRole(activeProject?.id);
  const canEditProjectWorkflow =
    permissionsReady &&
    !isReadOnly &&
    (canEditWorkflow || projectRole === "project_admin" || projectRole === "editor");
  const canDeleteProjectFlow =
    !isReadOnly && (canDeleteFlowAction || projectRole === "project_admin");
  const shouldHoldForWorkspace =
    !hasHydrated ||
    (!isPlatformOperator && !activeWorkspace?.workspace_id);

  useEffect(() => {
    if (!hasHydrated || isPlatformOperator) {
      return;
    }

    if (activeWorkspace?.workspace_id && activeProject?.id) {
      return;
    }

    let cancelled = false;

    const setProjectFromList = (workspaceId: string, projectSource: any) => {
      if (cancelled) {
        return;
      }

      const projectList = Array.isArray(projectSource)
        ? projectSource
        : Array.isArray(projectSource?.data)
          ? projectSource.data
          : [];

      const nextProject = projectList[0] || null;
      if (nextProject?.id) {
        setActiveProject({
          id: nextProject.id,
          workspace_id: nextProject.workspace_id,
          name: nextProject.name,
          status: nextProject.status,
          is_default: nextProject.is_default,
        });
      }
    };

    if (activeWorkspace?.workspace_id && !activeProject?.id) {
      projectService.list(activeWorkspace.workspace_id)
        .then((res) => setProjectFromList(activeWorkspace.workspace_id, res))
        .catch((err) => {
          console.error("Failed to resolve fallback project", err);
        });
    } else if (!activeWorkspace?.workspace_id) {
      workspaceService
        .list()
        .then((rows) => {
          if (cancelled) {
            return;
          }

          const workspaceList = Array.isArray(rows)
            ? rows
            : Array.isArray((rows as any)?.data)
              ? (rows as any).data
              : [];
          const firstWorkspace = workspaceList[0] || null;
          if (firstWorkspace?.id) {
            setActiveWorkspace(firstWorkspace.id);
            projectService.list(firstWorkspace.id)
              .then((res) => setProjectFromList(firstWorkspace.id, res))
              .catch((err) => {
                console.error("Failed to resolve fallback project", err);
              });
          }
        })
        .catch((err) => {
          console.error("Failed to resolve fallback workspace", err);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [
    activeWorkspace?.workspace_id,
    activeProject?.id,
    hasHydrated,
    isPlatformOperator,
    router,
    setActiveWorkspace,
    setActiveProject,
  ]);

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { screenToFlowPosition, setViewport } = useReactFlow(); 
  const nodeTypes = staticNodeTypes;
  
  const [nodes, setNodes, onNodesChangeState] = useNodesState([]);
  const [edges, setEdges, onEdgesChangeState] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [botMetadata, setBotMetadata] = useState<any | null>(null);
  const [availableBots, setAvailableBots] = useState<any[]>([]); 
  const [handoffBots, setHandoffBots] = useState<any[]>([]);
  const [currentFlowId, setCurrentFlowId] = useState<string | null>(null);
  const [currentFlowName, setCurrentFlowName] = useState("");
  const [flowNameDialogMode, setFlowNameDialogMode] = useState<"create" | "rename" | null>(null);
  const [flowNameDraft, setFlowNameDraft] = useState("");
  const [flowSummaries, setFlowSummaries] = useState<any[]>([]);
  const [flowOptionsByBot, setFlowOptionsByBot] = useState<Record<string, any[]>>({});
  const [leadForms, setLeadForms] = useState<LeadFormRecord[]>([]);
  const [resolvedLeadFormWorkspaceId, setResolvedLeadFormWorkspaceId] = useState<string>("");
  const [resolvedLeadFormProjectId, setResolvedLeadFormProjectId] = useState<string>("");
  const [allowedNodeTypes, setAllowedNodeTypes] = useState<string[]>([]);
  const [nodeDisabledReasons, setNodeDisabledReasons] = useState<Record<string, string>>({});
  const [isSystemFlow, setIsSystemFlow] = useState(false);
  const [flowLayoutLeftToRight, setFlowLayoutLeftToRight] = useState(true);
  const [isGlobalRulesInfoOpen, setIsGlobalRulesInfoOpen] = useState(false);
  const [isPasteJsonOpen, setIsPasteJsonOpen] = useState(false);
  const [pasteJsonDraft, setPasteJsonDraft] = useState("");
  const [pasteJsonError, setPasteJsonError] = useState("");
  const [isImportingPasteJson, setIsImportingPasteJson] = useState(false);
  const [hasClipboardSelection, setHasClipboardSelection] = useState(false);
  const flowClipboardRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [draftSaveStatus, setDraftSaveStatus] = useState("");
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const suppressNodeSelectionRef = useRef(false);
  const suppressAutoSaveRef = useRef(false);
  const manualNodeSaveInFlightRef = useRef(false);

  const { takeSnapshot, undo, redo, past, future } = useFlowHistory(nodes, edges, setNodes, setEdges, setIsDirty);
  const canEditTopology = canEditProjectWorkflow && (!isSystemFlow || isCampaignSystemFlowEditor);
  const flowValidation = useMemo(() => validateFlowGraph(nodes, edges), [nodes, edges]);
  const flowDraftStorageKey = useMemo(
    () => getFlowDraftStorageKey(campaignId || botId, currentFlowId, currentFlowName),
    [botId, campaignId, currentFlowId, currentFlowName]
  );
  const botGlobalSettings = useMemo(
    () => botMetadata?.global_settings || botMetadata?.settings_json || botMetadata?.settings || null,
    [botMetadata]
  );

  const getDefaultFlowId = useCallback((summaries: any[]) => {
    const normalized = Array.isArray(summaries) ? summaries : [];
    const nonGlobalFlows = normalized.filter((flow: any) => {
      const flowType = String(flow?.system_flow_type || flow?.flow_json?.system_flow_type || "").trim();
      return !Boolean(flow.is_global_flow || flowType);
    });

    const defaultNonGlobal =
      nonGlobalFlows.find((flow: any) => Boolean(flow?.is_default)) ||
      nonGlobalFlows[0];
    return String(defaultNonGlobal?.id || "").trim() || undefined;
  }, []);

  const getSystemFlowIdByType = useCallback((summaries: any[], flowType: "handoff" | "csat") => {
    const normalized = Array.isArray(summaries) ? summaries : [];
    const matched = normalized.find((flow: any) => {
      const currentFlowType = String(flow?.system_flow_type || flow?.flow_json?.system_flow_type || "").trim();
      if (currentFlowType === flowType) {
        return true;
      }
      return false;
    });

    return String(matched?.id || "").trim() || undefined;
  }, []);

  const importFlowJsonPayload = useCallback((rawPayload: any) => {
    if (!canEditTopology) {
      notify("You do not have permission to import workflows.", "error");
      return false;
    }

    const payload = rawPayload && typeof rawPayload === "object" && typeof rawPayload.flow_json === "object"
      ? rawPayload.flow_json
      : rawPayload;

    if (!payload || !Array.isArray(payload.nodes)) {
      throw new Error("Imported JSON must include a nodes array.");
    }

    const repairedFlow = normalizeImportedFlowGraph(payload);
    const layoutConfig = readFlowLayoutLeftToRight(repairedFlow);
    const importedFlow = layoutConfig.hasExplicitValue
      ? layoutFlowNodes(repairedFlow, layoutConfig.isLeftToRight)
      : repairedFlow;
    const importedNodes = Array.isArray(importedFlow.nodes) ? importedFlow.nodes : [];
    const importedEdges = Array.isArray(importedFlow.edges) ? importedFlow.edges : [];
    const validNodeIds = new Set(importedNodes.map((node: any) => String(node?.id || "").trim()).filter(Boolean));
    const startNodeTypes = new Set(["start", "trigger", "resume_bot"]);
    const startNodeIds = new Set(
      importedNodes
        .filter((node: any) => startNodeTypes.has(String(node?.type || "").trim().toLowerCase()))
        .map((node: any) => String(node?.id || "").trim())
        .filter(Boolean)
    );
    let removedInvalidEdges = 0;
    const sanitizedEdges = importedEdges.filter((edge: any) => {
      const sourceId = String(edge?.source || "").trim();
      const targetId = String(edge?.target || "").trim();

      if (!sourceId || !targetId) {
        removedInvalidEdges += 1;
        return false;
      }

      if (!validNodeIds.has(sourceId) || !validNodeIds.has(targetId)) {
        removedInvalidEdges += 1;
        return false;
      }

      if (startNodeIds.has(targetId)) {
        removedInvalidEdges += 1;
        return false;
      }

      return true;
    });

    const sanitizedFlow = {
      ...importedFlow,
      nodes: importedNodes,
      edges: sanitizedEdges,
    };

    if (removedInvalidEdges > 0) {
      notify("Cleaned up invalid connections from imported JSON.", "info");
    }

    startTransition(() => {
      takeSnapshot();
      setFlowLayoutLeftToRight(layoutConfig.isLeftToRight);
      setNodes(sanitizedFlow.nodes);
      setEdges(sanitizedFlow.edges || []);
      setIsDirty(true);
      setSelectedNode(null);
      setViewport({ x: 0, y: 0, zoom: 1 });
    });
    return true;
  }, [canEditTopology, setEdges, setNodes, setSelectedNode, setViewport, takeSnapshot]);

  const handleOpenPasteJsonDialog = useCallback(() => {
    if (!canEditTopology) {
      notify("You do not have permission to import workflows.", "error");
      return;
    }
    setPasteJsonError("");
    setPasteJsonDraft("");
    setIsPasteJsonOpen(true);
  }, [canEditTopology]);

  const handleApplyPastedJson = useCallback(async () => {
    if (!pasteJsonDraft.trim()) {
      setPasteJsonError("Paste a JSON flow first.");
      return;
    }

    setIsImportingPasteJson(true);
    await new Promise<void>((resolve) => {
      if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
        resolve();
        return;
      }
      window.requestAnimationFrame(() => resolve());
    });
    try {
      const parsed = JSON.parse(pasteJsonDraft);
      const imported = importFlowJsonPayload(parsed);
      if (imported) {
        setIsPasteJsonOpen(false);
        setPasteJsonDraft("");
        setPasteJsonError("");
        notify("JSON flow imported.", "success");
      }
    } catch (err: any) {
      console.error("Paste JSON import failed", err);
      setPasteJsonError(err?.message || "Error parsing pasted JSON.");
      notify(err?.message || "Error parsing pasted JSON.", "error");
    } finally {
      setIsImportingPasteJson(false);
    }
  }, [importFlowJsonPayload, pasteJsonDraft]);

  const normalizeFlowForCanvas = useCallback((flowJson: any) => {
    const repairedFlow = normalizeImportedFlowGraph(flowJson);
    const rawNodes = Array.isArray(repairedFlow?.nodes)
      ? repairedFlow.nodes.map((node: any) => ({
          ...node,
          id: String(node?.id || ""),
          type: normalizeCanvasNodeType(node?.type, node?.data),
          data: normalizeCanvasNodeData(node?.type, node?.data),
        }))
      : [];
    const rawEdges = Array.isArray(repairedFlow?.edges) ? repairedFlow.edges : [];

    return {
      ...(repairedFlow && typeof repairedFlow === "object" ? repairedFlow : {}),
      nodes: rawNodes,
      edges: rawEdges,
    };
  }, []);

  useEffect(() => {
    if (!flowDraftStorageKey) {
      setDraftSaveStatus("");
      return;
    }

    const snapshot = readFlowDraftSnapshot(flowDraftStorageKey);
    if (snapshot?.savedAt) {
      setDraftSaveStatus(
        `Draft saved locally at ${new Date(snapshot.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`
      );
    } else {
      setDraftSaveStatus(isDirty ? "Unsaved changes." : "Saved to backend.");
    }
  }, [flowDraftStorageKey, isDirty]);

  useEffect(() => {
    if (!flowDraftStorageKey || suppressAutoSaveRef.current || manualNodeSaveInFlightRef.current) {
      return;
    }
    if (!isDirty) {
      return;
    }
    const snapshot = {
      botId: String(botId || "").trim(),
      flowId: String(currentFlowId || "").trim(),
      flowName: String(currentFlowName || "").trim(),
      savedAt: new Date().toISOString(),
      nodes: nodes as Node[],
      edges: edges as Edge[],
      layoutLeftToRight: flowLayoutLeftToRight,
    };
    writeFlowDraftSnapshot(flowDraftStorageKey, snapshot);
    setDraftSaveStatus(`Draft saved locally at ${new Date(snapshot.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`);
  }, [botId, currentFlowId, currentFlowName, edges, flowDraftStorageKey, flowLayoutLeftToRight, isDirty, nodes]);

  const applyLoadedFlow = useCallback((payload: any) => {
    const flowJson = payload?.flow_json && typeof payload.flow_json === "object"
      ? payload.flow_json
      : payload;

    setCurrentFlowId(typeof payload?.id === "string" ? payload.id : null);
    setCurrentFlowName(String(payload?.flow_name || payload?.name || "").trim());
    setIsSystemFlow(Boolean(
      payload?.is_system_flow ||
        inferSystemFlowType(payload) ||
        flowJson?.is_global_flow ||
        flowJson?.isGlobalFlow ||
        flowJson?.global_flow
    ));
    setFlowLayoutLeftToRight(readFlowLayoutLeftToRight(flowJson).isLeftToRight);
    const normalizedFlow = normalizeFlowForCanvas(flowJson);
    setNodes(normalizedFlow.nodes);
    setEdges(normalizedFlow.edges);
  }, [normalizeFlowForCanvas, setNodes, setEdges]);

  const refreshFlowSummariesSafe = useCallback(async (targetId: string) => {
    if (!targetId) return [];

    try {
      if (isCampaignSystemFlowEditor) {
        const campaign = await campaignService.get(targetId);
        const systemFlows: Record<string, any> =
          (campaign?.settings_json?.system_flows && typeof campaign.settings_json.system_flows === "object")
            ? campaign.settings_json.system_flows
            : {};
        const normalized = ["handoff", "csat"]
          .map((flowType) => {
            const flowJson = systemFlows?.[flowType];
            if (!flowJson) return null;
            return {
              id: flowType,
              campaign_id: targetId,
              flow_name: flowJson.flow_name || (flowType === "handoff" ? "Global: Human Handoff" : "Post-Handoff CSAT"),
              flow_json: flowJson,
              is_system_flow: true,
              is_global_flow: true,
              system_flow_type: flowType,
            };
          })
          .filter(Boolean) as any[];
        setFlowSummaries(normalized);
        return normalized;
      }

      const summaries = await flowService.getFlowSummaries(targetId);
      const normalized = Array.isArray(summaries) ? summaries : [];
      setFlowSummaries(normalized);
      return normalized;
    } catch (error) {
      console.error("Flow summaries refresh failed:", error);
      return [];
    }
  }, [isCampaignSystemFlowEditor]);

  const ensureSystemFlowExists = useCallback(async (targetId: string, flowType: "handoff" | "csat") => {
    if (!targetId) return null;

    if (isCampaignSystemFlowEditor) {
      return flowType;
    }

    try {
      const systemFlows = await botService.getSystemFlows(targetId);
      return getSystemFlowIdByType(Array.isArray(systemFlows) ? systemFlows : [], flowType) || null;
    } catch (err) {
      console.error("Failed to resolve system flows:", err);
      return null;
    }
  }, [getSystemFlowIdByType, isCampaignSystemFlowEditor]);

  const ensurePrimaryFlowExists = useCallback(async (targetBotId: string, summaries: any[] = [], botName?: string) => {
    if (!targetBotId) return null;
    const normalized = Array.isArray(summaries) ? summaries : [];
    const nonGlobalFlows = normalized.filter((flow: any) => {
      const flowType = String(flow?.system_flow_type || flow?.flow_json?.system_flow_type || "").trim();
      return !Boolean(flow.is_global_flow || flowType);
    });

    const existingPrimary =
      nonGlobalFlows.find((flow: any) => Boolean(flow?.is_default)) ||
      nonGlobalFlows[0];

    if (existingPrimary?.id) {
      return String(existingPrimary.id).trim() || null;
    }

    return null;
  }, [refreshFlowSummariesSafe]);

  useEffect(() => {
    if (selectedNode && !nodes.some(n => n.id === selectedNode.id)) {
      setSelectedNode(null);
    }
  }, [nodes, selectedNode]);

  const onNodesChange = useCallback((changes: any) => {
    if (!canEditTopology) return;
    onNodesChangeState(changes);
    setIsDirty(true);
  }, [canEditTopology, onNodesChangeState]);

  const onEdgesChange = useCallback((changes: any) => {
    if (!canEditTopology) return;
    onEdgesChangeState(changes);
    setIsDirty(true);
  }, [canEditTopology, onEdgesChangeState]);

  const onConnect = useCallback((params: Connection | Edge) => {
    if (!canEditTopology) return;
    takeSnapshot();
    setEdges((eds) => addEdge(params, eds));
    setIsDirty(true);
  }, [canEditTopology, takeSnapshot, setEdges]);

  const buildDefaultNodeData = useCallback((type: string) => {
    const normalized = String(type || "").trim().toLowerCase();
    const base = { label: formatDefaultLabel(normalized), text: "" };

    if (normalized === "message") {
      return {
        ...base,
        messageType: "text",
      };
    }

    if (normalized === "menu") {
      return {
        ...base,
        menuMode: "auto",
        buttonText: "View Options",
        sectionTitle: "Options",
        timeout: 900,
        reminderDelay: 300,
        reminderText: "",
        timeoutFallback: "",
      };
    }

    if (normalized === "input") {
      return {
        ...base,
        variable: "",
        linkedFormId: "",
        leadFormId: "",
        formId: "",
        linkedFieldKey: "",
        leadField: "",
        field: "",
        linkLeadForm: false,
        validation: "text",
        onInvalidMessage: "",
        maxRetries: 3,
        timeout: 900,
        reminderDelay: 300,
        reminderText: "",
        timeoutFallback: "",
      };
    }

    if (normalized === "ai_generate") {
      return {
        ...base,
        provider: "auto",
        model: "",
        prompt: "",
        saveTo: "ai_output",
        style: "",
      };
    }

    if (normalized === "business_hours") {
      return {
        ...base,
        timezone: "Asia/Kolkata",
        days: "mon,tue,wed,thu,fri",
        startTime: "09:00",
        endTime: "17:00",
      };
    }

    if (normalized === "split_traffic") {
      return {
        ...base,
        percentA: 50,
        percentB: 50,
        routeALabel: "Variant A",
        routeBLabel: "Variant B",
      };
    }

    if (normalized === "condition") {
      return {
        ...base,
        variable: "",
        operator: "equals",
        value: "",
      };
    }

    if (normalized === "save") {
      return {
        ...base,
        variable: "",
        leadField: "",
      };
    }

    if (normalized === "trigger") {
      return {
        ...base,
        triggerKeywords: "",
        triggerType: "keyword",
        entryKey: "",
      };
    }

    if (normalized === "resume_bot") {
      return {
        ...base,
        resumeText: "Welcome back.",
        resumeMode: "continue",
      };
    }

    if (normalized === "api") {
      return {
        ...base,
        method: "GET",
        saveTo: "api_response",
        timeoutMs: 10000,
      };
    }

    if (normalized === "goto") {
      return {
        ...base,
        gotoType: "node",
      };
    }

    if (normalized === "assign_agent") {
      return {
        ...base,
        text: "A human agent will review your request now.",
      };
    }

    return base;
  }, []);

  useEffect(() => {
    if (!router.isReady) return;

    let cancelled = false;

    const loadPortalData = async () => {
      try {
        setIsLoading(true);

        const botRows = await botService.getBots({
          workspaceId: activeWorkspace?.workspace_id || undefined,
          projectId: activeProject?.id || undefined,
        });
        if (cancelled) return;

        const unlockedList = botRows.filter((b: any) => unlockedBotIds.includes(b.id));
        setAvailableBots(unlockedList);
        setHandoffBots(Array.isArray(botRows) ? botRows : []);

        const summariesByBotEntries = await Promise.all(
          (Array.isArray(botRows) ? botRows : []).map(async (bot: any) => {
            try {
              const summaries = await flowService.getFlowSummaries(bot.id);
              return [String(bot.id), Array.isArray(summaries) ? summaries : []] as const;
            } catch {
              return [String(bot.id), []] as const;
            }
          })
        );
        if (cancelled) return;
        setFlowOptionsByBot(Object.fromEntries(summariesByBotEntries));

        let resolvedWorkspaceId = String(activeWorkspace?.workspace_id || "").trim();
        let resolvedProjectId = String(activeProject?.id || "").trim();
        let resolvedBotName = String(botMetadata?.name || "").trim();

        if (botId && isUnlocked) {
          const botInfo = await apiClient.get(`/bots/${botId}`);
          if (cancelled) return;
          setBotMetadata(botInfo.data);
          resolvedBotName = String(botInfo.data?.name || "").trim();
          resolvedWorkspaceId = String(
            botInfo.data?.workspace_id || resolvedWorkspaceId || ""
          ).trim();
          resolvedProjectId = String(
            botInfo.data?.project_id || resolvedProjectId || ""
          ).trim();
        } else {
          setBotMetadata(null);
        }

        if (cancelled) return;

        setResolvedLeadFormWorkspaceId(resolvedWorkspaceId);
        setResolvedLeadFormProjectId(resolvedProjectId);

        if (resolvedWorkspaceId) {
          try {
            const leadFormRows = await leadFormService.list(
              resolvedWorkspaceId,
              resolvedProjectId || undefined
            );
            if (cancelled) return;
            console.log("leadForms loaded:", Array.isArray(leadFormRows) ? leadFormRows.length : 0, leadFormRows);
            setLeadForms(Array.isArray(leadFormRows) ? leadFormRows : []);
          } catch (leadFormError) {
            if (cancelled) return;
            console.error("Lead form preload failed:", leadFormError);
            setLeadForms([]);
          }
        } else {
          console.log("leadForms RESET TO EMPTY - reason:", "workspace/project missing or else branch");
          setLeadForms([]);
        }

        if (cancelled) return;

        if (isCampaignSystemFlowEditor) {
          setAllowedNodeTypes([]);
          setNodeDisabledReasons({});

          const campaign = await campaignService.get(campaignId);
          if (cancelled) return;

          setBotMetadata(campaign);
          const campaignFlows: Record<string, any> =
            (campaign?.settings_json?.system_flows && typeof campaign.settings_json.system_flows === "object")
              ? campaign.settings_json.system_flows
              : {};
          const requestedCampaignFlowKey = requestedSystemFlowType || requestedFlowId || "handoff";
          const selectedFlow = campaignFlows?.[requestedCampaignFlowKey];
          const fallbackFlowName =
            requestedCampaignFlowKey === "handoff"
              ? "Global: Human Handoff"
              : "Post-Handoff CSAT";

          if (!selectedFlow) {
            const blankFlow = buildBlankFlowCanvas();
            applyLoadedFlow({
              id: requestedCampaignFlowKey,
              flow_name: fallbackFlowName,
              flow_json: blankFlow,
              is_system_flow: true,
              is_global_flow: true,
            });
            setFlowSummaries([]);
            return;
          }

          applyLoadedFlow({
            id: requestedCampaignFlowKey,
            flow_name: selectedFlow.flow_name || fallbackFlowName,
            flow_json: selectedFlow,
            is_system_flow: true,
            is_global_flow: true,
          });
          setFlowSummaries([
            {
              id: "handoff",
              flow_name: campaignFlows?.handoff?.flow_name || "Global: Human Handoff",
              flow_json: campaignFlows?.handoff || null,
              is_system_flow: true,
              system_flow_type: "handoff",
            },
            {
              id: "csat",
              flow_name: campaignFlows?.csat?.flow_name || "Post-Handoff CSAT",
              flow_json: campaignFlows?.csat || null,
              is_system_flow: true,
              system_flow_type: "csat",
            },
          ]);
        } else if (botId && isUnlocked) {

          const capabilities = await flowService.getCapabilities(botId);
          if (cancelled) return;
          setAllowedNodeTypes(Array.isArray(capabilities?.allowedNodeTypes) ? capabilities.allowedNodeTypes : []);
          setNodeDisabledReasons(
            capabilities?.disabledReasons && typeof capabilities.disabledReasons === "object"
              ? capabilities.disabledReasons
              : {}
          );

          const summaries = await refreshFlowSummariesSafe(botId);
          if (cancelled) return;
          const systemFlowSummaries = await botService.getSystemFlows(botId).catch(() => []);
          if (cancelled) return;

          const requestedFlowId =
            typeof router.query.flowId === "string" ? router.query.flowId.trim() : "";
          const requestedFlow = requestedFlowId
            ? summaries.find((flow: any) => String(flow?.id || "").trim() === requestedFlowId)
            : null;
          const requestedFlowType = inferSystemFlowType(requestedFlow);
          const isExplicitNewFlowRequest = requestedFlowId === "new";

          if (isExplicitNewFlowRequest) {
            setCurrentFlowId(null);
            setCurrentFlowName("Untitled flow");
            setIsSystemFlow(false);
            setFlowLayoutLeftToRight(true);
            const blankFlow = buildBlankFlowCanvas();
            setNodes(blankFlow.nodes);
            setEdges(blankFlow.edges);
            setSelectedNode(null);
            setIsDirty(false);
            setViewport({ x: 0, y: 0, zoom: 1 });
            return;
          }

          let initialFlowId =
            requestedFlowId && !requestedFlowType
              ? requestedFlowId
              : (requestedFlowId && requestedFlowType && requestedSystemFlowType === requestedFlowType
                  ? requestedFlowId
                  : undefined) ||
              (requestedSystemFlowType === "handoff" || requestedSystemFlowType === "csat"
                ? getSystemFlowIdByType(summaries, requestedSystemFlowType)
                : undefined) ||
              (requestedSystemFlowType === "handoff" || requestedSystemFlowType === "csat"
                ? getSystemFlowIdByType(systemFlowSummaries, requestedSystemFlowType)
                : undefined) ||
              getDefaultFlowId(summaries) ||
              undefined;

          if (
            (requestedSystemFlowType === "handoff" || requestedSystemFlowType === "csat") &&
            !initialFlowId
          ) {
            initialFlowId =
              (await ensureSystemFlowExists(botId, requestedSystemFlowType as "handoff" | "csat")) || undefined;
          }

          if (cancelled) return;
          if (!initialFlowId && !requestedSystemFlowType) {
            setCurrentFlowId(null);
            setCurrentFlowName("");
            applyLoadedFlow(buildBlankFlowCanvas());
            return;
          }

          const data = await flowService.getFlow(botId, initialFlowId);
          if (cancelled) return;
          applyLoadedFlow(data);
        } else {
          setCurrentFlowId(null);
          setCurrentFlowName("");
          setFlowSummaries([]);
          console.log("leadForms RESET TO EMPTY - reason:", "workspace/project missing or else branch");
          setLeadForms([]);
          setResolvedLeadFormWorkspaceId("");
          setResolvedLeadFormProjectId("");
          setAllowedNodeTypes([]);
          setNodeDisabledReasons({});
          setIsSystemFlow(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error("Session initialization failed:", err);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadPortalData();
    return () => {
      cancelled = true;
    };
  }, [
    botId,
    campaignId,
    isUnlocked,
    unlockedBotIds,
    router.isReady,
    router.query.flowId,
    router.query.systemFlowType,
    applyLoadedFlow,
    refreshFlowSummariesSafe,
    getDefaultFlowId,
    getSystemFlowIdByType,
    activeWorkspace?.workspace_id,
    activeProject?.id,
    isCampaignSystemFlowEditor,
    requestedSystemFlowType,
    router.query.flowId,
  ]);

  const openCreateFlowDialog = useCallback(() => {
    const nextIndex = (flowSummaries?.length || 0) + 1;
    setFlowNameDraft(`Flow ${nextIndex}`);
    setFlowNameDialogMode("create");
  }, [flowSummaries.length]);

  const regularFlowSummaries = useMemo(
    () =>
      flowSummaries.filter((flow: any) => {
        const flowType = String(flow?.system_flow_type || flow?.flow_json?.system_flow_type || "").trim();
        return !Boolean(flow.is_global_flow || flow.is_system_flow || flowType);
      }),
    [flowSummaries]
  );

  const openRenameFlowDialog = useCallback(() => {
    if (!currentFlowId) {
      return;
    }
    setFlowNameDraft(currentFlowName || "Untitled flow");
    setFlowNameDialogMode("rename");
  }, [currentFlowId, currentFlowName]);

  const closeFlowNameDialog = useCallback(() => {
    setFlowNameDialogMode(null);
    setFlowNameDraft("");
  }, []);

  const handleCreateFlow = useCallback(async (requestedName: string) => {
    if (isCampaignSystemFlowEditor) {
      notify("Campaign system flows are edited from the shared flow template.", "error");
      return;
    }
    if (!botId || !canEditTopology) {
      return;
    }

    const blankBlueprint = {
      layout_left_to_right: true,
      nodes: [
        {
          id: `node-start-${Date.now()}`,
          type: "start",
          position: { x: 120, y: 120 },
          data: { label: "Start" },
        },
      ],
      edges: [],
    };

    const created = await flowService.createFlow(
      botId,
      blankBlueprint,
      requestedName,
      regularFlowSummaries.length === 0
    );

    await refreshFlowSummariesSafe(botId);
    const createdFlowId = String(created?.id || "").trim();
    if (createdFlowId) {
      setCurrentFlowId(createdFlowId);
      await router.replace(
        {
          pathname: router.pathname,
          query: {
            ...router.query,
            botId,
            flowId: createdFlowId,
          },
        },
        undefined,
        { shallow: true }
      ).catch(() => undefined);
    }
    applyLoadedFlow(created);
    setSelectedNode(null);
    setIsDirty(false);
  }, [applyLoadedFlow, botId, canEditTopology, refreshFlowSummariesSafe, regularFlowSummaries.length, router, setCurrentFlowId, isCampaignSystemFlowEditor]);

  const persistFlow = useCallback(async (
    nextNodes = nodes,
    nextEdges = edges,
    force = false,
    nextFlowName = currentFlowName,
    showValidationError = true,
    skipValidation = false
  ) => {
    const sanitized = sanitizeFlowGraphEdges(nextNodes, nextEdges);
    if (sanitized.removedInvalidEdges > 0) {
      notify("Cleaned up invalid connections before saving the flow.", "info");
      setNodes(sanitized.nodes);
      setEdges(sanitized.edges);
      nextNodes = sanitized.nodes;
      nextEdges = sanitized.edges;
    }

    if (!canEditProjectWorkflow) {
      notify("You do not have permission to edit this workflow.", "error");
      return false;
    }
    if (!botId && !isCampaignSystemFlowEditor) {
      notify("Cannot save: this workflow is currently locked.", "error");
      console.warn("persistFlow blocked", {
        botId: !!botId,
        campaignId: !!campaignId,
        canEditProjectWorkflow,
        permissionsReady,
        activeWorkspaceId: activeWorkspace?.workspace_id,
        activeProjectId: activeProject?.id,
      });
      return false;
    }
    if (!skipValidation) {
      const validation = validateFlowGraph(nextNodes, nextEdges);
      if (!validation.isValid) {
        if (showValidationError) {
          const invalidSummaries = (validation.invalidNodes || [])
            .filter((entry) => Boolean(String(entry?.label || entry?.id || "").trim()))
            .slice(0, 4)
            .map((entry) => {
              const label = String(entry.label || entry.id || "Node").trim();
              const reason = String(entry.reason || "").trim();
              return reason ? `${label} (${reason})` : label;
            });
          notify(
            invalidSummaries.length > 0
              ? `Cannot save flow. Please fix: ${invalidSummaries.join(", ")}.`
              : "Cannot save flow. Please ensure all nodes are properly connected.",
            "error"
          );
        }
        return false;
      }
    }
    if (!force && !isDirty) return true;

    setIsSaving(true);
    try {
      if (isCampaignSystemFlowEditor) {
        const flowKey = String(currentFlowId || requestedSystemFlowType || "").trim() || requestedSystemFlowType;
        const currentCampaign = botMetadata || {};
        const currentSettings = (currentCampaign?.settings_json && typeof currentCampaign.settings_json === "object")
          ? currentCampaign.settings_json
          : {};
        const nextFlowJson = {
          nodes: nextNodes,
          edges: nextEdges,
          layout_left_to_right: flowLayoutLeftToRight,
          layoutLeftToRight: flowLayoutLeftToRight,
        };
        const nextSettings = {
          ...currentSettings,
          system_flows: {
            ...(currentSettings.system_flows && typeof currentSettings.system_flows === "object" ? currentSettings.system_flows : {}),
            [flowKey]: {
              ...nextFlowJson,
              flow_name: String(nextFlowName || currentFlowName).trim() || undefined,
            },
          },
        };
        const savedCampaign = await campaignService.update(campaignId, {
          settingsJson: nextSettings,
        });
        setBotMetadata(savedCampaign);
        setCurrentFlowId(flowKey);
        setCurrentFlowName(String(nextFlowName || currentFlowName).trim());
        await refreshFlowSummariesSafe(campaignId);
      } else {
        const saved = await flowService.saveFlow(
          botId,
          {
            nodes: nextNodes,
            edges: nextEdges,
            layout_left_to_right: flowLayoutLeftToRight,
            layoutLeftToRight: flowLayoutLeftToRight,
          },
          currentFlowId || undefined,
          String(nextFlowName || currentFlowName).trim() || undefined
        );
        setCurrentFlowId(saved?.id || currentFlowId);
        setCurrentFlowName(String(saved?.flow_name || currentFlowName).trim());
        if (saved?.id) {
          await refreshFlowSummariesSafe(botId);
        }
      }
      clearFlowDraftSnapshot(flowDraftStorageKey);
      setIsDirty(false);
      return true;
    } catch (err) { 
      console.error("Save error", err); 
      notifyApiError(err, "Failed to save workflow.", "Workflow Save Failed");
      return false;
    } finally {
      setTimeout(() => setIsSaving(false), 800);
    }
  }, [botId, campaignId, requestedSystemFlowType, nodes, edges, isDirty, currentFlowId, currentFlowName, canEditProjectWorkflow, permissionsReady, activeWorkspace?.workspace_id, activeProject?.id, refreshFlowSummariesSafe, flowLayoutLeftToRight, flowDraftStorageKey, isCampaignSystemFlowEditor, botMetadata]);

  const handleRenameFlow = useCallback(async (nextName: string) => {
    if ((!botId && !isCampaignSystemFlowEditor) || !currentFlowId || !canEditProjectWorkflow) {
      return;
    }

    setIsSaving(true);
    try {
      const saved = await persistFlow(nodes, edges, true, nextName);
      if (saved) {
        setCurrentFlowName(nextName);
        await refreshFlowSummariesSafe(isCampaignSystemFlowEditor ? campaignId : botId);
        setIsDirty(false);
        notify("Flow name updated.", "success");
      }
    } catch (err) {
      console.error("Rename flow error", err);
      notifyApiError(err, "Failed to rename flow.", "Rename Failed");
    } finally {
      setIsSaving(false);
    }
  }, [botId, campaignId, isCampaignSystemFlowEditor, canEditProjectWorkflow, currentFlowId, nodes, edges, refreshFlowSummariesSafe, persistFlow]);

  const handleSubmitFlowNameDialog = useCallback(async () => {
    const nextName = flowNameDraft.trim();
    if (!nextName) {
      notify("Flow name is required.", "error");
      return;
    }

    if (flowNameDialogMode === "create") {
      await handleCreateFlow(nextName);
      closeFlowNameDialog();
      return;
    }

    if (flowNameDialogMode === "rename") {
      await handleRenameFlow(nextName);
      closeFlowNameDialog();
    }
  }, [closeFlowNameDialog, flowNameDialogMode, flowNameDraft, handleCreateFlow, handleRenameFlow]);

  const handleSave = useCallback(async () => {
    if (suppressAutoSaveRef.current || manualNodeSaveInFlightRef.current) {
      return;
    }
    const saved = await persistFlow(nodes, edges, false);
    if (saved && flowDraftStorageKey) {
      clearFlowDraftSnapshot(flowDraftStorageKey);
      setDraftSaveStatus("Saved to backend.");
    }
  }, [persistFlow, nodes, edges, flowDraftStorageKey, suppressAutoSaveRef, manualNodeSaveInFlightRef]);

  const handleAutoDraftSave = useCallback(() => {
    if (!flowDraftStorageKey || suppressAutoSaveRef.current || manualNodeSaveInFlightRef.current) {
      return;
    }

    writeFlowDraftSnapshot(flowDraftStorageKey, {
      botId: String(botId || "").trim(),
      flowId: String(currentFlowId || "").trim(),
      flowName: String(currentFlowName || "").trim(),
      savedAt: new Date().toISOString(),
      nodes,
      edges,
      layoutLeftToRight: flowLayoutLeftToRight,
    });
    setDraftSaveStatus(`Draft saved locally at ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`);
  }, [
    botId,
    currentFlowId,
    currentFlowName,
    edges,
    flowDraftStorageKey,
    flowLayoutLeftToRight,
    manualNodeSaveInFlightRef,
    nodes,
    suppressAutoSaveRef,
  ]);

  const suppressNodeReselect = useCallback(() => {
    suppressNodeSelectionRef.current = true;
    window.setTimeout(() => {
      suppressNodeSelectionRef.current = false;
    }, 600);
  }, []);

  const buildPatchedNodeForSave = useCallback((nodeToPatch: Node, nextData: any) => {
    const normalizedType = normalizeCanvasNodeType(nodeToPatch?.type, nextData);
    return {
      ...nodeToPatch,
      id: String(nodeToPatch?.id || ""),
      type: normalizedType,
      data: normalizeCanvasNodeData(normalizedType, nextData),
    };
  }, []);

  const handleNodeSaveAndClose = useCallback(async (newData: any): Promise<boolean> => {
    console.log("3. Reached handleNodeSaveAndClose in flows.tsx");
    console.info("[NodeSave][FlowCanvas] save-handler-start", {
      flowId: currentFlowId || null,
      selectedNodeId: selectedNode?.id || null,
      selectedNodeType: selectedNode?.type || null,
      isDirty,
      isSaving,
    });
    if (!permissionsReady) {
      console.warn("handleNodeSaveAndClose: permissions not ready, aborting");
      notify("Loading workspace permissions. Please try again in a moment.", "error");
      return false;
    }
    if (!canEditProjectWorkflow) {
      notify("You do not have permission to edit this workflow.", "error");
      return false;
    }
    if (!selectedNode) {
      notify("Missing required fields in this node.", "error");
      setSelectedNode(null);
      return false;
    }

    const selectedNodeId = String(selectedNode.id);
    const patchedNode = buildPatchedNodeForSave(selectedNode, newData);

    const nextNodes = nodes.map((node) =>
      node.id === selectedNode.id ? patchedNode : node
    );

    setNodes(nextNodes);
    setSelectedNode(null);
    setIsDirty(true);
    writeFlowDraftSnapshot(flowDraftStorageKey, {
      botId: String(botId || "").trim(),
      flowId: String(currentFlowId || "").trim(),
      flowName: String(currentFlowName || "").trim(),
      savedAt: new Date().toISOString(),
      nodes: nextNodes,
      edges,
      layoutLeftToRight: flowLayoutLeftToRight,
    });
    setDraftSaveStatus("Draft updated locally.");
    console.info("[NodeSave][FlowCanvas] save-handler-local-success", {
      flowId: currentFlowId || null,
      selectedNodeId,
      selectedNodeType: patchedNode?.type || null,
    });
    setSelectedNode(null);
    return true;
  }, [selectedNode, buildPatchedNodeForSave, nodes, edges, setNodes, currentFlowName, currentFlowId, flowDraftStorageKey, botId, flowLayoutLeftToRight]);

  const handleCloseNodeEditor = useCallback(() => {
    console.info("[NodeSave][FlowCanvas] editor-close-requested", {
      selectedNodeId: selectedNode?.id || null,
      selectedNodeType: selectedNode?.type || null,
    });
    suppressNodeReselect();
    setSelectedNode(null);
  }, [suppressNodeReselect]);

  const handleCloseBuilder = useCallback(async () => {
    if (isSaving) {
      return;
    }

    try {
      if (isDirty && canEditProjectWorkflow) {
        const saved = await persistFlow(nodes, edges, false);
        if (!saved) {
          return;
        }
      }
      await router.push("/bots");
    } catch (err) {
      console.error("Close builder error", err);
      notifyApiError(err, "Failed to save workflow before closing.", "Close Builder Failed");
    }
  }, [canEditProjectWorkflow, persistFlow, nodes, edges, isDirty, isSaving, router]);

  const handleSelectFlow = useCallback(async (flowId: string) => {
    if ((!botId && !isCampaignSystemFlowEditor) || !flowId) {
      return;
    }

    try {
      if (isDirty) {
        const saved = await persistFlow(nodes, edges, false);
        if (!saved) {
          return;
        }
      }
      setIsLoading(true);
      const data = isCampaignSystemFlowEditor
        ? (() => {
            const campaignSettings = botMetadata?.settings_json || {};
            const selectedFlow = campaignSettings?.system_flows?.[flowId];
            return selectedFlow
              ? {
                  id: flowId,
                  flow_name: selectedFlow.flow_name || (flowId === "handoff" ? "Global: Human Handoff" : "Post-Handoff CSAT"),
                  flow_json: selectedFlow,
                  is_system_flow: true,
                  is_global_flow: true,
                }
              : null;
          })()
        : await flowService.getFlow(botId, flowId);
      if (!data) {
        throw new Error("Flow not found");
      }
      applyLoadedFlow(data);
      setSelectedNode(null);
      setIsDirty(false);
    } catch (err) {
      console.error("Failed to load selected flow", err);
      notifyApiError(err, "Failed to load flow.", "Flow Load Failed");
    } finally {
      setIsLoading(false);
    }
  }, [applyLoadedFlow, botId, campaignId, isCampaignSystemFlowEditor, botMetadata, persistFlow, nodes, edges, isDirty]);

  useEffect(() => {
    if (suppressAutoSaveRef.current || manualNodeSaveInFlightRef.current) {
      return;
    }
    if (isDirty && flowValidation.isValid) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(handleAutoDraftSave, AUTO_SAVE_DELAY);
    }
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [isDirty, handleAutoDraftSave, flowValidation.isValid]);

  const deleteSelected = useCallback(() => {
    if (!canEditTopology) return;
    takeSnapshot();
    setNodes((nds) => nds.filter((node) => !node.selected || String(node?.type || "").trim().toLowerCase() === "start"));
    setEdges((eds) => eds.filter((edge) => !edge.selected));
    setSelectedNode(null); 
    setIsDirty(true);
  }, [canEditTopology, takeSnapshot, setNodes, setEdges]);

  const selectAll = useCallback(() => {
    if (!canEditTopology) return;
    setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
    setEdges((eds) => eds.map((e) => ({ ...e, selected: true })));
  }, [canEditTopology, setNodes, setEdges]);

  const copySelected = useCallback(async () => {
    if (!canEditTopology) return;
    const selectedNodes = nodes.filter((node) => node.selected);
    if (!selectedNodes.length) {
      notify("Select one or more nodes first.", "error");
      return;
    }

    const selectedNodeIds = new Set(selectedNodes.map((node) => String(node.id)));
    const selectedEdges = edges.filter(
      (edge) =>
        selectedNodeIds.has(String(edge.source)) &&
        selectedNodeIds.has(String(edge.target))
    );

    const payload = {
      nodes: selectedNodes.map((node) => sanitizeClipboardNode(node)),
      edges: selectedEdges.map((edge) => sanitizeClipboardEdge(edge)),
    };

    flowClipboardRef.current = payload;
    setHasClipboardSelection(true);

    try {
      await navigator.clipboard.writeText(JSON.stringify(payload));
    } catch {}

    notify(`Copied ${selectedNodes.length} node${selectedNodes.length === 1 ? "" : "s"}.`, "success");
  }, [canEditTopology, nodes, edges]);

  const pasteSelected = useCallback(async () => {
    if (!canEditTopology) return;

    let payload = flowClipboardRef.current;
    if (!payload) {
      try {
        const text = await navigator.clipboard.readText();
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed?.nodes) && Array.isArray(parsed?.edges)) {
          payload = parsed;
        }
      } catch {}
    }

    if (!payload?.nodes?.length) {
      notify("No copied nodes are available to paste.", "error");
      return;
    }

    takeSnapshot();
    const timestamp = Date.now();
    const idMap = new Map<string, string>();
    const pastedNodes: Node[] = payload.nodes.map((node, index) => {
      const nextId = `${String(node.id)}-copy-${timestamp}-${index}`;
      idMap.set(String(node.id), nextId);
      return {
        ...sanitizeClipboardNode(node as Node),
        id: nextId,
        selected: true,
        position: {
          x: Number(node.position?.x || 0) + 60,
          y: Number(node.position?.y || 0) + 60,
        },
      };
    });
    const pastedEdges: Edge[] = payload.edges
      .filter((edge) => idMap.has(String(edge.source)) && idMap.has(String(edge.target)))
      .map((edge, index) => ({
        ...sanitizeClipboardEdge(edge as Edge),
        id: `${String(edge.id || `edge-${index}`)}-copy-${timestamp}-${index}`,
        source: idMap.get(String(edge.source)) || String(edge.source),
        target: idMap.get(String(edge.target)) || String(edge.target),
        selected: true,
      }));

    setNodes((nds) => {
      const clearedNodes: Node[] = nds.map((node) => ({ ...node, selected: false }));
      return [...clearedNodes, ...pastedNodes];
    });
    setEdges((eds) => {
      const clearedEdges: Edge[] = eds.map((edge) => ({ ...edge, selected: false }));
      return [...clearedEdges, ...pastedEdges];
    });
    setIsDirty(true);
    notify(`Pasted ${pastedNodes.length} node${pastedNodes.length === 1 ? "" : "s"}.`, "success");
  }, [canEditTopology, setNodes, setEdges, takeSnapshot]);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      const element = target instanceof HTMLElement ? target : null;
      if (!element) {
        return false;
      }

      const tagName = element.tagName.toLowerCase();
      if (element.isContentEditable) {
        return true;
      }

      return ["input", "textarea", "select", "option", "button"].includes(tagName);
    };

  const handleKeyDown = (e: KeyboardEvent) => {
    const activeElement = document.activeElement as HTMLElement | null;
    const selection = typeof window !== "undefined" ? window.getSelection?.() : null;
    const hasTextSelection = Boolean(selection && !selection.isCollapsed && String(selection.toString() || "").trim());
    if (isEditableTarget(e.target) || isEditableTarget(activeElement)) {
      return;
    }

    if (hasTextSelection) {
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
        return;
      }

      if (!canEditTopology) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        selectAll();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        copySelected().catch?.(() => undefined);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        pasteSelected().catch?.(() => undefined);
        return;
      }

      if (e.key === "Delete") {
        e.preventDefault();
        deleteSelected();
        return;
      }

      if (e.key === "Backspace") {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, deleteSelected, selectAll, copySelected, pasteSelected, canEditTopology]);

  const onAddNode = (type: string) => {
    if (!canEditTopology) return;
    if (allowedNodeTypes.length > 0 && !allowedNodeTypes.includes(type)) {
      notify(nodeDisabledReasons[type] || "This node is not available for the current workspace.", "error");
      return;
    }
    takeSnapshot();
    const offset = (nodes.length % 15) * 30; 
    const newNode: Node = { id: `node-${Date.now()}`, type, position: { x: 300 + offset, y: 150 + offset }, data: buildDefaultNodeData(type) };
    setNodes((nds) => nds.concat(newNode));
    setIsDirty(true);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!canEditTopology) return;
    const type = e.dataTransfer.getData('application/reactflow');
    if (!type || !reactFlowWrapper.current) return;
    if (allowedNodeTypes.length > 0 && !allowedNodeTypes.includes(type)) {
      notify(nodeDisabledReasons[type] || "This node is not available for the current workspace.", "error");
      return;
    }
    const position = screenToFlowPosition({
      x: e.clientX,
      y: e.clientY,
    });
    takeSnapshot();
    const newNode: Node = { id: `node-${Date.now()}`, type, position, data: buildDefaultNodeData(type) };
    setNodes((nds) => nds.concat(newNode));
    setIsDirty(true);
  }, [setNodes, takeSnapshot, screenToFlowPosition, canEditTopology, allowedNodeTypes, nodeDisabledReasons, buildDefaultNodeData]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEditTopology) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        importFlowJsonPayload(json);
      } catch (err) { notify("Error parsing JSON.", "error"); }
      if (fileInputRef.current) fileInputRef.current.value = ""; 
    };
    reader.readAsText(file);
  };

  const handleDownloadSample = () => {
    const sampleData = {
      flow_name: "Starter Lead Qualification Flow",
      is_system_flow: false,
      layout_left_to_right: true,
      nodes: [
        { id: "start_1", type: "start", position: { x: 80, y: 120 }, data: { label: "Start" } },
        {
          id: "msg_welcome_1",
          type: "message",
          position: { x: 320, y: 120 },
          data: { label: "Intro", text: "Sample greeting message for a blank flow." },
        },
        {
          id: "menu_main_1",
          type: "menu",
          position: { x: 580, y: 120 },
          data: {
            label: "Main Menu",
            text: "Please choose one option:",
            item1: "Sales Lead",
            item2: "Talk to Human",
            item3: "Other / Error",
          },
        },
        {
          id: "msg_lead_intro_1",
          type: "message",
          position: { x: 840, y: 40 },
          data: { label: "Lead Intro", text: "Great. Let's get a few details so we can help you better." },
        },
        {
          id: "input_name_1",
          type: "input",
          position: { x: 1090, y: 40 },
          data: {
            label: "Lead Name",
            text: "What's your name?",
            variable: "full_name",
            linkedFieldKey: "lead_name",
            leadField: "lead_name",
            field: "lead_name",
            linkLeadForm: false,
            validation: "text",
            onInvalidMessage: "Please enter your name again.",
            maxRetries: 3,
            timeout: 900,
            reminderDelay: 300,
            reminderText: "",
            timeoutFallback: "",
          },
        },
        {
          id: "input_email_1",
          type: "input",
          position: { x: 1340, y: 40 },
          data: {
            label: "Lead Email",
            text: "Step 2: Great, {{full_name}}. Now provide your Email...",
            variable: "lead_email",
            linkedFieldKey: "lead_email",
            leadField: "lead_email",
            field: "lead_email",
            linkLeadForm: false,
            validation: "email",
            onInvalidMessage: "Please enter a valid email address.",
            maxRetries: 3,
            timeout: 900,
            reminderDelay: 300,
            reminderText: "",
            timeoutFallback: "",
          },
        },
        {
          id: "cond_email_1",
          type: "condition",
          position: { x: 1590, y: 40 },
          data: {
            label: "Email Exists?",
            rules: [
              { id: "rule_email_ok", if: "{{lead_email}} is not empty", next_node_id: "save_qualified_1" },
              { id: "rule_email_missing", if: "otherwise", next_node_id: "msg_error_1" },
            ],
          },
        },
        {
          id: "save_qualified_1",
          type: "save",
          position: { x: 1840, y: 40 },
          data: { label: "Mark Qualified", field: "lead_status", value: "qualified" },
        },
        {
          id: "msg_handoff_intro_1",
          type: "message",
          position: { x: 840, y: 260 },
          data: { label: "Handoff Intro", text: "No problem. I will connect you to a human agent now." },
        },
        {
          id: "assign_agent_1",
          type: "assign_agent",
          position: { x: 1090, y: 260 },
          data: { label: "Assign Agent", strategy: "lowest_load_online" },
        },
        {
          id: "msg_handoff_note_1",
          type: "message",
          position: { x: 1340, y: 260 },
          data: { label: "Handoff Note", text: "A human agent has been notified. Please wait here and we will reply shortly." },
        },
        {
          id: "msg_error_1",
          type: "message",
          position: { x: 840, y: 480 },
          data: { label: "Error Recovery", text: "I'm sorry, I didn't quite understand that. Please try again or choose an option from the menu." },
        },
        { id: "end_1", type: "end", position: { x: 1840, y: 260 }, data: { label: "End" } },
        { id: "end_2", type: "end", position: { x: 1090, y: 480 }, data: { label: "End" } },
      ],
      edges: [
        { id: "e_start_welcome", source: "start_1", target: "msg_welcome_1", sourceHandle: "next" },
        { id: "e_welcome_menu", source: "msg_welcome_1", target: "menu_main_1", sourceHandle: "next" },
        { id: "e_menu_sales", source: "menu_main_1", sourceHandle: "item1", target: "msg_lead_intro_1" },
        { id: "e_menu_human", source: "menu_main_1", sourceHandle: "item2", target: "msg_handoff_intro_1" },
        { id: "e_menu_other", source: "menu_main_1", sourceHandle: "item3", target: "msg_error_1" },
        { id: "e_lead_intro_name", source: "msg_lead_intro_1", target: "input_name_1", sourceHandle: "next" },
        { id: "e_name_email", source: "input_name_1", target: "input_email_1", sourceHandle: "response" },
        { id: "e_email_condition", source: "input_email_1", target: "cond_email_1", sourceHandle: "response" },
        { id: "e_cond_true", source: "cond_email_1", sourceHandle: "true", target: "save_qualified_1" },
        { id: "e_cond_false", source: "cond_email_1", sourceHandle: "false", target: "msg_error_1" },
        { id: "e_qualified_handoff", source: "save_qualified_1", target: "msg_handoff_intro_1", sourceHandle: "next" },
        { id: "e_handoff_assign", source: "msg_handoff_intro_1", target: "assign_agent_1", sourceHandle: "next" },
        { id: "e_assign_note", source: "assign_agent_1", target: "msg_handoff_note_1", sourceHandle: "response" },
        { id: "e_note_end", source: "msg_handoff_note_1", target: "end_1", sourceHandle: "next" },
        { id: "e_error_end", source: "msg_error_1", target: "end_2", sourceHandle: "next" },
      ],
    };
    const blob = new Blob([JSON.stringify(sampleData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "sample-flow.json"; document.body.appendChild(link);
    link.click(); document.body.removeChild(link);
  };

  const onInit = useCallback((reactFlowInstance: any) => {
    reactFlowInstance.setViewport({ x: 0, y: 0, zoom: 1 });
  }, []);

  const handleDeleteFlow = useCallback(async () => {
    if (!currentFlowId || !botId || isSaving) {
      return;
    }
    if (isSystemFlow) {
      notify("System flows cannot be removed from the builder.", "error");
      return;
    }
    if (!canDeleteProjectFlow) {
      notify("You do not have permission to remove workflows.", "error");
      return;
    }

    const confirmed = await confirmAction(
      "Remove workflow?",
      "This will permanently delete the current workflow for this bot. This action cannot be undone.",
      "Remove Flow",
      "Keep Flow"
    );

    if (!confirmed) {
      return;
    }

    setIsSaving(true);
    try {
      await flowService.deleteFlow(currentFlowId);
      notify("Workflow removed.", "success");

      const nextFlow = await flowService.getFlow(botId);
      applyLoadedFlow(nextFlow);
      setSelectedNode(null);
      setIsDirty(false);
    } catch (err) {
      console.error("Delete flow error", err);
      notifyApiError(err, "Failed to remove workflow.", "Remove Failed");
    } finally {
      setIsSaving(false);
    }
  }, [applyLoadedFlow, botId, currentFlowId, isSaving, canDeleteProjectFlow, isSystemFlow]);

  const handleOpenGlobalRulesInfo = useCallback(() => {
    setIsGlobalRulesInfoOpen(true);
  }, []);

  const handleOpenBotGlobalRules = useCallback(async () => {
    try {
      if (isDirty && canEditProjectWorkflow) {
        const saved = await persistFlow(nodes, edges, false);
        if (!saved) {
          return;
        }
      }
      await router.push(`/bots?editBot=${encodeURIComponent(String(botId || ""))}`);
    } catch (error) {
      console.error("Open bot global rules failed:", error);
      notifyApiError(error, "Unable to open the bot settings screen.", "Navigation Failed");
    }
  }, [botId, canEditProjectWorkflow, edges, isDirty, nodes, persistFlow, router]);

  if (shouldHoldForWorkspace) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-[2rem] border border-dashed border-border-main bg-surface px-6 py-12 text-sm font-semibold tracking-wide text-text-muted">
        Loading workspace context...
      </div>
    );
  }

  if (isLoading) return <div className="flex min-h-full w-full items-center justify-center bg-canvas text-text-main font-black animate-pulse tracking-tighter uppercase">Loading Workflow...</div>;

  if ((!botId && !campaignId) || (!isCampaignSystemFlowEditor && !isUnlocked)) {
    return (
      <FlowPortal availableBots={availableBots} embedded />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex h-screen w-screen flex-col overflow-hidden bg-canvas font-sans text-text-main">
        <RequirePermission
          permissionKey="edit_workflow"
          fallback={
      <FlowHeader
          isSidebarOpen={isSidebarOpen}
              setIsSidebarOpen={setIsSidebarOpen}
              botName={botMetadata?.name}
              botId={botId || campaignId}
              builderContextLabel={campaignId ? "Campaign System Flow" : undefined}
              canEditWorkflow={false}
              canDeleteFlowAction={canDeleteProjectFlow}
              flowSummaries={regularFlowSummaries}
              currentFlowId={currentFlowId}
              currentFlowName={currentFlowName}
              onSelectFlow={handleSelectFlow}
              onCreateFlow={openCreateFlowDialog}
              onEditFlowName={openRenameFlowDialog}
              onDownloadSample={handleDownloadSample}
              fileInputRef={fileInputRef}
              onFileUpload={handleFileUpload}
              onPasteJson={handleOpenPasteJsonDialog}
              onUndo={undo}
              onRedo={redo}
              canUndo={past.length > 0}
              canRedo={future.length > 0}
              onDeleteSelected={deleteSelected}
              onCopySelected={copySelected}
              onPasteSelected={pasteSelected}
              onDeleteFlow={handleDeleteFlow}
              onSave={handleSave}
              onOpenGlobalRulesInfo={handleOpenGlobalRulesInfo}
              onCloseBuilder={handleCloseBuilder}
              isDirty={isDirty}
              isSaving={isSaving}
              draftSaveStatus={draftSaveStatus}
              canDeleteFlow={Boolean(currentFlowId) && !isSystemFlow}
              canPasteSelection={hasClipboardSelection}
              isSystemFlow={isSystemFlow}
            />
          }
        >
        <FlowHeader
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
          botName={botMetadata?.name}
          botId={botId || campaignId}
          builderContextLabel={campaignId ? "Campaign System Flow" : undefined}
          canEditWorkflow={canEditProjectWorkflow}
          isSystemFlow={isSystemFlow}
          canDeleteFlowAction={canDeleteProjectFlow}
          flowSummaries={regularFlowSummaries}
          currentFlowId={currentFlowId}
          currentFlowName={currentFlowName}
          onSelectFlow={handleSelectFlow}
          onCreateFlow={openCreateFlowDialog}
          onEditFlowName={openRenameFlowDialog}
        onDownloadSample={handleDownloadSample}
        fileInputRef={fileInputRef}
        onFileUpload={handleFileUpload}
        onPasteJson={handleOpenPasteJsonDialog}
        onUndo={undo}
        onRedo={redo}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onDeleteSelected={deleteSelected}
        onCopySelected={copySelected}
        onPasteSelected={pasteSelected}
        onDeleteFlow={handleDeleteFlow}
        onSave={handleSave}
        onOpenGlobalRulesInfo={handleOpenGlobalRulesInfo}
        onCloseBuilder={handleCloseBuilder}
        isDirty={isDirty}
        isSaving={isSaving}
        draftSaveStatus={draftSaveStatus}
        canDeleteFlow={Boolean(currentFlowId) && !isSystemFlow}
        canPasteSelection={hasClipboardSelection}
      />
      </RequirePermission>

      <div className="flex-1 flex overflow-hidden relative">
        {flowNameDialogMode ? (
          <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-[1.5rem] border border-border-main bg-surface p-6 shadow-sm">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
                {flowNameDialogMode === "create" ? "Create Flow" : "Rename Flow"}
              </div>
              <h3 className="mt-3 text-lg font-semibold text-text-main">
                {flowNameDialogMode === "create" ? "Name the new flow" : "Update flow name"}
              </h3>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                {flowNameDialogMode === "create"
                  ? "Create a separate workflow for this bot with a clear name."
                  : "Change the current flow name without leaving the builder."}
              </p>
              <input
                autoFocus
                value={flowNameDraft}
                onChange={(event) => setFlowNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleSubmitFlowNameDialog().catch(() => undefined);
                  }
                }}
                placeholder="Flow name"
                className="mt-5 w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm font-semibold text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <div className="mt-5 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeFlowNameDialog}
                  className="rounded-xl border border-border-main bg-canvas px-4 py-2.5 text-xs font-black uppercase tracking-[0.16em] text-text-main transition hover:bg-surface hover:border-primary/30"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmitFlowNameDialog().catch(() => undefined)}
                  className="rounded-xl bg-primary px-4 py-2.5 text-xs font-black uppercase tracking-[0.16em] text-white transition-opacity hover:opacity-90"
                >
                  {flowNameDialogMode === "create" ? "Create New" : "Save"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {isPasteJsonOpen ? (
          <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
            <div className="w-full max-w-3xl rounded-[1.5rem] border border-border-main bg-surface p-6 shadow-sm">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
                Paste JSON Flow
              </div>
              <h3 className="mt-3 text-lg font-semibold text-text-main">
                Paste a flow export to import it
              </h3>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                You can paste the raw JSON directly here. If the payload contains `flow_json`, it will be imported automatically.
              </p>
              <textarea
                autoFocus
                value={pasteJsonDraft}
                onChange={(event) => {
                  setPasteJsonDraft(event.target.value);
                  if (pasteJsonError) {
                    setPasteJsonError("");
                  }
                }}
                placeholder='Paste JSON here, for example: { "flow_json": { "nodes": [], "edges": [] } }'
                className="mt-5 min-h-[24rem] w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm font-mono text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              {pasteJsonError ? (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {pasteJsonError}
                </div>
              ) : null}
              <div className="mt-5 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsPasteJsonOpen(false);
                    setPasteJsonDraft("");
                    setPasteJsonError("");
                  }}
                  className="rounded-xl border border-border-main bg-canvas px-4 py-2.5 text-xs font-black uppercase tracking-[0.16em] text-text-main transition hover:bg-surface hover:border-primary/30"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPastedJson()}
                  disabled={isImportingPasteJson}
                  className="rounded-xl bg-primary px-4 py-2.5 text-xs font-black uppercase tracking-[0.16em] text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isImportingPasteJson ? "Importing..." : "Import JSON"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {!isSystemFlow ? (
          <FlowSidebar
            isOpen={isSidebarOpen}
            onAddNode={onAddNode}
            canEditWorkflow={canEditTopology}
            allowedNodeTypes={allowedNodeTypes}
            disabledReasons={nodeDisabledReasons}
          />
        ) : null}

        <GlobalRulesInfoPanel
          isOpen={isGlobalRulesInfoOpen}
          onClose={() => setIsGlobalRulesInfoOpen(false)}
          botId={botId}
          botName={botMetadata?.name}
          globalSettings={botGlobalSettings}
          flowSummaries={flowSummaries}
          onEditGlobalRules={handleOpenBotGlobalRules}
        />

        <FlowValidationProvider value={{ invalidNodeReasons: flowValidation.invalidNodeReasons, isLockedTopology: isSystemFlow }}>
          <div className="flex-1 relative w-full h-full" ref={reactFlowWrapper} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
            {!canEditProjectWorkflow ? (
              <div className="absolute left-1/2 top-5 z-50 -translate-x-1/2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700 shadow-sm">
                Read-only workflow mode
              </div>
            ) : null}
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_, n) => {
                if (suppressNodeSelectionRef.current) {
                  return;
                }
                setSelectedNode(n);
              }}
              onPaneClick={() => setSelectedNode(null)}
              nodeTypes={nodeTypes}
              panOnDrag={true}
              selectionOnDrag={false}
              selectionMode={SelectionMode.Partial}
              multiSelectionKeyCode="Shift"
              selectionKeyCode="Shift"
              panOnScroll={true}
              deleteKeyCode={isReadOnly ? null : "Delete"}
              nodesDraggable={canEditTopology}
              nodesConnectable={canEditTopology}
              elementsSelectable={canEditTopology}
              onInit={onInit} 
              className="bg-canvas"
            >
              <Background color="var(--border)" gap={20} size={1} />
              <Controls className="mb-4 ml-4 shadow-xl border-none" />
              
              {selectedNode && (
            <Panel
                  position="top-right"
                  className="bg-surface border border-border-main shadow-sm rounded-2xl w-[350px] h-[85%] overflow-hidden flex flex-col mr-6 mt-6 animate-in slide-in-from-right-8 z-50"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="h-14 bg-canvas border-b border-border-main flex items-center justify-between px-5 shrink-0">
                    <span className="text-xs font-black text-text-main uppercase tracking-widest">Edit Node Data</span>
                    <button onClick={handleCloseNodeEditor} className="text-text-muted hover:text-primary"><X size={18} /></button>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                    <NodeEditor
                      node={selectedNode}
                      onSaveAndClose={handleNodeSaveAndClose}
                      onClose={handleCloseNodeEditor}
                      isReadOnly={isReadOnly}
                      permissionsReady={permissionsReady}
                      canEditWorkflow={canEditProjectWorkflow}
                      isSaving={isSaving}
                      currentBotId={botId}
                      currentWorkspaceId={resolvedLeadFormWorkspaceId || botMetadata?.workspace_id || activeWorkspace?.workspace_id}
                      currentProjectId={resolvedLeadFormProjectId || botMetadata?.project_id || activeProject?.id}
                      currentFlowId={currentFlowId}
                      isSystemFlow={isSystemFlow}
                      flowOptions={flowSummaries}
                      botOptions={handoffBots}
                      flowOptionsByBot={flowOptionsByBot}
                      leadForms={leadForms}
                    />
                    {!canEditProjectWorkflow ? (
                      <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px]" />
                    ) : null}
                  </div>
                </Panel>
              )}
            </ReactFlow>
          </div>
        </FlowValidationProvider>
      </div>
    </div>
  );
}

export default function FlowBuilderPageWrapper() {
  return (
    <ReactFlowProvider>
      <FlowBuilderCanvas />
    </ReactFlowProvider>
  );
}

