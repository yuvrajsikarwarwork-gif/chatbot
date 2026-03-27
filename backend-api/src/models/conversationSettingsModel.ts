import { query } from "../config/db";

export interface ConversationSettingsRecord {
  workspace_id: string;
  auto_assign: boolean;
  default_agent: string | null;
  allow_manual_reply: boolean;
  allow_agent_takeover: boolean;
  allow_bot_resume: boolean;
  show_campaign: boolean;
  show_flow: boolean;
  show_list: boolean;
  max_open_chats: number;
  allowed_platforms: string[];
  default_campaign_id: string | null;
  default_list_id: string | null;
  created_at?: string;
  updated_at?: string;
}

export async function findConversationSettingsByWorkspace(workspaceId: string) {
  const res = await query(
    `SELECT *
     FROM conversation_settings
     WHERE workspace_id = $1
     LIMIT 1`,
    [workspaceId]
  );

  return res.rows[0] as ConversationSettingsRecord | undefined;
}

export async function upsertConversationSettings(
  workspaceId: string,
  payload: Omit<ConversationSettingsRecord, "workspace_id" | "created_at" | "updated_at">
) {
  const res = await query(
    `INSERT INTO conversation_settings
       (
         workspace_id,
         auto_assign,
         default_agent,
         allow_manual_reply,
         allow_agent_takeover,
         allow_bot_resume,
         show_campaign,
         show_flow,
         show_list,
         max_open_chats,
         allowed_platforms,
         default_campaign_id,
         default_list_id
       )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13
     )
     ON CONFLICT (workspace_id)
     DO UPDATE SET
       auto_assign = EXCLUDED.auto_assign,
       default_agent = EXCLUDED.default_agent,
       allow_manual_reply = EXCLUDED.allow_manual_reply,
       allow_agent_takeover = EXCLUDED.allow_agent_takeover,
       allow_bot_resume = EXCLUDED.allow_bot_resume,
       show_campaign = EXCLUDED.show_campaign,
       show_flow = EXCLUDED.show_flow,
       show_list = EXCLUDED.show_list,
       max_open_chats = EXCLUDED.max_open_chats,
       allowed_platforms = EXCLUDED.allowed_platforms,
       default_campaign_id = EXCLUDED.default_campaign_id,
       default_list_id = EXCLUDED.default_list_id,
       updated_at = NOW()
     RETURNING *`,
    [
      workspaceId,
      payload.auto_assign,
      payload.default_agent,
      payload.allow_manual_reply,
      payload.allow_agent_takeover,
      payload.allow_bot_resume,
      payload.show_campaign,
      payload.show_flow,
      payload.show_list,
      payload.max_open_chats,
      JSON.stringify(payload.allowed_platforms),
      payload.default_campaign_id,
      payload.default_list_id,
    ]
  );

  return res.rows[0] as ConversationSettingsRecord;
}
