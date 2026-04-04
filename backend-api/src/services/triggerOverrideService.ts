import { query } from "../config/db";
import {
  patchConversationContext,
} from "./conversationContextPatchService";
import {
  resetConversationRuntimeState,
  updateConversationRuntimeState,
} from "./conversationRuntimeStateService";
import { RegistryAnalyticsService } from "./registryAnalyticsService";

export interface OverrideResponse {
  success: boolean;
  message: string;
}

type TriggerOverrideAction = "STOP" | "RESTART";

export class TriggerOverrideService {
  static async execute(
    action: TriggerOverrideAction,
    input: {
      conversationId?: string | null;
      contactId?: string | null;
      optOutMessage?: string | null;
      restartMessage?: string | null;
    }
  ): Promise<OverrideResponse> {
    if (action === "STOP") {
      return this.handleStop(input);
    }

    return this.handleRestart(input);
  }

  private static async handleStop(input: {
    conversationId?: string | null;
    contactId?: string | null;
    optOutMessage?: string | null;
  }): Promise<OverrideResponse> {
    const conversationId = String(input.conversationId || "").trim();

    const message =
      String(input.optOutMessage || "").trim() ||
      "You have been unsubscribed and will no longer receive messages from us.";

    await query(
      `UPDATE contacts
       SET opted_in = false,
           updated_at = NOW()
       WHERE id = COALESCE(
         $2::uuid,
         (
           SELECT contact_id
           FROM conversations
           WHERE id = $1
           LIMIT 1
          )
      )`,
      [conversationId, input.contactId || null]
    );

    if (conversationId) {
      const conversationRes = await query(
        `SELECT workspace_id, flow_id
         FROM conversations
         WHERE id = $1
         LIMIT 1`,
        [conversationId]
      );
      const workspaceId = String(conversationRes.rows[0]?.workspace_id || "").trim() || null;
      const flowId = String(conversationRes.rows[0]?.flow_id || "").trim() || null;
      if (workspaceId) {
        await RegistryAnalyticsService.logEvent({
          workspaceId,
          conversationId,
          eventType: "OVERRIDE_EXECUTED",
          flowId,
          metadata: {
            action: "STOP",
          },
        });
      }
      await this.cleanupQueueJobs(conversationId);
    }

    if (conversationId) {
      await updateConversationRuntimeState({
        conversationId,
        currentNodeId: null,
        flowId: null,
        status: "unsubscribed",
        retryCount: 0,
        touchUpdatedAt: true,
      });

      await patchConversationContext({
        conversationId,
        removeKeys: [
          "pending_confirmation",
          "trigger_confirmation_pending",
          "bookmarked_state",
        ],
      });
    }

    return {
      success: true,
      message,
    };
  }

  private static async handleRestart(input: {
    conversationId?: string | null;
    restartMessage?: string | null;
  }): Promise<OverrideResponse> {
    const conversationId = String(input.conversationId || "").trim();
    if (!conversationId) {
      throw new Error("conversationId is required for RESTART override");
    }

    const message =
      String(input.restartMessage || "").trim() ||
      "Your session has been reset. How can I help you today?";

    await this.cleanupQueueJobs(conversationId);

    const conversationRes = await query(
      `SELECT workspace_id, flow_id
       FROM conversations
       WHERE id = $1
       LIMIT 1`,
      [conversationId]
    );
    const workspaceId = String(conversationRes.rows[0]?.workspace_id || "").trim() || null;
    const flowId = String(conversationRes.rows[0]?.flow_id || "").trim() || null;
    if (workspaceId) {
      await RegistryAnalyticsService.logEvent({
        workspaceId,
        conversationId,
        eventType: "OVERRIDE_EXECUTED",
        flowId,
        metadata: {
          action: "RESTART",
        },
      });
    }

    await resetConversationRuntimeState({
      conversationId,
      flowId: null,
      variables: {},
      status: "active",
      retryCount: 0,
    });

    await patchConversationContext({
      conversationId,
      removeKeys: [
        "pending_confirmation",
        "trigger_confirmation_pending",
        "bookmarked_state",
      ],
    });

    return {
      success: true,
      message,
    };
  }

  /**
   * Cancels pending reminder/timeout jobs for the conversation.
   * Matches both camelCase and snake_case payload keys.
   */
  private static async cleanupQueueJobs(conversationId: string): Promise<void> {
    const normalizedConversationId = String(conversationId || "").trim();
    if (!normalizedConversationId) {
      return;
    }

    const jobTypes = [
      "flow_wait_reminder",
      "flow_wait_timeout",
      "trigger_confirmation_timeout",
    ];

    try {
      const res = await query(
        `UPDATE queue_jobs
         SET status = 'cancelled',
             updated_at = NOW()
         WHERE status IN ('pending', 'retry')
           AND COALESCE(job_type, type) = ANY($2::text[])
           AND (
             payload->>'conversationId' = $1
             OR payload->>'conversation_id' = $1
           )`,
        [normalizedConversationId, jobTypes]
      );

      console.log(
        `[QueueCleanup] Cancelled ${res.rowCount || 0} jobs for conversation ${normalizedConversationId}`
      );
    } catch (error) {
      console.error("[QueueCleanup] Failed to cancel jobs:", error);
    }
  }
}
