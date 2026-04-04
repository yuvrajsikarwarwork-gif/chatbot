import { query } from "../config/db";

export interface ErrorHandlerResolution {
  targetFlowId: string;
  targetNodeId: string | null;
}

export class ErrorHandlerService {
  static async resolve(params: {
    workspaceId: string;
    flowId: string;
    nodeId?: string | null;
    errorType: string;
  }): Promise<ErrorHandlerResolution | null> {
    const workspaceId = String(params.workspaceId || "").trim();
    const flowId = String(params.flowId || "").trim();
    const errorType = String(params.errorType || "").trim().toUpperCase() || "ANY";
    const nodeId = String(params.nodeId || "").trim() || null;

    if (!workspaceId || !flowId) {
      return null;
    }

    const res = await query(
      `SELECT target_flow_id, target_node_id
       FROM error_handlers
       WHERE workspace_id = $1
         AND is_active = true
         AND (UPPER(TRIM(error_type)) = $2 OR UPPER(TRIM(error_type)) = 'ANY')
         AND (flow_id = $3 OR flow_id IS NULL)
         AND (($4::uuid IS NULL AND node_id IS NULL) OR node_id = $4 OR node_id IS NULL)
       ORDER BY
         CASE WHEN node_id IS NOT NULL THEN 0 ELSE 1 END,
         CASE WHEN flow_id IS NOT NULL THEN 0 ELSE 1 END,
         COALESCE(priority, 0) DESC,
         updated_at DESC,
         created_at DESC
       LIMIT 1`,
      [workspaceId, errorType, flowId, nodeId]
    );

    const row = res.rows[0];
    if (!row) {
      return null;
    }

    return {
      targetFlowId: String(row.target_flow_id || "").trim(),
      targetNodeId: row.target_node_id ? String(row.target_node_id).trim() : null,
    };
  }
}
