import { query } from "../config/db";

type ConversationRuntimeStateInput = {
  conversationId: string;
  currentNodeId?: string | null | undefined;
  flowId?: string | null | undefined;
  variables?: Record<string, any> | null | undefined;
  status?: string | null | undefined;
  retryCount?: number | null | undefined;
  touchUpdatedAt?: boolean | undefined;
};

const normalizeSafeFlowId = (value: any) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.startsWith("00000000-0000") ? null : trimmed;
};

export const updateConversationRuntimeState = async (input: ConversationRuntimeStateInput) => {
  const setClauses: string[] = [];
  const params: any[] = [input.conversationId];

  if (input.currentNodeId !== undefined) {
    params.push(input.currentNodeId);
    setClauses.push(`current_node = $${params.length}`);
  }

  if (input.flowId !== undefined) {
    params.push(normalizeSafeFlowId(input.flowId));
    setClauses.push(`flow_id = $${params.length}`);
  }

  if (input.variables !== undefined) {
    params.push(JSON.stringify(input.variables || {}));
    setClauses.push(`variables = $${params.length}::jsonb`);
  }

  if (input.status !== undefined) {
    params.push(input.status);
    setClauses.push(`status = $${params.length}`);
  }

  if (input.retryCount !== undefined) {
    params.push(input.retryCount);
    setClauses.push(`retry_count = $${params.length}`);
  }

  if (input.touchUpdatedAt) {
    setClauses.push("updated_at = NOW()");
  }

  await query(
    `UPDATE conversations
     SET ${setClauses.join(", ")}
     WHERE id = $1`,
    params
  );
};

export const setConversationCurrentNode = async (
  conversationId: string,
  currentNodeId: string | null
) => updateConversationRuntimeState({ conversationId, currentNodeId });

export const activateConversationRuntimeState = async (input: {
  conversationId: string;
  flowId?: string | null;
  currentNodeId?: string | null;
  variables?: Record<string, any> | null;
  status?: string | null;
  retryCount?: number | null;
}) =>
  updateConversationRuntimeState({
    conversationId: input.conversationId,
    currentNodeId: input.currentNodeId ?? null,
    flowId: input.flowId,
    variables: input.variables ?? {},
    status: input.status ?? "active",
    retryCount: input.retryCount ?? 0,
    touchUpdatedAt: true,
  });

export const resetConversationRuntimeState = async (input: {
  conversationId: string;
  flowId?: string | null | undefined;
  variables?: Record<string, any> | null | undefined;
  status?: string | null | undefined;
  retryCount?: number | null | undefined;
}) =>
  updateConversationRuntimeState({
    conversationId: input.conversationId,
    currentNodeId: null,
    flowId: input.flowId,
    variables: input.variables ?? {},
    status: input.status ?? "active",
    retryCount: input.retryCount ?? 0,
    touchUpdatedAt: true,
  });

export const setConversationAgentPendingState = async (conversationId: string) =>
  updateConversationRuntimeState({
    conversationId,
    currentNodeId: null,
    status: "agent_pending",
    retryCount: 0,
  });
