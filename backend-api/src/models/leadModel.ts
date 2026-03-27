import { query } from "../config/db";

interface LeadFilters {
  workspaceId?: string;
  projectId?: string;
  campaignId?: string;
  channelId?: string;
  entryPointId?: string;
  flowId?: string;
  listId?: string;
  platform?: string;
  status?: string;
  botId?: string;
  search?: string;
}

export async function findLeadsByUser(userId: string, filters: LeadFilters) {
  const where: string[] = [
    `(l.user_id = $1
      OR (
        c.workspace_id IS NOT NULL
        AND c.workspace_id IN (
          SELECT workspace_id
          FROM workspace_memberships
          WHERE user_id = $1
            AND status = 'active'
        )
      ))`,
  ];
  const params: any[] = [userId];

  if (filters.workspaceId) {
    params.push(filters.workspaceId);
    where.push(`c.workspace_id = $${params.length}`);
  }

  if (filters.projectId) {
    params.push(filters.projectId);
    where.push(`COALESCE(l.project_id, c.project_id, b.project_id) = $${params.length}`);
  }

  if (filters.campaignId) {
    params.push(filters.campaignId);
    where.push(`l.campaign_id = $${params.length}`);
  }

  if (filters.channelId) {
    params.push(filters.channelId);
    where.push(`l.channel_id = $${params.length}`);
  }

  if (filters.entryPointId) {
    params.push(filters.entryPointId);
    where.push(`l.entry_point_id = $${params.length}`);
  }

  if (filters.flowId) {
    params.push(filters.flowId);
    where.push(`l.flow_id = $${params.length}`);
  }

  if (filters.listId) {
    params.push(filters.listId);
    where.push(`l.list_id = $${params.length}`);
  }

  if (filters.platform) {
    params.push(filters.platform);
    where.push(`l.platform = $${params.length}`);
  }

  if (filters.status) {
    params.push(filters.status);
    where.push(`l.status = $${params.length}`);
  }

  if (filters.botId) {
    params.push(filters.botId);
    where.push(`l.bot_id = $${params.length}`);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    where.push(
      `(COALESCE(l.name, '') ILIKE $${params.length}
        OR COALESCE(l.phone, '') ILIKE $${params.length}
        OR COALESCE(l.email, '') ILIKE $${params.length}
        OR COALESCE(c.name, '') ILIKE $${params.length}
        OR COALESCE(ep.name, '') ILIKE $${params.length}
        OR COALESCE(ls.name, '') ILIKE $${params.length})`
    );
  }

  const res = await query(
    `SELECT
       l.*,
       c.workspace_id,
       COALESCE(l.project_id, c.project_id, b.project_id) AS resolved_project_id,
       c.name AS campaign_name,
       cc.name AS channel_name,
       ep.name AS entry_point_name,
       f.flow_name,
       ls.name AS list_name,
       ct.platform_user_id,
       ct.name AS contact_name
     FROM leads l
     LEFT JOIN campaigns c ON c.id = l.campaign_id
     LEFT JOIN bots b ON b.id = l.bot_id
     LEFT JOIN campaign_channels cc ON cc.id = l.channel_id
     LEFT JOIN entry_points ep ON ep.id = l.entry_point_id
     LEFT JOIN flows f ON f.id = l.flow_id
     LEFT JOIN lists ls ON ls.id = l.list_id
     LEFT JOIN contacts ct ON ct.id = l.contact_id
     WHERE ${where.join(" AND ")}
     ORDER BY l.created_at DESC`,
    params
  );

  return res.rows;
}

export async function findLeadById(id: string, userId: string) {
  const res = await query(
    `SELECT
       l.*,
       c.workspace_id,
       COALESCE(l.project_id, c.project_id, b.project_id) AS resolved_project_id,
       c.name AS campaign_name,
       cc.name AS channel_name,
       ep.name AS entry_point_name,
       f.flow_name,
       ls.name AS list_name
     FROM leads l
     LEFT JOIN campaigns c ON c.id = l.campaign_id
     LEFT JOIN bots b ON b.id = l.bot_id
     LEFT JOIN campaign_channels cc ON cc.id = l.channel_id
     LEFT JOIN entry_points ep ON ep.id = l.entry_point_id
     LEFT JOIN flows f ON f.id = l.flow_id
     LEFT JOIN lists ls ON ls.id = l.list_id
     WHERE l.id = $1
       AND (
         l.user_id = $2
         OR (
           c.workspace_id IS NOT NULL
           AND c.workspace_id IN (
             SELECT workspace_id
             FROM workspace_memberships
             WHERE user_id = $2
               AND status = 'active'
           )
         )
       )`,
    [id, userId]
  );

  return res.rows[0];
}

export async function deleteLead(id: string, userId: string) {
  await query(
    `DELETE FROM leads l
     USING campaigns c
     WHERE l.id = $1
       AND l.campaign_id = c.id
       AND (
         l.user_id = $2
         OR (
           c.workspace_id IS NOT NULL
           AND c.workspace_id IN (
             SELECT workspace_id
             FROM workspace_memberships
             WHERE user_id = $2
               AND status = 'active'
           )
         )
       )`,
    [id, userId]
  );
}

export async function findLeadListSummariesByUser(
  userId: string,
  campaignId?: string,
  workspaceId?: string,
  projectId?: string
) {
  const params: any[] = [userId];
  let campaignCondition = "";
  let workspaceCondition = "";
  let projectCondition = "";

  if (campaignId) {
    params.push(campaignId);
    campaignCondition = `AND l.campaign_id = $2`;
  }

  if (workspaceId) {
    params.push(workspaceId);
    workspaceCondition = `AND c.workspace_id = $${params.length}`;
  }

  if (projectId) {
    params.push(projectId);
    projectCondition = `AND COALESCE(l.project_id, c.project_id) = $${params.length}`;
  }

  const res = await query(
    `SELECT
       l.id,
       l.campaign_id,
       c.workspace_id,
       COALESCE(l.project_id, c.project_id) AS project_id,
       l.channel_id,
       l.entry_point_id,
       l.platform,
       l.name,
       l.list_key,
       l.source_type,
       l.is_system,
       COALESCE(ld.lead_count, 0)::int AS lead_count
     FROM lists l
     JOIN campaigns c ON c.id = l.campaign_id
     LEFT JOIN (
       SELECT list_id, COUNT(*)::int AS lead_count
       FROM leads
       GROUP BY list_id
     ) ld ON ld.list_id = l.id
     WHERE (
         l.user_id = $1
         OR (
           c.workspace_id IS NOT NULL
           AND c.workspace_id IN (
             SELECT workspace_id
             FROM workspace_memberships
             WHERE user_id = $1
               AND status = 'active'
           )
         )
       )
       ${campaignCondition}
       ${workspaceCondition}
       ${projectCondition}
     ORDER BY l.created_at ASC`,
    params
  );

  return res.rows;
}
