// src/models/messageModel.ts

import { query } from "../config/db";

let messageDeliveryColumnSupport:
  | {
      externalMessageId: boolean;
      status: boolean;
      statusUpdatedAt: boolean;
    }
  | null = null;

async function getMessageDeliveryColumnSupport() {
  if (messageDeliveryColumnSupport) {
    return messageDeliveryColumnSupport;
  }

  const res = await query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'messages'`
  );

  const columns = new Set(res.rows.map((row: any) => String(row.column_name || "").trim()));
  messageDeliveryColumnSupport = {
    externalMessageId: columns.has("external_message_id"),
    status: columns.has("status"),
    statusUpdatedAt: columns.has("status_updated_at"),
  };

  return messageDeliveryColumnSupport;
}

export async function createMessage(
  conversationId: string,
  sender: string,
  text: string
) {
  const contextRes = await query(
    `
    SELECT c.bot_id, c.workspace_id, c.project_id, c.channel, ct.platform_user_id
    FROM conversations c
    JOIN contacts ct ON c.contact_id = ct.id
    WHERE c.id = $1
    `,
    [conversationId]
  );

  const context = contextRes.rows[0];
  if (!context) {
    throw new Error("Conversation not found");
  }

  const res = await query(
    `
    INSERT INTO messages
    (bot_id, workspace_id, project_id, conversation_id, channel, sender, platform_user_id, content)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
    RETURNING *
    `,
    [
      context.bot_id,
      context.workspace_id || null,
      context.project_id || null,
      conversationId,
      context.channel,
      sender,
      context.platform_user_id,
      JSON.stringify({ type: "text", text }),
    ]
  );

  return res.rows[0];
}

export async function createMessageForProject(
  projectId: string,
  conversationId: string,
  sender: string,
  text: string
) {
  const message = await createMessage(conversationId, sender, text);
  if (message.project_id && message.project_id !== projectId) {
    throw new Error("Conversation does not belong to the requested project");
  }

  return message;
}

export async function findMessagesByConversation(
  conversationId: string
) {
  const res = await query(
    `
    SELECT * FROM messages
    WHERE conversation_id = $1
    ORDER BY created_at ASC
    `,
    [conversationId]
  );

  return res.rows;
}

export async function findMessagesByConversationAndProject(
  conversationId: string,
  projectId: string
) {
  const res = await query(
    `
    SELECT * FROM messages
    WHERE conversation_id = $1
      AND project_id = $2
    ORDER BY created_at ASC
    `,
    [conversationId, projectId]
  );

  return res.rows;
}

export async function updateMessageDeliveryStatusByExternalId(
  externalMessageId: string,
  status: string,
  metadata?: Record<string, unknown>
) {
  const support = await getMessageDeliveryColumnSupport();
  if (!support.externalMessageId) {
    return [];
  }

  const assignments = [
    ...(support.status ? ["status = $2"] : []),
    ...(support.statusUpdatedAt ? ["status_updated_at = NOW()"] : []),
    `content = CASE
       WHEN $3::jsonb IS NULL THEN content
       ELSE COALESCE(content, '{}'::jsonb) || $3::jsonb
     END`,
  ];

  const res = await query(
    `UPDATE messages
     SET ${assignments.join(", ")}
     WHERE external_message_id = $1
     RETURNING *`,
    [
      externalMessageId,
      status,
      metadata ? JSON.stringify({ deliveryEvent: metadata }) : null,
    ]
  );

  return res.rows;
}
