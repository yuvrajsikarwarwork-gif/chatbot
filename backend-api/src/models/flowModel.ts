import { db, query } from "../config/db";

export async function findFlowsByBot(botId: string) {
  const res = await query(
    "SELECT * FROM flows WHERE bot_id = $1 ORDER BY is_default DESC, updated_at DESC, created_at DESC",
    [botId]
  );
  return res.rows;
}

export async function findFlowsByProject(projectId: string) {
  const res = await query(
    `SELECT *
     FROM flows
     WHERE project_id = $1
     ORDER BY is_default DESC, updated_at DESC, created_at DESC`,
    [projectId]
  );
  return res.rows;
}

export async function findFlowSummariesByBot(botId: string) {
  try {
    const res = await query(
      `SELECT id, bot_id, flow_name, flow_key, is_default, is_active, created_at, updated_at
       FROM flows
       WHERE bot_id = $1
       ORDER BY is_default DESC, updated_at DESC, created_at DESC`,
      [botId]
    );
    return res.rows;
  } catch (error: any) {
    // Backward-compatible fallback for databases that have not yet applied
    // the newer campaign/flow migrations adding flow_key and is_default.
    if (error?.code !== "42703") {
      throw error;
    }

    const fallbackRes = await query(
      `SELECT
         id,
         bot_id,
         flow_name,
         NULL::text AS flow_key,
         false AS is_default,
         COALESCE(is_active, true) AS is_active,
         created_at,
         updated_at
       FROM flows
       WHERE bot_id = $1
       ORDER BY updated_at DESC, created_at DESC`,
      [botId]
    );

    return fallbackRes.rows;
  }
}

export async function findFlowById(id: string) {
  const res = await query("SELECT * FROM flows WHERE id = $1", [id]);
  return res.rows[0];
}

export async function findFlowByIdAndProject(id: string, projectId: string) {
  const res = await query("SELECT * FROM flows WHERE id = $1 AND project_id = $2", [
    id,
    projectId,
  ]);
  return res.rows[0];
}

export async function createFlow(
  botId: string,
  flowJson: any,
  flowName?: string,
  isDefault = false
) {
  const flowJsonStr = JSON.stringify(flowJson || { nodes: [], edges: [] });
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    if (isDefault) {
      await client.query(
        "UPDATE flows SET is_default = false, updated_at = CURRENT_TIMESTAMP WHERE bot_id = $1",
        [botId]
      );
    }

    const res = await client.query(
      `INSERT INTO flows (bot_id, flow_name, flow_json, is_default)
       VALUES ($1, $2, $3::jsonb, $4)
       RETURNING *`,
      [botId, flowName || "Primary Flow", flowJsonStr, isDefault]
    );

    await syncFlowNodes(client, res.rows[0].id, flowJson);
    await client.query("COMMIT");

    return res.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateFlow(
  id: string,
  botId: string,
  flowJson: any,
  flowName?: string,
  isDefault?: boolean
) {
  const flowJsonStr = JSON.stringify(flowJson || { nodes: [], edges: [] });
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    if (isDefault) {
      await client.query(
        "UPDATE flows SET is_default = false, updated_at = CURRENT_TIMESTAMP WHERE bot_id = $1 AND id <> $2",
        [botId, id]
      );
    }

    const res = await client.query(
      `UPDATE flows
       SET
         flow_json = $1::jsonb,
         flow_name = COALESCE($2, flow_name),
         is_default = COALESCE($3, is_default),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND bot_id = $5
       RETURNING *`,
      [
        flowJsonStr,
        flowName || null,
        typeof isDefault === "boolean" ? isDefault : null,
        id,
        botId,
      ]
    );

    if (res.rows[0]) {
      await syncFlowNodes(client, id, flowJson);
    }

    await client.query("COMMIT");
    return res.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteFlow(id: string, botId: string) {
  await query("DELETE FROM flows WHERE id = $1 AND bot_id = $2", [id, botId]);
}

async function syncFlowNodes(client: any, flowId: string, flowJson: any) {
  const nodes = Array.isArray(flowJson?.nodes) ? flowJson.nodes : [];

  await client.query("DELETE FROM flow_nodes WHERE flow_id = $1", [flowId]);

  for (const node of nodes) {
    await client.query(
      `INSERT INTO flow_nodes (flow_id, node_id, node_type, node_label, node_data, position_x, position_y)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
      [
        flowId,
        node.id,
        node.type,
        node.data?.label || null,
        JSON.stringify(node.data || {}),
        node.position?.x ?? null,
        node.position?.y ?? null,
      ]
    );
  }
}
