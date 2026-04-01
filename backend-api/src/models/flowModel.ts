import { db, query } from "../config/db";

let flowColumnSupport:
  | {
      isDefault: boolean;
      isSystemFlow: boolean;
      isActive: boolean;
      workspaceId: boolean;
      projectId: boolean;
    }
  | null = null;
let flowStorageCompatibility:
  | {
      checked: boolean;
      flowsHasFlowJson: boolean;
      hasFlowNodesTable: boolean;
      flowNodesColumns: {
        flow_id: boolean;
        node_id: boolean;
        node_type: boolean;
        node_label: boolean;
        node_data: boolean;
        position_x: boolean;
        position_y: boolean;
      };
    }
  | null = null;

async function getFlowColumnSupport() {
  if (flowColumnSupport) {
    return flowColumnSupport;
  }

  const res = await query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'flows'`
  );

  const columns = new Set(res.rows.map((row: any) => String(row.column_name || "").trim()));
  flowColumnSupport = {
    isDefault: columns.has("is_default"),
    isSystemFlow: columns.has("is_system_flow"),
    isActive: columns.has("is_active"),
    workspaceId: columns.has("workspace_id"),
    projectId: columns.has("project_id"),
  };
  return flowColumnSupport;
}

async function getFlowStorageCompatibility() {
  if (flowStorageCompatibility?.checked) {
    return flowStorageCompatibility;
  }

  const res = await query(
    `SELECT table_name, column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN ('flows', 'flow_nodes')`
  );

  const tableColumns = new Map<string, Set<string>>();
  for (const row of res.rows) {
    const tableName = String(row.table_name || "").trim();
    const columnName = String(row.column_name || "").trim();
    if (!tableColumns.has(tableName)) {
      tableColumns.set(tableName, new Set());
    }
    tableColumns.get(tableName)!.add(columnName);
  }

  const flowsColumns = tableColumns.get("flows") || new Set<string>();
  const flowNodesColumns = tableColumns.get("flow_nodes") || new Set<string>();

  flowStorageCompatibility = {
    checked: true,
    flowsHasFlowJson: flowsColumns.has("flow_json"),
    hasFlowNodesTable: tableColumns.has("flow_nodes"),
    flowNodesColumns: {
      flow_id: flowNodesColumns.has("flow_id"),
      node_id: flowNodesColumns.has("node_id"),
      node_type: flowNodesColumns.has("node_type"),
      node_label: flowNodesColumns.has("node_label"),
      node_data: flowNodesColumns.has("node_data"),
      position_x: flowNodesColumns.has("position_x"),
      position_y: flowNodesColumns.has("position_y"),
    },
  };

  return flowStorageCompatibility;
}

async function assertFlowStorageCompatibility() {
  const compatibility = await getFlowStorageCompatibility();
  const missingDetails: string[] = [];

  if (!compatibility.flowsHasFlowJson) {
    missingDetails.push('Missing column: flows.flow_json');
  }

  if (!compatibility.hasFlowNodesTable) {
    missingDetails.push('Missing table: flow_nodes');
  } else {
    for (const [columnName, isPresent] of Object.entries(compatibility.flowNodesColumns)) {
      if (!isPresent) {
        missingDetails.push(`Missing column: flow_nodes.${columnName}`);
      }
    }
  }

  if (missingDetails.length === 0) {
    return;
  }

  throw {
    status: 500,
    code: "FLOW_STORAGE_INCOMPATIBLE",
    message: "Flow builder storage is not compatible with this backend/database state.",
    details: [
      ...missingDetails,
      "Run database migrations for flow storage before using flow save features.",
      "Required baseline migrations include 003_create_flows.sql and 012_create_campaign_capture_architecture.sql.",
    ],
  };
}

export async function findFlowsByBot(botId: string) {
  const columns = await getFlowColumnSupport();
  if (!columns.isSystemFlow) {
    const res = await query(
      "SELECT * FROM flows WHERE bot_id = $1 ORDER BY is_default DESC, updated_at DESC, created_at DESC",
      [botId]
    );
    return res.rows;
  }

  const res = await query(
    `SELECT *
     FROM flows
     WHERE bot_id = $1
       AND COALESCE(is_system_flow, false) = false
     ORDER BY is_default DESC, updated_at DESC, created_at DESC`,
    [botId]
  );
  return res.rows;
}

export async function findAllFlowsByBot(botId: string) {
  const res = await query(
    "SELECT * FROM flows WHERE bot_id = $1 ORDER BY is_default DESC, updated_at DESC, created_at DESC",
    [botId]
  );
  return res.rows;
}

export async function findSystemFlowsByBot(botId: string) {
  const columns = await getFlowColumnSupport();
  if (!columns.isSystemFlow) {
    return [];
  }

  const res = await query(
    `SELECT *
     FROM flows
     WHERE bot_id = $1
       AND COALESCE(is_system_flow, false) = true
     ORDER BY updated_at DESC, created_at DESC`,
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
    const columns = await getFlowColumnSupport();
    const selectColumns = columns.isSystemFlow
      ? "id, bot_id, flow_name, flow_key, flow_json, is_default, is_active, is_system_flow, created_at, updated_at"
      : "id, bot_id, flow_name, flow_key, flow_json, is_default, is_active, false AS is_system_flow, created_at, updated_at";
    const whereClause = columns.isSystemFlow ? "AND COALESCE(is_system_flow, false) = false" : "";
    const res = await query(
      `SELECT ${selectColumns}
       FROM flows
       WHERE bot_id = $1
         ${whereClause}
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
         NULL::jsonb AS flow_json,
         false AS is_default,
         COALESCE(is_active, true) AS is_active,
         false AS is_system_flow,
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

export async function findSystemFlowSummariesByBot(botId: string) {
  try {
    const columns = await getFlowColumnSupport();
    if (!columns.isSystemFlow) {
      return [];
    }
    const res = await query(
      `SELECT id, bot_id, flow_name, flow_key, flow_json, is_default, is_active, is_system_flow, created_at, updated_at
       FROM flows
       WHERE bot_id = $1
         AND COALESCE(is_system_flow, false) = true
       ORDER BY updated_at DESC, created_at DESC`,
      [botId]
    );
    return res.rows;
  } catch (error: any) {
    if (error?.code !== "42703") {
      throw error;
    }

    const fallbackRes = await query(
      `SELECT
         id,
         bot_id,
         flow_name,
         NULL::text AS flow_key,
         NULL::jsonb AS flow_json,
         false AS is_default,
         COALESCE(is_active, true) AS is_active,
         true AS is_system_flow,
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
  isDefault = false,
  isSystemFlow = false,
  isActive?: boolean,
  workspaceId?: string | null,
  projectId?: string | null
) {
  await assertFlowStorageCompatibility();
  const flowJsonStr = JSON.stringify(flowJson || { nodes: [], edges: [] });
  const columns = await getFlowColumnSupport();
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    if (isDefault && columns.isDefault) {
      await client.query(
        "UPDATE flows SET is_default = false, updated_at = CURRENT_TIMESTAMP WHERE bot_id = $1",
        [botId]
      );
    }

    const insertColumns = ["bot_id", "flow_name", "flow_json"];
    const insertValues: any[] = [botId, flowName || "Primary Flow", flowJsonStr];
    const placeholders = ["$1", "$2", "$3::jsonb"];

    if (columns.workspaceId) {
      insertColumns.push("workspace_id");
      insertValues.push(workspaceId || null);
      placeholders.push(`$${insertValues.length}`);
    }

    if (columns.projectId) {
      insertColumns.push("project_id");
      insertValues.push(projectId || null);
      placeholders.push(`$${insertValues.length}`);
    }

    if (columns.isDefault) {
      insertColumns.push("is_default");
      insertValues.push(isDefault);
      placeholders.push(`$${insertValues.length}`);
    }

    if (columns.isSystemFlow) {
      insertColumns.push("is_system_flow");
      insertValues.push(isSystemFlow);
      placeholders.push(`$${insertValues.length}`);
    }

    if (columns.isActive) {
      insertColumns.push("is_active");
      insertValues.push(typeof isActive === "boolean" ? isActive : true);
      placeholders.push(`$${insertValues.length}`);
    }

    const res = await client.query(
      `INSERT INTO flows (${insertColumns.join(", ")})
       VALUES (${placeholders.join(", ")})
       RETURNING *`,
      insertValues
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
  isDefault?: boolean,
  isSystemFlow?: boolean,
  isActive?: boolean
) {
  await assertFlowStorageCompatibility();
  const flowJsonStr = JSON.stringify(flowJson || { nodes: [], edges: [] });
  const columns = await getFlowColumnSupport();
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    if (isDefault && columns.isDefault) {
      await client.query(
        "UPDATE flows SET is_default = false, updated_at = CURRENT_TIMESTAMP WHERE bot_id = $1 AND id <> $2",
        [botId, id]
      );
    }

    const updateClauses = [
      "flow_json = $1::jsonb",
      "flow_name = COALESCE($2, flow_name)",
    ];
    const updateValues: any[] = [flowJsonStr, flowName || null];

    if (columns.isDefault) {
      updateClauses.push("is_default = COALESCE($3, is_default)");
      updateValues.push(typeof isDefault === "boolean" ? isDefault : null);
    }

    if (columns.isSystemFlow) {
      updateClauses.push(`is_system_flow = COALESCE($${updateValues.length + 1}, is_system_flow)`);
      updateValues.push(typeof isSystemFlow === "boolean" ? isSystemFlow : null);
    }

    if (columns.isActive) {
      updateClauses.push(`is_active = COALESCE($${updateValues.length + 1}, is_active)`);
      updateValues.push(typeof isActive === "boolean" ? isActive : null);
    }

    updateValues.push(id, botId);
    const idIndex = updateValues.length - 1;
    const botIndex = updateValues.length;

    const res = await client.query(
      `UPDATE flows
      SET
         ${updateClauses.join(", ")},
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $${idIndex} AND bot_id = $${botIndex}
       RETURNING *`,
      updateValues
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

export async function patchFlowNode(
  flowId: string,
  nodeId: string,
  nextNode: any,
  nextFlowName?: string,
  requestId = "unknown"
) {
  await assertFlowStorageCompatibility();
  const client = await db.connect();

  try {
    console.info(`[NodeSave][Model][${requestId}] begin-transaction`, {
      flowId,
      nodeId,
      nodeType: nextNode?.type || null,
      label: nextNode?.data?.label || null,
    });
    await client.query("BEGIN");

    const existing = await client.query("SELECT * FROM flows WHERE id = $1 FOR UPDATE", [flowId]);
    const flow = existing.rows[0];
    if (!flow) {
      throw { status: 404, message: "Flow not found" };
    }

    const flowJson = flow?.flow_json && typeof flow.flow_json === "object" ? flow.flow_json : {};
    const nodes = Array.isArray(flowJson.nodes) ? [...flowJson.nodes] : [];
    const nodeIndex = nodes.findIndex((node: any) => String(node?.id || "") === String(nodeId));
    if (nodeIndex < 0) {
      throw { status: 404, message: "Node not found" };
    }

    console.info(`[NodeSave][Model][${requestId}] flow-row-locked`, {
      flowId,
      nodeId,
      nodeIndex,
      nodeCount: nodes.length,
    });

    const updatedNode = {
      ...nodes[nodeIndex],
      ...nextNode,
      id: String(nodeId),
    };

    nodes[nodeIndex] = updatedNode;
    const updatedFlowJson = {
      ...(flowJson && typeof flowJson === "object" ? flowJson : {}),
      nodes,
      edges: Array.isArray(flowJson.edges) ? flowJson.edges : [],
    };

    const updatedRes = await client.query(
      `UPDATE flows
       SET flow_json = $1::jsonb,
           flow_name = COALESCE($2, flow_name),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [JSON.stringify(updatedFlowJson), nextFlowName || null, flowId]
    );

    await client.query(
      `INSERT INTO flow_nodes (flow_id, node_id, node_type, node_label, node_data, position_x, position_y)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
       ON CONFLICT (flow_id, node_id) DO UPDATE SET
         node_type = EXCLUDED.node_type,
         node_label = EXCLUDED.node_label,
         node_data = EXCLUDED.node_data,
         position_x = EXCLUDED.position_x,
         position_y = EXCLUDED.position_y,
         updated_at = CURRENT_TIMESTAMP`,
      [
        flowId,
        String(updatedNode.id || nodeId),
        updatedNode.type,
        updatedNode.data?.label || null,
        JSON.stringify(updatedNode.data || {}),
        updatedNode.position?.x ?? null,
        updatedNode.position?.y ?? null,
      ]
    );

    await client.query("COMMIT");
    console.info(`[NodeSave][Model][${requestId}] commit-succeeded`, {
      flowId,
      nodeId,
      savedFlowId: updatedRes.rows[0]?.id || null,
      nodeType: updatedNode?.type || null,
    });
    return updatedRes.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`[NodeSave][Model][${requestId}] rollback`, {
      flowId,
      nodeId,
      error:
        error instanceof Error
          ? error.message
          : (error as any)?.message || String(error || "Unknown model patch error"),
    });
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
