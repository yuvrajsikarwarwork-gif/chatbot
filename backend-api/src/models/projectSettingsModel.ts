import { query } from "../config/db";

export interface ProjectSettingsRecord {
  project_id: string;
  auto_assign: boolean;
  assignment_mode: string;
  default_agent_id: string | null;
  max_open_per_agent: number;
  allow_takeover: boolean;
  allow_manual_reply: boolean;
  allow_bot_resume: boolean;
  show_campaign: boolean;
  show_flow: boolean;
  show_list: boolean;
  allowed_platforms: string[];
  default_campaign_id: string | null;
  default_list_id: string | null;
  created_at?: string;
  updated_at?: string;
}

export async function findProjectSettingsByProject(projectId: string) {
  const res = await query(
    `SELECT *
     FROM project_settings
     WHERE project_id = $1
     LIMIT 1`,
    [projectId]
  );

  return res.rows[0] as ProjectSettingsRecord | undefined;
}

export async function upsertProjectSettings(
  projectId: string,
  payload: Omit<ProjectSettingsRecord, "project_id" | "created_at" | "updated_at">
) {
  const res = await query(
    `INSERT INTO project_settings
       (
         project_id,
         auto_assign,
         assignment_mode,
         default_agent_id,
         max_open_per_agent,
         allow_takeover,
         allow_manual_reply,
         allow_bot_resume,
         show_campaign,
         show_flow,
         show_list,
         allowed_platforms,
         default_campaign_id,
         default_list_id
       )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14
     )
     ON CONFLICT (project_id)
     DO UPDATE SET
       auto_assign = EXCLUDED.auto_assign,
       assignment_mode = EXCLUDED.assignment_mode,
       default_agent_id = EXCLUDED.default_agent_id,
       max_open_per_agent = EXCLUDED.max_open_per_agent,
       allow_takeover = EXCLUDED.allow_takeover,
       allow_manual_reply = EXCLUDED.allow_manual_reply,
       allow_bot_resume = EXCLUDED.allow_bot_resume,
       show_campaign = EXCLUDED.show_campaign,
       show_flow = EXCLUDED.show_flow,
       show_list = EXCLUDED.show_list,
       allowed_platforms = EXCLUDED.allowed_platforms,
       default_campaign_id = EXCLUDED.default_campaign_id,
       default_list_id = EXCLUDED.default_list_id,
       updated_at = NOW()
     RETURNING *`,
    [
      projectId,
      payload.auto_assign,
      payload.assignment_mode,
      payload.default_agent_id,
      payload.max_open_per_agent,
      payload.allow_takeover,
      payload.allow_manual_reply,
      payload.allow_bot_resume,
      payload.show_campaign,
      payload.show_flow,
      payload.show_list,
      JSON.stringify(payload.allowed_platforms),
      payload.default_campaign_id,
      payload.default_list_id,
    ]
  );

  return res.rows[0] as ProjectSettingsRecord;
}
