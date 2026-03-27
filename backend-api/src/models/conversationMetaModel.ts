import { query } from "../config/db";

export async function listConversationNotes(conversationId: string) {
  const res = await query(
    `SELECT
       n.*,
       u.name AS author_name,
       u.email AS author_email
     FROM conversation_notes n
     LEFT JOIN users u ON u.id = n.author_user_id
     WHERE n.conversation_id = $1
     ORDER BY n.created_at DESC`,
    [conversationId]
  );

  return res.rows;
}

export async function createConversationNote(input: {
  conversationId: string;
  workspaceId?: string | null;
  authorUserId?: string | null;
  note: string;
}) {
  const res = await query(
    `INSERT INTO conversation_notes
       (conversation_id, workspace_id, author_user_id, note)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [input.conversationId, input.workspaceId || null, input.authorUserId || null, input.note]
  );

  return res.rows[0];
}

export async function listConversationTags(conversationId: string) {
  const res = await query(
    `SELECT *
     FROM conversation_tags
     WHERE conversation_id = $1
     ORDER BY created_at DESC, tag ASC`,
    [conversationId]
  );

  return res.rows;
}

export async function createConversationTag(input: {
  conversationId: string;
  workspaceId?: string | null;
  createdBy?: string | null;
  tag: string;
}) {
  const res = await query(
    `INSERT INTO conversation_tags
       (conversation_id, workspace_id, tag, created_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (conversation_id, tag)
     DO UPDATE SET created_by = EXCLUDED.created_by
     RETURNING *`,
    [input.conversationId, input.workspaceId || null, input.tag, input.createdBy || null]
  );

  return res.rows[0];
}

export async function deleteConversationTag(conversationId: string, tag: string) {
  const res = await query(
    `DELETE FROM conversation_tags
     WHERE conversation_id = $1
       AND tag = $2
     RETURNING *`,
    [conversationId, tag]
  );

  return res.rows[0];
}
