import axios from "axios";
import { query } from "../config/db";
import { resolveCampaignContext } from "./campaignContextService";
import {
  LeadCaptureContextError,
  maybeAutoCaptureLead,
  upsertLeadCapture,
} from "./leadCaptureService";
import { GenericMessage, routeMessage } from "./messageRouter";
import { normalizePlatform } from "../utils/platform";
import { applyConversationWorkspacePolicies } from "./conversationAssignmentService";
import { findConversationSettingsByWorkspace } from "../models/conversationSettingsModel";
import { upsertContactWithIdentity } from "./contactIdentityService";
import {
  cancelPendingJobsByConversation,
  createJob,
} from "../models/queueJobModel";
import { createSupportSurvey } from "../models/supportSurveyModel";

const MAX_RETRY_LIMIT = 3;

const processingLocks: Set<string> = new Set();

const ESCAPE_KEYWORDS = ["end", "exit", "stop", "cancel", "quit", "conversation end"];
const RESET_KEYWORDS = ["reset", "restart", "home", "menu", "start"];
const CSAT_RESPONSE_MAP: Record<string, "csat_good" | "csat_okay" | "csat_bad"> = {
  "csat_good": "csat_good",
  "great": "csat_good",
  "good": "csat_good",
  "csat_okay": "csat_okay",
  "okay": "csat_okay",
  "ok": "csat_okay",
  "fine": "csat_okay",
  "csat_bad": "csat_bad",
  "bad": "csat_bad",
  "poor": "csat_bad",
};

const globalAny: any = global;

if (!globalAny.activeReminders) {
  globalAny.activeReminders = new Map<string, NodeJS.Timeout>();
}

if (!globalAny.activeTimeouts) {
  globalAny.activeTimeouts = new Map<string, NodeJS.Timeout>();
}

const activeReminders = globalAny.activeReminders;
const activeTimeouts = globalAny.activeTimeouts;

const STRONG_NEGATIVE_PATTERNS = [
  "very bad",
  "not working",
  "worst",
  "angry",
  "frustrated",
  "cancel order",
  "refund",
  "complaint",
  "fake",
  "useless",
  "hate",
];

const NEGATIVE_KEYWORDS = new Set([
  "angry",
  "annoyed",
  "awful",
  "bad",
  "cancel",
  "complaint",
  "disappointed",
  "frustrated",
  "hate",
  "issue",
  "problem",
  "refund",
  "scam",
  "terrible",
  "useless",
  "worst",
]);

interface IncomingMessageOptions {
  entryKey?: string;
  requireExplicitTrigger?: boolean;
}

export const clearUserTimers = (botId: string, platformUserId: string) => {
  const key = `${botId}_${platformUserId}`;

  if (activeReminders.has(key)) {
    clearTimeout(activeReminders.get(key)!);
  }

  if (activeTimeouts.has(key)) {
    clearTimeout(activeTimeouts.get(key)!);
  }

  activeReminders.delete(key);
  activeTimeouts.delete(key);
};

const EMPTY_UUID = "00000000-0000-0000-0000-000000000000";

const buildConversationContextPayload = (resolvedContext: any) =>
  JSON.stringify({
    userId: resolvedContext.userId,
    workspaceId: resolvedContext.workspaceId,
    projectId: resolvedContext.projectId,
    campaignId: resolvedContext.campaignId,
    channelId: resolvedContext.channelId,
    entryPointId: resolvedContext.entryPointId,
    flowId: resolvedContext.flowId,
    listId: resolvedContext.listId,
    platform: resolvedContext.platform,
    platformAccountId: resolvedContext.platformAccountId,
    entryKey: resolvedContext.entryKey,
    campaignName: resolvedContext.campaignName,
    channelName: resolvedContext.channelName,
    entryName: resolvedContext.entryName,
    entryMetadata: resolvedContext.entryMetadata,
  });

const hasMismatchedConversationContext = (conversation: any, resolvedContext: any) => {
  const checks: Array<[string | null | undefined, string | null | undefined]> = [
    [conversation.campaign_id, resolvedContext.campaignId],
    [conversation.channel_id, resolvedContext.channelId],
    [conversation.entry_point_id, resolvedContext.entryPointId],
    [conversation.flow_id, resolvedContext.flowId],
    [conversation.list_id, resolvedContext.listId],
  ];

  return checks.some(
    ([existingValue, nextValue]) =>
      Boolean(existingValue) && Boolean(nextValue) && existingValue !== nextValue
  );
};

const buildConversationContextParams = (resolvedContext: any) => [
  resolvedContext.campaignId,
  resolvedContext.channelId,
  resolvedContext.entryPointId,
  resolvedContext.flowId,
  resolvedContext.listId,
];

const findConversationByContext = async (
  contactId: string,
  channel: string,
  resolvedContext: any
) => {
  const res = await query(
    `SELECT *
     FROM conversations
     WHERE contact_id = $1
       AND channel = $2
       AND COALESCE(campaign_id, '${EMPTY_UUID}'::uuid) = COALESCE($3, '${EMPTY_UUID}'::uuid)
       AND COALESCE(channel_id, '${EMPTY_UUID}'::uuid) = COALESCE($4, '${EMPTY_UUID}'::uuid)
       AND COALESCE(entry_point_id, '${EMPTY_UUID}'::uuid) = COALESCE($5, '${EMPTY_UUID}'::uuid)
       AND COALESCE(flow_id, '${EMPTY_UUID}'::uuid) = COALESCE($6, '${EMPTY_UUID}'::uuid)
       AND COALESCE(list_id, '${EMPTY_UUID}'::uuid) = COALESCE($7, '${EMPTY_UUID}'::uuid)
     ORDER BY updated_at DESC
     LIMIT 1`,
    [contactId, channel, ...buildConversationContextParams(resolvedContext)]
  );

  return res.rows[0] || null;
};

const findLatestRunnableConversation = async (
  botId: string,
  contactId: string,
  channel: string,
  projectId?: string | null
) => {
  const res = await query(
    `SELECT *
     FROM conversations
     WHERE bot_id = $1
       AND contact_id = $2
       AND channel = $3
       AND ($4::uuid IS NULL OR project_id IS NULL OR project_id = $4)
       AND status IN ('active', 'agent_pending')
     ORDER BY
       CASE WHEN current_node IS NOT NULL THEN 0 ELSE 1 END,
       updated_at DESC
     LIMIT 1`,
    [botId, contactId, channel, projectId || null]
  );

  return res.rows[0] || null;
};

const findLatestConversationForBotContact = async (
  botId: string,
  contactId: string,
  channel: string,
  projectId?: string | null
) => {
  const res = await query(
    `SELECT *
     FROM conversations
     WHERE bot_id = $1
       AND contact_id = $2
       AND channel = $3
       AND ($4::uuid IS NULL OR project_id IS NULL OR project_id = $4)
     ORDER BY updated_at DESC
     LIMIT 1`,
    [botId, contactId, channel, projectId || null]
  );

  return res.rows[0] || null;
};

const closeSiblingRunnableConversations = async (
  conversationId: string,
  botId: string,
  contactId: string,
  channel: string,
  projectId?: string | null
) => {
  await query(
    `UPDATE conversations
     SET status = 'closed',
         current_node = NULL,
         retry_count = 0,
         updated_at = NOW()
     WHERE id <> $1
       AND bot_id = $2
       AND contact_id = $3
       AND channel = $4
       AND ($5::uuid IS NULL OR project_id IS NULL OR project_id = $5)
       AND status IN ('active', 'agent_pending')`,
    [conversationId, botId, contactId, channel, projectId || null]
  );
};

const closePlatformUserRunnableConversations = async (
  conversationId: string,
  platformUserId: string,
  channel: string
) => {
  await query(
    `UPDATE conversations c
     SET status = 'closed',
         current_node = NULL,
         retry_count = 0,
         updated_at = NOW()
     FROM contacts ct
     WHERE c.contact_id = ct.id
       AND c.id <> $1
       AND c.channel = $2
       AND ct.platform_user_id = $3
       AND c.status IN ('active', 'agent_pending')`,
    [conversationId, channel, platformUserId]
  );
};

const replaceVariables = (text: string, variables: Record<string, any>) => {
  if (!text) {
    return "";
  }

  return text.replace(/{{(\w+)}}/g, (_, key) => {
    return variables?.[key] ?? `{{${key}}}`;
  });
};

const validators: Record<string, (v: string, pattern?: any) => boolean> = {
  text: (v) => v.trim().length > 0,
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  phone: (v) => /^[0-9+\-() ]{6,15}$/.test(v),
  number: (v) => !isNaN(Number(v)),
  date: (v) => !isNaN(Date.parse(v)),
  regex: (v, pattern) => {
    try {
      return new RegExp(pattern || "").test(v);
    } catch {
      return false;
    }
  },
};

const isInputNode = (type: string) =>
  ["input", "menu_button", "menu_list"].includes(type);

const parseVariables = (value: any): Record<string, any> => {
  if (!value) {
    return {};
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  if (typeof value === "object") {
    return value;
  }

  return {};
};

const parseJsonObject = (value: any): Record<string, any> => {
  if (!value) {
    return {};
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
};

const escapeRegex = (value: string) =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const keywordMatchesText = (keyword: string, text: string) => {
  const normalizedKeyword = String(keyword || "").trim().toLowerCase();
  const normalizedText = String(text || "").trim().toLowerCase();

  if (!normalizedKeyword || !normalizedText) {
    return false;
  }

  return new RegExp(`(^|\\b)${escapeRegex(normalizedKeyword)}(\\b|$)`, "i").test(normalizedText);
};

const persistConversationVariables = async (
  conversationId: string,
  variables: Record<string, any>
) => {
  await query("UPDATE conversations SET variables = $1::jsonb WHERE id = $2", [
    JSON.stringify(variables),
    conversationId,
  ]);
};

const getDurationMs = (data: any) => {
  if (data?.delayMs !== undefined && data?.delayMs !== null && data?.delayMs !== "") {
    return Math.max(0, Number(data.delayMs || 0));
  }

  const rawValue = Number(data?.seconds ?? data?.delaySeconds ?? data?.duration ?? 0);
  const unit = String(data?.unit || "seconds").trim().toLowerCase();
  const multipliers: Record<string, number> = {
    ms: 1,
    millisecond: 1,
    milliseconds: 1,
    second: 1000,
    seconds: 1000,
    minute: 60_000,
    minutes: 60_000,
    hour: 3_600_000,
    hours: 3_600_000,
  };

  return Math.max(0, rawValue) * (multipliers[unit] || 1000);
};

const findNextEdge = (
  currentNodeId: string,
  edges: any[],
  handles: Array<string | null | undefined>
) =>
  edges.find((candidate: any) => {
    if (String(candidate.source) !== String(currentNodeId)) {
      return false;
    }

    if (!candidate.sourceHandle) {
      return handles.includes("response") || handles.includes(undefined) || handles.includes(null);
    }

    return handles.some(
      (handle) => handle !== null && handle !== undefined && String(candidate.sourceHandle) === String(handle)
    );
  });

const findNextNode = (
  currentNodeId: string,
  nodes: any[],
  edges: any[],
  handles: Array<string | null | undefined>
) => {
  const edge = findNextEdge(currentNodeId, edges, handles);
  return nodes.find((node: any) => String(node.id) === String(edge?.target));
};

const FLOW_WAIT_JOB_TYPES = ["flow_wait_reminder", "flow_wait_timeout"];

const isConversationWaitingOnNode = async (
  conversationId: string,
  waitingNodeId: string
) => {
  const res = await query(
    `SELECT current_node, status
     FROM conversations
     WHERE id = $1`,
    [conversationId]
  );
  const conversation = res.rows[0];

  return (
    conversation &&
    String(conversation.status || "").toLowerCase() === "active" &&
    String(conversation.current_node || "") === String(waitingNodeId)
  );
};

export const sendWaitingNodeReminder = async (input: {
  conversationId: string;
  waitingNodeId: string;
  reminderText: string;
  io: any;
}) => {
  const reminderText = String(input.reminderText || "").trim();
  if (!reminderText) {
    return;
  }

  if (!(await isConversationWaitingOnNode(input.conversationId, input.waitingNodeId))) {
    return;
  }

  await routeMessage(
    input.conversationId,
    {
      type: "text",
      text: reminderText,
    },
    input.io
  );
};

export const handleWaitingNodeTimeout = async (input: {
  conversationId: string;
  botId: string;
  platformUserId: string;
  waitingNodeId: string;
  channel: string;
  timeoutFallback?: string;
  io: any;
}) => {
  const timeoutFallback = String(input.timeoutFallback || "").trim();

  if (!(await isConversationWaitingOnNode(input.conversationId, input.waitingNodeId))) {
    return;
  }

  await cancelPendingJobsByConversation(input.conversationId, FLOW_WAIT_JOB_TYPES);
  clearUserTimers(input.botId, input.platformUserId);

  const conversationRes = await query(
    `SELECT flow_id, project_id
     FROM conversations
     WHERE id = $1`,
    [input.conversationId]
  );
  const conversation = conversationRes.rows[0];
  const availableFlows = await loadEligibleFlows(
    input.botId,
    conversation?.project_id || null
  );
  const activeFlow = availableFlows.find(
    (flow) => String(flow.id) === String(conversation?.flow_id)
  );
  const nodes = activeFlow?.flow_json?.nodes || [];
  const edges = activeFlow?.flow_json?.edges || [];
  const timeoutTarget = findNextNode(input.waitingNodeId, nodes, edges, ["timeout"]);

  if (timeoutTarget) {
    const actions = await executeFlowFromNode(
      timeoutTarget,
      input.conversationId,
      input.botId,
      input.platformUserId,
      nodes,
      edges,
      input.channel,
      input.io
    );

    for (const action of actions) {
      await routeMessage(input.conversationId, action, input.io);
    }

    return;
  }

  if (timeoutFallback) {
    await routeMessage(
      input.conversationId,
      {
        type: "text",
        text: timeoutFallback,
      },
      input.io
    );
  }
};

const scheduleWaitingNodeInactivity = async (input: {
  conversationId: string;
  botId: string;
  platformUserId: string;
  waitingNodeId: string;
  channel: string;
  io: any;
  reminderDelaySeconds?: number;
  reminderText?: string;
  timeoutSeconds?: number;
  timeoutFallback?: string;
}) => {
  const reminderDelayMs = Math.max(0, Number(input.reminderDelaySeconds || 0)) * 1000;
  const timeoutDelayMs = Math.max(0, Number(input.timeoutSeconds || 0)) * 1000;
  const reminderText = String(input.reminderText || "").trim();
  const timeoutFallback = String(input.timeoutFallback || "").trim();

  await cancelPendingJobsByConversation(input.conversationId, FLOW_WAIT_JOB_TYPES);

  if (reminderDelayMs > 0 && reminderText) {
    await createJob(
      "flow_wait_reminder",
      {
        conversationId: input.conversationId,
        waitingNodeId: input.waitingNodeId,
        reminderText,
      },
      {
        availableAt: new Date(Date.now() + reminderDelayMs).toISOString(),
        maxRetries: 2,
      }
    );
  }

  if (timeoutDelayMs > 0) {
    await createJob(
      "flow_wait_timeout",
      {
        conversationId: input.conversationId,
        botId: input.botId,
        platformUserId: input.platformUserId,
        waitingNodeId: input.waitingNodeId,
        channel: input.channel,
        timeoutFallback,
      },
      {
        availableAt: new Date(Date.now() + timeoutDelayMs).toISOString(),
        maxRetries: 2,
      }
    );
  }
};

const inferMediaType = (data: any): "image" | "video" | "audio" | "document" => {
  const explicitType = String(data?.mediaType || data?.type || "").trim().toLowerCase();
  if (["image", "video", "audio", "document"].includes(explicitType)) {
    return explicitType as "image" | "video" | "audio" | "document";
  }

  const source = String(data?.media_url || data?.url || "").trim().toLowerCase();
  if (/\.(mp4|mov|webm|mkv)(\?|#|$)/.test(source)) {
    return "video";
  }
  if (/\.(mp3|wav|ogg|m4a|aac)(\?|#|$)/.test(source)) {
    return "audio";
  }
  if (/\.(pdf|doc|docx|ppt|pptx|xls|xlsx|txt)(\?|#|$)/.test(source)) {
    return "document";
  }
  return "image";
};

const normalizeRuntimeNodeType = (type: any) => {
  const normalized = String(type || "").trim().toLowerCase();
  if (normalized === "message") {
    return "msg_text";
  }
  return normalized;
};

const normalizeRuntimeFlowJson = (flowJson: any) => {
  const nodes = Array.isArray(flowJson?.nodes)
    ? flowJson.nodes.map((node: any) => ({
        ...node,
        type: normalizeRuntimeNodeType(node?.type),
      }))
    : [];

  return {
    ...(flowJson && typeof flowJson === "object" ? flowJson : {}),
    nodes,
    edges: Array.isArray(flowJson?.edges) ? flowJson.edges : [],
  };
};

type FlowRuntimeRecord = {
  id: string;
  flow_json: any;
  is_default?: boolean;
  updated_at?: string;
  created_at?: string;
};

const extractNodeKeywords = (node: any) =>
  String(node?.data?.keywords || "")
    .split(",")
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(Boolean);

const extractStartNodeKeywords = (node: any) => {
  const configuredKeywords = extractNodeKeywords(node);
  if (configuredKeywords.length > 0) {
    return configuredKeywords;
  }

  return String(node?.data?.text || "")
    .split(",")
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(Boolean);
};

const findTriggeredNodeInFlow = (flowJson: any, text: string) => {
  const nodes = Array.isArray(flowJson?.nodes) ? flowJson.nodes : [];
  const explicitTrigger = nodes.find((node: any) => {
    if (normalizeRuntimeNodeType(node.type) !== "trigger") {
      return false;
    }

    return extractNodeKeywords(node).some((keyword) => keywordMatchesText(keyword, text));
  });

  if (explicitTrigger) {
    return explicitTrigger;
  }

  const startNode = nodes.find((node: any) => normalizeRuntimeNodeType(node.type) === "start");
  if (!startNode) {
    return null;
  }

  const startKeywords = extractStartNodeKeywords(startNode);
  if (startKeywords.length === 0) {
    return null;
  }

  return startKeywords.some((keyword) => keywordMatchesText(keyword, text))
    ? findStartNodeTargetInFlow(flowJson)
    : null;
};

const findSystemOverrideMatch = (
  flows: FlowRuntimeRecord[],
  conversationFlowId: string | null | undefined,
  text: string
) => {
  if (!text) {
    return null;
  }

  if (conversationFlowId) {
    const activeFlow = flows.find((flow) => String(flow.id) === String(conversationFlowId));
    const activeNodes = Array.isArray(activeFlow?.flow_json?.nodes) ? activeFlow!.flow_json.nodes : [];
    const endNode = activeNodes.find(
      (node: any) =>
        normalizeRuntimeNodeType(node.type) === "end" &&
        extractNodeKeywords(node).some((keyword) => keywordMatchesText(keyword, text))
    );

    if (activeFlow && endNode) {
      return { flow: activeFlow, node: endNode };
    }
  }

  for (const flow of flows) {
    const flowNodes = Array.isArray(flow?.flow_json?.nodes) ? flow.flow_json.nodes : [];
    const overrideNode = flowNodes.find((node: any) => {
      const normalizedType = normalizeRuntimeNodeType(node.type);
      const isGlobalTrigger =
        normalizedType === "trigger" && Boolean(node?.data?.isGlobalOverride);
      const isKeywordAgentNode =
        normalizedType === "assign_agent" && extractNodeKeywords(node).length > 0;

      if (!isGlobalTrigger && !isKeywordAgentNode) {
        return false;
      }

      return extractNodeKeywords(node).some((keyword) => keywordMatchesText(keyword, text));
    });

    if (overrideNode) {
      return { flow, node: overrideNode };
    }
  }

  return null;
};

const resolveCsatRating = (buttonId: string, text: string) => {
  const buttonKey = String(buttonId || "").trim().toLowerCase();
  if (buttonKey && CSAT_RESPONSE_MAP[buttonKey]) {
    return CSAT_RESPONSE_MAP[buttonKey];
  }

  const textKey = String(text || "").trim().toLowerCase();
  return textKey ? CSAT_RESPONSE_MAP[textKey] || null : null;
};

const findStartNodeTargetInFlow = (flowJson: any) => {
  const nodes = Array.isArray(flowJson?.nodes) ? flowJson.nodes : [];
  const edges = Array.isArray(flowJson?.edges) ? flowJson.edges : [];
  const entryNode = nodes.find((node: any) => normalizeRuntimeNodeType(node.type) === "start");
  if (!entryNode) {
    return null;
  }

  const edge = edges.find((candidate: any) => String(candidate.source) === String(entryNode.id));
  return nodes.find((node: any) => String(node.id) === String(edge?.target)) || null;
};

const findGlobalErrorNodeInFlow = (flowJson: any) => {
  const nodes = Array.isArray(flowJson?.nodes) ? flowJson.nodes : [];
  return (
    nodes.find((node: any) => normalizeRuntimeNodeType(node.type) === "error_handler") || null
  );
};

const flowHasTriggerNodes = (flowJson: any) => {
  const nodes = Array.isArray(flowJson?.nodes) ? flowJson.nodes : [];
  return nodes.some((node: any) => normalizeRuntimeNodeType(node.type) === "trigger");
};

const findGlobalErrorNodeAcrossFlows = (
  flows: FlowRuntimeRecord[],
  preferredFlowId?: string | null
) => {
  const orderedFlows = preferredFlowId
    ? [
        ...flows.filter((flow) => String(flow.id) === String(preferredFlowId)),
        ...flows.filter((flow) => String(flow.id) !== String(preferredFlowId)),
      ]
    : flows;

  for (const flow of orderedFlows) {
    const node = findGlobalErrorNodeInFlow(flow.flow_json);
    if (node) {
      return { flow, node };
    }
  }

  return null;
};

const loadEligibleFlows = async (botId: string, projectId?: string | null) => {
  const res = await query(
    `SELECT id, flow_json, COALESCE(is_default, false) AS is_default, updated_at, created_at
     FROM flows
     WHERE bot_id = $1
       AND COALESCE(is_active, true) = true
       AND (project_id IS NULL OR project_id = $2)
     ORDER BY is_default DESC, updated_at DESC NULLS LAST, created_at DESC`,
    [botId, projectId || null]
  );

  return res.rows.map((row: any) => ({
    ...row,
    flow_json: normalizeRuntimeFlowJson(row.flow_json),
  })) as FlowRuntimeRecord[];
};

export const botHasInboundTriggerMatch = async (
  botId: string,
  incomingText: string,
  projectId?: string | null
) => {
  const text = String(incomingText || "").trim().toLowerCase();
  if (!text) {
    return false;
  }

  const flows = await loadEligibleFlows(botId, projectId || null);
  return flows.some((flow) => Boolean(findTriggeredNodeInFlow(flow.flow_json, text)));
};

const calculateNegativeSignal = (input: string) => {
  const text = String(input || "").toLowerCase().trim();
  if (!text) {
    return 0;
  }

  let score = 0;
  for (const phrase of STRONG_NEGATIVE_PATTERNS) {
    if (text.includes(phrase)) {
      score += 2;
    }
  }

  const words = text.split(/[^a-z0-9]+/).filter(Boolean);
  for (const word of words) {
    if (NEGATIVE_KEYWORDS.has(word)) {
      score += 1;
    }
  }

  if (text.includes("!!!")) {
    score += 1;
  }

  return score;
};

const shouldTriggerHumanTakeover = async (conversation: any, incomingText: string) => {
  if (!conversation?.workspace_id) {
    return false;
  }

  const settings = await findConversationSettingsByWorkspace(conversation.workspace_id);
  if (settings && !settings.allow_agent_takeover) {
    return false;
  }

  return calculateNegativeSignal(incomingText) >= 2;
};

const handleValidationError = async (conversation: any, lastNode: any) => {
  const currentRetries = (conversation.retry_count || 0) + 1;

  if (currentRetries >= (lastNode.data?.maxRetries || MAX_RETRY_LIMIT)) {
    await query("UPDATE conversations SET retry_count = 0 WHERE id = $1", [
      conversation.id,
    ]);

    const limitEdge = lastNode.edges?.find(
      (edge: any) =>
        String(edge.sourceHandle) === "limit" &&
        String(edge.source) === String(lastNode.id)
    );

    if (limitEdge) {
      return { step: limitEdge.target };
    }

    const availableFlows = await loadEligibleFlows(
      String(conversation.bot_id),
      conversation.project_id || null
    );
    const globalHandlerMatch = findGlobalErrorNodeAcrossFlows(
      availableFlows,
      conversation.flow_id || null
    );

    return {
      step: globalHandlerMatch?.node ? globalHandlerMatch.node.id : null,
    };
  }

  await query("UPDATE conversations SET retry_count = $1 WHERE id = $2", [
    currentRetries,
    conversation.id,
  ]);

  return {
    step: "stay",
    message: {
      type: "text",
      text:
        lastNode.data?.onInvalidMessage || "Invalid input. Please try again.",
    } satisfies GenericMessage,
  };
};

export const executeFlowFromNode = async (
  startNode: any,
  conversationId: string,
  botId: string,
  platformUserId: string,
  nodes: any[],
  edges: any[],
  channel: string,
  io: any
): Promise<GenericMessage[]> => {
  const lockKey = `${botId}_${platformUserId}`;
  const normalizedChannel = normalizePlatform(channel);

  if (processingLocks.has(lockKey)) {
    return [];
  }

  processingLocks.add(lockKey);

  const generatedActions: GenericMessage[] = [];

  try {
    let currentNode = startNode;
    let loop = 0;
    let endedByInputWait = false;
    let endedByTerminalNode = false;

    const conversationRes = await query(
      "SELECT variables FROM conversations WHERE id = $1",
      [conversationId]
    );

    let variables = parseVariables(conversationRes.rows[0]?.variables);

    while (currentNode && loop < 25) {
      loop++;

      const currentNodeType = normalizeRuntimeNodeType(currentNode.type);
      const data = currentNode.data || {};
      let payload: GenericMessage | null = null;
      let nextHandles: Array<string | null | undefined> = ["response"];

      if (currentNodeType === "assign_agent") {
        await query(
          "UPDATE conversations SET status = 'agent_pending' WHERE id = $1",
          [conversationId]
        );
        await cancelPendingJobsByConversation(conversationId, FLOW_WAIT_JOB_TYPES);

        if (io) {
          io.emit("dashboard_update", {
            conversationId,
            botId,
            channel: normalizedChannel,
            platformUserId,
            text: data.text || "User routed to human agent via flow.",
            isBot: false,
            priorityAlert: true,
            status: "agent_pending",
            timestamp: new Date().toISOString(),
          });
        }

        payload = {
          type: "system",
          text: data.text || "Bot paused. An agent will be with you shortly.",
        };

        clearUserTimers(botId, platformUserId);
      } else if (currentNodeType === "resume_bot") {
        await query(
          "UPDATE conversations SET status = 'active' WHERE id = $1",
          [conversationId]
        );
        await cancelPendingJobsByConversation(conversationId, FLOW_WAIT_JOB_TYPES);

        payload = {
          type: "system",
          text: data.text || "Automation resumed.",
        };

        clearUserTimers(botId, platformUserId);
      } else if (
        currentNodeType === "msg_text" ||
        currentNodeType === "input"
      ) {
        const delayMs = currentNodeType === "msg_text" ? Number(data.delayMs || 0) : 0;
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        let text = replaceVariables(data.text || data.label || "...", variables);

        if (currentNodeType === "input") {
          text += "\n\n_(Type 'reset' to restart)_";
        }

        payload = {
          type: "text",
          text,
        };
      } else if (currentNodeType === "msg_media") {
        const delayMs = Number(data.delayMs || 0);
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        const mediaUrl = String(data.media_url || data.url || "").trim();

        if (!mediaUrl) {
          console.warn(`[FlowEngine] msg_media node ${currentNode.id} is missing media_url`);
        } else {
          payload = {
            type: inferMediaType(data),
            mediaUrl,
            ...(String(data.caption || data.text || "").trim()
              ? { text: replaceVariables(String(data.caption || data.text || ""), variables) }
              : {}),
          };
        }
        nextHandles = ["next", "response"];
      } else if (currentNodeType === "send_template") {
        const templateName = String(data.templateName || data.template_name || "").trim();
        if (!templateName) {
          console.warn(`[FlowEngine] send_template node ${currentNode.id} is missing templateName`);
        } else {
          payload = {
            type: "template",
            templateName,
            languageCode: String(data.language || data.languageCode || "en_US").trim() || "en_US",
          };
        }
        nextHandles = ["next", "response"];
      } else if (currentNodeType === "delay") {
        const delayMs = getDurationMs(data) || 2000;
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        nextHandles = ["next", "response"];
      } else if (currentNodeType === "reminder") {
        payload = {
          type: "text",
          text: replaceVariables(data.text || data.label || "Just checking in.", variables),
        };
        nextHandles = ["next", "response"];
      } else if (currentNodeType === "timeout") {
        payload = {
          type: "text",
          text: replaceVariables(data.text || data.label || "Session timed out.", variables),
        };
      } else if (currentNodeType === "error_handler") {
        endedByTerminalNode = true;
        payload = {
          type: "text",
          text: data.text || "Too many invalid attempts. Session reset.",
        };

        await query(
          `UPDATE conversations
           SET current_node = NULL,
               flow_id = NULL,
               variables = '{}'::jsonb,
               retry_count = 0,
               status = 'closed',
               context_json = COALESCE(context_json, '{}'::jsonb)
                 || '{"restart_required": true, "termination_reason": "error_handler"}'::jsonb,
               updated_at = NOW()
           WHERE id = $1`,
          [conversationId]
        );
        await cancelPendingJobsByConversation(conversationId, FLOW_WAIT_JOB_TYPES);
        clearUserTimers(botId, platformUserId);
        await closePlatformUserRunnableConversations(
          conversationId,
          platformUserId,
          normalizedChannel
        );
      } else if (currentNodeType === "end") {
        endedByTerminalNode = true;
        payload = {
          type: "text",
          text: data.text || "Session completed.",
        };

        await query(
          `UPDATE conversations
           SET current_node = NULL,
               flow_id = NULL,
               variables = '{}'::jsonb,
               retry_count = 0,
               status = 'closed',
               context_json = COALESCE(context_json, '{}'::jsonb)
                 || '{"restart_required": true, "termination_reason": "end_node"}'::jsonb,
               updated_at = NOW()
           WHERE id = $1`,
          [conversationId]
        );

        await cancelPendingJobsByConversation(conversationId, FLOW_WAIT_JOB_TYPES);
        clearUserTimers(botId, platformUserId);
        await closePlatformUserRunnableConversations(
          conversationId,
          platformUserId,
          normalizedChannel
        );
        generatedActions.push(payload);
        break;
      } else if (
        currentNodeType === "menu_button" ||
        currentNodeType === "menu_list"
      ) {
        if (currentNodeType === "menu_list") {
          const rows = Array.from({ length: 10 }, (_, index) => index + 1)
            .map((index) => {
              const title = String(data[`item${index}`] || "").trim();
              if (!title) {
                return null;
              }

              return {
                id: `item${index}`,
                title: title.substring(0, 24),
              };
            })
            .filter(Boolean) as Array<{ id: string; title: string }>;

          payload = {
            type: "interactive",
            text: replaceVariables(data.text || "Choose an option:", variables),
            buttonText: String(data.buttonText || "View Options").trim() || "View Options",
            sections: rows.length > 0 ? [{ title: String(data.sectionTitle || "Options").trim() || "Options", rows }] : [],
          };
        } else {
          payload = {
            type: "interactive",
            text: replaceVariables(data.text || "Choose an option:", variables),
            buttons: [
              data.item1 && { id: "item1", title: data.item1.substring(0, 20) },
              data.item2 && { id: "item2", title: data.item2.substring(0, 20) },
              data.item3 && { id: "item3", title: data.item3.substring(0, 20) },
              data.item4 && { id: "item4", title: data.item4.substring(0, 20) },
            ].filter(Boolean) as { id: string; title: string }[],
          };
        }
      } else if (currentNodeType === "api") {
        try {
          const apiUrl = replaceVariables(data.url, variables);
          const response = await axios({
            method: data.method || "GET",
            url: apiUrl,
            data: data.body,
          });

          if (data.saveTo) {
            variables[data.saveTo] = response.data;
            await persistConversationVariables(conversationId, variables);
          }
          nextHandles = ["success", "response"];
        } catch (err) {
          console.error("API node error", err);
          nextHandles = ["fail", "error", "response"];
        }
      } else if (currentNodeType === "save") {
        if (data.variable && data.value !== undefined) {
          variables[data.variable] =
            typeof data.value === "string"
              ? replaceVariables(data.value, variables)
              : data.value;
        }

        await persistConversationVariables(conversationId, variables);
      } else if (currentNodeType === "lead_form") {
        try {
          await upsertLeadCapture({
            conversationId,
            botId,
            platform: normalizePlatform(channel),
            variables,
            nodeData: {
              ...data,
              nodeId: currentNode.id,
            },
            sourcePayload: {
              platformUserId,
              conversationId,
            },
          });
        } catch (err: any) {
          if (err instanceof LeadCaptureContextError) {
            console.error("Lead capture skipped:", err.message);
            payload = {
              type: "text",
              text:
                data.errorText ||
                "We could not save your details because the campaign context is incomplete.",
            };
            generatedActions.push(payload);
            break;
          }

          throw err;
        }

        if (data.text) {
          payload = {
            type: "text",
            text: replaceVariables(data.text, variables),
          };
        }
      } else if (currentNodeType === "goto") {
        const gotoType = String(data.gotoType || "").trim().toLowerCase();
        if (gotoType === "bot" && data.targetBotId) {
          console.warn(
            `[FlowEngine] goto node ${currentNode.id} targets external bot ${data.targetBotId}, which is not wired for runtime transfer yet`
          );
          currentNode = findNextNode(currentNode.id, nodes, edges, ["next", "response"]);
        } else {
          const targetNodeId = String(data.targetNode || data.targetNodeId || "").trim();
          currentNode = nodes.find((node: any) => String(node.id) === targetNodeId);
        }

        await query(
          "UPDATE conversations SET current_node = $1 WHERE id = $2",
          [currentNode?.id || null, conversationId]
        );
        continue;
      } else if (currentNodeType === "condition") {
        const { variable, operator, value } = data;
        const userVal = variables[variable] || "";
        let isTrue = false;

        if (operator === "equals") {
          isTrue =
            String(userVal).toLowerCase() === String(value).toLowerCase();
        } else if (operator === "contains") {
          isTrue = String(userVal)
            .toLowerCase()
            .includes(String(value).toLowerCase());
        } else if (operator === "exists") {
          isTrue = userVal !== undefined && userVal !== "";
        }

        const matchedHandle = isTrue ? "true" : "false";
        const edge = edges.find(
          (candidate: any) =>
            String(candidate.source) === String(currentNode.id) &&
            String(candidate.sourceHandle) === matchedHandle
        );

        currentNode = nodes.find(
          (node: any) => String(node.id) === String(edge?.target)
        );

        await query(
          "UPDATE conversations SET current_node = $1 WHERE id = $2",
          [currentNode?.id || null, conversationId]
        );

        continue;
      }

      if (payload) {
        generatedActions.push(payload);
      }

      await query("UPDATE conversations SET current_node = $1 WHERE id = $2", [
        currentNode.id,
        conversationId,
      ]);

      if (isInputNode(currentNodeType)) {
        await scheduleWaitingNodeInactivity({
          conversationId,
          botId,
          platformUserId,
          waitingNodeId: String(currentNode.id),
          channel,
          io,
          reminderDelaySeconds: Number(data.reminderDelay || 0),
          reminderText: data.reminderText,
          timeoutSeconds: Number(data.timeout || 0),
          timeoutFallback: data.timeoutFallback,
        });
        endedByInputWait = true;
        break;
      }

      currentNode = findNextNode(currentNode.id, nodes, edges, nextHandles);
    }

    if (!endedByInputWait && !endedByTerminalNode) {
      const hasExplicitLeadForm = nodes.some(
        (node: any) => normalizeRuntimeNodeType(node.type) === "lead_form"
      );
      if (!hasExplicitLeadForm) {
        try {
          await maybeAutoCaptureLead({
            conversationId,
            botId,
            platform: normalizedChannel,
            variables,
            sourcePayload: {
              platformUserId,
              conversationId,
              terminalAutoCapture: true,
            },
          });
        } catch (err: any) {
          if (!(err instanceof LeadCaptureContextError)) {
            throw err;
          }
        }
      }
    }

    return generatedActions;
  } catch (err: any) {
    console.error("Execute Flow Error:", err.message);
    return generatedActions;
  } finally {
    processingLocks.delete(lockKey);
  }
};

export const processIncomingMessage = async (
  botId: string,
  platformUserId: string,
  userName: string,
  incomingText: string,
  buttonId: string,
  io: any,
  channel = "whatsapp",
  options: IncomingMessageOptions = {}
) => {
  try {
    const normalizedChannel = normalizePlatform(channel);
    const text = (incomingText || "").toLowerCase().trim();
    const resolvedContext = await resolveCampaignContext(
      botId,
      normalizedChannel,
      options.entryKey || null
    );

    if (!resolvedContext.workspaceId || !resolvedContext.projectId) {
      console.warn(
        `[FlowEngine] Skipping inbound runtime for bot ${botId}: missing workspace/project context`
      );
      return {
        conversationId: null,
        actions: [],
      };
    }

    const botRes = await query(
      "SELECT id FROM bots WHERE id = $1 AND status = 'active'",
      [botId]
    );

    if (!botRes.rows[0]) {
      return;
    }

    const contact = await upsertContactWithIdentity({
      botId,
      workspaceId: resolvedContext.workspaceId || null,
      platform: normalizedChannel,
      platformUserId,
      name: userName,
      phone: normalizedChannel === "whatsapp" ? platformUserId : null,
      email: normalizedChannel === "email" ? platformUserId : null,
    });

    const availableFlows = await loadEligibleFlows(
      botId,
      resolvedContext.projectId || null
    );
    const matchedTriggerFlow = text
      ? availableFlows.reduce<{ flow: FlowRuntimeRecord; node: any } | null>(
          (match, flow) => {
            if (match) {
              return match;
            }
            const triggeredNode = findTriggeredNodeInFlow(flow.flow_json, text);
            return triggeredNode ? { flow, node: triggeredNode } : null;
          },
          null
        )
      : null;
    const hasAnyTriggerFlows = availableFlows.some((flow) => flowHasTriggerNodes(flow.flow_json));
    const shouldPreferActiveConversation =
      !matchedTriggerFlow &&
      !ESCAPE_KEYWORDS.includes(text) &&
      !RESET_KEYWORDS.includes(text);
    const activeConversationCandidate = shouldPreferActiveConversation
      ? await findLatestRunnableConversation(
          botId,
          contact.id,
          normalizedChannel,
          resolvedContext.projectId || null
        )
      : null;
    const activeConversation =
      activeConversationCandidate?.current_node ? activeConversationCandidate : null;
    const latestConversation = await findLatestConversationForBotContact(
      botId,
      contact.id,
      normalizedChannel,
      resolvedContext.projectId || null
    );

    let conversation =
      activeConversation ||
      latestConversation ||
      (await findConversationByContext(contact.id, normalizedChannel, resolvedContext));

    if (!conversation) {
      try {
        const insertConversationRes = await query(
          `INSERT INTO conversations (bot_id, workspace_id, project_id, contact_id, channel, status, variables, campaign_id, channel_id, entry_point_id, flow_id, list_id, platform, platform_account_id, context_json)
           VALUES ($1, $2, $3, $4, $5, 'active', '{}'::jsonb, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
           RETURNING *`,
          [
            botId,
            contact.workspace_id || resolvedContext.workspaceId || null,
            resolvedContext.projectId,
            contact.id,
            normalizedChannel,
            resolvedContext.campaignId,
            resolvedContext.channelId,
            resolvedContext.entryPointId,
            resolvedContext.flowId,
            resolvedContext.listId,
            resolvedContext.platform,
            resolvedContext.platformAccountId,
            buildConversationContextPayload(resolvedContext),
          ]
        );

        conversation = insertConversationRes.rows[0];
      } catch (error: any) {
        if (String(error?.code || "") !== "23505") {
          throw error;
        }
        conversation = await findConversationByContext(
          contact.id,
          normalizedChannel,
          resolvedContext
        );
      }

      await applyConversationWorkspacePolicies(conversation.id);
    } else if (hasMismatchedConversationContext(conversation, resolvedContext)) {
      const updatedConversationRes = await query(
        `UPDATE conversations
         SET
           workspace_id = COALESCE($1, workspace_id),
           project_id = COALESCE($2, project_id),
           campaign_id = $3,
           channel_id = $4,
           entry_point_id = $5,
           flow_id = $6,
           list_id = $7,
           platform = COALESCE($8, platform),
           platform_account_id = COALESCE($9, platform_account_id),
           context_json = $10::jsonb,
           updated_at = NOW()
         WHERE id = $11
         RETURNING *`,
        [
          contact.workspace_id || resolvedContext.workspaceId || null,
          resolvedContext.projectId,
          resolvedContext.campaignId,
          resolvedContext.channelId,
          resolvedContext.entryPointId,
          resolvedContext.flowId,
          resolvedContext.listId,
          resolvedContext.platform,
          resolvedContext.platformAccountId,
          buildConversationContextPayload(resolvedContext),
          conversation.id,
        ]
      );

      conversation = updatedConversationRes.rows[0] || conversation;
      await applyConversationWorkspacePolicies(conversation.id);
    } else if (
      (!conversation.campaign_id && resolvedContext.campaignId) ||
      (!conversation.channel_id && resolvedContext.channelId) ||
      (!conversation.entry_point_id && resolvedContext.entryPointId) ||
      (!conversation.flow_id && resolvedContext.flowId) ||
      (!conversation.list_id && resolvedContext.listId)
    ) {
      const updatedConversationRes = await query(
        `UPDATE conversations
         SET
           workspace_id = COALESCE(workspace_id, $1),
           project_id = COALESCE(project_id, $2),
           campaign_id = COALESCE(campaign_id, $3),
           channel_id = COALESCE(channel_id, $4),
           entry_point_id = COALESCE(entry_point_id, $5),
          flow_id = COALESCE(flow_id, $6),
          list_id = COALESCE(list_id, $7),
          platform = COALESCE(platform, $8),
          platform_account_id = COALESCE(platform_account_id, $9),
          context_json = context_json || $10::jsonb,
          updated_at = NOW()
        WHERE id = $11
         RETURNING *`,
        [
          contact.workspace_id || resolvedContext.workspaceId || null,
          resolvedContext.projectId,
          resolvedContext.campaignId,
          resolvedContext.channelId,
          resolvedContext.entryPointId,
          resolvedContext.flowId,
          resolvedContext.listId,
          resolvedContext.platform,
          resolvedContext.platformAccountId,
          buildConversationContextPayload(resolvedContext),
          conversation.id,
        ]
      );

      conversation = updatedConversationRes.rows[0];
    }

    if (text) {
      await query(
        `INSERT INTO messages (bot_id, workspace_id, project_id, conversation_id, channel, platform, platform_account_id, sender, sender_type, platform_user_id, content)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'user', 'user', $8, $9::jsonb)`,
        [
          botId,
          conversation.workspace_id || null,
          conversation.project_id || resolvedContext.projectId || null,
          conversation.id,
          normalizedChannel,
          conversation.platform || normalizedChannel,
          conversation.platform_account_id || resolvedContext.platformAccountId || null,
          platformUserId,
          JSON.stringify({ type: "text", text: incomingText }),
        ]
      );

      await query(
        `UPDATE conversations
         SET updated_at = NOW(),
             last_message_at = NOW()
         WHERE id = $1`,
        [conversation.id]
      );
    }

    const outgoingActions: GenericMessage[] = [];
    const conversationContext = parseJsonObject(conversation.context_json);
    const resolvedCsatRating = resolveCsatRating(buttonId, text);
    const requireExplicitTrigger = options.requireExplicitTrigger === true;

    if (conversationContext.csat_pending && resolvedCsatRating) {
      await createSupportSurvey({
        conversationId: conversation.id,
        workspaceId: conversation.workspace_id || null,
        projectId: conversation.project_id || null,
        botId,
        rating: resolvedCsatRating,
        source: buttonId ? "button" : "text",
        rawPayload: {
          buttonId: buttonId || null,
          text: incomingText || null,
        },
      });

      await query(
        `UPDATE conversations
         SET context_json = COALESCE(context_json, '{}'::jsonb)
             || '{"csat_pending": false}'::jsonb
             || jsonb_build_object('csat_rating', $2::text, 'csat_submitted_at', NOW()::text),
             updated_at = NOW()
         WHERE id = $1`,
        [conversation.id, resolvedCsatRating]
      );

      outgoingActions.push({
        type: "text",
        text:
          resolvedCsatRating === "csat_bad"
            ? "We are sorry to hear that. A manager will review your ticket."
            : "Thank you for your feedback. Have a great day.",
      });

      return {
        conversationId: conversation.id,
        actions: outgoingActions,
      };
    }

    if (ESCAPE_KEYWORDS.includes(text)) {
      await cancelPendingJobsByConversation(conversation.id, FLOW_WAIT_JOB_TYPES);
      clearUserTimers(botId, platformUserId);

      await query(
        `UPDATE conversations
         SET current_node = NULL,
             flow_id = NULL,
             variables = '{}'::jsonb,
             retry_count = 0,
             status = 'closed',
             context_json = COALESCE(context_json, '{}'::jsonb)
               || '{"restart_required": true, "termination_reason": "escape_keyword"}'::jsonb,
             updated_at = NOW()
         WHERE id = $1`,
        [conversation.id]
      );
      await closeSiblingRunnableConversations(
        conversation.id,
        botId,
        contact.id,
        normalizedChannel,
        resolvedContext.projectId || null
      );
      await closePlatformUserRunnableConversations(
        conversation.id,
        platformUserId,
        normalizedChannel
      );

      outgoingActions.push({
        type: "system",
        text: "Conversation ended.",
      });

      return {
        conversationId: conversation.id,
        actions: outgoingActions,
      };
    }

    const systemOverrideMatch =
      conversation.status === "agent_pending"
        ? null
        : findSystemOverrideMatch(availableFlows, conversation.flow_id || null, text);

    if (conversation.status === "closed" || conversation.status === "resolved") {
      const wantsReopen =
        Boolean(matchedTriggerFlow) ||
        Boolean(systemOverrideMatch) ||
        RESET_KEYWORDS.includes(text) ||
        text === "reset";

      if (!wantsReopen) {
        const globalErrorMatch = findGlobalErrorNodeAcrossFlows(
          availableFlows,
          conversation.flow_id || null
        );
        if (globalErrorMatch) {
          const actions = await executeFlowFromNode(
            globalErrorMatch.node,
            conversation.id,
            botId,
            platformUserId,
            globalErrorMatch.flow.flow_json?.nodes || [],
            globalErrorMatch.flow.flow_json?.edges || [],
            channel,
            io
          );

          outgoingActions.push(...actions);
        } else if (text) {
          outgoingActions.push({
            type: "text",
            text: "Sorry, I didn't understand that. Send a valid trigger keyword to start a flow, or type reset.",
          });
        }
        return {
          conversationId: conversation.id,
          actions: outgoingActions,
        };
      }

      const reopenedConversationRes = await query(
        `UPDATE conversations
         SET current_node = NULL,
             retry_count = 0,
             status = 'active',
             variables = '{}'::jsonb,
             context_json = COALESCE(context_json, '{}'::jsonb) - 'restart_required' - 'termination_reason',
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [conversation.id]
      );

      conversation = reopenedConversationRes.rows[0] || conversation;
      await closeSiblingRunnableConversations(
        conversation.id,
        botId,
        contact.id,
        normalizedChannel,
        resolvedContext.projectId || null
      );
    }

    if (systemOverrideMatch) {
      await cancelPendingJobsByConversation(conversation.id, FLOW_WAIT_JOB_TYPES);
      conversation = (
        await query(
          `UPDATE conversations
           SET current_node = NULL,
               flow_id = $2,
               variables = '{}'::jsonb,
               status = 'active',
               retry_count = 0,
               updated_at = NOW()
           WHERE id = $1
           RETURNING *`,
          [conversation.id, systemOverrideMatch.flow.id]
        )
      ).rows[0] || conversation;
      await closeSiblingRunnableConversations(
        conversation.id,
        botId,
        contact.id,
        normalizedChannel,
        resolvedContext.projectId || null
      );

      const actions = await executeFlowFromNode(
        systemOverrideMatch.node,
        conversation.id,
        botId,
        platformUserId,
        systemOverrideMatch.flow.flow_json?.nodes || [],
        systemOverrideMatch.flow.flow_json?.edges || [],
        channel,
        io
      );

      outgoingActions.push(...actions);

      return {
        conversationId: conversation.id,
        actions: outgoingActions,
      };
    }

    if (conversation.status === "agent_pending" && text !== "reset") {
      return {
        conversationId: conversation.id,
        actions: outgoingActions,
      };
    }

    if (text === "reset") {
      await cancelPendingJobsByConversation(conversation.id, FLOW_WAIT_JOB_TYPES);
      await query(
        `UPDATE conversations
         SET current_node = NULL, retry_count = 0, status = 'active'
         WHERE id = $1`,
        [conversation.id]
      );
      await closeSiblingRunnableConversations(
        conversation.id,
        botId,
        contact.id,
        normalizedChannel,
        resolvedContext.projectId || null
      );

      return {
        conversationId: conversation.id,
        actions: outgoingActions,
      };
    }

    if (
      text &&
      conversation.status !== "agent_pending" &&
      (await shouldTriggerHumanTakeover(conversation, incomingText))
    ) {
      await cancelPendingJobsByConversation(conversation.id, FLOW_WAIT_JOB_TYPES);
      await query(
        `UPDATE conversations
         SET current_node = NULL, retry_count = 0, status = 'agent_pending', updated_at = NOW()
         WHERE id = $1`,
        [conversation.id]
      );

      if (io) {
        io.emit("dashboard_update", {
          conversationId: conversation.id,
          botId,
          channel: normalizedChannel,
          platformUserId,
          text: incomingText,
          isBot: false,
          priorityAlert: true,
          status: "agent_pending",
          timestamp: new Date().toISOString(),
        });
      }

      outgoingActions.push({
        type: "system",
        text: "I am connecting you with a human agent for faster help.",
      });

      return {
        conversationId: conversation.id,
        actions: outgoingActions,
      };
    }

    await cancelPendingJobsByConversation(conversation.id, FLOW_WAIT_JOB_TYPES);
    clearUserTimers(botId, platformUserId);

    const conversationFlow =
      conversation.flow_id
        ? availableFlows.find((flow) => String(flow.id) === String(conversation.flow_id)) || null
        : null;
    const fallbackFlow = availableFlows.find((flow) => flow.is_default) || availableFlows[0] || null;
    const activeFlow = conversationFlow || fallbackFlow;
    let activeFlowId = activeFlow?.id || null;
    let flowData = activeFlow?.flow_json || { nodes: [], edges: [] };
    let nodes = flowData.nodes || [];
    let edges = flowData.edges || [];

    let currentNode = null;
    const isReset = RESET_KEYWORDS.includes(text);

    if (matchedTriggerFlow) {
      activeFlowId = matchedTriggerFlow.flow.id;
      flowData = matchedTriggerFlow.flow.flow_json || { nodes: [], edges: [] };
      nodes = flowData.nodes || [];
      edges = flowData.edges || [];
      currentNode = matchedTriggerFlow.node;

      await query(
        `UPDATE conversations
         SET current_node = NULL,
             flow_id = $2,
             variables = '{}'::jsonb,
             status = 'active',
             retry_count = 0,
             updated_at = NOW()
         WHERE id = $1`,
        [conversation.id, activeFlowId]
      );
      await closeSiblingRunnableConversations(
        conversation.id,
        botId,
        contact.id,
        normalizedChannel,
        resolvedContext.projectId || null
      );
    }

    if (!currentNode && conversation.current_node && !isReset) {
      const lastNode = nodes.find(
        (node: any) => String(node.id) === String(conversation.current_node)
      );

      if (lastNode && isInputNode(normalizeRuntimeNodeType(lastNode.type))) {
        let isValid = false;
        let matchedHandle = "response";
        const lastNodeType = normalizeRuntimeNodeType(lastNode.type);

        if (lastNodeType === "input") {
          const validationType = lastNode.data.validation || "text";
          const validatorFn = validators[validationType];
          isValid = validatorFn ? validatorFn(text, lastNode.data.regex) : true;
        } else {
          for (let i = 1; i <= 10; i++) {
            const itemText = lastNode.data[`item${i}`];

            if (
              itemText &&
              (text === itemText.toLowerCase().trim() ||
                buttonId === `item${i}`)
            ) {
              isValid = true;
              matchedHandle = `item${i}`;
              break;
            }
          }
        }

        if (!isValid) {
          const validationResult = await handleValidationError(
            conversation,
            lastNode
          );

          if (validationResult.message) {
            outgoingActions.push(validationResult.message);
          }

          if (validationResult.step === "stay") {
            return {
              conversationId: conversation.id,
              actions: outgoingActions,
            };
          }

          if (validationResult.step) {
            const targetNode = nodes.find(
              (node: any) => String(node.id) === String(validationResult.step)
            );

            if (targetNode) {
              const actions = await executeFlowFromNode(
                targetNode,
                conversation.id,
                botId,
                platformUserId,
                nodes,
                edges,
                channel,
                io
              );

              outgoingActions.push(...actions);
            }
          }

          return {
            conversationId: conversation.id,
            actions: outgoingActions,
          };
        }

        await query("UPDATE conversations SET retry_count = 0 WHERE id = $1", [
          conversation.id,
        ]);

        if (normalizeRuntimeNodeType(lastNode.type) === "input") {
          const updatedVariables = parseVariables(conversation.variables);
          updatedVariables[lastNode.data?.variable || "input"] = incomingText;

          await query(
            "UPDATE conversations SET variables = $1::jsonb WHERE id = $2",
            [JSON.stringify(updatedVariables), conversation.id]
          );
        }

        currentNode = findNextNode(lastNode.id, nodes, edges, [
          matchedHandle,
          "response",
          null,
          undefined,
        ]);

        if (!currentNode) {
          await query(
            "UPDATE conversations SET current_node = NULL WHERE id = $1",
            [conversation.id]
          );

          return {
            conversationId: conversation.id,
            actions: outgoingActions,
          };
        }
      }
    }

    if (!currentNode || isReset) {
      let selectedFlow = activeFlow;
      let selectedNode = null;
      let shouldUseGlobalErrorFallback = false;
      const shouldBlockDefaultBootstrap =
        Boolean(text) &&
        !matchedTriggerFlow &&
        !conversation.current_node &&
        !isReset;

      if (text && !matchedTriggerFlow) {
        for (const flow of availableFlows) {
          const triggeredNode = findTriggeredNodeInFlow(flow.flow_json, text);
          if (triggeredNode) {
            selectedFlow = flow;
            selectedNode = triggeredNode;
            break;
          }
        }

        if (!selectedNode && (hasAnyTriggerFlows || shouldBlockDefaultBootstrap)) {
          shouldUseGlobalErrorFallback = true;
        }
      }

      if (!selectedNode && shouldUseGlobalErrorFallback) {
        const globalErrorMatch = findGlobalErrorNodeAcrossFlows(
          availableFlows,
          conversation.flow_id || activeFlowId || null
        );
        if (globalErrorMatch) {
          selectedFlow = globalErrorMatch.flow;
          selectedNode = globalErrorMatch.node;
        }
      }

      if (!selectedNode && shouldBlockDefaultBootstrap && text) {
        outgoingActions.push({
          type: "text",
          text: "Sorry, I didn't understand that. Send a valid trigger keyword to start a flow.",
        });

        return {
          conversationId: conversation.id,
          actions: outgoingActions,
        };
      }

      if (!selectedNode && selectedFlow && !shouldBlockDefaultBootstrap) {
        selectedNode = findStartNodeTargetInFlow(selectedFlow.flow_json);
      }

      if (selectedFlow) {
        activeFlowId = selectedFlow.id;
        flowData = selectedFlow.flow_json || { nodes: [], edges: [] };
        nodes = flowData.nodes || [];
        edges = flowData.edges || [];
        if (conversation.flow_id !== activeFlowId) {
          const flowAdjustedContext = {
            ...resolvedContext,
            flowId: activeFlowId,
          };
          const contextConversation =
            (await findConversationByContext(contact.id, normalizedChannel, flowAdjustedContext)) ||
            conversation;
          conversation = contextConversation;
        }
      }

      currentNode = selectedNode;

      if (currentNode) {
        await query(
          `UPDATE conversations
           SET current_node = NULL,
               flow_id = COALESCE($2, flow_id),
               variables = '{}'::jsonb,
               status = 'active',
               retry_count = 0
           WHERE id = $1`,
          [conversation.id, activeFlowId]
        );
        await closeSiblingRunnableConversations(
          conversation.id,
          botId,
          contact.id,
          normalizedChannel,
          resolvedContext.projectId || null
        );
      }
    }

    if (currentNode) {
      const actions = await executeFlowFromNode(
        currentNode,
        conversation.id,
        botId,
        platformUserId,
        nodes,
        edges,
        channel,
        io
      );

      outgoingActions.push(...actions);
    }

    return {
      conversationId: conversation.id,
      actions: outgoingActions,
    };
  } catch (err: any) {
    console.error("ENGINE ERROR:", err.message);
  }
};
