import { GenericMessage } from "./messageRouter";
import { patchConversationContext } from "./conversationContextPatchService";
import {
  cancelTriggerConfirmationTimeout,
  restoreTriggerConfirmationBookmark,
} from "./flowConfirmationBookmarkService";
import {
  buildTriggerConfirmationButtonsMessage,
  parseTriggerConfirmationDecision,
  TriggerConfirmationState,
} from "./flowConfirmationService";

type FlowLike = {
  id: string;
  flow_json?: any;
};

type HandleTriggerConfirmationInput = {
  conversation: any;
  confirmationState: TriggerConfirmationState | null;
  currentFlowDisplayName: string;
  incomingText: string;
  text: string;
  buttonId?: string | null | undefined;
  availableFlows: FlowLike[];
  botId: string;
  platformUserId: string;
  channel: string;
  io: any;
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
};

export const handleTriggerConfirmation = async (
  input: HandleTriggerConfirmationInput
): Promise<{ handled: boolean; actions: GenericMessage[] } | null> => {
  const {
    conversation,
    confirmationState,
    currentFlowDisplayName,
    incomingText,
    text,
    buttonId,
    availableFlows,
    botId,
    platformUserId,
    channel,
    io,
    executeFlowFromNode,
    loadCampaignSystemFlowRuntime,
    findTriggerNodeTargetInFlow,
    findStartNodeTargetInFlow,
    findImplicitEntryNode,
  } = input;

  if (!confirmationState) {
    return null;
  }

  const confirmationDecision = parseTriggerConfirmationDecision(text, buttonId);

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
      await cancelTriggerConfirmationTimeout(conversation.id);
      await patchConversationContext({
        conversationId: conversation.id,
        removeKeys: ["trigger_confirmation_pending", "bookmarked_state"],
      });

      return {
        handled: true,
        actions: [
          buildTriggerConfirmationButtonsMessage({
            currentFlowName: currentFlowDisplayName,
            targetFlowName: confirmationState.target.flowName,
            targetLabel: confirmationState.target.nodeLabel,
          }),
        ],
      };
    }

    await cancelTriggerConfirmationTimeout(conversation.id);
    await restoreTriggerConfirmationBookmark({
      conversationId: conversation.id,
      bookmark: {
        flowId: confirmedFlow.id,
        nodeId: confirmedNode.id,
        variables: {},
      },
      notify: false,
      io,
    });
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
    await cancelTriggerConfirmationTimeout(conversation.id);
    await restoreTriggerConfirmationBookmark({
      conversationId: conversation.id,
      bookmark: {
        ...bookmark,
        nodeId: bookmark.nodeId || conversation.current_node || null,
      },
      notify: false,
      io,
    });
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

  return {
    handled: true,
    actions: [
      buildTriggerConfirmationButtonsMessage({
        currentFlowName: currentFlowDisplayName,
        targetFlowName: confirmationState.target.flowName,
        targetLabel: confirmationState.target.nodeLabel,
      }),
    ],
  };
};
