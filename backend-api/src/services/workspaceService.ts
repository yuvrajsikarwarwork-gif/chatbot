import { db, query } from "../config/db";
import { findPlanById } from "../models/planModel";
import { updateLatestWorkspaceSubscription } from "../models/subscriptionModel";
import {
  deleteSupportAccess,
  listSupportAccessByWorkspace,
  upsertSupportAccess,
} from "../models/supportAccessModel";
import {
  createSupportRequest,
  findSupportRequestById,
  listSupportRequestsByWorkspace,
  updateSupportRequestStatus,
} from "../models/supportRequestModel";
import { upsertWorkspaceMembership } from "../models/workspaceMembershipModel";
import {
  createWorkspace,
  findWorkspaceById,
  findWorkspacesByUser,
  updateWorkspace,
} from "../models/workspaceModel";
import { assertRecord } from "../utils/assertRecord";
import {
  assignWorkspaceMemberService,
  assertPlatformRoles,
  assertWorkspacePermission,
  listWorkspaceMembersService,
  WORKSPACE_PERMISSIONS,
} from "./workspaceAccessService";
import { logAuditSafe } from "./auditLogService";

function normalizeWorkspaceStatus(status?: string) {
  const value = String(status || "active").trim().toLowerCase();
  const allowed = new Set(["active", "inactive", "paused", "locked"]);
  if (!allowed.has(value)) {
    throw { status: 400, message: `Unsupported workspace status '${status}'` };
  }

  return value;
}

export async function listWorkspacesService(userId: string) {
  return findWorkspacesByUser(userId);
}

export async function getWorkspaceByIdService(workspaceId: string, userId: string) {
  return assertRecord(await findWorkspaceById(workspaceId, userId), "Workspace not found");
}

export async function createWorkspaceService(userId: string, payload: any) {
  await assertPlatformRoles(userId, ["super_admin", "developer"]);

  if (!payload.name) {
    throw { status: 400, message: "Workspace name is required" };
  }

  const ownerRes = await query(`SELECT id FROM users WHERE id = $1 LIMIT 1`, [
    payload.ownerUserId || userId,
  ]);
  if (!ownerRes.rows[0]) {
    throw { status: 404, message: "Workspace owner not found" };
  }

  const plan = await findPlanById(payload.planId || "starter");
  if (!plan) {
    throw { status: 404, message: "Plan not found" };
  }

  const workspace = await createWorkspace({
    name: payload.name,
    ownerUserId: payload.ownerUserId || userId,
    planId: payload.planId || "starter",
    status: normalizeWorkspaceStatus(payload.status),
  });

  await query(
    `INSERT INTO subscriptions (
       workspace_id,
       plan_id,
       billing_cycle,
       currency,
       price_amount,
       start_date,
       expiry_date,
       status,
       auto_renew
     )
     VALUES ($1, $2, 'monthly', 'INR', $3, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 day', 'active', true)
     ON CONFLICT DO NOTHING`,
    [
      workspace.id,
      plan.id,
      Number(plan.monthly_price_inr || 0),
    ]
  );

  await upsertWorkspaceMembership({
    workspaceId: workspace.id,
    userId: payload.ownerUserId || userId,
    role: "workspace_owner",
    status: "active",
    createdBy: payload.ownerUserId || userId,
  });

  await logAuditSafe({
    userId,
    workspaceId: workspace.id,
    action: "create",
    entity: "workspace",
    entityId: workspace.id,
    newData: workspace,
  });

  return workspace;
}

export async function updateWorkspaceService(id: string, userId: string, payload: any) {
  const existing = assertRecord(await findWorkspaceById(id, userId), "Workspace not found");
  await assertPlatformRoles(userId, ["super_admin", "developer"]);
  const updatePayload: Record<string, unknown> = {};

  if (payload.name !== undefined) updatePayload.name = payload.name;
  if (payload.planId !== undefined) {
    const plan = await findPlanById(payload.planId);
    if (!plan) {
      throw { status: 404, message: "Plan not found" };
    }
    updatePayload.planId = payload.planId;
  }
  if (payload.status !== undefined) {
    updatePayload.status = normalizeWorkspaceStatus(payload.status);
  }
  if (payload.lockReason !== undefined) {
    updatePayload.lockReason = payload.lockReason;
  }

  const updated = await updateWorkspace(id, userId, updatePayload);
  await logAuditSafe({
    userId,
    workspaceId: id,
    action: "update",
    entity: "workspace",
    entityId: id,
    oldData: existing,
    newData: updated || {},
  });
  return updated;
}

function normalizeSubscriptionStatus(status?: string) {
  const value = String(status || "").trim().toLowerCase();
  const allowed = new Set([
    "active",
    "trialing",
    "overdue",
    "expired",
    "canceled",
    "locked",
  ]);
  if (!allowed.has(value)) {
    throw { status: 400, message: `Unsupported subscription status '${status}'` };
  }

  return value;
}

export async function updateWorkspaceBillingService(
  workspaceId: string,
  userId: string,
  payload: any
) {
  const workspace = assertRecord(
    await findWorkspaceById(workspaceId, userId),
    "Workspace not found"
  );
  await assertPlatformRoles(userId, ["super_admin", "developer"]);

  const subscriptionUpdate: Record<string, unknown> = {};
  if (payload.subscriptionStatus !== undefined) {
    subscriptionUpdate.status = normalizeSubscriptionStatus(payload.subscriptionStatus);
  }
  if (payload.billingCycle !== undefined) {
    subscriptionUpdate.billingCycle = payload.billingCycle;
  }
  if (payload.currency !== undefined) {
    subscriptionUpdate.currency = payload.currency;
  }
  if (payload.priceAmount !== undefined) {
    subscriptionUpdate.priceAmount = Number(payload.priceAmount);
  }
  if (payload.expiryDate !== undefined) {
    subscriptionUpdate.expiryDate = payload.expiryDate || null;
  }
  if (payload.gracePeriodEnd !== undefined) {
    subscriptionUpdate.gracePeriodEnd = payload.gracePeriodEnd || null;
  }
  if (payload.autoRenew !== undefined) {
    subscriptionUpdate.autoRenew = Boolean(payload.autoRenew);
  }
  if (payload.metadata !== undefined) {
    subscriptionUpdate.metadata = payload.metadata;
  }
  if (payload.lockAt !== undefined) {
    subscriptionUpdate.lockAt = payload.lockAt || null;
  }

  const subscription = await updateLatestWorkspaceSubscription(workspaceId, subscriptionUpdate);
  if (!subscription) {
    throw { status: 404, message: "Workspace subscription not found" };
  }

  if (payload.workspaceStatus !== undefined || payload.lockReason !== undefined) {
    const workspaceUpdate: Record<string, unknown> = {};
    if (payload.workspaceStatus !== undefined) {
      workspaceUpdate.status = normalizeWorkspaceStatus(payload.workspaceStatus);
    }
    if (payload.lockReason !== undefined) {
      workspaceUpdate.lockReason = payload.lockReason;
    }

    await updateWorkspace(workspaceId, userId, {
      ...workspaceUpdate,
    });
  }

  const updatedWorkspace = assertRecord(await findWorkspaceById(workspaceId, userId), "Workspace not found");
  await logAuditSafe({
    userId,
    workspaceId,
    action: "update_billing",
    entity: "workspace_subscription",
    entityId: workspaceId,
    oldData: workspace,
    newData: {
      subscription,
      workspace: updatedWorkspace,
    },
  });
  return updatedWorkspace;
}

export async function lockWorkspaceService(
  workspaceId: string,
  userId: string,
  payload: { reason?: string; subscriptionStatus?: string; lockAt?: string | null }
) {
  return updateWorkspaceBillingService(workspaceId, userId, {
    subscriptionStatus: payload.subscriptionStatus || "locked",
    workspaceStatus: "locked",
    lockReason: payload.reason || "Locked by workspace admin",
    lockAt: payload.lockAt === undefined ? new Date().toISOString() : payload.lockAt,
  });
}

export async function unlockWorkspaceService(
  workspaceId: string,
  userId: string,
  payload: { subscriptionStatus?: string; gracePeriodEnd?: string | null } = {}
) {
  return updateWorkspaceBillingService(workspaceId, userId, {
    subscriptionStatus: payload.subscriptionStatus || "active",
    workspaceStatus: "active",
    lockReason: "",
    lockAt: null,
    gracePeriodEnd:
      payload.gracePeriodEnd === undefined ? null : payload.gracePeriodEnd,
  });
}

export async function assignUserWorkspaceService(
  workspaceId: string,
  userId: string,
  payload: { userId?: string; email?: string; role?: string; status?: string }
) {
  assertRecord(await findWorkspaceById(workspaceId, userId), "Workspace not found");
  return assignWorkspaceMemberService(workspaceId, userId, payload);
}

export async function removeUserWorkspaceService(
  workspaceId: string,
  actorUserId: string,
  targetUserId: string
) {
  assertRecord(await findWorkspaceById(workspaceId, actorUserId), "Workspace not found");
  await assertWorkspacePermission(
    actorUserId,
    workspaceId,
    WORKSPACE_PERMISSIONS.manageUsers
  );

  const existingMembership = await query(
    `SELECT *
     FROM workspace_memberships
     WHERE workspace_id = $1
       AND user_id = $2
     LIMIT 1`,
    [workspaceId, targetUserId]
  );
  const membership = existingMembership.rows[0];
  if (!membership) {
    throw { status: 404, message: "Workspace member not found" };
  }

  if (String(membership.role || "") === "workspace_owner") {
    throw { status: 409, message: "Workspace owner cannot be removed from the workspace" };
  }

  if (actorUserId === targetUserId) {
    throw { status: 409, message: "Use another workspace admin to remove this account" };
  }

  await db.query(
    `DELETE FROM project_users
     WHERE workspace_id = $1
       AND user_id = $2`,
    [workspaceId, targetUserId]
  );
  await db.query(
    `DELETE FROM user_project_access
     WHERE workspace_id = $1
       AND user_id = $2`,
    [workspaceId, targetUserId]
  );
  await db.query(
    `DELETE FROM agent_scope
     WHERE workspace_id = $1
       AND user_id = $2`,
    [workspaceId, targetUserId]
  );
  await db.query(
    `DELETE FROM user_permissions
     WHERE workspace_id = $1
       AND user_id = $2`,
    [workspaceId, targetUserId]
  );

  const deleted = await db.query(
    `DELETE FROM workspace_memberships
     WHERE workspace_id = $1
       AND user_id = $2
     RETURNING *`,
    [workspaceId, targetUserId]
  );

  await logAuditSafe({
    userId: actorUserId,
    workspaceId,
    action: "delete",
    entity: "workspace_member",
    entityId: targetUserId,
    oldData: membership,
    newData: {
      removed: Boolean(deleted.rows[0]),
    },
  });

  return deleted.rows[0] || membership;
}

export async function listWorkspaceMembersForUserService(
  workspaceId: string,
  userId: string
) {
  return listWorkspaceMembersService(workspaceId, userId);
}

export async function listWorkspaceSupportAccessService(workspaceId: string, userId: string) {
  assertRecord(await findWorkspaceById(workspaceId, userId), "Workspace not found");
  await assertWorkspaceMembershipOrPlatformOperator(userId, workspaceId);
  return listSupportAccessByWorkspace(workspaceId);
}

async function assertWorkspaceMembershipOrPlatformOperator(userId: string, workspaceId: string) {
  try {
    return await assertWorkspacePermission(userId, workspaceId, WORKSPACE_PERMISSIONS.manageWorkspace);
  } catch {
    await assertPlatformRoles(userId, ["super_admin", "developer"]);
    return null;
  }
}

export async function listWorkspaceSupportRequestsService(workspaceId: string, userId: string) {
  assertRecord(await findWorkspaceById(workspaceId, userId), "Workspace not found");
  await assertWorkspaceMembershipOrPlatformOperator(userId, workspaceId);
  return listSupportRequestsByWorkspace(workspaceId);
}

export async function createWorkspaceSupportRequestService(
  workspaceId: string,
  userId: string,
  payload: { targetUserId?: string; reason?: string; requestedExpiresAt?: string }
) {
  assertRecord(await findWorkspaceById(workspaceId, userId), "Workspace not found");
  await assertWorkspaceMembershipOrPlatformOperator(userId, workspaceId);

  const reason = String(payload.reason || "").trim();
  if (!reason) {
    throw { status: 400, message: "reason is required" };
  }

  const request = await createSupportRequest({
    workspaceId,
    requestedBy: userId,
    targetUserId: String(payload.targetUserId || "").trim() || null,
    reason,
    requestedExpiresAt: payload.requestedExpiresAt || null,
  });
  await logAuditSafe({
    userId,
    workspaceId,
    action: "create",
    entity: "support_request",
    entityId: request.id,
    newData: request,
  });
  return request;
}

export async function approveWorkspaceSupportRequestService(
  workspaceId: string,
  requestId: string,
  userId: string,
  payload: { expiresAt?: string; durationHours?: number; targetUserId?: string; resolutionNotes?: string }
) {
  assertRecord(await findWorkspaceById(workspaceId, userId), "Workspace not found");
  await assertPlatformRoles(userId, ["super_admin", "developer"]);

  const request = assertRecord(await findSupportRequestById(requestId), "Support request not found");
  if (request.workspace_id !== workspaceId) {
    throw { status: 400, message: "Support request does not belong to this workspace" };
  }
  if (request.status !== "open") {
    throw { status: 409, message: "Support request is no longer open" };
  }

  const targetUserId = String(payload.targetUserId || request.target_user_id || userId).trim();
  const durationHours = Math.max(1, Number(payload.durationHours || 24));
  const expiresAt =
    payload.expiresAt ||
    request.requested_expires_at ||
    new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();

  const granted = await upsertSupportAccess({
    workspaceId,
    userId: targetUserId,
    grantedBy: request.requested_by,
    reason: request.reason,
    expiresAt,
  });
  const resolved = await updateSupportRequestStatus({
    id: requestId,
    status: "approved",
    resolvedBy: userId,
    resolutionNotes: payload.resolutionNotes || null,
  });
  await logAuditSafe({
    userId,
    workspaceId,
    action: "approve",
    entity: "support_request",
    entityId: requestId,
    oldData: request,
    newData: {
      supportRequest: resolved,
      supportAccess: granted,
    },
  });
  return {
    request: resolved,
    supportAccess: granted,
  };
}

export async function denyWorkspaceSupportRequestService(
  workspaceId: string,
  requestId: string,
  userId: string,
  payload: { resolutionNotes?: string } = {}
) {
  assertRecord(await findWorkspaceById(workspaceId, userId), "Workspace not found");
  await assertPlatformRoles(userId, ["super_admin", "developer"]);

  const request = assertRecord(await findSupportRequestById(requestId), "Support request not found");
  if (request.workspace_id !== workspaceId) {
    throw { status: 400, message: "Support request does not belong to this workspace" };
  }
  if (request.status !== "open") {
    throw { status: 409, message: "Support request is no longer open" };
  }

  const resolved = await updateSupportRequestStatus({
    id: requestId,
    status: "denied",
    resolvedBy: userId,
    resolutionNotes: payload.resolutionNotes || null,
  });
  await logAuditSafe({
    userId,
    workspaceId,
    action: "deny",
    entity: "support_request",
    entityId: requestId,
    oldData: request,
    newData: resolved || {},
  });
  return resolved;
}

export async function grantWorkspaceSupportAccessService(
  workspaceId: string,
  userId: string,
  payload: { userId?: string; expiresAt?: string; durationHours?: number; reason?: string }
) {
  assertRecord(await findWorkspaceById(workspaceId, userId), "Workspace not found");
  await assertPlatformRoles(userId, ["super_admin", "developer"]);

  const targetUserId = String(payload.userId || "").trim();
  if (!targetUserId) {
    throw { status: 400, message: "userId is required" };
  }

  const durationHours = Math.max(1, Number(payload.durationHours || 24));
  const expiresAt =
    payload.expiresAt ||
    new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();

  const granted = await upsertSupportAccess({
    workspaceId,
    userId: targetUserId,
    grantedBy: userId,
    reason: payload.reason || "Workspace support access granted by owner/admin",
    expiresAt,
  });
  await logAuditSafe({
    userId,
    workspaceId,
    action: "grant_support_access",
    entity: "support_access",
    entityId: `${workspaceId}:${targetUserId}`,
    newData: granted,
  });
  return granted;
}

export async function revokeWorkspaceSupportAccessService(
  workspaceId: string,
  userId: string,
  targetUserId: string
) {
  assertRecord(await findWorkspaceById(workspaceId, userId), "Workspace not found");
  await assertPlatformRoles(userId, ["super_admin", "developer"]);
  const revoked = await deleteSupportAccess(workspaceId, targetUserId);
  await logAuditSafe({
    userId,
    workspaceId,
    action: "revoke_support_access",
    entity: "support_access",
    entityId: `${workspaceId}:${targetUserId}`,
    oldData: revoked || {},
  });
  return revoked;
}

export async function deleteWorkspaceService(workspaceId: string, userId: string) {
  assertRecord(await findWorkspaceById(workspaceId, userId), "Workspace not found");
  await assertPlatformRoles(userId, ["super_admin", "developer"]);

  const dependencyRes = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM bots WHERE workspace_id = $1) AS bot_count,
       (SELECT COUNT(*)::int FROM flows f JOIN bots b ON b.id = f.bot_id WHERE b.workspace_id = $1) AS flow_count,
       (SELECT COUNT(*)::int FROM campaigns WHERE workspace_id = $1) AS campaign_count,
       (SELECT COUNT(*)::int FROM platform_accounts WHERE workspace_id = $1) AS platform_account_count,
       (SELECT COUNT(*)::int FROM conversations WHERE workspace_id = $1) AS conversation_count`,
    [workspaceId]
  );

  const dependency = dependencyRes.rows[0];
  const blockingCount = Number(dependency?.bot_count || 0)
    + Number(dependency?.flow_count || 0)
    + Number(dependency?.campaign_count || 0)
    + Number(dependency?.platform_account_count || 0)
    + Number(dependency?.conversation_count || 0);

  if (blockingCount > 0) {
    throw {
      status: 409,
      message:
        "Workspace cannot be deleted while bots, flows, campaigns, integrations, or conversations still exist.",
    };
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM project_users WHERE workspace_id = $1`, [workspaceId]);
    await client.query(`DELETE FROM user_project_access WHERE workspace_id = $1`, [workspaceId]);
    await client.query(
      `DELETE FROM project_settings
       WHERE project_id IN (SELECT id FROM projects WHERE workspace_id = $1)`,
      [workspaceId]
    );
    await client.query(`DELETE FROM projects WHERE workspace_id = $1`, [workspaceId]);
    await client.query(`DELETE FROM workspace_memberships WHERE workspace_id = $1`, [workspaceId]);
    await client.query(`DELETE FROM subscriptions WHERE workspace_id = $1`, [workspaceId]);
    const deleted = await client.query(
      `DELETE FROM workspaces
       WHERE id = $1
       RETURNING *`,
      [workspaceId]
    );
    await client.query("COMMIT");
    await logAuditSafe({
      userId,
      workspaceId,
      action: "delete",
      entity: "workspace",
      entityId: workspaceId,
      oldData: deleted.rows[0] || {},
    });
    return deleted.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
