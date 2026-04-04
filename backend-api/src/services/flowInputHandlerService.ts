import { resolveTrigger } from "./triggerRouterService";
import { TriggerOverrideService } from "./triggerOverrideService";
import { GenericMessage } from "./messageRouter";
import { patchConversationContext } from "./conversationContextPatchService";
import {
  setConversationCurrentNode,
  updateConversationRuntimeState,
} from "./conversationRuntimeStateService";

type HandleValidationErrorResult = {
  step: string | null;
  message?: GenericMessage | null;
};

type FlowNode = {
  id: string;
  type: string;
  data?: Record<string, any>;
};

type HandleActiveConversationNodeInput = {
  conversation: any;
  lastNode: FlowNode;
  incomingText: string;
  text: string;
  buttonId: string;
  nodes: FlowNode[];
  edges: any[];
  botId: string;
  platformUserId: string;
  normalizedChannel: string;
  channel: string;
  io: any;
  globalFallbackNodeId?: string | null;
  resolvedContext: {
    workspaceId?: string | null;
    projectId?: string | null;
  };
  validators: Record<string, (value: string, pattern?: any) => boolean>;
  handleValidationError: (
    conversation: any,
    lastNode: FlowNode,
    globalFallbackNodeId?: string | null
  ) => Promise<HandleValidationErrorResult>;
  maybeAutoCaptureLead: (input: any) => Promise<any>;
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
  query: (sql: string, params?: any[]) => Promise<any>;
  parseVariables: (value: any) => Record<string, any>;
  findNextNode: (nodeId: string, nodes: any[], edges: any[], handles: Array<string | null | undefined>) => any;
  normalizeRuntimeNodeType: (value: any) => string;
  activeFlowId: string | null;
  activeFlowSystemType: string | null;
};

export const handleActiveConversationNode = async (
  input: HandleActiveConversationNodeInput
): Promise<{ actions: GenericMessage[]; nextNode: any | null } | null> => {
  const {
    conversation,
    lastNode,
    incomingText,
    text,
    buttonId,
    nodes,
    edges,
    botId,
    platformUserId,
    normalizedChannel,
    channel,
    io,
    globalFallbackNodeId,
    resolvedContext,
    validators,
    handleValidationError,
    maybeAutoCaptureLead,
    executeFlowFromNode,
    query,
    parseVariables,
    findNextNode,
    normalizeRuntimeNodeType,
    activeFlowId,
    activeFlowSystemType,
  } = input;

  const outgoingActions: GenericMessage[] = [];
  let isValid = false;
  let matchedHandle = "response";

  const overrideTrigger = await resolveTrigger({
    text: incomingText,
    workspaceId: String(resolvedContext.workspaceId || "").trim(),
    projectId: resolvedContext.projectId || null,
    botId,
    conversationStatus: conversation.status,
    currentNode: conversation.current_node,
  });

  if (overrideTrigger.type === "OVERRIDE") {
    const overrideResult = await TriggerOverrideService.execute(overrideTrigger.action, {
      conversationId: conversation.id,
    });

    return {
      actions: [
        {
          type: "text",
          text: overrideResult.message,
        },
      ],
      nextNode: null,
    };
  }

  const lastNodeType = normalizeRuntimeNodeType(lastNode.type);

  if (lastNodeType === "input") {
    await patchConversationContext({
      conversationId: conversation.id,
      removeKeys: ["trigger_confirmation_pending", "bookmarked_state"],
    }).catch(() => null);
  }

  if (lastNodeType === "input") {
    const validationType = lastNode.data?.validation || "text";
    const validatorFn = validators[validationType];
    isValid = validatorFn ? validatorFn(text, lastNode.data?.regex) : true;
  } else {
    for (let i = 1; i <= 10; i++) {
      const itemText = lastNode.data?.[`item${i}`];

      if (itemText && (text === String(itemText).toLowerCase().trim() || buttonId === `item${i}`)) {
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
      return { actions: outgoingActions, nextNode: null };
    }

    if (validationResult.step) {
      const targetNode = nodes.find((node: any) => String(node.id) === String(validationResult.step));
      if (targetNode) {
        const actions = await executeFlowFromNode(
          targetNode,
          conversation.id,
          botId,
          platformUserId,
          nodes,
          edges,
          channel,
          io,
          {
            flowId: String(activeFlowId || "").trim() || null,
            systemFlowType: activeFlowSystemType || null,
            incomingText,
          }
        );

        outgoingActions.push(...actions);
      }
    }

    return { actions: outgoingActions, nextNode: null };
  }

  await updateConversationRuntimeState({
    conversationId: conversation.id,
    retryCount: 0,
  });

  if (lastNodeType === "input") {
    const updatedVariables = parseVariables(conversation.variables);
    updatedVariables[lastNode.data?.variable || "input"] = incomingText;

    await updateConversationRuntimeState({
      conversationId: conversation.id,
      variables: updatedVariables,
    });

    try {
      await maybeAutoCaptureLead({
        conversationId: conversation.id,
        botId,
        platform: normalizedChannel,
        variables: updatedVariables,
        workspaceId: conversation.workspace_id || resolvedContext.workspaceId || null,
        projectId: conversation.project_id || resolvedContext.projectId || null,
        sourcePayload: {
          platformUserId,
          conversationId: conversation.id,
          triggerSource: "input_answer",
          linkedFieldKey: String(
            lastNode.data?.linkedFieldKey || lastNode.data?.leadField || lastNode.data?.field || ""
          ).trim() || null,
          nodeId: lastNode.id,
        },
      });
    } catch (err: any) {
      if (err?.name !== "LeadCaptureContextError") {
        throw err;
      }
    }
  }

  const nextNode = findNextNode(lastNode.id, nodes, edges, [
    matchedHandle,
    "response",
    null,
    undefined,
  ]);

  if (!nextNode) {
    await setConversationCurrentNode(conversation.id, null);
  }

  return {
    actions: outgoingActions,
    nextNode,
  };
};
