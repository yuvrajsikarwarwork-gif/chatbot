import { query } from "../config/db";

type AgentScopeInput = {
  workspaceId: string;
  userId: string;
  projectIds?: string[];
  campaignIds?: string[];
  platforms?: string[];
  channelIds?: string[];
};

export async function replaceAgentScope(input: AgentScopeInput) {
  await query(
    `DELETE FROM agent_scope
     WHERE workspace_id = $1
       AND user_id = $2`,
    [input.workspaceId, input.userId]
  );

  const seen = new Set<string>();
  const insertRow = async (row: {
    projectId?: string | null;
    campaignId?: string | null;
    platform?: string | null;
    channelId?: string | null;
  }) => {
    const key = [
      row.projectId || "",
      row.campaignId || "",
      row.platform || "",
      row.channelId || "",
    ].join("|");
    if (seen.has(key)) {
      return;
    }
    seen.add(key);

    await query(
      `INSERT INTO agent_scope (workspace_id, user_id, project_id, campaign_id, platform, channel_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.workspaceId,
        input.userId,
        row.projectId || null,
        row.campaignId || null,
        row.platform || null,
        row.channelId || null,
      ]
    );
  };

  for (const projectId of input.projectIds || []) {
    await insertRow({ projectId });
  }
  for (const campaignId of input.campaignIds || []) {
    await insertRow({ campaignId });
  }
  for (const platform of input.platforms || []) {
    await insertRow({ platform: String(platform).toLowerCase() });
  }
  for (const channelId of input.channelIds || []) {
    await insertRow({ channelId });
  }
}

export async function findAgentScopeByWorkspaceUser(workspaceId: string, userId: string) {
  const res = await query(
    `SELECT
       ARRAY_REMOVE(ARRAY_AGG(DISTINCT project_id::text), NULL) AS project_ids,
       ARRAY_REMOVE(ARRAY_AGG(DISTINCT campaign_id::text), NULL) AS campaign_ids,
       ARRAY_REMOVE(ARRAY_AGG(DISTINCT LOWER(platform)), NULL) AS platforms,
       ARRAY_REMOVE(ARRAY_AGG(DISTINCT channel_id::text), NULL) AS channel_ids
     FROM agent_scope
     WHERE workspace_id = $1
       AND user_id = $2`,
    [workspaceId, userId]
  );

  return res.rows[0] || {
    project_ids: [],
    campaign_ids: [],
    platforms: [],
    channel_ids: [],
  };
}
