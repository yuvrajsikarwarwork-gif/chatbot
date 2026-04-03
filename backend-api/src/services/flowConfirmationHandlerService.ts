import { GenericMessage } from "./messageRouter";
import { patchConversationContext } from "./conversationContextPatchService";
import {
  buildTriggerConfirmationState,
  buildTriggerConfirmationText,
  parseTriggerConfirmationDecision,
  TriggerConfirmationState,
} from "./flowConfirmationService";

type FlowLike = {
  id: string;
  flow_json?: any;
};

type TriggerMatch = {
  flow: FlowLike;
  node: any;
  source?: string;
};

type HandleTriggerConfirmationInput = {
  conversation: any;
  confirmationState: TriggerConfirmationState | null;
  currentFlowDisplayName: string;
  currentConversationNodeForConfirmation: any;
  incomingText: string;
  text: string;
  campaignId: string | null;
  lockedTriggerMatch: { matchedTriggerFlow: TriggerMatch | null } | null;
  availableFlows: FlowLike[];
  botId: string;
  platformUserId: string;
  channel: string;
  io: any;
  normalizeSafeFlowId: (value: any) => string | null;
  persistConversationBookmark: (conversationId: string, bookmark: any) => Promise<void>;
  clearConversationBookmark: (conversationId: string) => Promise<void>;
  query: (sql: string, params?: any[]) => Promise<any>;
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
  loadCampaignSystemFlowRuntime: (campaignId: string, flowType: any) => Promise<FlowLike | null>;
  findTriggerNodeTargetInFlow: (flowJson: any) => any;
  findStartNodeTargetInFlow: (flowJson: any) => any;
  findImplicitEntryNode: (flowJson: any) => any;
  onBookmarkReplacement?: (bookmark: any) => any;
};

export const handleTriggerConfirmation = async (
  input: HandleTriggerConfirmationInput
): Promise<{ handled: boolean; actions: GenericMessage[] } | null> => {
  const {
    conversation,
    confirmationState,
    currentFlowDisplayName,
    currentConversationNodeForConfirmation,
    incomingText,
    text,
    campaignId,
    lockedTriggerMatch,
    availableFlows,
    botId,
    platformUserId,
    channel,
    io,
    normalizeSafeFlowId,
    persistConversationBookmark,
    clearConversationBookmark,
    query,
    executeFlowFromNode,
    loadCampaignSystemFlowRuntime,
    findTriggerNodeTargetInFlow,
    findStartNodeTargetInFlow,
    findImplicitEntryNode,
    onBookmarkReplacement,
  } = input;

  if (!confirmationState) {
    return null;
  }

  const confirmationDecision = parseTriggerConfirmationDecision(text);

  if (lockedTriggerMatch?.matchedTriggerFlow && confirmationDecision === "unknown") {
    const replacementTarget = {
      source: (lockedTriggerMatch.matchedTriggerFlow as any).source || "bot",
      flowId: String(lockedTriggerMatch.matchedTriggerFlow.flow.id || "").trim() || null,
      flowName: String(
        lockedTriggerMatch.matchedTriggerFlow.flow.flow_json?.flow_name ||
          lockedTriggerMatch.matchedTriggerFlow.flow.flow_json?.name ||
          ""
      ).trim() || null,
      nodeId: String(lockedTriggerMatch.matchedTriggerFlow.node?.id || "").trim() || null,
      nodeLabel: String(
        lockedTriggerMatch.matchedTriggerFlow.node?.data?.label ||
          lockedTriggerMatch.matchedTriggerFlow.node?.data?.text ||
          lockedTriggerMatch.matchedTriggerFlow.node?.data?.name ||
          ""
      ).trim() || null,
      campaignId: campaignId || null,
      matchedText: incomingText,
      promptText: null,
    };
    const replacementState = buildTriggerConfirmationState({
      target: replacementTarget as any,
      bookmark: confirmationState.bookmark,
      createdAt: confirmationState.createdAt,
      updatedAt: new Date().toISOString(),
    });

    await persistConversationBookmark(conversation.id, {
      ...confirmationState.bookmark,
      flowName: confirmationState.bookmark.flowName || currentFlowDisplayName,
      nodeLabel:
        confirmationState.bookmark.nodeLabel ||
        String(
          currentConversationNodeForConfirmation?.data?.label ||
            currentConversationNodeForConfirmation?.data?.text ||
            currentConversationNodeForConfirmation?.data?.name ||
            ""
        ).trim() ||
        null,
    });

    if (onBookmarkReplacement) {
      await onBookmarkReplacement(replacementState);
    } else {
      await patchConversationContext({
        conversationId: conversation.id,
        set: { trigger_confirmation_pending: replacementState },
      });
    }

    return {
      handled: true,
      actions: [
        {
          type: "text",
          text: buildTriggerConfirmationText({
            currentFlowName: currentFlowDisplayName,
            targetFlowName: replacementTarget.flowName,
            targetLabel: replacementTarget.nodeLabel,
          }),
        },
      ],
    };
  }

  if (confirmationDecision === "yes") {
    const confirmedTarget = confirmationState.target;
    const confirmedFlow =
      confirmedTarget.source === "campaign" && confirmedTarget.campaignId
        ? await loadCampaignSystemFlowRuntime(confirmedTarget.campaignId, "handoff").catch(() => null)
        : availableFlows.find((flow) => String(flow.id) === String(confirmedTarget.flowId || "")) || null;

    const confirmedNode =
      confirmedTarget.nodeId && confirmedFlow
        ? (confirmedFlow.flow_json?.nodes || []).find((node: any) => String(node.id) === String(confirmedTarget.nodeId))
        : confirmedFlow
          ? findTriggerNodeTargetInFlow(confirmedFlow.flow_json) ||
            findStartNodeTargetInFlow(confirmedFlow.flow_json) ||
            findImplicitEntryNode(confirmedFlow.flow_json)
          : null;

    if (!confirmedFlow || !confirmedNode) {
      await clearConversationBookmark(conversation.id);
      await patchConversationContext({
        conversationId: conversation.id,
        removeKeys: ["trigger_confirmation_pending", "bookmarked_state"],
      });

      return {
        handled: true,
        actions: [
          {
            type: "text",
            text: "Sorry, I couldn't switch flows right now.",
          },
        ],
      };
    }

    await clearConversationBookmark(conversation.id);
    await query(
      `UPDATE conversations
       SET current_node = NULL,
           flow_id = $2,
           variables = '{}'::jsonb,
           status = 'active',
           retry_count = 0,
           updated_at = NOW()
       WHERE id = $1`,
      [
        conversation.id,
        normalizeSafeFlowId(confirmedFlow.id),
        confirmedTarget.source === "campaign"
          ? String(confirmedFlow.flow_json?.system_flow_type || "handoff").trim() || "handoff"
          : null,
      ]
    );
    await patchConversationContext({
      conversationId: conversation.id,
      removeKeys: ["trigger_confirmation_pending", "bookmarked_state"],
      set:
        confirmedTarget.source === "campaign"
          ? { active_system_flow: String(confirmedFlow.flow_json?.system_flow_type || "handoff").trim() || "handoff" }
          : {},
    });

    const actions = await executeFlowFromNode(
      confirmedNode,
      conversation.id,
      botId,
      platformUserId,
      confirmedFlow.flow_json?.nodes || [],
      confirmedFlow.flow_json?.edges || [],
      channel,
      io,
      {
        flowId: String(confirmedFlow.id || "").trim() || null,
        systemFlowType: String(confirmedFlow.flow_json?.system_flow_type || "").trim().toLowerCase() || null,
      }
    );

    return {
      handled: true,
      actions,
    };
  }

  if (confirmationDecision === "no") {
    const bookmark = confirmationState.bookmark;
    await clearConversationBookmark(conversation.id);
    await query(
      `UPDATE conversations
       SET current_node = $2,
           flow_id = COALESCE($3, flow_id),
           variables = $4::jsonb,
           status = 'active',
           retry_count = 0,
           updated_at = NOW()
       WHERE id = $1`,
      [
        conversation.id,
        bookmark.nodeId || conversation.current_node || null,
        normalizeSafeFlowId(bookmark.flowId),
        JSON.stringify(bookmark.variables || {}),
      ]
    );
    await patchConversationContext({
      conversationId: conversation.id,
      removeKeys: ["trigger_confirmation_pending", "bookmarked_state"],
    });

    return {
      handled: true,
      actions: [
        {
          type: "text",
          text: bookmark.resumeText || "Let's pick up where we left off...",
        },
      ],
    };
  }

  if (lockedTriggerMatch?.matchedTriggerFlow) {
    const replacementTarget = {
      source: (lockedTriggerMatch.matchedTriggerFlow as any).source || "bot",
      flowId: String(lockedTriggerMatch.matchedTriggerFlow.flow.id || "").trim() || null,
      flowName: String(
        lockedTriggerMatch.matchedTriggerFlow.flow.flow_json?.flow_name ||
          lockedTriggerMatch.matchedTriggerFlow.flow.flow_json?.name ||
          ""
      ).trim() || null,
      nodeId: String(lockedTriggerMatch.matchedTriggerFlow.node?.id || "").trim() || null,
      nodeLabel: String(
        lockedTriggerMatch.matchedTriggerFlow.node?.data?.label ||
          lockedTriggerMatch.matchedTriggerFlow.node?.data?.text ||
          lockedTriggerMatch.matchedTriggerFlow.node?.data?.name ||
          ""
      ).trim() || null,
      campaignId: campaignId || null,
      matchedText: incomingText,
      promptText: null,
    };
    const replacementState = buildTriggerConfirmationState({
      target: replacementTarget as any,
      bookmark: confirmationState.bookmark,
      createdAt: confirmationState.createdAt,
      updatedAt: new Date().toISOString(),
    });

    await patchConversationContext({
      conversationId: conversation.id,
      set: { trigger_confirmation_pending: replacementState },
    });

    return {
      handled: true,
      actions: [
        {
          type: "text",
          text: buildTriggerConfirmationText({
            currentFlowName: currentFlowDisplayName,
            targetFlowName: replacementTarget.flowName,
            targetLabel: replacementTarget.nodeLabel,
          }),
        },
      ],
    };
  }

  return {
    handled: true,
    actions: [
      {
        type: "text",
        text: buildTriggerConfirmationText({
          currentFlowName: currentFlowDisplayName,
          targetFlowName: confirmationState.target.flowName,
          targetLabel: confirmationState.target.nodeLabel,
        }),
      },
    ],
  };
};
