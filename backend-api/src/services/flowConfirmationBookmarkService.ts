import { query } from "../config/db";
import {
  cancelPendingJobsByConversation,
  createJob,
} from "../models/queueJobModel";
import { routeMessage } from "./messageRouter";
import { patchConversationContext } from "./conversationContextPatchService";
import { updateConversationRuntimeState } from "./conversationRuntimeStateService";
import {
  buildTriggerConfirmationExpiryAt,
  readTriggerConfirmation,
  isTriggerConfirmationExpired,
  TriggerBookmark,
  TriggerConfirmationState,
} from "./flowConfirmationService";

export const TRIGGER_CONFIRMATION_TIMEOUT_JOB_TYPE = "trigger_confirmation_timeout";
const TRIGGER_CONFIRMATION_TIMEOUT_JOB_TYPES = [TRIGGER_CONFIRMATION_TIMEOUT_JOB_TYPE];

export const scheduleTriggerConfirmationTimeout = async (input: {
  conversationId: string;
  expiresAt?: string | null | undefined;
}) => {
  await cancelPendingJobsByConversation(input.conversationId, TRIGGER_CONFIRMATION_TIMEOUT_JOB_TYPES);

  const availableAt = String(input.expiresAt || "").trim() || buildTriggerConfirmationExpiryAt();
  await createJob(
    TRIGGER_CONFIRMATION_TIMEOUT_JOB_TYPE,
    {
      conversationId: input.conversationId,
    },
    {
      availableAt,
      maxRetries: 1,
    }
  );
};

export const cancelTriggerConfirmationTimeout = async (conversationId: string) => {
  await cancelPendingJobsByConversation(conversationId, TRIGGER_CONFIRMATION_TIMEOUT_JOB_TYPES);
};

export const restoreTriggerConfirmationBookmark = async (input: {
  conversationId: string;
  bookmark: TriggerBookmark;
  notify?: boolean;
  io?: any;
  resumeText?: string | null | undefined;
}) => {
  await updateConversationRuntimeState({
    conversationId: input.conversationId,
    currentNodeId: input.bookmark.nodeId || null,
    flowId: input.bookmark.flowId || undefined,
    variables: input.bookmark.variables || {},
    status: "active",
    retryCount: 0,
    touchUpdatedAt: true,
  });

  await patchConversationContext({
    conversationId: input.conversationId,
    removeKeys: ["trigger_confirmation_pending", "bookmarked_state"],
  });

  await cancelTriggerConfirmationTimeout(input.conversationId);

  if (input.notify) {
    await routeMessage(
      input.conversationId,
      {
        type: "text",
        text: input.resumeText || input.bookmark.resumeText || "Let's pick up where we left off...",
      },
      input.io
    );
  }
};

export const handleExpiredTriggerConfirmation = async (input: {
  conversationId: string;
  confirmationState: TriggerConfirmationState | null;
  io?: any;
  notify?: boolean;
}) => {
  let confirmationState = input.confirmationState;

  if (!confirmationState) {
    const res = await query(
      `SELECT context_json
       FROM conversations
       WHERE id = $1
       LIMIT 1`,
      [input.conversationId]
    );
    confirmationState = readTriggerConfirmation(res.rows[0]?.context_json);
  }

  if (!isTriggerConfirmationExpired(confirmationState)) {
    return {
      restored: false,
    };
  }

  const bookmark = confirmationState!.bookmark;
  await restoreTriggerConfirmationBookmark({
    conversationId: input.conversationId,
    bookmark,
    notify: Boolean(input.notify),
    io: input.io,
    resumeText: "Let's pick up where we left off...",
  });

  const refreshed = await query(
    `SELECT *
     FROM conversations
     WHERE id = $1
     LIMIT 1`,
    [input.conversationId]
  );

  return {
    restored: true,
    conversation: refreshed.rows[0] || null,
    bookmark,
  };
};
