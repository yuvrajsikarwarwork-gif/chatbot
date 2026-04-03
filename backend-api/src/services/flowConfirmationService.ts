type JsonRecord = Record<string, any>;

export type TriggerSource = "campaign" | "bot" | "universal";

export interface TriggerBookmark {
  flowId: string | null;
  flowName?: string | null | undefined;
  nodeId: string | null;
  nodeLabel?: string | null | undefined;
  variables: JsonRecord;
  resumeText?: string | null | undefined;
  reason?: string | null | undefined;
}

export interface TriggerTarget {
  source: TriggerSource;
  flowId: string | null;
  flowName?: string | null | undefined;
  nodeId?: string | null | undefined;
  nodeLabel?: string | null | undefined;
  campaignId?: string | null | undefined;
  promptText?: string | null | undefined;
  matchedText?: string | null | undefined;
}

export interface TriggerConfirmationState {
  target: TriggerTarget;
  bookmark: TriggerBookmark;
  createdAt?: string | null | undefined;
  updatedAt?: string | null | undefined;
}

const CONFIRMATION_KEY = "trigger_confirmation_pending";

const parseJsonObject = (value: any): JsonRecord => {
  if (!value) {
    return {};
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  return value && typeof value === "object" ? value : {};
};

const normalizeText = (value: any) => String(value || "").trim().toLowerCase();

export const buildTriggerConfirmationTarget = (
  match: { flow: { id: string; flow_json?: any }; node: any; source?: string },
  campaignId: string | null,
  incomingText: string
): TriggerTarget => ({
  source: (String(match?.source || "bot").trim().toLowerCase() as TriggerSource) || "bot",
  flowId: String(match?.flow?.id || "").trim() || null,
  flowName: String(match?.flow?.flow_json?.flow_name || match?.flow?.flow_json?.name || "").trim() || null,
  nodeId: String(match?.node?.id || "").trim() || null,
  nodeLabel: String(
    match?.node?.data?.label ||
      match?.node?.data?.text ||
      match?.node?.data?.name ||
      ""
  ).trim() || null,
  campaignId: campaignId || null,
  promptText: null,
  matchedText: incomingText,
});

export const readTriggerConfirmation = (contextJson: any): TriggerConfirmationState | null => {
  const context = parseJsonObject(contextJson);
  const pending = parseJsonObject(context[CONFIRMATION_KEY] || context.triggerConfirmationPending);

  const target = parseJsonObject(pending.target || pending);
  const bookmark = parseJsonObject(pending.bookmark || context.bookmarked_state);

  const flowId = String(target.flowId || target.flow_id || pending.flowId || pending.flow_id || "").trim() || null;
  const nodeId = String(target.nodeId || target.node_id || pending.nodeId || pending.node_id || "").trim() || null;

  if (!flowId && !nodeId) {
    return null;
  }

  return {
    target: {
      source: (String(target.source || pending.source || "bot").trim().toLowerCase() as TriggerSource) || "bot",
      flowId,
      flowName: String(target.flowName || target.flow_name || pending.flowName || pending.flow_name || "").trim() || null,
      nodeId,
      nodeLabel: String(target.nodeLabel || target.node_label || pending.nodeLabel || pending.node_label || "").trim() || null,
      campaignId: String(target.campaignId || target.campaign_id || pending.campaignId || pending.campaign_id || "").trim() || null,
      promptText: String(target.promptText || target.prompt_text || pending.promptText || pending.prompt_text || "").trim() || null,
      matchedText: String(target.matchedText || target.matched_text || pending.matchedText || pending.matched_text || "").trim() || null,
    },
    bookmark: {
      flowId: String(bookmark.flowId || bookmark.flow_id || "").trim() || null,
      flowName: String(bookmark.flowName || bookmark.flow_name || "").trim() || null,
      nodeId: String(bookmark.nodeId || bookmark.node_id || "").trim() || null,
      nodeLabel: String(bookmark.nodeLabel || bookmark.node_label || "").trim() || null,
      variables: parseJsonObject(bookmark.variables),
      resumeText: String(bookmark.resumeText || bookmark.resume_text || "").trim() || null,
      reason: String(bookmark.reason || "").trim() || null,
    },
    createdAt: String(pending.createdAt || pending.created_at || "").trim() || null,
    updatedAt: String(pending.updatedAt || pending.updated_at || "").trim() || null,
  };
};

export const buildTriggerConfirmationState = (input: {
  target: TriggerTarget;
  bookmark: TriggerBookmark;
  createdAt?: string | null | undefined;
  updatedAt?: string | null | undefined;
}): TriggerConfirmationState => ({
  target: input.target,
  bookmark: input.bookmark,
  createdAt: input.createdAt || null,
  updatedAt: input.updatedAt || null,
});

export const parseTriggerConfirmationDecision = (text: string) => {
  const normalized = normalizeText(text);
  if (!normalized) {
    return "unknown" as const;
  }

  if (["yes", "y", "confirm", "ok", "okay", "sure", "switch"].includes(normalized)) {
    return "yes" as const;
  }

  if (["no", "n", "nope", "cancel", "stay", "continue"].includes(normalized)) {
    return "no" as const;
  }

  return "unknown" as const;
};

export const buildTriggerConfirmationPrompt = (input: {
  currentFlowName?: string | null | undefined;
  targetFlowName?: string | null | undefined;
  targetLabel?: string | null | undefined;
}) => {
  const currentName = String(input.currentFlowName || "the current flow").trim() || "the current flow";
  const targetName = String(input.targetFlowName || input.targetLabel || "the requested flow").trim() || "the requested flow";

  return [
    `You are currently in ${currentName}.`,
    `Switch to ${targetName}?`,
    "Reply YES to switch or NO to stay where you are.",
  ].join(" ");
};

export const buildTriggerConfirmationText = (input: {
  currentFlowName?: string | null | undefined;
  targetFlowName?: string | null | undefined;
  targetLabel?: string | null | undefined;
}) => buildTriggerConfirmationPrompt(input);
