import { query } from "../config/db";

type ConversationEventPayload = Record<string, unknown>;

export async function createConversationEvent(input: {
  conversationId: string;
  workspaceId?: string | null;
  actorUserId?: string | null;
  eventType: string;
  eventPayload?: ConversationEventPayload;
}) {
  const res = await query(
    `INSERT INTO conversation_events
     (conversation_id, workspace_id, actor_user_id, event_type, event_payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING *`,
    [
      input.conversationId,
      input.workspaceId || null,
      input.actorUserId || null,
      input.eventType,
      JSON.stringify(input.eventPayload || {}),
    ]
  );

  return res.rows[0];
}
