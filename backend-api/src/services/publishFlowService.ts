import { db, query } from "../config/db";
import { findBotById } from "../models/botModel";
import {
  assertBotWorkspacePermission,
  WORKSPACE_PERMISSIONS,
} from "./workspaceAccessService";

interface ExtractedTrigger {
  keyword: string;
  targetNodeId: string;
}

type PublishFlowResult = {
  success: boolean;
  count: number;
  sourceType: "campaign" | "bot" | "universal";
  version?: number | null;
};

const TRIGGER_NODE_TYPES = new Set(["trigger"]);

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

async function tableExists(client: any, tableName: string) {
  const res = await client.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = $1
     ) AS exists`,
    [tableName]
  );

  return Boolean(res.rows[0]?.exists);
}

const splitKeywords = (value: any) =>
  String(value || "")
    .split(/[,;\n|]+/)
    .map((item) => String(item || "").trim())
    .filter(Boolean);

const parseJsonObject = (value: any) => {
  if (!value) {
    return {};
  }

  if (typeof value === "object") {
    return value && !Array.isArray(value) ? value : {};
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return {};
};

const normalizeKeyword = (value: string) => String(value || "").trim().toLowerCase();

const collectNodeKeywords = (nodeData: Record<string, any>) => {
  const candidateValues = [
    nodeData.keyword,
    nodeData.keywords,
    nodeData.triggerKeywords,
    nodeData.triggerKeyword,
    nodeData.trigger_keyword,
    nodeData.entryKey,
    nodeData.entry_key,
  ];

  const collected: string[] = [];
  for (const candidate of candidateValues) {
    if (Array.isArray(candidate)) {
      collected.push(...candidate.map((item) => String(item || "").trim()));
      continue;
    }

    if (typeof candidate === "string") {
      collected.push(...splitKeywords(candidate));
      continue;
    }
  }

  return Array.from(new Set(collected.map(normalizeKeyword).filter(Boolean)));
};

function extractTriggers(flowJson: any): ExtractedTrigger[] {
  const nodes = Array.isArray(flowJson?.nodes) ? flowJson.nodes : [];
  const seen = new Set<string>();
  const results: ExtractedTrigger[] = [];

  for (const node of nodes) {
    const nodeType = String(node?.type || "").trim().toLowerCase();
    if (!TRIGGER_NODE_TYPES.has(nodeType)) {
      continue;
    }

    const nodeId = String(node?.id || "").trim();
    if (!nodeId) {
      continue;
    }

    const nodeData = parseJsonObject(node?.data);
    const keywords = collectNodeKeywords(nodeData);

    for (const keyword of keywords) {
      const normalizedKeyword = normalizeKeyword(keyword);
      if (!normalizedKeyword) {
        continue;
      }

      const uniqueKey = `${normalizedKeyword}::${nodeId}`;
      if (seen.has(uniqueKey)) {
        continue;
      }
      seen.add(uniqueKey);

      results.push({
        keyword: normalizedKeyword,
        targetNodeId: nodeId,
      });
    }
  }

  return results;
}

async function resolveCampaignId(client: any, flow: {
  id: string;
  workspace_id?: string | null;
  project_id?: string | null;
}) {
  const res = await client.query(
    `SELECT c.id
     FROM campaigns c
     LEFT JOIN campaign_channels cc ON cc.campaign_id = c.id
     WHERE c.deleted_at IS NULL
       AND c.workspace_id = $2
       AND (
         c.default_flow_id = $1
         OR cc.flow_id = $1
       )
       AND (
         $3::uuid IS NULL
         OR c.project_id IS NULL
         OR c.project_id = $3
       )
     ORDER BY c.updated_at DESC, c.created_at DESC
     LIMIT 1`,
    [flow.id, flow.workspace_id || null, flow.project_id || null]
  );

  return res.rows[0]?.id || null;
}

export async function publishFlow(
  flowId: string,
  userId: string
): Promise<PublishFlowResult> {
  const requestedFlowId = String(flowId || "").trim();
  if (!requestedFlowId) {
    throw { status: 400, message: "flowId is required" };
  }

  const flowLookup = await query(
    `SELECT id, flow_name, flow_json, workspace_id, bot_id, project_id
     FROM flows
     WHERE id = $1
     LIMIT 1`,
    [requestedFlowId]
  );

  const flow = flowLookup.rows[0];
  if (!flow) {
    throw { status: 404, message: "Flow not found" };
  }

  const botId = String(flow.bot_id || "").trim();
  if (!botId) {
    throw { status: 409, message: "Flow must belong to a bot before it can be published." };
  }

  const bot = await findBotById(botId);
  if (!bot) {
    throw { status: 404, message: "Bot not found for the selected flow." };
  }

  await assertBotWorkspacePermission(userId, bot.id, WORKSPACE_PERMISSIONS.editWorkflow);

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const lockedFlowRes = await client.query(
      `SELECT id, flow_name, flow_json, workspace_id, bot_id, project_id
       FROM flows
       WHERE id = $1
       FOR UPDATE`,
      [requestedFlowId]
    );

    const lockedFlow = lockedFlowRes.rows[0];
    if (!lockedFlow) {
      throw { status: 404, message: "Flow not found" };
    }

    const campaignId = await resolveCampaignId(client, lockedFlow);
    const sourceType: "campaign" | "bot" | "universal" = campaignId
      ? "campaign"
      : botId
        ? "bot"
        : "universal";
    const priority = sourceType === "campaign" ? 2 : sourceType === "bot" ? 1 : 0;
    const flowVersionsAvailable = await tableExists(client, "flow_versions");
    let nextVersion: number | null = null;

    if (flowVersionsAvailable) {
      const versionRes = await client.query(
        `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
         FROM flow_versions
         WHERE flow_id = $1`,
        [requestedFlowId]
      );
      nextVersion = Number(versionRes.rows[0]?.next_version || 1);
    }

    const triggers = extractTriggers(parseJsonObject(lockedFlow.flow_json));

    await client.query(`DELETE FROM triggers WHERE target_flow_id = $1`, [requestedFlowId]);

    let insertedCount = 0;
    const snapshotTriggers: Array<Record<string, any>> = [];
    for (const trigger of triggers) {
      const triggerRes = await client.query(
        `INSERT INTO triggers (
           workspace_id,
           project_id,
           bot_id,
           campaign_id,
           keyword,
           target_flow_id,
           target_node_id,
           source_type,
           priority,
           is_active
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
         RETURNING
           id,
           workspace_id,
           project_id,
           bot_id,
           campaign_id,
           keyword,
           target_flow_id,
           target_node_id,
           source_type,
           priority,
           is_active,
           created_at,
           updated_at`,
        [
          lockedFlow.workspace_id || bot.workspace_id || null,
          lockedFlow.project_id || null,
          sourceType === "universal" ? null : botId,
          campaignId,
          trigger.keyword,
          requestedFlowId,
          trigger.targetNodeId,
          sourceType,
          priority,
        ]
      );
      snapshotTriggers.push(triggerRes.rows[0]);
      insertedCount += 1;
    }

    if (flowVersionsAvailable) {
      await client.query(
        `INSERT INTO flow_versions (
           flow_id,
           version_number,
           flow_json,
           triggers_json,
           published_by,
           change_summary
         )
         VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6)`,
        [
          requestedFlowId,
          nextVersion,
          JSON.stringify(parseJsonObject(lockedFlow.flow_json)),
          JSON.stringify(snapshotTriggers),
          userId,
          `Automated publish: ${String(lockedFlow.flow_name || flowLookup.rows[0]?.flow_name || requestedFlowId)}`,
        ]
      );
    } else {
      console.warn(
        `[PublishFlowService] flow_versions table missing, skipping snapshot for ${requestedFlowId}`
      );
    }

    await client.query(
      (await hasColumn("flows", "updated_at"))
        ? `UPDATE flows
           SET is_active = true,
               updated_at = NOW()
           WHERE id = $1`
        : `UPDATE flows
           SET is_active = true
           WHERE id = $1`,
      [requestedFlowId]
    );

    await client.query("COMMIT");
    return {
      success: true,
      count: insertedCount,
      sourceType,
      version: nextVersion,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
