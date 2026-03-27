import { query } from "../config/db";

export interface InboundQuarantineInput {
  platform: string;
  platformUserId?: string | null;
  phoneNumberId?: string | null;
  routeBotId?: string | null;
  attemptedWorkspaceId?: string | null;
  attemptedProjectId?: string | null;
  attemptedCampaignId?: string | null;
  attemptedChannelId?: string | null;
  attemptedPlatformAccountId?: string | null;
  entryKey?: string | null;
  failureReason: string;
  payload: Record<string, unknown>;
  status?: string;
}

export async function createInboundQuarantineRow(input: InboundQuarantineInput) {
  const res = await query(
    `INSERT INTO inbound_quarantine
       (
         platform,
         platform_user_id,
         phone_number_id,
         route_bot_id,
         attempted_workspace_id,
         attempted_project_id,
         attempted_campaign_id,
         attempted_channel_id,
         attempted_platform_account_id,
         entry_key,
         failure_reason,
         payload,
         status
       )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13
     )
     RETURNING *`,
    [
      input.platform,
      input.platformUserId || null,
      input.phoneNumberId || null,
      input.routeBotId || null,
      input.attemptedWorkspaceId || null,
      input.attemptedProjectId || null,
      input.attemptedCampaignId || null,
      input.attemptedChannelId || null,
      input.attemptedPlatformAccountId || null,
      input.entryKey || null,
      input.failureReason,
      JSON.stringify(input.payload),
      input.status || "pending",
    ]
  );

  return res.rows[0];
}
