import axios from "axios";
import { db, query } from "../config/db";
import { resolveCampaignContext } from "./campaignContextService";
import {
  LeadCaptureContextError,
  maybeAutoCaptureLead,
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
import { analyzeMessageSentiment } from "./sentimentAnalysisService";
import { retrieveKnowledgeForWorkspace } from "./ragService";
import { normalizeWhatsAppPlatformUserId } from "./contactIdentityService";
import { validateWorkspaceContext } from "./businessValidationService";
import { findBotById } from "../models/botModel";
import {
  findBotUniversalRuleMatch,
  getBotSystemFlowId,
  getBotSystemMessages,
  getBotGlobalSettings,
} from "./botSettingsService";
import { getAiProvidersRuntimeService } from "./platformSettingsService";
import { fitSectionsToTokenBudget } from "../utils/tokenBudget";

const MAX_RETRY_LIMIT = 3;
const MAX_KNOWLEDGE_LOOKUP_TEXT_TOKENS = 3000;
const MAX_KNOWLEDGE_LOOKUP_CHUNK_CHARS = 1500;

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

const parseClockTime = (value: any) => {
  const normalized = String(value || "").trim();
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
};

const normalizeWeekdayToken = (value: string) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }

  const map: Record<string, string> = {
    mon: "mon",
    monday: "mon",
    tue: "tue",
    tues: "tue",
    tuesday: "tue",
    wed: "wed",
    wednesday: "wed",
    thu: "thu",
    thur: "thu",
    thurs: "thu",
    thursday: "thu",
    fri: "fri",
    friday: "fri",
    sat: "sat",
    saturday: "sat",
    sun: "sun",
    sunday: "sun",
  };

  return map[normalized] || normalized.slice(0, 3);
};

const parseDayList = (value: any) =>
  String(value || "")
    .split(",")
    .map((item) => normalizeWeekdayToken(item))
    .filter(Boolean);

const getNowInTimezone = (timeZone?: string | null) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || "UTC",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const weekday = parts.find((item) => item.type === "weekday")?.value || "Mon";
  const hour = Number(parts.find((item) => item.type === "hour")?.value || 0);
  const minute = Number(parts.find((item) => item.type === "minute")?.value || 0);

  return {
    weekday: normalizeWeekdayToken(weekday),
    minutes: hour * 60 + minute,
  };
};

const isBusinessHoursOpen = (data: any) => {
  const timezone = String(data?.timezone || data?.timeZone || "UTC").trim() || "UTC";
  const startMinutes = parseClockTime(data?.startTime || data?.openTime || data?.fromTime);
  const endMinutes = parseClockTime(data?.endTime || data?.closeTime || data?.toTime);
  const allowedDays = parseDayList(data?.days || data?.dayNames || data?.workingDays);
  const now = getNowInTimezone(timezone);

  if (allowedDays.length > 0 && !allowedDays.includes(now.weekday)) {
    return false;
  }

  if (startMinutes === null || endMinutes === null) {
    return true;
  }

  if (startMinutes === endMinutes) {
    return true;
  }

  if (startMinutes < endMinutes) {
    return now.minutes >= startMinutes && now.minutes < endMinutes;
  }

  return now.minutes >= startMinutes || now.minutes < endMinutes;
};

const chooseSplitTrafficBranch = (data: any) => {
  const percentA = Math.max(0, Math.min(100, Number(data?.percentA ?? data?.splitA ?? 50)));
  const percentB = Math.max(0, Math.min(100, Number(data?.percentB ?? data?.splitB ?? 50)));
  const total = percentA + percentB;
  if (total <= 0) {
    return "a";
  }

  return Math.random() * total < percentA ? "a" : "b";
};

const generateAiNodeText = async (data: any, variables: Record<string, any>) => {
  const aiProviders = await getAiProvidersRuntimeService().catch(() => null);
  const rawProvider = String(data?.provider || aiProviders?.editable?.defaultProvider || "auto").trim().toLowerCase();
  const provider = rawProvider === "auto" ? String(aiProviders?.editable?.defaultProvider || "openai").trim().toLowerCase() : rawProvider;
  const model =
    String(
      data?.model ||
        (provider === "gemini" ? aiProviders?.editable?.geminiModel : aiProviders?.editable?.openaiModel) ||
        aiProviders?.editable?.defaultModel ||
        ""
    ).trim();
  const systemPrompt = replaceVariables(String(data?.systemPrompt || data?.instructions || "").trim(), variables);
  const style = String(data?.style || data?.tone || "").trim();
  const userPrompt = replaceVariables(String(data?.prompt || data?.text || "").trim(), variables);
  const promptParts = [systemPrompt, style ? `Style: ${style}` : "", userPrompt].filter(Boolean);
  const fullPrompt = promptParts.join("\n\n").trim();

  if (!fullPrompt) {
    return "";
  }

  try {
    if (provider === "gemini" && aiProviders?.secrets?.geminiApiKey) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          model || aiProviders.editable.geminiModel
        )}:generateContent?key=${encodeURIComponent(aiProviders.secrets.geminiApiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: fullPrompt }],
              },
            ],
          }),
        }
      );
      const json = await response.json().catch(() => ({}));
      const text = Array.isArray(json?.candidates)
        ? json.candidates
            .map((candidate: any) =>
              Array.isArray(candidate?.content?.parts)
                ? candidate.content.parts.map((part: any) => String(part?.text || "")).join("")
                : ""
            )
            .join("\n")
            .trim()
        : "";
      if (text) {
        return text;
      }
    }

    if (provider === "openai" && aiProviders?.secrets?.openaiApiKey) {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${aiProviders.secrets.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: model || aiProviders.editable.openaiModel,
          temperature: Number(aiProviders.editable.temperature ?? 0.2),
          max_tokens: Number(aiProviders.editable.maxOutputTokens ?? 1024),
          messages: [
            ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
            { role: "user", content: userPrompt || fullPrompt },
          ],
        }),
      });
      const json = await response.json().catch(() => ({}));
      const text = String(json?.choices?.[0]?.message?.content || "").trim();
      if (text) {
        return text;
      }
    }
  } catch (error) {
    console.warn("[FlowEngine] AI generate node failed, falling back to prompt text:", error);
  }

  return fullPrompt;
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
  ["input", "menu", "menu_button", "menu_list"].includes(type);

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

const truncateText = (value: string, maxChars: number) => {
  const normalized = String(value || "");
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
};

const buildKnowledgeLookupText = (chunks: Array<{ content?: string | null }>) =>
  fitSectionsToTokenBudget(
    [
      {
        key: "knowledge_lookup",
        text: chunks
          .map((chunk) => truncateText(String(chunk?.content || ""), MAX_KNOWLEDGE_LOOKUP_CHUNK_CHARS))
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    MAX_KNOWLEDGE_LOOKUP_TEXT_TOKENS
  ).sections[0]?.text || "";

const withConversationProcessingLock = async <T>(
  conversationId: string,
  work: () => Promise<T>
) => {
  const client = await db.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [String(conversationId)]);
    return await work();
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [String(conversationId)]);
    } catch {}
    client.release();
  }
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

type ConversationBookmark = {
  flowId: string | null;
  nodeId: string | null;
  variables: Record<string, any>;
  resumeText?: string | null;
  reason?: string | null;
};

const readConversationBookmark = (contextJson: any): ConversationBookmark | null => {
  const context = parseJsonObject(contextJson);
  const bookmark = parseJsonObject(context.bookmarked_state);

  if (!bookmark.flowId && !bookmark.nodeId) {
    return null;
  }

  return {
    flowId: String(bookmark.flowId || bookmark.flow_id || "").trim() || null,
    nodeId: String(bookmark.nodeId || bookmark.node_id || "").trim() || null,
    variables: parseVariables(bookmark.variables),
    resumeText: String(bookmark.resumeText || bookmark.resume_text || "").trim() || null,
    reason: String(bookmark.reason || "").trim() || null,
  };
};

const buildConversationBookmark = (conversation: any, reason: string): ConversationBookmark => ({
  flowId: String(conversation?.flow_id || "").trim() || null,
  nodeId: String(conversation?.current_node || "").trim() || null,
  variables: parseVariables(conversation?.variables),
  resumeText: "Let's pick up where we left off...",
  reason: String(reason || "").trim() || null,
});

const persistConversationBookmark = async (conversationId: string, bookmark: ConversationBookmark) => {
  await query(
    `UPDATE conversations
     SET context_json = COALESCE(context_json, '{}'::jsonb)
       || jsonb_build_object(
            'bookmarked_state',
            jsonb_build_object(
              'flowId', $2::text,
              'nodeId', $3::text,
              'variables', $4::jsonb,
              'resumeText', $5::text,
              'reason', $6::text
            )
          ),
         updated_at = NOW()
     WHERE id = $1`,
    [
      conversationId,
      bookmark.flowId || null,
      bookmark.nodeId || null,
      JSON.stringify(bookmark.variables || {}),
      bookmark.resumeText || null,
      bookmark.reason || null,
    ]
  );
};

const clearConversationBookmark = async (conversationId: string) => {
  await query(
    `UPDATE conversations
     SET context_json = COALESCE(context_json, '{}'::jsonb) - 'bookmarked_state',
         updated_at = NOW()
     WHERE id = $1`,
    [conversationId]
  );
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

const AUTO_ADVANCE_WAIT_NODE_TYPES = new Set([
  "message",
  "msg_text",
  "msg_media",
  "send_template",
  "ai_generate",
  "api",
  "save",
  "action",
  "reminder",
  "knowledge_lookup",
]);

const AUTO_ADVANCE_DELAY_MS = 1500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const findImplicitNextNode = (currentNodeId: string, nodes: any[]) => {
  const currentIndex = nodes.findIndex((node: any) => String(node.id) === String(currentNodeId));
  if (currentIndex < 0) {
    return null;
  }

  return nodes
    .slice(currentIndex + 1)
    .find((node: any) => node && String(node.id || "").trim());
};

const findImplicitEntryNode = (flowJson: any) => {
  const nodes = Array.isArray(flowJson?.nodes) ? flowJson.nodes : [];
  const edges = Array.isArray(flowJson?.edges) ? flowJson.edges : [];
  const incomingCounts = new Map<string, number>();

  for (const edge of edges) {
    const targetId = String(edge?.target || edge?.to || "").trim();
    if (!targetId) {
      continue;
    }

    incomingCounts.set(targetId, (incomingCounts.get(targetId) || 0) + 1);
  }

  const candidates = nodes.filter((node: any) => {
    const nodeId = String(node?.id || "").trim();
    if (!nodeId) {
      return false;
    }

    const type = normalizeRuntimeNodeType(node.type);
    if (type === "start" || type === "trigger") {
      return false;
    }

    return (incomingCounts.get(nodeId) || 0) === 0;
  });

  if (!candidates.length) {
    return null;
  }

  const preferredTypes = [
    "message",
    "msg_text",
    "msg_media",
    "send_template",
    "delay",
    "action",
    "save",
    "ai_generate",
    "api",
    "knowledge_lookup",
    "business_hours",
    "menu",
    "menu_button",
    "menu_list",
    "input",
    "condition",
    "goto",
    "handoff",
    "assign_agent",
    "end",
  ];

  for (const preferredType of preferredTypes) {
    const match = candidates.find((node: any) => normalizeRuntimeNodeType(node.type) === preferredType);
    if (match) {
      return match;
    }
  }

  return candidates[0] || null;
};

const getBotStoredTriggerKeywords = async (botId: string) => {
  const res = await query(
    `SELECT trigger_keywords
     FROM bots
     WHERE id = $1
     LIMIT 1`,
    [botId]
  );

  return String(res.rows[0]?.trigger_keywords || "")
    .split(",")
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(Boolean);
};

const hasBotStoredTriggerKeywordMatch = async (botId: string, text: string) => {
  const keywords = await getBotStoredTriggerKeywords(botId);
  return keywords.some((keyword) => keywordMatchesText(keyword, text));
};

const findBotStoredTriggerFlowMatch = async (
  botId: string,
  flows: FlowRuntimeRecord[],
  text: string
) => {
  if (!(await hasBotStoredTriggerKeywordMatch(botId, text))) {
    return null;
  }

  const selectedFlow = flows.find((flow) => flow.is_default) || flows[0] || null;
  if (!selectedFlow) {
    return null;
  }

  const startNode = findStartNodeTargetInFlow(selectedFlow.flow_json);
  if (!startNode) {
    return null;
  }

  return {
    flow: selectedFlow,
    node: startNode,
  };
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

  await withConversationProcessingLock(input.conversationId, async () => {
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
  });
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
  if (["message", "msg_text", "msg_media"].includes(normalized)) {
    return "message";
  }
  if (["menu", "menu_button", "menu_list"].includes(normalized)) {
    return "menu";
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
      const isKeywordAgentNode =
        normalizedType === "assign_agent" && extractNodeKeywords(node).length > 0;

      if (!isKeywordAgentNode) {
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
    return findImplicitEntryNode(flowJson);
  }

  const edge = edges.find((candidate: any) => String(candidate.source) === String(entryNode.id));
  return nodes.find((node: any) => String(node.id) === String(edge?.target)) || findImplicitEntryNode(flowJson) || null;
};

const resolveFlowEntryNode = (flowJson: any) => {
  const nodes = Array.isArray(flowJson?.nodes) ? flowJson.nodes : [];
  return findStartNodeTargetInFlow(flowJson) || findImplicitEntryNode(flowJson) || nodes[0] || null;
};

const selectTransferFlow = (
  flows: FlowRuntimeRecord[],
  targetFlowId?: string | null
) => {
  const normalizedTargetFlowId = String(targetFlowId || "").trim();
  if (normalizedTargetFlowId) {
    return (
      flows.find((flow) => String(flow.id) === normalizedTargetFlowId) || null
    );
  }

  return flows[0] || null;
};

const buildHandoffContextPatch = (input: {
  handoffType: "flow" | "bot";
  fromBotId: string;
  fromFlowId?: string | null | undefined;
  toBotId: string;
  toFlowId?: string | null | undefined;
  gotoNodeId: string;
}) =>
  JSON.stringify({
    handoff: {
      type: input.handoffType,
      fromBotId: input.fromBotId,
      fromFlowId: input.fromFlowId || null,
      toBotId: input.toBotId,
      toFlowId: input.toFlowId || null,
      gotoNodeId: input.gotoNodeId,
      transferredAt: new Date().toISOString(),
    },
  });

const performGotoHandoff = async (input: {
  conversationId: string;
  currentBotId: string;
  currentFlowId?: string | null;
  currentNodeId: string;
  gotoData: any;
  normalizedChannel: string;
  platformUserId: string;
}) => {
  const gotoType = String(input.gotoData?.gotoType || "").trim().toLowerCase();
  const conversationRes = await query(
    `SELECT c.*, ct.name AS contact_name, ct.email AS contact_email, ct.phone AS contact_phone
     FROM conversations c
     LEFT JOIN contacts ct ON ct.id = c.contact_id
     WHERE c.id = $1
     LIMIT 1`,
    [input.conversationId]
  );
  const conversation = conversationRes.rows[0];
  if (!conversation) {
    throw new Error("Conversation not found for Go To handoff.");
  }

  if (gotoType === "flow") {
    const flows = await loadEligibleFlows(input.currentBotId, conversation.project_id || null);
    const targetFlow = selectTransferFlow(flows, input.gotoData?.targetFlowId || null);
    if (!targetFlow) {
      throw new Error("Target flow could not be found for same-bot handoff.");
    }

    const targetNode = resolveFlowEntryNode(targetFlow.flow_json);
    if (!targetNode) {
      throw new Error("Target flow has no runnable entry node.");
    }

    await query(
      `UPDATE conversations
       SET flow_id = $1,
           current_node = $2,
           status = 'active',
           retry_count = 0,
           context_json = COALESCE(context_json, '{}'::jsonb) || $3::jsonb,
           updated_at = NOW()
       WHERE id = $4`,
      [
        targetFlow.id,
        targetNode.id,
        buildHandoffContextPatch({
          handoffType: "flow",
          fromBotId: input.currentBotId,
          fromFlowId: input.currentFlowId,
          toBotId: input.currentBotId,
          toFlowId: targetFlow.id,
          gotoNodeId: input.currentNodeId,
        }),
        input.conversationId,
      ]
    );

    return {
      botId: input.currentBotId,
      flowId: targetFlow.id,
      targetNode,
      nodes: Array.isArray(targetFlow.flow_json?.nodes) ? targetFlow.flow_json.nodes : [],
      edges: Array.isArray(targetFlow.flow_json?.edges) ? targetFlow.flow_json.edges : [],
    };
  }

  if (gotoType === "bot") {
    const targetBotId = String(input.gotoData?.targetBotId || "").trim();
    if (!targetBotId) {
      throw new Error("Target bot is required for Go To bot handoff.");
    }

    const currentBot = await findBotById(input.currentBotId);
    const targetBot = await findBotById(targetBotId);
    if (!currentBot || !targetBot) {
      throw new Error("Go To bot target could not be found.");
    }
    if (String(currentBot.workspace_id || "") !== String(targetBot.workspace_id || "")) {
      throw new Error("Inter-bot handoff must stay inside the same workspace.");
    }
    if (String(targetBot.status || "").trim().toLowerCase() !== "active") {
      throw new Error("Target bot must be active before using Go To bot.");
    }

    const contact = await upsertContactWithIdentity({
      botId: targetBot.id,
      workspaceId: targetBot.workspace_id,
      platform: input.normalizedChannel,
      platformUserId: input.platformUserId,
      name: conversation.contact_name || null,
      email: conversation.contact_email || null,
      phone: conversation.contact_phone || input.platformUserId,
    });

    const resolvedContext = await resolveCampaignContext(
      targetBot.id,
      input.normalizedChannel,
      null
    );

    const targetFlows = await loadEligibleFlows(
      targetBot.id,
      resolvedContext.projectId || targetBot.project_id || null
    );
    const targetFlow = selectTransferFlow(targetFlows, input.gotoData?.targetFlowId || null);
    if (!targetFlow) {
      throw new Error("Target bot has no active flows available.");
    }

    const targetNode = resolveFlowEntryNode(targetFlow.flow_json);
    if (!targetNode) {
      throw new Error("Target bot flow has no runnable entry node.");
    }

    await query(
      `UPDATE conversations
       SET bot_id = $1,
           workspace_id = COALESCE($2, workspace_id),
           project_id = COALESCE($3, project_id),
           contact_id = $4,
           campaign_id = $5,
           channel_id = $6,
           entry_point_id = $7,
           flow_id = $8,
           list_id = $9,
           platform = COALESCE($10, platform),
           platform_account_id = COALESCE($11, platform_account_id),
           current_node = $12,
           status = 'active',
           retry_count = 0,
           context_json = COALESCE(context_json, '{}'::jsonb) || $13::jsonb,
           updated_at = NOW()
       WHERE id = $14`,
      [
        targetBot.id,
        targetBot.workspace_id || resolvedContext.workspaceId || null,
        resolvedContext.projectId || targetBot.project_id || null,
        contact.id,
        resolvedContext.campaignId,
        resolvedContext.channelId,
        resolvedContext.entryPointId,
        targetFlow.id,
        resolvedContext.listId,
        resolvedContext.platform || input.normalizedChannel,
        resolvedContext.platformAccountId,
        targetNode.id,
        buildHandoffContextPatch({
          handoffType: "bot",
          fromBotId: input.currentBotId,
          fromFlowId: input.currentFlowId,
          toBotId: targetBot.id,
          toFlowId: targetFlow.id,
          gotoNodeId: input.currentNodeId,
        }),
        input.conversationId,
      ]
    );

    await applyConversationWorkspacePolicies(input.conversationId);
    await closePlatformUserRunnableConversations(
      input.conversationId,
      input.platformUserId,
      input.normalizedChannel
    );

    return {
      botId: targetBot.id,
      flowId: targetFlow.id,
      targetNode,
      nodes: Array.isArray(targetFlow.flow_json?.nodes) ? targetFlow.flow_json.nodes : [],
      edges: Array.isArray(targetFlow.flow_json?.edges) ? targetFlow.flow_json.edges : [],
    };
  }

  throw new Error(`Unsupported Go To handoff type '${gotoType}'.`);
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

  return hasBotStoredTriggerKeywordMatch(botId, text);
};

const shouldTriggerHumanTakeover = async (conversation: any, incomingText: string) => {
  if (!conversation?.workspace_id) {
    return false;
  }

  const settings = await findConversationSettingsByWorkspace(conversation.workspace_id);
  if (settings && !settings.allow_agent_takeover) {
    return false;
  }

  const sentiment = await analyzeMessageSentiment(incomingText);
  return sentiment.shouldEscalate;
};

const handleValidationError = async (
  conversation: any,
  lastNode: any,
  globalFallbackNodeId?: string | null
) => {
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

    if (globalFallbackNodeId) {
      return { step: globalFallbackNodeId };
    }

    return {
      step: null,
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
    let activeBotId = botId;
    let activeNodes = nodes;
    let activeEdges = edges;
    let loop = 0;
    let endedByInputWait = false;
    let endedByTerminalNode = false;

    const conversationRes = await query(
      "SELECT variables, workspace_id, project_id, flow_id, current_node, context_json FROM conversations WHERE id = $1",
      [conversationId]
    );

    let variables = parseVariables(conversationRes.rows[0]?.variables);
    let conversationWorkspaceId = String(conversationRes.rows[0]?.workspace_id || "").trim() || null;
    let conversationProjectId = String(conversationRes.rows[0]?.project_id || "").trim() || null;
    const botSystemMessages = await getBotSystemMessages(activeBotId);
    const runSystemFlowMapping = async (eventKey: "handoff" | "conversation_close") => {
      const mappedFlowId = await getBotSystemFlowId(activeBotId, eventKey);
      if (!mappedFlowId) {
        return null;
      }

      const result = await triggerFlowExternally({
        botId: activeBotId,
        flowId: mappedFlowId,
        conversationId,
        platform: normalizedChannel,
        channel: normalizedChannel,
        io,
        context: {
          workspaceId: conversationWorkspaceId,
          projectId: conversationProjectId,
        },
      });

      return Array.isArray(result.actions) ? result.actions : [];
    };

    const closeConversationNaturally = async () => {
      await query(
        `UPDATE conversations
         SET current_node = NULL,
             status = 'closed',
             retry_count = 0,
             updated_at = NOW()
         WHERE id = $1`,
        [conversationId]
      );

      await cancelPendingJobsByConversation(conversationId, FLOW_WAIT_JOB_TYPES);
      clearUserTimers(activeBotId, platformUserId);
    };

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
            botId: activeBotId,
            channel: normalizedChannel,
            platformUserId,
            text: data.text || "User routed to human agent via flow.",
            isBot: false,
            priorityAlert: true,
            status: "agent_pending",
            timestamp: new Date().toISOString(),
          });
        }

        clearUserTimers(activeBotId, platformUserId);
        const systemFlowActions = await runSystemFlowMapping("handoff");
        if (systemFlowActions) {
          generatedActions.push(...systemFlowActions);
          endedByTerminalNode = true;
          break;
        }

        payload = {
          type: "system",
          text: data.text || "Bot paused. An agent will be with you shortly.",
        };
      } else if (currentNodeType === "message" || currentNodeType === "input") {
        const delayMs = Number(data.delayMs || 0);
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        const messageType = String(data.messageType || data.contentType || "").trim().toLowerCase();
        const mediaUrl = String(data.media_url || data.url || "").trim();
        const isMediaMessage = Boolean(mediaUrl) && messageType !== "text" && currentNodeType !== "input";

        if (isMediaMessage) {
          payload = {
            type: inferMediaType({ ...data, media_url: mediaUrl, url: mediaUrl }),
            mediaUrl,
            ...(String(data.caption || data.text || "").trim()
              ? { text: replaceVariables(String(data.caption || data.text || ""), variables) }
              : {}),
          };
          nextHandles = ["next", "response"];
        } else {
          let text = replaceVariables(data.text || data.label || "...", variables);

          if (currentNodeType === "input") {
            text += "\n\n_(Type 'reset' to restart)_";
          }

          payload = {
            type: "text",
            text,
          };

          // When a plain text message is immediately followed by an input node,
          // collapse them into a single outbound prompt and wait on the input node.
          if (currentNodeType === "message") {
            const immediateNextNode = findNextNode(
              currentNode.id,
              activeNodes,
              activeEdges,
              ["response", "next", null, undefined]
            );
            const immediateNextType = normalizeRuntimeNodeType(immediateNextNode?.type);

            if (immediateNextNode && immediateNextType === "input") {
              const nextData = immediateNextNode.data || {};
              const promptText = replaceVariables(
                nextData.text || nextData.label || "...",
                variables
              );

              payload = {
                type: "text",
                text: [text, `${promptText}\n\n_(Type 'reset' to restart)_`]
                  .filter(Boolean)
                  .join("\n\n"),
              };

              generatedActions.push(payload);

              await query("UPDATE conversations SET current_node = $1 WHERE id = $2", [
                immediateNextNode.id,
                conversationId,
              ]);

              await scheduleWaitingNodeInactivity({
                conversationId,
                botId: activeBotId,
                platformUserId,
                waitingNodeId: String(immediateNextNode.id),
                channel,
                io,
                reminderDelaySeconds: Number(nextData.reminderDelay || 0),
                reminderText: nextData.reminderText,
                timeoutSeconds: Number(nextData.timeout || 0),
                timeoutFallback: nextData.timeoutFallback,
              });

              endedByInputWait = true;
              break;
            }
          }
        }
      } else if (currentNodeType === "menu") {
        const menuMode = String(data.menuMode || data.menuStyle || "").trim().toLowerCase();
        const menuItems = Array.from({ length: 10 }, (_, index) => index + 1)
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
        const useListLayout = menuMode === "list" || menuItems.length > 3;

        payload = {
          type: "interactive",
          text: replaceVariables(data.text || "Choose an option:", variables),
          ...(useListLayout
            ? {
                buttonText: String(data.buttonText || "View Options").trim() || "View Options",
                sections:
                  menuItems.length > 0
                    ? [
                        {
                          title: String(data.sectionTitle || "Options").trim() || "Options",
                          rows: menuItems,
                        },
                      ]
                    : [],
              }
            : {
                buttons: menuItems.map((item) => ({
                  id: item.id,
                  title: item.title,
                })),
              }),
        };
      } else if (currentNodeType === "ai_generate") {
        const generatedText = await generateAiNodeText(data, variables);
        const saveTo =
          String(data.saveTo || data.variable || data.outputVariable || "ai_output").trim() || "ai_output";
        if (saveTo) {
          variables[saveTo] = generatedText;
          await persistConversationVariables(conversationId, variables);
        }

        payload = {
          type: "text",
          text: generatedText || replaceVariables(data.text || data.prompt || data.label || "", variables),
        };
        nextHandles = ["next", "response"];
      } else if (currentNodeType === "business_hours") {
        const isOpen = isBusinessHoursOpen(data);
        const routeHandle = isOpen ? "open" : "closed";
        const targetNode = findNextNode(currentNode.id, activeNodes, activeEdges, [routeHandle]);

        if (targetNode) {
          currentNode = targetNode;
          await query("UPDATE conversations SET current_node = $1 WHERE id = $2", [
            currentNode.id,
            conversationId,
          ]);
          continue;
        }

        payload = {
          type: "text",
          text: replaceVariables(
            isOpen
              ? String(data.openMessage || data.text || "We are open now.")
              : String(data.closedMessage || data.text || "We're currently offline. Please leave a message."),
            variables
          ),
        };
        nextHandles = ["next", "response"];
      } else if (currentNodeType === "split_traffic") {
        const branchHandle = chooseSplitTrafficBranch(data);
        const targetNode = findNextNode(currentNode.id, activeNodes, activeEdges, [branchHandle]);
        if (targetNode) {
          currentNode = targetNode;
          await query("UPDATE conversations SET current_node = $1 WHERE id = $2", [
            currentNode.id,
            conversationId,
          ]);
          continue;
        }

        payload = {
          type: "text",
          text: replaceVariables(
            String(data.fallbackText || data.text || "Routing split could not be resolved."),
            variables
          ),
        };
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
        const delayMs = getDurationMs(data) || AUTO_ADVANCE_DELAY_MS;
        if (delayMs > 0) {
          await sleep(delayMs);
        }
        nextHandles = ["next", "response"];
      } else if (currentNodeType === "reminder") {
        payload = {
          type: "text",
          text: replaceVariables(data.text || data.label || "Just checking in.", variables),
        };
        nextHandles = ["next", "response"];
      } else if (currentNodeType === "end") {
        endedByTerminalNode = true;
        const latestConversationRes = await query(
          `SELECT context_json
           FROM conversations
           WHERE id = $1
           LIMIT 1`,
          [conversationId]
        );
        const latestContext = parseJsonObject(latestConversationRes.rows[0]?.context_json);
        const bookmarkedState = readConversationBookmark(latestContext);

        if (bookmarkedState) {
          await clearConversationBookmark(conversationId);
          await query(
            `UPDATE conversations
             SET current_node = $2,
                 flow_id = $3,
                 variables = $4::jsonb,
                 retry_count = 0,
                 status = 'active',
                 context_json = COALESCE(context_json, '{}'::jsonb)
                   - 'restart_required'
                   - 'termination_reason',
                 updated_at = NOW()
             WHERE id = $1`,
            [
              conversationId,
              bookmarkedState.nodeId || null,
              bookmarkedState.flowId || null,
              JSON.stringify(bookmarkedState.variables || {}),
            ]
          );

          await cancelPendingJobsByConversation(conversationId, FLOW_WAIT_JOB_TYPES);
          clearUserTimers(activeBotId, platformUserId);
          generatedActions.push({
            type: "system",
            text: bookmarkedState.resumeText || "Let's pick up where we left off...",
          });
          break;
        }

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
        clearUserTimers(activeBotId, platformUserId);
        await closePlatformUserRunnableConversations(
          conversationId,
          platformUserId,
          normalizedChannel
        );
        const systemFlowActions = await runSystemFlowMapping("conversation_close");
        if (systemFlowActions) {
          generatedActions.push(...systemFlowActions);
          break;
        }
        payload = {
          type: "text",
          text: data.text || "Session completed.",
        };
        generatedActions.push(payload);
        break;
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
      } else if (currentNodeType === "knowledge_lookup") {
        try {
          const lookupQuery = replaceVariables(
            String(data.query || data.prompt || data.search || "").trim(),
            variables
          );
          const saveTo = String(data.saveTo || data.variable || "knowledge_results").trim();
          const saveTextTo = String(data.saveTextTo || "").trim();
          const scope = String(data.scope || "project").trim().toLowerCase();
          const limit = Math.max(1, Math.min(Number(data.limit || 3), 10));

          if (!conversationWorkspaceId) {
            throw new Error("Conversation is missing workspace context.");
          }

          if (!lookupQuery) {
            nextHandles = ["empty", "no_results", "response"];
          } else {
            const chunks = await retrieveKnowledgeForWorkspace({
              workspaceId: conversationWorkspaceId,
              projectId: scope === "workspace" ? null : conversationProjectId,
              query: lookupQuery,
              limit,
            });

            variables[saveTo] = chunks;
            if (saveTextTo) {
              variables[saveTextTo] = buildKnowledgeLookupText(chunks);
            }
            await persistConversationVariables(conversationId, variables);
            nextHandles = chunks.length > 0 ? ["success", "response"] : ["empty", "no_results", "response"];
          }
        } catch (err) {
          console.error("Knowledge lookup node error", err);
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
      } else if (currentNodeType === "goto") {
        const gotoType = String(data.gotoType || "").trim().toLowerCase();
        if (gotoType === "flow" || gotoType === "bot") {
          const handoff = await performGotoHandoff({
            conversationId,
            currentBotId: activeBotId,
            currentFlowId: conversationRes.rows[0]?.flow_id || null,
            currentNodeId: String(currentNode.id),
            gotoData: data,
            normalizedChannel,
            platformUserId,
          });
          activeBotId = handoff.botId;
          activeNodes = handoff.nodes;
          activeEdges = handoff.edges;
          currentNode = handoff.targetNode;
          conversationRes.rows[0] = {
            ...(conversationRes.rows[0] || {}),
            flow_id: handoff.flowId || null,
          };
          if (gotoType === "bot") {
            const refreshedConversationRes = await query(
              "SELECT workspace_id, project_id FROM conversations WHERE id = $1",
              [conversationId]
            );
            conversationWorkspaceId =
              String(refreshedConversationRes.rows[0]?.workspace_id || "").trim() || null;
            conversationProjectId =
              String(refreshedConversationRes.rows[0]?.project_id || "").trim() || null;
          }
        } else {
          const targetNodeId = String(data.targetNode || data.targetNodeId || "").trim();
          currentNode = activeNodes.find((node: any) => String(node.id) === targetNodeId);
        }

        await query(
          "UPDATE conversations SET current_node = $1, flow_id = COALESCE($2, flow_id) WHERE id = $3",
          [currentNode?.id || null, conversationRes.rows[0]?.flow_id || null, conversationId]
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
        const edge = activeEdges.find(
          (candidate: any) =>
            String(candidate.source) === String(currentNode.id) &&
            String(candidate.sourceHandle) === matchedHandle
        );

        currentNode = activeNodes.find(
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
          botId: activeBotId,
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

      const explicitNextNode = findNextNode(currentNode.id, activeNodes, activeEdges, nextHandles);
      if (explicitNextNode) {
        if (AUTO_ADVANCE_WAIT_NODE_TYPES.has(currentNodeType)) {
          await sleep(AUTO_ADVANCE_DELAY_MS);
        }
        currentNode = explicitNextNode;
        continue;
      }

      if (AUTO_ADVANCE_WAIT_NODE_TYPES.has(currentNodeType)) {
        const implicitNextNode = findImplicitNextNode(currentNode.id, activeNodes);
        if (implicitNextNode) {
          await sleep(AUTO_ADVANCE_DELAY_MS);
          currentNode = implicitNextNode;
          continue;
        }
      }

      await closeConversationNaturally();
      endedByTerminalNode = true;
      currentNode = null;
      break;
    }

    if (!endedByInputWait && !endedByTerminalNode) {
      try {
        await maybeAutoCaptureLead({
          conversationId,
          botId: activeBotId,
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
    const normalizedPlatformUserId =
      normalizedChannel === "whatsapp"
        ? normalizeWhatsAppPlatformUserId(platformUserId) || platformUserId
        : platformUserId;
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

    try {
      await validateWorkspaceContext(resolvedContext.workspaceId);
    } catch (validationError: any) {
      if (validationError?.status === 403) {
        console.warn(
          `[FlowEngine] Skipping inbound runtime for workspace ${resolvedContext.workspaceId}: ${validationError.message}`
        );
        return {
          conversationId: null,
          actions: [],
        };
      }

      throw validationError;
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
      platformUserId: normalizedPlatformUserId,
      name: userName,
      phone: normalizedChannel === "whatsapp" ? normalizedPlatformUserId : null,
      email: normalizedChannel === "email" ? normalizedPlatformUserId : null,
    });

    const botSettings = await getBotSystemMessages(botId);
    const botGlobalSettings = await getBotGlobalSettings(botId);
    const globalFallbackNodeId = String(botGlobalSettings.globalFallbackNodeId || "").trim() || null;
    const normalizedText = String(incomingText || "").trim().toUpperCase();
    if (normalizedText === "STOP" || normalizedText === "UNSUBSCRIBE") {
      await query(
        `UPDATE contacts
         SET opted_in = false,
             updated_at = NOW()
         WHERE id = $1`,
        [contact.id]
      );

      return {
        conversationId: null,
        actions: [
          {
            type: "text",
            text: botSettings.optOutMessage,
          },
        ],
      };
    }

    const availableFlows = await loadEligibleFlows(
      botId,
      resolvedContext.projectId || null
    );
    const botKeywordMatchedTriggerFlow = text
      ? await findBotStoredTriggerFlowMatch(botId, availableFlows, text)
      : null;
    const universalRuleMatch =
      text && !botKeywordMatchedTriggerFlow
        ? await findBotUniversalRuleMatch(botId, text)
        : null;
    const universalRuleMatchedFlow =
      universalRuleMatch?.flowId
        ? availableFlows.find((flow) => String(flow.id) === String(universalRuleMatch.flowId))
        : null;
    const universalMatchedTriggerFlow = (() => {
      if (!universalRuleMatchedFlow) {
        return null;
      }

      const startNode = findStartNodeTargetInFlow(universalRuleMatchedFlow.flow_json);
      if (!startNode) {
        return null;
      }

      return {
        flow: universalRuleMatchedFlow,
        node: startNode,
        source: "universal" as const,
      };
    })();
    const matchedTriggerFlow = botKeywordMatchedTriggerFlow || universalMatchedTriggerFlow;
    const shouldBypassCurrentNodeHandling = (matchedTriggerFlow as any)?.source === "universal";
    const shouldPreferActiveConversation =
      !matchedTriggerFlow &&
      !ESCAPE_KEYWORDS.includes(text) &&
      !RESET_KEYWORDS.includes(text);
    const activeConversationCandidate = shouldPreferActiveConversation
      ? await findLatestRunnableConversation(
          botId,
          contact.id,
          normalizedChannel,
          normalizedChannel === "whatsapp" ? null : resolvedContext.projectId || null
        )
      : null;
    const activeConversation =
      activeConversationCandidate?.current_node ? activeConversationCandidate : null;
    const latestConversation = await findLatestConversationForBotContact(
      botId,
      contact.id,
      normalizedChannel,
      normalizedChannel === "whatsapp" ? null : resolvedContext.projectId || null
    );

    const shouldSendFallbackMessage =
      Boolean(text) &&
      !ESCAPE_KEYWORDS.includes(text) &&
      !RESET_KEYWORDS.includes(text) &&
      !matchedTriggerFlow &&
      !botKeywordMatchedTriggerFlow &&
      !universalRuleMatch &&
      !activeConversationCandidate;

    if (shouldSendFallbackMessage) {
      return {
        conversationId: latestConversation?.id || null,
        actions: [
          {
            type: "text",
            text: botSettings.fallbackMessage,
          },
        ],
      };
    }

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

    return await withConversationProcessingLock(conversation.id, async () => {
    const refreshedConversationRes = await query(
      `SELECT *
       FROM conversations
       WHERE id = $1
       LIMIT 1`,
      [conversation.id]
    );
    conversation = refreshedConversationRes.rows[0] || conversation;

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
          normalizedPlatformUserId,
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

      if (io) {
        io.emit("dashboard_update", {
          conversationId: conversation.id,
          botId,
          channel: normalizedChannel,
          platformUserId,
          isBot: false,
          priorityAlert: resolvedCsatRating === "csat_bad",
          csatRating: resolvedCsatRating,
          csatPending: false,
          text:
            resolvedCsatRating === "csat_bad"
              ? "User rated this interaction: Bad"
              : resolvedCsatRating === "csat_okay"
                ? "User rated this interaction: Okay"
                : "User rated this interaction: Great",
          timestamp: new Date().toISOString(),
        });
      }

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
        if (text) {
          outgoingActions.push({
            type: "text",
            text: botSettings.fallbackMessage,
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

      if ((matchedTriggerFlow as any).source === "universal") {
        await persistConversationBookmark(
          conversation.id,
          buildConversationBookmark(conversation, "universal_interrupt")
        );
      }

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

    if (!currentNode && conversation.current_node && !isReset && !shouldBypassCurrentNodeHandling) {
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
            lastNode,
            globalFallbackNodeId
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

          try {
            await maybeAutoCaptureLead({
              conversationId: conversation.id,
              botId,
              platform: normalizedChannel,
              variables: updatedVariables,
              sourcePayload: {
                platformUserId,
                conversationId: conversation.id,
                triggerSource: "input_answer",
                linkedFieldKey: String(lastNode.data?.linkedFieldKey || lastNode.data?.leadField || lastNode.data?.field || "").trim() || null,
                nodeId: lastNode.id,
              },
            });
          } catch (err: any) {
            if (!(err instanceof LeadCaptureContextError)) {
              throw err;
            }
          }
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

      if (matchedTriggerFlow) {
        selectedFlow = matchedTriggerFlow.flow;
        selectedNode = matchedTriggerFlow.node;
      }

      if (!selectedNode && selectedFlow) {
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
    });
  } catch (err: any) {
    console.error("ENGINE ERROR:", err.message);
  }
};

export const triggerFlowExternally = async (input: {
  botId?: string | null;
  flowId?: string | null;
  startNodeId?: string | null;
  conversationId?: string | null;
  contactId?: string | null;
  platform?: string | null;
  channel?: string | null;
  platformUserId?: string | null;
  phone?: string | null;
  email?: string | null;
  contactName?: string | null;
  variables?: Record<string, any>;
  context?: {
    workspaceId?: string | null;
    projectId?: string | null;
    campaignId?: string | null;
    channelId?: string | null;
    entryPointId?: string | null;
    listId?: string | null;
    platformAccountId?: string | null;
    entryKey?: string | null;
  } | null;
  io?: any;
}) => {
  const normalizedChannel = normalizePlatform(input.channel || input.platform || "whatsapp");
  const requestedConversationId = String(input.conversationId || "").trim();
  const requestedContactId = String(input.contactId || "").trim();
  const requestedBotId = String(input.botId || "").trim();
  const requestedFlowId = String(input.flowId || "").trim();
  const requestedStartNodeId = String(input.startNodeId || "").trim();
  const incomingVariables =
    input.variables && typeof input.variables === "object" ? input.variables : {};

  let conversation: any = null;
  let contact: any = null;
  let botId = requestedBotId;

  if (requestedConversationId) {
    const conversationRes = await query(
      `SELECT c.*, ct.platform_user_id, ct.name AS contact_record_name, ct.phone AS contact_record_phone, ct.email AS contact_record_email
       FROM conversations c
       JOIN contacts ct ON ct.id = c.contact_id
       WHERE c.id = $1
       LIMIT 1`,
      [requestedConversationId]
    );
    conversation = conversationRes.rows[0] || null;
    if (!conversation) {
      throw { status: 404, message: "Conversation not found" };
    }

    contact = {
      id: conversation.contact_id,
      platform_user_id: conversation.platform_user_id,
      name: conversation.contact_record_name,
      phone: conversation.contact_record_phone,
      email: conversation.contact_record_email,
    };
    botId = botId || String(conversation.bot_id || "").trim();
  }

  if (!botId) {
    throw { status: 400, message: "botId is required when conversationId is not provided" };
  }

  const bot = await findBotById(botId);
  if (!bot) {
    throw { status: 404, message: "Bot not found" };
  }

  if (!bot.workspace_id || !bot.project_id) {
    throw {
      status: 409,
      message: "Target bot must belong to a workspace project before it can be triggered externally.",
    };
  }

  await validateWorkspaceContext(bot.workspace_id);

  if (!contact) {
    if (requestedContactId) {
      const contactRes = await query(
        `SELECT id, platform_user_id, name, phone, email
         FROM contacts
         WHERE id = $1
         LIMIT 1`,
        [requestedContactId]
      );
      contact = contactRes.rows[0] || null;
      if (!contact) {
        throw { status: 404, message: "Contact not found" };
      }
    } else {
      const resolvedPlatformUserId =
        String(input.platformUserId || input.phone || input.email || "").trim();
      if (!resolvedPlatformUserId) {
        throw {
          status: 400,
          message:
            "Provide conversationId, contactId, or a platformUserId/phone/email to start a flow.",
        };
      }

      contact = await upsertContactWithIdentity({
        botId,
        workspaceId: bot.workspace_id,
        platform: normalizedChannel,
        platformUserId: resolvedPlatformUserId,
        name: input.contactName || null,
        phone: input.phone || (normalizedChannel === "whatsapp" ? resolvedPlatformUserId : null),
        email: input.email || (normalizedChannel === "email" ? resolvedPlatformUserId : null),
      });
    }
  }

  const explicitContext = input.context && typeof input.context === "object" ? input.context : {};
  const resolvedContext = {
    workspaceId: String(explicitContext.workspaceId || bot.workspace_id || "").trim() || null,
    projectId: String(explicitContext.projectId || bot.project_id || "").trim() || null,
    campaignId: String(explicitContext.campaignId || "").trim() || null,
    channelId: String(explicitContext.channelId || "").trim() || null,
    entryPointId: String(explicitContext.entryPointId || "").trim() || null,
    flowId: requestedFlowId || null,
    listId: String(explicitContext.listId || "").trim() || null,
    platform: normalizedChannel,
    platformAccountId: String(explicitContext.platformAccountId || "").trim() || null,
    entryKey: String(explicitContext.entryKey || "").trim() || null,
    campaignName: null,
    channelName: null,
    entryName: null,
    entryMetadata: null,
    userId: null,
  };

  if (!conversation) {
    conversation =
      (await findConversationByContext(contact.id, normalizedChannel, resolvedContext)) ||
      (await findLatestConversationForBotContact(
        botId,
        contact.id,
        normalizedChannel,
        resolvedContext.projectId || null
      ));

    if (!conversation) {
      const insertConversationRes = await query(
        `INSERT INTO conversations (bot_id, workspace_id, project_id, contact_id, channel, status, variables, campaign_id, channel_id, entry_point_id, flow_id, list_id, platform, platform_account_id, context_json, contact_name, contact_phone)
         VALUES ($1, $2, $3, $4, $5, 'active', '{}'::jsonb, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15)
         RETURNING *`,
        [
          botId,
          resolvedContext.workspaceId,
          resolvedContext.projectId,
          contact.id,
          normalizedChannel,
          resolvedContext.campaignId,
          resolvedContext.channelId,
          resolvedContext.entryPointId,
          resolvedContext.flowId,
          resolvedContext.listId,
          normalizedChannel,
          resolvedContext.platformAccountId,
          buildConversationContextPayload(resolvedContext),
          input.contactName || contact.name || null,
          input.phone || contact.phone || null,
        ]
      );
      conversation = insertConversationRes.rows[0] || null;
      if (conversation) {
        await applyConversationWorkspacePolicies(conversation.id);
      }
    }
  }

  if (!conversation) {
    throw { status: 500, message: "Unable to create or resolve a conversation for this request." };
  }

  const availableFlows = await loadEligibleFlows(
    botId,
    conversation.project_id || bot.project_id || null
  );
  const targetFlow =
    (requestedFlowId
      ? availableFlows.find((flow: FlowRuntimeRecord) => String(flow.id) === requestedFlowId)
      : null) ||
    availableFlows.find((flow: FlowRuntimeRecord) => String(flow.id) === String(conversation.flow_id || "")) ||
    availableFlows.find((flow: FlowRuntimeRecord) => flow.is_default) ||
    availableFlows[0] ||
    null;

  if (!targetFlow) {
    throw { status: 404, message: "No runnable flow was found for the target bot." };
  }

  const targetNodes = Array.isArray(targetFlow.flow_json?.nodes) ? targetFlow.flow_json.nodes : [];
  const targetEdges = Array.isArray(targetFlow.flow_json?.edges) ? targetFlow.flow_json.edges : [];
  const startNode =
    (requestedStartNodeId
      ? targetNodes.find((node: any) => String(node.id) === requestedStartNodeId)
      : null) || resolveFlowEntryNode(targetFlow.flow_json);

  if (!startNode) {
    throw { status: 409, message: "The selected flow has no runnable entry node." };
  }

  const mergedVariables = {
    ...parseVariables(conversation.variables),
    ...incomingVariables,
  };

  await query(
    `UPDATE conversations
     SET bot_id = $1,
         workspace_id = COALESCE($2, workspace_id),
         project_id = COALESCE($3, project_id),
         flow_id = $4,
         current_node = NULL,
         variables = $5::jsonb,
         status = 'active',
         retry_count = 0,
         campaign_id = COALESCE($6, campaign_id),
         channel_id = COALESCE($7, channel_id),
         entry_point_id = COALESCE($8, entry_point_id),
         list_id = COALESCE($9, list_id),
         platform = COALESCE($10, platform, channel),
         platform_account_id = COALESCE($11, platform_account_id),
         context_json = COALESCE(context_json, '{}'::jsonb) || $12::jsonb,
         updated_at = NOW()
     WHERE id = $13`,
    [
      botId,
      resolvedContext.workspaceId,
      resolvedContext.projectId,
      targetFlow.id,
      JSON.stringify(mergedVariables),
      resolvedContext.campaignId,
      resolvedContext.channelId,
      resolvedContext.entryPointId,
      resolvedContext.listId,
      normalizedChannel,
      resolvedContext.platformAccountId,
      buildConversationContextPayload({
        ...resolvedContext,
        flowId: targetFlow.id,
      }),
      conversation.id,
    ]
  );

  await closeSiblingRunnableConversations(
    conversation.id,
    botId,
    contact.id,
    normalizedChannel,
    resolvedContext.projectId || null
  );

  const platformUserId =
    String(contact.platform_user_id || input.platformUserId || input.phone || input.email || "").trim() ||
    String(contact.id);

  await closePlatformUserRunnableConversations(
    conversation.id,
    platformUserId,
    normalizedChannel
  );

  const actions = await executeFlowFromNode(
    startNode,
    conversation.id,
    botId,
    platformUserId,
    targetNodes,
    targetEdges,
    normalizedChannel,
    input.io
  );

  for (const action of actions) {
    await routeMessage(conversation.id, action, input.io);
  }

  return {
    conversationId: conversation.id,
    contactId: contact.id,
    botId,
    flowId: targetFlow.id,
    startNodeId: String(startNode.id),
    actionCount: actions.length,
    actions,
  };
};
