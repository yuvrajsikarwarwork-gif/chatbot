import { query } from "../config/db";

interface WorkspaceMembershipInput {
  workspaceId: string;
  userId: string;
  role: string;
  status?: string;
  permissionsJson?: Record<string, unknown>;
  createdBy?: string | null;
}

export async function findWorkspaceMembership(workspaceId: string, userId: string) {
  const res = await query(
    `SELECT
       wm.*,
       COALESCE(wm.permissions_json, '{}'::jsonb) ||
       jsonb_build_object(
         'agent_scope',
         COALESCE(scope.agent_scope_json, '{}'::jsonb)
       ) AS permissions_json
     FROM workspace_memberships wm
     LEFT JOIN LATERAL (
       SELECT jsonb_build_object(
         'projectIds', COALESCE(to_jsonb(ARRAY_REMOVE(ARRAY_AGG(DISTINCT project_id::text), NULL)), '[]'::jsonb),
         'campaignIds', COALESCE(to_jsonb(ARRAY_REMOVE(ARRAY_AGG(DISTINCT campaign_id::text), NULL)), '[]'::jsonb),
         'platforms', COALESCE(to_jsonb(ARRAY_REMOVE(ARRAY_AGG(DISTINCT LOWER(platform)), NULL)), '[]'::jsonb),
         'channelIds', COALESCE(to_jsonb(ARRAY_REMOVE(ARRAY_AGG(DISTINCT channel_id::text), NULL)), '[]'::jsonb)
       ) AS agent_scope_json
       FROM agent_scope s
       WHERE s.workspace_id = wm.workspace_id
         AND s.user_id = wm.user_id
     ) scope ON true
     WHERE wm.workspace_id = $1
       AND wm.user_id = $2
     LIMIT 1`,
    [workspaceId, userId]
  );

  return res.rows[0];
}

export async function findWorkspaceMembershipsByUser(userId: string) {
  const res = await query(
    `SELECT wm.*, w.name AS workspace_name, w.status AS workspace_status, w.plan_id
     FROM workspace_memberships wm
     JOIN workspaces w ON w.id = wm.workspace_id
     WHERE wm.user_id = $1
       AND wm.status = 'active'
     ORDER BY
       CASE wm.role
         WHEN 'workspace_admin' THEN 0
         WHEN 'workspace_owner' THEN 0
         WHEN 'admin' THEN 0
         WHEN 'editor' THEN 1
         WHEN 'user' THEN 1
         WHEN 'agent' THEN 2
         WHEN 'viewer' THEN 3
         ELSE 4
       END,
       wm.created_at DESC`,
    [userId]
  );

  return res.rows;
}

export async function findWorkspaceMembers(workspaceId: string) {
  const res = await query(
    `SELECT
       wm.*,
       COALESCE(wm.permissions_json, '{}'::jsonb) ||
       jsonb_build_object(
         'agent_scope',
         COALESCE(scope.agent_scope_json, '{}'::jsonb)
       ) AS permissions_json,
       u.name,
       u.email,
       u.role AS global_role
     FROM workspace_memberships wm
     JOIN users u ON u.id = wm.user_id
     LEFT JOIN LATERAL (
       SELECT jsonb_build_object(
         'projectIds', COALESCE(to_jsonb(ARRAY_REMOVE(ARRAY_AGG(DISTINCT project_id::text), NULL)), '[]'::jsonb),
         'campaignIds', COALESCE(to_jsonb(ARRAY_REMOVE(ARRAY_AGG(DISTINCT campaign_id::text), NULL)), '[]'::jsonb),
         'platforms', COALESCE(to_jsonb(ARRAY_REMOVE(ARRAY_AGG(DISTINCT LOWER(platform)), NULL)), '[]'::jsonb),
         'channelIds', COALESCE(to_jsonb(ARRAY_REMOVE(ARRAY_AGG(DISTINCT channel_id::text), NULL)), '[]'::jsonb)
       ) AS agent_scope_json
       FROM agent_scope s
       WHERE s.workspace_id = wm.workspace_id
         AND s.user_id = wm.user_id
     ) scope ON true
     WHERE wm.workspace_id = $1
     ORDER BY
       CASE wm.role
         WHEN 'workspace_admin' THEN 0
         WHEN 'workspace_owner' THEN 0
         WHEN 'admin' THEN 0
         WHEN 'editor' THEN 1
         WHEN 'user' THEN 1
         WHEN 'agent' THEN 2
         WHEN 'viewer' THEN 3
         ELSE 4
       END,
       u.name ASC NULLS LAST,
       u.email ASC`,
    [workspaceId]
  );

  return res.rows;
}

export async function upsertWorkspaceMembership(input: WorkspaceMembershipInput) {
  const res = await query(
    `INSERT INTO workspace_memberships
       (workspace_id, user_id, role, status, permissions_json, created_by)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     ON CONFLICT (workspace_id, user_id)
     DO UPDATE SET
       role = EXCLUDED.role,
       status = EXCLUDED.status,
       permissions_json = EXCLUDED.permissions_json,
       updated_at = NOW()
     RETURNING *`,
    [
      input.workspaceId,
      input.userId,
      input.role,
      input.status || "active",
      JSON.stringify(input.permissionsJson || {}),
      input.createdBy || null,
    ]
  );

  return res.rows[0];
}
