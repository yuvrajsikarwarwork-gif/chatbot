import { query } from "../config/db";

async function hasColumn(tableName: string, columnName: string) {
  const res = await query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = $1
         AND column_name = $2
     ) AS exists`,
    [tableName, columnName]
  );

  return Boolean(res.rows[0]?.exists);
}

interface AnalyticsEventInput {
  botId?: string | null;
  conversationId?: string | null;
  workspaceId?: string | null;
  campaignId?: string | null;
  channelId?: string | null;
  entryPointId?: string | null;
  flowId?: string | null;
  listId?: string | null;
  leadId?: string | null;
  actorUserId?: string | null;
  platform?: string | null;
  eventType: string;
  eventName?: string | null;
  payload?: Record<string, unknown>;
}

interface LeadLogInput {
  workspaceId?: string | null;
  userId?: string | null;
  leadId: string;
  campaignId?: string | null;
  channelId?: string | null;
  entryPointId?: string | null;
  listId?: string | null;
  action: string;
  payload?: Record<string, unknown>;
}

export async function recordAnalyticsEvent(input: AnalyticsEventInput) {
  const tableRes = await query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = 'analytics_events'
     ) AS exists`
  );
  if (!tableRes.rows[0]?.exists) {
    return;
  }

  await query(
    `INSERT INTO analytics_events
       (bot_id, conversation_id, workspace_id, campaign_id, channel_id, entry_point_id, flow_id, list_id, lead_id, platform, event_type, event_name, actor_user_id, event_payload)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)`,
    [
      input.botId || null,
      input.conversationId || null,
      input.workspaceId || null,
      input.campaignId || null,
      input.channelId || null,
      input.entryPointId || null,
      input.flowId || null,
      input.listId || null,
      input.leadId || null,
      input.platform || null,
      input.eventType,
      input.eventName || null,
      input.actorUserId || null,
      JSON.stringify(input.payload || {}),
    ]
  );
}

export async function recordLeadLog(input: LeadLogInput) {
  const tableRes = await query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = 'lead_logs'
     ) AS exists`
  );
  if (!tableRes.rows[0]?.exists) {
    return;
  }

  await query(
    `INSERT INTO lead_logs
       (workspace_id, user_id, lead_id, campaign_id, channel_id, entry_point_id, list_id, action, payload)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [
      input.workspaceId || null,
      input.userId || null,
      String(input.leadId),
      input.campaignId || null,
      input.channelId || null,
      input.entryPointId || null,
      input.listId || null,
      input.action,
      JSON.stringify(input.payload || {}),
    ]
  );
}

export async function getWorkspaceAnalyticsOverview(
  userId: string,
  workspaceId: string,
  projectId?: string | null,
  visibleProjectIds?: string[] | null,
  sinceHours?: number | null
) {
  const analyticsEventsHasProjectId = await hasColumn("analytics_events", "project_id");
  const hasVisibleProjectScope = Array.isArray(visibleProjectIds);
  const needsProjectParam = Boolean(projectId) || (hasVisibleProjectScope && visibleProjectIds.length > 0);
  const eventProjectExpression = analyticsEventsHasProjectId
    ? "ae.project_id"
    : "c.project_id";
  const eventProjectClause = projectId
    ? ` AND ${eventProjectExpression} = $2`
    : hasVisibleProjectScope
      ? visibleProjectIds.length > 0
        ? ` AND ${eventProjectExpression} = ANY($2)`
        : ` AND 1 = 0`
      : "";
  const recordProjectClause = projectId
    ? ` AND project_id = $2`
    : hasVisibleProjectScope
      ? visibleProjectIds.length > 0
        ? ` AND project_id = ANY($2)`
        : ` AND 1 = 0`
      : "";
  const sinceHoursValue = Number(sinceHours || 0);
  const hasSinceFilter = Number.isFinite(sinceHoursValue) && sinceHoursValue > 0;
  const timeClause = hasSinceFilter ? ` AND ae.created_at >= NOW() - ($${needsProjectParam ? 3 : 2}::int * INTERVAL '1 hour')` : "";
  const params = projectId
    ? [workspaceId, projectId]
    : needsProjectParam
      ? [workspaceId, visibleProjectIds]
      : [workspaceId];
  const queryParams = hasSinceFilter ? [...params, sinceHoursValue] : params;

  const [eventsRes, campaignRes, leadRes, channelRes] = await Promise.all([
    query(
      `SELECT
         COUNT(*)::int AS total_events,
         COUNT(*) FILTER (WHERE ae.event_name = 'lead_captured')::int AS leads_captured,
         COUNT(*) FILTER (WHERE ae.event_name = 'conversation_forked')::int AS conversation_forks,
         COUNT(*) FILTER (WHERE ae.event_name = 'entry_point_resolved')::int AS entry_resolutions
       FROM analytics_events ae
       LEFT JOIN campaigns c ON c.id = ae.campaign_id
       WHERE ae.workspace_id = $1${eventProjectClause}${timeClause}`,
      queryParams
    ),
    query(
      `SELECT COUNT(*)::int AS active_campaigns
       FROM campaigns
       WHERE workspace_id = $1
         ${recordProjectClause}
         AND status = 'active'`,
      params
    ),
    query(
      `SELECT COUNT(*)::int AS total_leads
       FROM leads
       WHERE workspace_id = $1
         ${recordProjectClause}`,
      params
    ),
    query(
      `SELECT
         platform,
         COUNT(*)::int AS total
       FROM campaign_channels
       WHERE campaign_id IN (
         SELECT id FROM campaigns WHERE workspace_id = $1${recordProjectClause}
       )
       GROUP BY platform
       ORDER BY total DESC`,
      params
    ),
  ]);

  return {
    workspaceId,
    projectId: projectId || null,
    stats: {
      totalEvents: Number(eventsRes.rows[0]?.total_events || 0),
      leadsCaptured: Number(eventsRes.rows[0]?.leads_captured || 0),
      conversationForks: Number(eventsRes.rows[0]?.conversation_forks || 0),
      entryResolutions: Number(eventsRes.rows[0]?.entry_resolutions || 0),
      activeCampaigns: Number(campaignRes.rows[0]?.active_campaigns || 0),
      totalLeads: Number(leadRes.rows[0]?.total_leads || 0),
    },
    platformBreakdown: channelRes.rows,
  };
}

export async function getWorkspaceAnalyticsEvents(
  userId: string,
  workspaceId: string,
  projectId?: string | null,
  visibleProjectIds?: string[] | null,
  sinceHours?: number | null
) {
  const analyticsEventsHasProjectId = await hasColumn("analytics_events", "project_id");
  const hasVisibleProjectScope = Array.isArray(visibleProjectIds);
  const needsProjectParam = Boolean(projectId) || (hasVisibleProjectScope && visibleProjectIds.length > 0);
  const params = projectId
    ? [workspaceId, projectId]
    : needsProjectParam
      ? [workspaceId, visibleProjectIds]
      : [workspaceId];
  const eventProjectExpression = analyticsEventsHasProjectId
    ? "ae.project_id"
    : "c.project_id";
  const sinceHoursValue = Number(sinceHours || 0);
  const hasSinceFilter = Number.isFinite(sinceHoursValue) && sinceHoursValue > 0;
  const timeClause = hasSinceFilter ? `AND ae.created_at >= NOW() - ($${needsProjectParam ? 3 : 2}::int * INTERVAL '1 hour')` : "";
  const queryParams = hasSinceFilter ? [...params, sinceHoursValue] : params;
  const res = await query(
    `SELECT
       ae.id,
       ae.event_type,
       ae.event_name,
       ae.platform,
       ae.campaign_id,
       ae.channel_id,
       ae.entry_point_id,
       ae.list_id,
       ae.lead_id,
       ae.created_at,
       ae.event_payload
     FROM analytics_events ae
     LEFT JOIN campaigns c ON c.id = ae.campaign_id
     WHERE ae.workspace_id = $1
       ${
         projectId
           ? `AND ${eventProjectExpression} = $2`
           : hasVisibleProjectScope
             ? visibleProjectIds.length > 0
               ? `AND ${eventProjectExpression} = ANY($2)`
               : "AND 1 = 0"
             : ""
       }
       ${timeClause}
     ORDER BY ae.created_at DESC
     LIMIT 100`,
    queryParams
  );

  return res.rows;
}
