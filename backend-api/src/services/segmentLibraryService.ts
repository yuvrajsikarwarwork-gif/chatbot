import { query } from "../config/db";

function buildAccessClause(userId: string, workspaceId?: string | null, projectId?: string | null) {
  const params: any[] = [userId];
  const clauses = [
    `(c.user_id = $1 OR (
      c.workspace_id IS NOT NULL
      AND c.workspace_id IN (
        SELECT workspace_id
        FROM workspace_memberships
        WHERE user_id = $1
          AND status = 'active'
      )
    ))`,
  ];

  if (workspaceId) {
    params.push(workspaceId);
    clauses.push(`c.workspace_id = $${params.length}`);
  }

  if (projectId) {
    params.push(projectId);
    clauses.push(`COALESCE(c.project_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE($${params.length}, '00000000-0000-0000-0000-000000000000'::uuid)`);
  }

  return { params, whereClause: clauses.join(" AND ") };
}

export async function listSegmentLibraryService(
  userId: string,
  filters: { workspaceId?: string; projectId?: string; sourceType?: string; campaignId?: string } = {}
) {
  const access = buildAccessClause(userId, filters.workspaceId, filters.projectId);
  const params = [...access.params];
  const clauses = [access.whereClause];

  if (filters.sourceType) {
    params.push(String(filters.sourceType).trim().toLowerCase());
    clauses.push(`LOWER(COALESCE(l.source_type, 'manual')) = $${params.length}`);
  }

  if (filters.campaignId) {
    params.push(String(filters.campaignId).trim());
    clauses.push(`c.id = $${params.length}`);
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const res = await query(
    `
    SELECT
      l.id,
      l.campaign_id AS campaign_id,
      c.name AS campaign_name,
      c.slug AS campaign_slug,
      c.workspace_id,
      c.project_id,
      l.bot_id,
      b.name AS bot_name,
      l.platform,
      l.name,
      l.list_key,
      l.source_type,
      l.is_system,
      l.filters,
      l.metadata,
      l.created_at,
      l.updated_at,
      COUNT(ld.id)::int AS lead_count
    FROM lists l
    JOIN campaigns c ON c.id = l.campaign_id
    LEFT JOIN bots b ON b.id = l.bot_id
    LEFT JOIN leads ld ON ld.list_id = l.id AND ld.deleted_at IS NULL
    ${whereClause}
    GROUP BY l.id, c.id, b.id
    ORDER BY c.created_at DESC, l.created_at ASC
    `,
    params
  );

  return res.rows.map((row: any) => ({
    id: row.id,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
    campaignSlug: row.campaign_slug,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    botId: row.bot_id,
    botName: row.bot_name,
    platform: row.platform,
    name: row.name,
    listKey: row.list_key,
    sourceType: row.source_type,
    isSystem: Boolean(row.is_system),
    filters: row.filters && typeof row.filters === "object" ? row.filters : {},
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    leadCount: Number(row.lead_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
