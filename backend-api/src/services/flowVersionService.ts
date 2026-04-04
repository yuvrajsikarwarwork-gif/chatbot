import { db, query } from "../config/db";
import { findBotById } from "../models/botModel";
import { assertBotWorkspacePermission, WORKSPACE_PERMISSIONS } from "./workspaceAccessService";

async function tableExists(tableName: string) {
  const res = await query(
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

async function columnExists(client: any, tableName: string, columnName: string) {
  const res = await client.query(
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

function normalizeJsonArray(value: any) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function normalizeJsonObject(value: any) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
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
}

function extractTriggerSignature(trigger: any) {
  return {
    id: String(trigger?.id || "").trim() || null,
    keyword: String(trigger?.keyword || "").trim() || null,
    targetFlowId: String(trigger?.target_flow_id || trigger?.targetFlowId || "").trim() || null,
    targetNodeId: String(trigger?.target_node_id || trigger?.targetNodeId || "").trim() || null,
    sourceType: String(trigger?.source_type || trigger?.sourceType || "").trim() || null,
    priority: Number.isFinite(Number(trigger?.priority)) ? Number(trigger.priority) : 0,
    isActive: Boolean(trigger?.is_active ?? trigger?.isActive),
  };
}

function normalizeSnapshotTrigger(trigger: any) {
  return {
    workspace_id: String(trigger?.workspace_id || trigger?.workspaceId || "").trim() || null,
    project_id: String(trigger?.project_id || trigger?.projectId || "").trim() || null,
    bot_id: String(trigger?.bot_id || trigger?.botId || "").trim() || null,
    campaign_id: String(trigger?.campaign_id || trigger?.campaignId || "").trim() || null,
    keyword: String(trigger?.keyword || "").trim().toLowerCase(),
    target_flow_id: String(trigger?.target_flow_id || trigger?.targetFlowId || "").trim() || null,
    target_node_id: String(trigger?.target_node_id || trigger?.targetNodeId || "").trim() || null,
    source_type: String(trigger?.source_type || trigger?.sourceType || "universal").trim().toLowerCase() || "universal",
    priority: Number.isFinite(Number(trigger?.priority)) ? Number(trigger.priority) : 0,
    is_active: Boolean(trigger?.is_active ?? trigger?.isActive ?? true),
  };
}

export async function getFlowVersions(flowId: string) {
  if (!String(flowId || "").trim()) {
    return [];
  }

  if (!(await tableExists("flow_versions"))) {
    return [];
  }

  const res = await query(
    `SELECT
       id,
       flow_id,
       version_number,
       flow_json,
       triggers_json,
       published_by,
       published_at,
       change_summary,
       created_at
     FROM flow_versions
     WHERE flow_id = $1
     ORDER BY version_number DESC`,
    [flowId]
  );

  return res.rows;
}

export async function getFlowVersionComparison(flowId: string, leftVersion: number, rightVersion: number) {
  if (!String(flowId || "").trim()) {
    return null;
  }

  if (!(await tableExists("flow_versions"))) {
    return null;
  }

  const res = await query(
    `SELECT
       version_number,
       flow_json,
       triggers_json,
       published_at,
       change_summary
     FROM flow_versions
     WHERE flow_id = $1
       AND version_number IN ($2, $3)
     ORDER BY version_number ASC`,
    [flowId, leftVersion, rightVersion]
  );

  const left = res.rows.find((row: any) => Number(row.version_number) === Number(leftVersion)) || null;
  const right = res.rows.find((row: any) => Number(row.version_number) === Number(rightVersion)) || null;
  if (!left || !right) {
    return null;
  }

  const leftNodes = normalizeJsonArray(normalizeJsonObject(left.flow_json).nodes);
  const rightNodes = normalizeJsonArray(normalizeJsonObject(right.flow_json).nodes);
  const leftTriggers = normalizeJsonArray(left.triggers_json).map(extractTriggerSignature);
  const rightTriggers = normalizeJsonArray(right.triggers_json).map(extractTriggerSignature);

  const nodeMap = (nodes: any[]) =>
    new Map(
      nodes
        .map((node) => [String(node?.id || "").trim(), node])
        .filter(([id]) => Boolean(id)) as Array<[string, any]>
    );

  const leftNodeMap = nodeMap(leftNodes);
  const rightNodeMap = nodeMap(rightNodes);

  const allNodeIds = Array.from(new Set([...leftNodeMap.keys(), ...rightNodeMap.keys()]));
  const nodeDiffs = allNodeIds
    .map((nodeId) => {
      const leftNode = leftNodeMap.get(nodeId) || null;
      const rightNode = rightNodeMap.get(nodeId) || null;
      if (!leftNode && !rightNode) {
        return null;
      }

      const leftJson = JSON.stringify(leftNode || null);
      const rightJson = JSON.stringify(rightNode || null);
      if (leftJson === rightJson) {
        return null;
      }

      return {
        nodeId,
        leftNode,
        rightNode,
      };
    })
    .filter(Boolean);

  const leftTriggerKey = new Set(
    leftTriggers.map((trigger) => `${trigger.keyword || ""}::${trigger.targetFlowId || ""}::${trigger.targetNodeId || ""}`)
  );
  const rightTriggerKey = new Set(
    rightTriggers.map((trigger) => `${trigger.keyword || ""}::${trigger.targetFlowId || ""}::${trigger.targetNodeId || ""}`)
  );

  const addedTriggers = rightTriggers.filter(
    (trigger) => !leftTriggerKey.has(`${trigger.keyword || ""}::${trigger.targetFlowId || ""}::${trigger.targetNodeId || ""}`)
  );
  const removedTriggers = leftTriggers.filter(
    (trigger) => !rightTriggerKey.has(`${trigger.keyword || ""}::${trigger.targetFlowId || ""}::${trigger.targetNodeId || ""}`)
  );

  return {
    flowId,
    leftVersion: {
      versionNumber: Number(left.version_number),
      publishedAt: left.published_at,
      changeSummary: left.change_summary,
      triggers: leftTriggers.length,
      nodes: leftNodes.length,
    },
    rightVersion: {
      versionNumber: Number(right.version_number),
      publishedAt: right.published_at,
      changeSummary: right.change_summary,
      triggers: rightTriggers.length,
      nodes: rightNodes.length,
    },
    summary: {
      nodesChanged: nodeDiffs.length,
      triggersAdded: addedTriggers.length,
      triggersRemoved: removedTriggers.length,
    },
    nodeDiffs,
    addedTriggers,
    removedTriggers,
  };
}

export async function rollbackToVersion(flowId: string, versionNumber: number, userId: string) {
  if (!String(flowId || "").trim()) {
    throw new Error("flowId is required");
  }

  if (!Number.isFinite(versionNumber) || versionNumber <= 0) {
    throw new Error("versionNumber is required");
  }

  if (!String(userId || "").trim()) {
    throw new Error("userId is required");
  }

  if (!(await tableExists("flow_versions"))) {
    throw new Error("flow_versions table does not exist");
  }

  const flowRes = await query(
    `SELECT id, flow_name, workspace_id, bot_id, project_id
     FROM flows
     WHERE id = $1
     LIMIT 1`,
    [flowId]
  );
  const flow = flowRes.rows[0];
  if (!flow) {
    throw new Error(`Flow ${flowId} not found`);
  }

  const bot = await findBotById(String(flow.bot_id || "").trim());
  if (!bot) {
    throw new Error("Bot not found for the selected flow.");
  }

  await assertBotWorkspacePermission(userId, bot.id, WORKSPACE_PERMISSIONS.editWorkflow);

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const versionRes = await client.query(
      `SELECT
         version_number,
         flow_json,
         triggers_json,
         change_summary
       FROM flow_versions
       WHERE flow_id = $1
         AND version_number = $2
       LIMIT 1`,
      [flowId, versionNumber]
    );
    const targetVersion = versionRes.rows[0];
    if (!targetVersion) {
      throw new Error(`Version ${versionNumber} not found for flow ${flowId}`);
    }

    const nextVersionRes = await client.query(
      `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
       FROM flow_versions
       WHERE flow_id = $1`,
      [flowId]
    );
    const newVersionNumber = Number(nextVersionRes.rows[0]?.next_version || versionNumber + 1);

    const restoredFlowJson = normalizeJsonObject(targetVersion.flow_json);
    const restoredTriggers = normalizeJsonArray(targetVersion.triggers_json).map(normalizeSnapshotTrigger);
    const flowsHasUpdatedAt = await columnExists(client, "flows", "updated_at");
    const restoredFlowName = String(
      restoredFlowJson.flow_name || restoredFlowJson.name || flow.flow_name || ""
    ).trim() || null;

    await client.query(
      flowsHasUpdatedAt
        ? `UPDATE flows
           SET flow_json = $2::jsonb,
               flow_name = COALESCE($3, flow_name),
               is_active = true,
               updated_at = NOW()
           WHERE id = $1`
        : `UPDATE flows
           SET flow_json = $2::jsonb,
               flow_name = COALESCE($3, flow_name),
               is_active = true
           WHERE id = $1`,
      [
        flowId,
        JSON.stringify(restoredFlowJson),
        restoredFlowName,
      ]
    );

    await client.query(`DELETE FROM triggers WHERE target_flow_id = $1`, [flowId]);

    for (const trigger of restoredTriggers) {
      await client.query(
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
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          trigger.workspace_id || flow.workspace_id || bot.workspace_id || null,
          trigger.project_id || flow.project_id || null,
          trigger.bot_id || flow.bot_id || null,
          trigger.campaign_id || null,
          trigger.keyword,
          flowId,
          trigger.target_node_id || null,
          trigger.source_type || "universal",
          trigger.priority || 0,
          trigger.is_active,
        ]
      );
    }

    await client.query(
      `INSERT INTO flow_versions (
         flow_id,
         version_number,
         flow_json,
         triggers_json,
         published_by,
         change_summary
       ) VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6)`,
      [
        flowId,
        newVersionNumber,
        JSON.stringify(restoredFlowJson),
        JSON.stringify(restoredTriggers),
        userId,
        `Rollback to version ${versionNumber}`,
      ]
    );

    await client.query("COMMIT");

    return {
      success: true,
      restoredFrom: versionNumber,
      newVersion: newVersionNumber,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
