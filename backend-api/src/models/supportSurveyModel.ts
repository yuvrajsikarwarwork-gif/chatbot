import { query } from "../config/db";

export async function createSupportSurvey(input: {
  conversationId: string;
  workspaceId?: string | null;
  projectId?: string | null;
  botId?: string | null;
  rating: string;
  source?: string | null;
  rawPayload?: Record<string, unknown> | null;
}) {
  const res = await query(
    `INSERT INTO support_surveys
     (conversation_id, workspace_id, project_id, bot_id, rating, source, raw_payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     RETURNING *`,
    [
      input.conversationId,
      input.workspaceId || null,
      input.projectId || null,
      input.botId || null,
      input.rating,
      input.source || null,
      JSON.stringify(input.rawPayload || {}),
    ]
  );

  return res.rows[0];
}
