import { GenericMessage } from "./messageRouter";

type FlowLike = {
  id: string;
  flow_json: any;
};

const buildFallbackSuggestions = (availableFlows: FlowLike[]) => {
  const keywords = Array.from(
    new Set(
      availableFlows.flatMap((flow) => {
        const flowName = String(flow?.flow_json?.flow_name || flow?.flow_json?.name || "").trim();
        const rawKeywords = String(
          flow?.flow_json?.keywords ||
            flow?.flow_json?.triggerKeywords ||
            flow?.flow_json?.trigger_keywords ||
            ""
        )
          .split(",")
          .map((keyword) => keyword.trim())
          .filter(Boolean);

        return rawKeywords.map((keyword) => (flowName ? `${flowName}: ${keyword}` : keyword));
      })
    )
  );

  return keywords.slice(0, 5);
};

export const buildFallbackMessage = (input: {
  botFallbackMessage?: string | null | undefined;
  availableFlows: FlowLike[];
}) => {
  const suggestions = buildFallbackSuggestions(input.availableFlows);
  const suffix = suggestions.length
    ? `\n\nTry one of these keywords:\n${suggestions.map((keyword) => `• ${keyword}`).join("\n")}`
    : "";

  return `${input.botFallbackMessage || "Sorry, I didn't understand. Type 'hello' to start."}${suffix}`;
};

export const resolveFallbackActions = async (input: {
  conversationId: string;
  conversationFlowId?: string | null;
  availableFlows: FlowLike[];
  globalFallbackNodeId?: string | null;
  botFallbackMessage?: string | null;
  executeFlowFromNode: (
    node: any,
    conversationId: string,
    botId: string,
    platformUserId: string,
    nodes: any[],
    edges: any[],
    channel: string,
    io: any,
    options?: any
  ) => Promise<GenericMessage[]>;
  botId: string;
  platformUserId: string;
  channel: string;
  io: any;
}) => {
  const fallbackFlow =
    input.conversationFlowId
      ? input.availableFlows.find((flow) => String(flow.id) === String(input.conversationFlowId || "")) || null
      : null;
  const fallbackNode =
    input.globalFallbackNodeId && fallbackFlow
      ? (fallbackFlow.flow_json?.nodes || []).find((node: any) => String(node.id) === input.globalFallbackNodeId)
      : null;

  if (fallbackNode && fallbackFlow) {
    const actions = await input.executeFlowFromNode(
      fallbackNode,
      input.conversationId,
      input.botId,
      input.platformUserId,
      fallbackFlow.flow_json?.nodes || [],
      fallbackFlow.flow_json?.edges || [],
      input.channel,
      input.io,
      {
        flowId: String(fallbackFlow.id || "").trim() || null,
        systemFlowType: String(fallbackFlow.flow_json?.system_flow_type || "").trim().toLowerCase() || null,
      }
    );

    return {
      conversationId: input.conversationId,
      actions,
    };
  }

  return {
    conversationId: input.conversationId,
    actions: [
      {
        type: "text",
        text: buildFallbackMessage({
          botFallbackMessage: input.botFallbackMessage,
          availableFlows: input.availableFlows,
        }),
      } as GenericMessage,
    ],
  };
};
