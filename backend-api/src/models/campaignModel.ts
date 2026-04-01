import { query } from "../config/db";

interface CampaignInput {
  name: string;
  slug: string;
  description?: string | null;
  status?: string;
  workspaceId?: string | null;
  projectId?: string | null;
  createdBy?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  defaultFlowId?: string | null;
  settingsJson?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

interface CampaignChannelInput {
  campaignId: string;
  userId: string;
  botId: string;
  projectId?: string | null;
  platform: string;
  platformType?: string;
  platformAccountId?: string | null;
  platformAccountRefId?: string | null;
  name: string;
  status?: string;
  defaultFlowId?: string | null;
  flowId?: string | null;
  listId?: string | null;
  settingsJson?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

interface EntryPointInput {
  campaignId: string;
  channelId: string;
  userId: string;
  botId: string;
  flowId: string;
  projectId?: string | null;
  platform: string;
  name: string;
  entryKey: string;
  entryType?: string;
  sourceRef?: string | null;
  landingUrl?: string | null;
  isDefault?: boolean;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
  listId?: string | null;
}

export async function findEntryPointByChannelAndKey(
  channelId: string,
  entryKey: string,
  userId: string
) {
  const res = await query(
    `SELECT ep.*
     FROM entry_points ep
     JOIN campaigns c ON c.id = ep.campaign_id
     WHERE ep.channel_id = $1
       AND c.deleted_at IS NULL
       AND lower(ep.entry_key) = lower($2)
       AND (
         c.user_id = $3
         OR (
           c.workspace_id IS NOT NULL
           AND c.workspace_id IN (
             SELECT workspace_id
             FROM workspace_memberships
             WHERE user_id = $3
               AND status = 'active'
           )
         )
       )
     LIMIT 1`,
    [channelId, entryKey, userId]
  );

  return res.rows[0];
}

export async function findEntryPointByChannelAndSourceRef(
  channelId: string,
  sourceRef: string,
  userId: string
) {
  const res = await query(
    `SELECT ep.*
     FROM entry_points ep
     JOIN campaigns c ON c.id = ep.campaign_id
     WHERE ep.channel_id = $1
       AND c.deleted_at IS NULL
       AND lower(ep.source_ref) = lower($2)
       AND (
         c.user_id = $3
         OR (
           c.workspace_id IS NOT NULL
           AND c.workspace_id IN (
             SELECT workspace_id
             FROM workspace_memberships
             WHERE user_id = $3
               AND status = 'active'
           )
         )
       )
     LIMIT 1`,
    [channelId, sourceRef, userId]
  );

  return res.rows[0];
}

export async function clearDefaultEntryPointsForChannel(
  channelId: string,
  userId: string,
  excludeId?: string
) {
  const params: any[] = [channelId, userId];
  let excludeClause = "";
  if (excludeId) {
    params.push(excludeId);
    excludeClause = `AND ep.id <> $${params.length}`;
  }

  await query(
    `UPDATE entry_points ep
     SET is_default = false,
         updated_at = NOW()
     FROM campaigns c
     WHERE ep.channel_id = $1
       AND ep.campaign_id = c.id
       AND (
         c.user_id = $2
         OR (
           c.workspace_id IS NOT NULL
           AND c.workspace_id IN (
             SELECT workspace_id
             FROM workspace_memberships
             WHERE user_id = $2
               AND status = 'active'
           )
         )
       )
       ${excludeClause}`,
    params
  );
}

interface ListInput {
  userId: string;
  botId: string;
  campaignId: string;
  projectId?: string | null;
  channelId?: string | null;
  entryPointId?: string | null;
  platform: string;
  name: string;
  listKey: string;
  sourceType?: string;
  isSystem?: boolean;
  filters?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export async function findListByCampaignAndKey(
  campaignId: string,
  listKey: string,
  userId: string
) {
  const res = await query(
    `SELECT l.*
     FROM lists l
     JOIN campaigns c ON c.id = l.campaign_id
     WHERE l.campaign_id = $1
       AND c.deleted_at IS NULL
       AND lower(l.list_key) = lower($2)
       AND (
         c.user_id = $3
         OR (
           c.workspace_id IS NOT NULL
           AND c.workspace_id IN (
             SELECT workspace_id
             FROM workspace_memberships
             WHERE user_id = $3
               AND status = 'active'
           )
         )
       )
     LIMIT 1`,
    [campaignId, listKey, userId]
  );

  return res.rows[0];
}

export async function findCampaignsByUser(userId: string) {
  const res = await query(
    `SELECT
       c.*,
       COUNT(DISTINCT cc.id) AS channel_count,
       COUNT(DISTINCT ep.id) AS entry_point_count,
       COUNT(DISTINCT l.id) AS list_count,
       COUNT(DISTINCT ld.id) AS lead_count
     FROM campaigns c
     LEFT JOIN campaign_channels cc ON cc.campaign_id = c.id
     LEFT JOIN entry_points ep ON ep.campaign_id = c.id
     LEFT JOIN lists l ON l.campaign_id = c.id
     LEFT JOIN leads ld ON ld.campaign_id = c.id
     WHERE (
       c.deleted_at IS NULL
       AND (
       c.user_id = $1
       OR (
         c.workspace_id IS NOT NULL
         AND c.workspace_id IN (
           SELECT workspace_id
           FROM workspace_memberships
           WHERE user_id = $1
           AND status = 'active'
         )
       )
     ))
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
    [userId]
  );

  return res.rows;
}

export async function findCampaignsByWorkspaceProject(
  workspaceId: string,
  projectId?: string | null
) {
  const params: Array<string | null> = [workspaceId];
  let projectClause = "";

  if (projectId) {
    params.push(projectId);
    projectClause = ` AND c.project_id = $${params.length}`;
  }

  const res = await query(
    `SELECT
       c.*,
       COUNT(DISTINCT cc.id) AS channel_count,
       COUNT(DISTINCT ep.id) AS entry_point_count,
       COUNT(DISTINCT l.id) AS list_count,
       COUNT(DISTINCT ld.id) AS lead_count
     FROM campaigns c
     LEFT JOIN campaign_channels cc ON cc.campaign_id = c.id
     LEFT JOIN entry_points ep ON ep.campaign_id = c.id
     LEFT JOIN lists l ON l.campaign_id = c.id
     LEFT JOIN leads ld ON ld.campaign_id = c.id
     WHERE c.workspace_id = $1
       AND c.deleted_at IS NULL${projectClause}
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
    params
  );

  return res.rows;
}

export async function findCampaignById(id: string, userId: string) {
  const res = await query(
    `SELECT *
     FROM campaigns
     WHERE id = $1
       AND deleted_at IS NULL`,
    [id]
  );

  return res.rows[0];
}

export async function findCampaignBySlug(
  userId: string,
  slug: string,
  workspaceId?: string | null
) {
  const res = await query(
    `SELECT *
     FROM campaigns
     WHERE slug = $2
       AND deleted_at IS NULL
       AND (
         ($3::uuid IS NOT NULL AND workspace_id = $3)
         OR ($3::uuid IS NULL AND user_id = $1 AND workspace_id IS NULL)
       )
     LIMIT 1`,
    [userId, slug, workspaceId || null]
  );

  return res.rows[0];
}

export async function createCampaign(userId: string, input: CampaignInput) {
  const res = await query(
    `INSERT INTO campaigns (
       user_id,
       workspace_id,
       project_id,
       created_by,
       name,
       slug,
       description,
       status,
       start_date,
       end_date,
       default_flow_id,
       settings_json,
       metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb)
     RETURNING *`,
    [
      userId,
      input.workspaceId || null,
      input.projectId || null,
      input.createdBy || userId,
      input.name,
      input.slug,
      input.description || null,
      input.status || "draft",
      input.startDate || null,
      input.endDate || null,
      input.defaultFlowId || null,
      JSON.stringify(input.settingsJson || {}),
      JSON.stringify(input.metadata || {}),
    ]
  );

  return res.rows[0];
}

export async function updateCampaign(
  id: string,
  userId: string,
  input: Partial<CampaignInput>
) {
  const res = await query(
    `UPDATE campaigns
     SET
       name = COALESCE($1, name),
       slug = COALESCE($2, slug),
      description = COALESCE($3, description),
      status = COALESCE($4, status),
      workspace_id = COALESCE($5, workspace_id),
       project_id = COALESCE($6, project_id),
       created_by = COALESCE($7, created_by),
       start_date = COALESCE($8, start_date),
       end_date = COALESCE($9, end_date),
       default_flow_id = COALESCE($10, default_flow_id),
       settings_json = CASE WHEN $11::jsonb IS NULL THEN settings_json ELSE $11::jsonb END,
       metadata = CASE WHEN $12::jsonb IS NULL THEN metadata ELSE $12::jsonb END,
       updated_at = NOW()
     WHERE id = $13
       AND (
         user_id = $14
         OR (
           workspace_id IS NOT NULL
           AND workspace_id IN (
             SELECT workspace_id
             FROM workspace_memberships
             WHERE user_id = $14
               AND status = 'active'
           )
         )
       )
     RETURNING *`,
    [
      input.name || null,
      input.slug || null,
      input.description === undefined ? null : input.description,
      input.status || null,
      input.workspaceId || null,
      input.projectId || null,
      input.createdBy || null,
      input.startDate || null,
      input.endDate || null,
      input.defaultFlowId || null,
      input.settingsJson ? JSON.stringify(input.settingsJson) : null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      id,
      userId,
    ]
  );

  return res.rows[0];
}

export async function createProjectBoundCampaign(
  userId: string,
  workspaceId: string,
  projectId: string,
  input: CampaignInput
) {
  return createCampaign(userId, {
    ...input,
    workspaceId,
    projectId,
  });
}

export async function deleteCampaign(id: string, userId: string) {
  await query(
    `DELETE FROM campaigns
     WHERE id = $1
       AND (
         user_id = $2
         OR (
           workspace_id IS NOT NULL
           AND workspace_id IN (
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

export async function updateCampaignByWorkspaceProject(
  id: string,
  workspaceId: string,
  projectId: string,
  input: Partial<CampaignInput>
) {
  const res = await query(
    `UPDATE campaigns
     SET
       name = COALESCE($1, name),
       slug = COALESCE($2, slug),
       description = COALESCE($3, description),
       status = COALESCE($4, status),
       default_flow_id = COALESCE($5, default_flow_id),
       settings_json = CASE WHEN $6::jsonb IS NULL THEN settings_json ELSE $6::jsonb END,
       metadata = CASE WHEN $7::jsonb IS NULL THEN metadata ELSE $7::jsonb END,
       updated_at = NOW()
     WHERE id = $8
       AND workspace_id = $9
       AND project_id = $10
     RETURNING *`,
    [
      input.name || null,
      input.slug || null,
      input.description === undefined ? null : input.description,
      input.status || null,
      input.defaultFlowId || null,
      input.settingsJson ? JSON.stringify(input.settingsJson) : null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      id,
      workspaceId,
      projectId,
    ]
  );

  return res.rows[0];
}

export async function findCampaignChannelsByCampaign(campaignId: string, userId: string) {
  const res = await query(
    `SELECT
       cc.*,
       b.name AS bot_name,
       f.flow_name AS default_flow_name,
       cf.flow_name AS flow_name,
       l.name AS list_name,
       pa.name AS platform_account_name,
       pa.account_id AS platform_account_external_id,
       pa.phone_number AS platform_account_phone_number
     FROM campaign_channels cc
     JOIN campaigns c ON c.id = cc.campaign_id
     JOIN bots b ON b.id = cc.bot_id
     LEFT JOIN flows f ON f.id = cc.default_flow_id
     LEFT JOIN flows cf ON cf.id = cc.flow_id
     LEFT JOIN lists l ON l.id = cc.list_id
     LEFT JOIN platform_accounts pa ON pa.id = cc.platform_account_ref_id
     WHERE cc.campaign_id = $1
       AND (
         c.user_id = $2
         OR (
           c.workspace_id IS NOT NULL
           AND c.workspace_id IN (
             SELECT workspace_id
             FROM workspace_memberships
             WHERE user_id = $2
               AND status = 'active'
           )
         )
       )
     ORDER BY cc.created_at ASC`,
    [campaignId, userId]
  );

  return res.rows;
}

export async function findCampaignChannelById(id: string, userId: string) {
  const res = await query(
    `SELECT cc.*
     FROM campaign_channels cc
     JOIN campaigns c ON c.id = cc.campaign_id
     WHERE cc.id = $1
       AND (
         c.user_id = $2
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

export async function createCampaignChannel(input: CampaignChannelInput) {
  const res = await query(
    `INSERT INTO campaign_channels
       (campaign_id, user_id, bot_id, project_id, platform, platform_type, platform_account_id, platform_account_ref_id, name, status, default_flow_id, flow_id, list_id, settings_json, config)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15::jsonb)
     RETURNING *`,
    [
      input.campaignId,
      input.userId,
      input.botId,
      input.projectId || null,
      input.platform,
      input.platformType || input.platform,
      input.platformAccountId || null,
      input.platformAccountRefId || null,
      input.name,
      input.status || "active",
      input.defaultFlowId || null,
      input.flowId || input.defaultFlowId || null,
      input.listId || null,
      JSON.stringify(input.settingsJson || {}),
      JSON.stringify(input.config || {}),
    ]
  );

  return res.rows[0];
}

export async function findCampaignChannelByCampaignBotAndPlatform(
  campaignId: string,
  botId: string,
  platform: string
) {
  const res = await query(
    `SELECT cc.*
     FROM campaign_channels cc
     WHERE cc.campaign_id = $1
       AND cc.bot_id = $2
       AND cc.platform = $3
     ORDER BY cc.created_at DESC
     LIMIT 1`,
    [campaignId, botId, platform]
  );

  return res.rows[0];
}

export async function updateCampaignChannel(
  id: string,
  userId: string,
  input: Partial<CampaignChannelInput>
) {
  const res = await query(
    `UPDATE campaign_channels cc
     SET
       bot_id = COALESCE($1, cc.bot_id),
       platform = COALESCE($2, cc.platform),
       platform_type = COALESCE($3, cc.platform_type),
       platform_account_id = COALESCE($4, cc.platform_account_id),
       platform_account_ref_id = COALESCE($5, cc.platform_account_ref_id),
       name = COALESCE($6, cc.name),
       status = COALESCE($7, cc.status),
       default_flow_id = COALESCE($8, cc.default_flow_id),
       flow_id = COALESCE($9, cc.flow_id),
       list_id = COALESCE($10, cc.list_id),
       settings_json = CASE WHEN $11::jsonb IS NULL THEN cc.settings_json ELSE $11::jsonb END,
       config = CASE WHEN $12::jsonb IS NULL THEN cc.config ELSE $12::jsonb END,
       updated_at = NOW()
     FROM campaigns c
     WHERE cc.id = $13
       AND cc.campaign_id = c.id
       AND (
         c.user_id = $14
         OR (
           c.workspace_id IS NOT NULL
           AND c.workspace_id IN (
             SELECT workspace_id
             FROM workspace_memberships
             WHERE user_id = $14
               AND status = 'active'
           )
         )
       )
     RETURNING cc.*`,
    [
      input.botId || null,
      input.platform || null,
      input.platformType || null,
      input.platformAccountId || null,
      input.platformAccountRefId || null,
      input.name || null,
      input.status || null,
      input.defaultFlowId || null,
      input.flowId || null,
      input.listId || null,
      input.settingsJson ? JSON.stringify(input.settingsJson) : null,
      input.config ? JSON.stringify(input.config) : null,
      id,
      userId,
    ]
  );

  return res.rows[0];
}

export async function deleteCampaignChannel(id: string, userId: string) {
  await query(
    `DELETE FROM campaign_channels cc
     USING campaigns c
     WHERE cc.id = $1
       AND cc.campaign_id = c.id
       AND (
         c.user_id = $2
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

export async function findEntryPointsByCampaign(campaignId: string, userId: string) {
  const res = await query(
    `SELECT
       ep.*,
       cc.name AS channel_name,
       f.flow_name,
       l.name AS list_name
     FROM entry_points ep
     JOIN campaigns c ON c.id = ep.campaign_id
     JOIN campaign_channels cc ON cc.id = ep.channel_id
     JOIN flows f ON f.id = ep.flow_id
     LEFT JOIN lists l ON l.id = ep.list_id
     WHERE ep.campaign_id = $1
       AND (
         c.user_id = $2
         OR (
           c.workspace_id IS NOT NULL
           AND c.workspace_id IN (
             SELECT workspace_id
             FROM workspace_memberships
             WHERE user_id = $2
               AND status = 'active'
           )
         )
       )
     ORDER BY ep.created_at ASC`,
    [campaignId, userId]
  );

  return res.rows;
}

export async function findEntryPointById(id: string, userId: string) {
  const res = await query(
    `SELECT ep.*
     FROM entry_points ep
     JOIN campaigns c ON c.id = ep.campaign_id
     WHERE ep.id = $1
       AND (
         c.user_id = $2
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

export async function createEntryPoint(input: EntryPointInput) {
  const res = await query(
    `INSERT INTO entry_points
       (campaign_id, channel_id, user_id, bot_id, flow_id, project_id, platform, name, entry_key, entry_type, source_ref, landing_url, is_default, is_active, metadata, list_id)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16)
     RETURNING *`,
    [
      input.campaignId,
      input.channelId,
      input.userId,
      input.botId,
      input.flowId,
      input.projectId || null,
      input.platform,
      input.name,
      input.entryKey,
      input.entryType || "generic",
      input.sourceRef || null,
      input.landingUrl || null,
      Boolean(input.isDefault),
      input.isActive !== false,
      JSON.stringify(input.metadata || {}),
      input.listId || null,
    ]
  );

  return res.rows[0];
}

export async function updateEntryPoint(
  id: string,
  userId: string,
  input: Partial<EntryPointInput>
) {
  const res = await query(
    `UPDATE entry_points ep
     SET
       flow_id = COALESCE($1, ep.flow_id),
       platform = COALESCE($2, ep.platform),
       name = COALESCE($3, ep.name),
       entry_key = COALESCE($4, ep.entry_key),
       entry_type = COALESCE($5, ep.entry_type),
       source_ref = COALESCE($6, ep.source_ref),
       landing_url = COALESCE($7, ep.landing_url),
       is_default = COALESCE($8, ep.is_default),
       is_active = COALESCE($9, ep.is_active),
       metadata = CASE WHEN $10::jsonb IS NULL THEN ep.metadata ELSE $10::jsonb END,
       list_id = COALESCE($11, ep.list_id),
       updated_at = NOW()
     FROM campaigns c
     WHERE ep.id = $12
       AND ep.campaign_id = c.id
       AND (
         c.user_id = $13
         OR (
           c.workspace_id IS NOT NULL
           AND c.workspace_id IN (
             SELECT workspace_id
             FROM workspace_memberships
             WHERE user_id = $13
               AND status = 'active'
           )
         )
       )
     RETURNING ep.*`,
    [
      input.flowId || null,
      input.platform || null,
      input.name || null,
      input.entryKey || null,
      input.entryType || null,
      input.sourceRef || null,
      input.landingUrl || null,
      typeof input.isDefault === "boolean" ? input.isDefault : null,
      typeof input.isActive === "boolean" ? input.isActive : null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.listId || null,
      id,
      userId,
    ]
  );

  return res.rows[0];
}

export async function deleteEntryPoint(id: string, userId: string) {
  await query(
    `DELETE FROM entry_points ep
     USING campaigns c
     WHERE ep.id = $1
       AND ep.campaign_id = c.id
       AND (
         c.user_id = $2
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

export async function findListsByCampaign(campaignId: string, userId: string) {
  const res = await query(
    `SELECT
       l.*,
       COUNT(ld.id) AS lead_count
     FROM lists l
     JOIN campaigns c ON c.id = l.campaign_id
     LEFT JOIN leads ld ON ld.list_id = l.id
     WHERE l.campaign_id = $1
       AND (
         c.user_id = $2
         OR (
           c.workspace_id IS NOT NULL
           AND c.workspace_id IN (
             SELECT workspace_id
             FROM workspace_memberships
             WHERE user_id = $2
               AND status = 'active'
           )
         )
       )
     GROUP BY l.id
     ORDER BY l.created_at ASC`,
    [campaignId, userId]
  );

  return res.rows;
}

export async function findListById(id: string, userId: string) {
  const res = await query(
    `SELECT l.*
     FROM lists l
     JOIN campaigns c ON c.id = l.campaign_id
     WHERE l.id = $1
       AND (
         c.user_id = $2
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

export async function createList(input: ListInput) {
  const res = await query(
    `INSERT INTO lists
       (user_id, bot_id, campaign_id, project_id, channel_id, entry_point_id, platform, name, list_key, source_type, is_system, filters, metadata)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb)
     RETURNING *`,
    [
      input.userId,
      input.botId,
      input.campaignId,
      input.projectId || null,
      input.channelId || null,
      input.entryPointId || null,
      input.platform,
      input.name,
      input.listKey,
      input.sourceType || "entry_point",
      input.isSystem !== false,
      JSON.stringify(input.filters || {}),
      JSON.stringify(input.metadata || {}),
    ]
  );

  return res.rows[0];
}

export async function updateList(
  id: string,
  userId: string,
  input: Partial<ListInput>
) {
  const res = await query(
    `UPDATE lists l
     SET
       name = COALESCE($1, l.name),
       platform = COALESCE($2, l.platform),
       list_key = COALESCE($3, l.list_key),
       source_type = COALESCE($4, l.source_type),
       is_system = COALESCE($5, l.is_system),
       filters = CASE WHEN $6::jsonb IS NULL THEN l.filters ELSE $6::jsonb END,
       metadata = CASE WHEN $7::jsonb IS NULL THEN l.metadata ELSE $7::jsonb END,
       updated_at = NOW()
     FROM campaigns c
     WHERE l.id = $8
       AND l.campaign_id = c.id
       AND (
         c.user_id = $9
         OR (
           c.workspace_id IS NOT NULL
           AND c.workspace_id IN (
             SELECT workspace_id
             FROM workspace_memberships
             WHERE user_id = $9
               AND status = 'active'
           )
         )
       )
     RETURNING l.*`,
    [
      input.name || null,
      input.platform || null,
      input.listKey || null,
      input.sourceType || null,
      typeof input.isSystem === "boolean" ? input.isSystem : null,
      input.filters ? JSON.stringify(input.filters) : null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      id,
      userId,
    ]
  );

  return res.rows[0];
}

export async function deleteList(id: string, userId: string) {
  await query(
    `DELETE FROM lists l
     USING campaigns c
     WHERE l.id = $1
       AND l.campaign_id = c.id
       AND (
         c.user_id = $2
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

export async function findCampaignContextByEntry(
  botId: string,
  platform: string,
  entryKey?: string | null
) {
  const params: any[] = [botId, platform];
  let entryCondition = "";

  if (entryKey) {
    params.push(entryKey);
    entryCondition = "AND ep.entry_key = $3";
  } else {
    entryCondition = "AND ep.is_default = true";
  }

  const res = await query(
    `SELECT
       c.user_id,
       c.workspace_id,
       c.project_id,
       c.id AS campaign_id,
       c.name AS campaign_name,
       cc.id AS channel_id,
       cc.name AS channel_name,
       cc.platform,
       cc.platform_account_ref_id AS platform_account_id,
       ep.id AS entry_point_id,
       ep.name AS entry_name,
       ep.entry_key,
       ep.flow_id,
       ep.list_id,
       ep.metadata AS entry_metadata
     FROM entry_points ep
     JOIN campaign_channels cc ON cc.id = ep.channel_id
     JOIN campaigns c ON c.id = ep.campaign_id
     WHERE ep.bot_id = $1
       AND ep.platform = $2
       AND ep.is_active = true
       AND cc.status = 'active'
       AND c.status = 'active'
       ${entryCondition}
     ORDER BY ep.is_default DESC, ep.created_at ASC
     LIMIT 1`,
    params
  );

  return res.rows[0];
}

export async function findDefaultCampaignContext(botId: string, platform: string) {
  const res = await query(
    `SELECT
       c.user_id,
       c.workspace_id,
       c.project_id,
       c.id AS campaign_id,
       c.name AS campaign_name,
       cc.id AS channel_id,
       cc.name AS channel_name,
       cc.platform,
       cc.platform_account_ref_id AS platform_account_id,
       ep.id AS entry_point_id,
       ep.name AS entry_name,
       ep.entry_key,
       ep.flow_id,
       ep.list_id,
       ep.metadata AS entry_metadata
     FROM campaign_channels cc
     JOIN campaigns c ON c.id = cc.campaign_id
     LEFT JOIN entry_points ep
       ON ep.channel_id = cc.id
      AND ep.is_default = true
      AND ep.is_active = true
     WHERE cc.bot_id = $1
       AND cc.platform = $2
       AND cc.status = 'active'
       AND c.status = 'active'
     ORDER BY cc.created_at ASC
     LIMIT 1`,
    [botId, platform]
  );

  return res.rows[0];
}

export async function findCampaignChannelByWhatsAppPhoneNumberId(
  phoneNumberId: string
) {
  const res = await query(
    `SELECT cc.*
     FROM campaign_channels cc
     JOIN campaigns c ON c.id = cc.campaign_id
     JOIN bots b ON b.id = cc.bot_id
     LEFT JOIN workspaces w ON w.id = c.workspace_id
     WHERE cc.platform = 'whatsapp'
       AND cc.status = 'active'
       AND c.deleted_at IS NULL
       AND b.deleted_at IS NULL
       AND (w.id IS NULL OR w.deleted_at IS NULL)
       AND (
         cc.config->>'phoneNumberId' = $1
         OR cc.config->>'phone_number_id' = $1
         OR cc.platform_account_id = $1
         OR EXISTS (
           SELECT 1
           FROM platform_accounts pa
           WHERE pa.id = cc.platform_account_ref_id
             AND pa.status = 'active'
             AND (pa.phone_number = $1 OR pa.account_id = $1)
         )
       )
     ORDER BY cc.created_at DESC
     LIMIT 1`,
    [phoneNumberId]
  );

  return res.rows[0];
}

export async function findCampaignChannelsByWhatsAppPhoneNumberId(
  phoneNumberId: string
) {
  const res = await query(
    `SELECT cc.*
     FROM campaign_channels cc
     JOIN campaigns c ON c.id = cc.campaign_id
     JOIN bots b ON b.id = cc.bot_id
     LEFT JOIN workspaces w ON w.id = c.workspace_id
     WHERE cc.platform = 'whatsapp'
       AND cc.status = 'active'
       AND c.deleted_at IS NULL
       AND b.deleted_at IS NULL
       AND (w.id IS NULL OR w.deleted_at IS NULL)
       AND (
         cc.config->>'phoneNumberId' = $1
         OR cc.config->>'phone_number_id' = $1
         OR cc.platform_account_id = $1
         OR EXISTS (
           SELECT 1
           FROM platform_accounts pa
           WHERE pa.id = cc.platform_account_ref_id
             AND pa.status = 'active'
             AND (pa.phone_number = $1 OR pa.account_id = $1)
         )
       )
     ORDER BY cc.created_at DESC`,
    [phoneNumberId]
  );

  return res.rows;
}

export async function findCampaignChannelsByPlatformAccountRefId(
  platformAccountId: string
) {
  const res = await query(
    `SELECT cc.*
     FROM campaign_channels cc
     JOIN campaigns c ON c.id = cc.campaign_id
     JOIN bots b ON b.id = cc.bot_id
     LEFT JOIN workspaces w ON w.id = c.workspace_id
     WHERE cc.platform = 'whatsapp'
       AND cc.status = 'active'
       AND c.deleted_at IS NULL
       AND b.deleted_at IS NULL
       AND (w.id IS NULL OR w.deleted_at IS NULL)
       AND cc.platform_account_ref_id = $1
     ORDER BY cc.created_at DESC`,
    [platformAccountId]
  );

  return res.rows;
}

export async function findCampaignChannelByPlatformAccountRefId(
  platformAccountId: string
) {
  const res = await query(
    `SELECT cc.*
     FROM campaign_channels cc
     JOIN campaigns c ON c.id = cc.campaign_id
     JOIN bots b ON b.id = cc.bot_id
     LEFT JOIN workspaces w ON w.id = c.workspace_id
     WHERE cc.platform = 'whatsapp'
       AND cc.status = 'active'
       AND c.deleted_at IS NULL
       AND b.deleted_at IS NULL
       AND (w.id IS NULL OR w.deleted_at IS NULL)
       AND cc.platform_account_ref_id = $1
     ORDER BY cc.created_at DESC
     LIMIT 1`,
    [platformAccountId]
  );

  return res.rows[0];
}

export async function findCampaignChannelsByBotAndPlatform(
  botId: string,
  platform: string
) {
  const res = await query(
    `SELECT cc.*
     FROM campaign_channels cc
     JOIN campaigns c ON c.id = cc.campaign_id
     JOIN bots b ON b.id = cc.bot_id
     LEFT JOIN workspaces w ON w.id = c.workspace_id
     WHERE cc.bot_id = $1
       AND cc.platform = $2
       AND cc.status = 'active'
       AND c.deleted_at IS NULL
       AND b.deleted_at IS NULL
       AND (w.id IS NULL OR w.deleted_at IS NULL)
     ORDER BY cc.created_at ASC`,
    [botId, platform]
  );

  return res.rows;
}

export async function findCampaignChannelRuntimeById(id: string) {
  const res = await query(
    `SELECT cc.*
     FROM campaign_channels cc
     WHERE cc.id = $1
     LIMIT 1`,
    [id]
  );

  return res.rows[0];
}
