import { query } from "../config/db";

export type TriggerResult =
  | { type: "OVERRIDE"; action: "STOP" | "RESTART" }
  | { type: "FLOW_START"; flowId: string; nodeId: string | null; source: string }
  | { type: "NONE" };

const GLOBAL_STOP = new Set(["stop", "unsubscribe", "quit", "exit", "cancel"]);
const GLOBAL_RESTART = new Set(["restart", "reset", "start over"]);
const LOCKED_STATUSES = new Set(["active", "awaiting_confirmation"]);

const normalizeText = (value: any) => String(value || "").trim().toLowerCase();

const isLockedConversation = (status?: string | null, currentNode?: string | null) =>
  Boolean(String(currentNode || "").trim()) && LOCKED_STATUSES.has(normalizeText(status));

export async function resolveTrigger(params: {
  text: string;
  workspaceId: string;
  projectId?: string | null;
  botId?: string | null;
  campaignId?: string | null;
  conversationStatus?: string | null;
  currentNode?: string | null;
}): Promise<TriggerResult> {
  const normalized = normalizeText(params.text);
  if (!normalized) {
    return { type: "NONE" };
  }

  if (GLOBAL_STOP.has(normalized)) {
    return { type: "OVERRIDE", action: "STOP" };
  }

  if (GLOBAL_RESTART.has(normalized)) {
    return { type: "OVERRIDE", action: "RESTART" };
  }

  if (isLockedConversation(params.conversationStatus, params.currentNode)) {
    return { type: "NONE" };
  }

  const paramsList: any[] = [params.workspaceId, normalized];
  const projectId = params.projectId || null;
  const botId = params.botId || null;
  const campaignId = params.campaignId || null;

  let projectClause = "AND t.project_id IS NULL";
  if (projectId) {
    paramsList.push(projectId);
    projectClause = `AND (t.project_id IS NULL OR t.project_id = $${paramsList.length})`;
  }

  let botClause = "AND t.bot_id IS NULL";
  if (botId) {
    paramsList.push(botId);
    botClause = `AND (t.bot_id IS NULL OR t.bot_id = $${paramsList.length})`;
  }

  let campaignClause = "AND t.campaign_id IS NULL";
  if (campaignId) {
    paramsList.push(campaignId);
    campaignClause = `AND (t.campaign_id IS NULL OR t.campaign_id = $${paramsList.length})`;
  }

  const sql = `
    SELECT
      t.id,
      t.target_flow_id,
      t.target_node_id,
      t.source_type
    FROM triggers t
    WHERE t.workspace_id = $1
      AND LOWER(TRIM(t.keyword)) = $2
      AND COALESCE(t.is_active, true) = true
      ${projectClause}
      ${botClause}
      ${campaignClause}
    ORDER BY
      CASE
        WHEN t.source_type = 'campaign' THEN 2
        WHEN t.source_type = 'bot' THEN 1
        ELSE 0
      END DESC,
      COALESCE(t.priority, 0) DESC,
      COALESCE(t.updated_at, t.created_at) DESC
    LIMIT 1
  `;

  const res = await query(sql, paramsList);
  const row = res.rows[0];
  if (!row) {
    return { type: "NONE" };
  }

  return {
    type: "FLOW_START",
    flowId: String(row.target_flow_id || "").trim(),
    nodeId: row.target_node_id ? String(row.target_node_id).trim() : null,
    source: String(row.source_type || "").trim() || "universal",
  };
}
