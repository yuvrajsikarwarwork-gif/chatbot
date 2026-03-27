import { query } from "../config/db";

export async function createAgentSession(input: {
  userId: string;
  workspaceId?: string | null;
  projectId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const res = await query(
    `INSERT INTO agent_sessions (user_id, workspace_id, project_id, status, metadata)
     VALUES ($1, $2, $3, 'online', $4::jsonb)
     RETURNING *`,
    [input.userId, input.workspaceId || null, input.projectId || null, JSON.stringify(input.metadata || {})]
  );

  return res.rows[0];
}

export async function touchAgentSessionsForUser(
  userId: string,
  payload: {
    workspaceId?: string | null;
    projectId?: string | null;
    status?: "online" | "idle" | "offline";
  }
) {
  const res = await query(
    `UPDATE agent_sessions
     SET last_activity_at = NOW(),
         workspace_id = COALESCE($2, workspace_id),
         project_id = COALESCE($3, project_id),
         status = COALESCE($4, status),
         updated_at = NOW()
     WHERE user_id = $1
       AND logout_time IS NULL
     RETURNING *`,
    [userId, payload.workspaceId || null, payload.projectId || null, payload.status || null]
  );

  return res.rows;
}

export async function closeAgentSessionsForUser(userId: string) {
  const res = await query(
    `UPDATE agent_sessions
     SET logout_time = NOW(),
         status = 'offline',
         updated_at = NOW()
     WHERE user_id = $1
       AND logout_time IS NULL
     RETURNING *`,
    [userId]
  );

  return res.rows;
}

export async function upsertAgentActivity(input: {
  userId: string;
  workspaceId: string;
  projectId?: string | null;
  lastAction?: string | null;
  activeChats?: number;
  metadata?: Record<string, unknown>;
}) {
  const res = await query(
    `INSERT INTO agent_activity
       (user_id, workspace_id, project_id, last_action, last_activity_at, active_chats, idle_seconds, metadata)
     VALUES
       ($1, $2, $3, $4, NOW(), $5, 0, $6::jsonb)
     ON CONFLICT (user_id, workspace_id)
     DO UPDATE SET
       project_id = COALESCE(EXCLUDED.project_id, agent_activity.project_id),
       last_action = COALESCE(EXCLUDED.last_action, agent_activity.last_action),
       last_activity_at = NOW(),
       active_chats = EXCLUDED.active_chats,
       idle_seconds = 0,
       metadata = EXCLUDED.metadata,
       updated_at = NOW()
     RETURNING *`,
    [
      input.userId,
      input.workspaceId,
      input.projectId || null,
      input.lastAction || null,
      Number(input.activeChats || 0),
      JSON.stringify(input.metadata || {}),
    ]
  );

  return res.rows[0];
}

export async function listWorkspaceAgentPresence(
  workspaceId: string,
  projectId?: string | null,
  visibleProjectIds?: string[] | null
) {
  const params: Array<string | string[] | null> = [workspaceId];
  let projectClause = "";
  if (projectId) {
    params.push(projectId);
    projectClause = `AND COALESCE(aa.project_id, s.project_id) = $${params.length}`;
  } else if (Array.isArray(visibleProjectIds)) {
    if (visibleProjectIds.length === 0) {
      projectClause = `AND 1 = 0`;
    } else {
      params.push(visibleProjectIds);
      projectClause = `AND COALESCE(aa.project_id, s.project_id) = ANY($${params.length})`;
    }
  }

  const res = await query(
    `SELECT
       u.id AS user_id,
       u.name,
       u.email,
       COALESCE(MAX(s.status) FILTER (WHERE s.logout_time IS NULL), 'offline') AS session_status,
       MAX(s.login_time) FILTER (WHERE s.logout_time IS NULL) AS login_time,
       MAX(COALESCE(s.last_activity_at, aa.last_activity_at)) AS last_activity_at,
       COALESCE(MAX(aa.active_chats), 0) AS active_chats,
       COALESCE(MAX(aa.idle_seconds), 0) AS idle_seconds,
       MAX(aa.last_action) AS last_action
     FROM workspace_memberships wm
     JOIN users u ON u.id = wm.user_id
     LEFT JOIN agent_sessions s
       ON s.user_id = wm.user_id
      AND s.workspace_id = wm.workspace_id
      AND s.logout_time IS NULL
     LEFT JOIN agent_activity aa
       ON aa.user_id = wm.user_id
      AND aa.workspace_id = wm.workspace_id
     WHERE wm.workspace_id = $1
       AND wm.status = 'active'
       AND wm.role IN ('workspace_admin', 'workspace_owner', 'admin', 'agent')
       ${projectClause}
     GROUP BY u.id, u.name, u.email
     ORDER BY last_activity_at DESC NULLS LAST, u.name ASC NULLS LAST, u.email ASC`,
    params
  );

  return res.rows;
}
