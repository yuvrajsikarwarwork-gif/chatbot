import bcrypt from "bcryptjs";
import axios from "axios";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { db, query } from "../config/db";
import { createAuthToken, findAuthTokenByHash, markAuthTokenUsed, revokeActiveAuthTokensForUser } from "../models/authTokenModel";
import { env } from "../config/env";
import { getBillingWalletCheckoutSecretsService } from "./platformSettingsService";
import { getUserPlatformRole, resolveWorkspaceMembership } from "./workspaceAccessService";
import { findPlanById } from "../models/planModel";
import {
  createBillingSubscription,
  findCurrentBillingSubscriptionByWorkspace,
  updateBillingSubscription,
} from "../models/billingSubscriptionModel";
import {
  deleteSupportAccess,
  findActiveSupportAccess,
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
import { findWorkspaceMembership } from "../models/workspaceMembershipModel";
import {
  createWorkspace,
  findWorkspaceById,
  findWorkspacesByUser,
  updateWorkspace,
} from "../models/workspaceModel";
import { findUserByEmail, findUserById } from "../models/userModel";
import { assertRecord } from "../utils/assertRecord";
import {
  assignWorkspaceMemberService,
  assertPlatformRoles,
  isPlatformInternalOperator,
  assertWorkspacePermission,
  listWorkspaceMembersService,
  WORKSPACE_PERMISSIONS,
} from "./workspaceAccessService";
import { logAuditSafe } from "./auditLogService";
import {
  assertOrganizationAccessService,
  isOrganizationSchemaAvailable,
} from "./organizationService";
import { getWorkspaceWalletSummary } from "./walletService";
import { createWalletAdjustment } from "./walletService";
import { ingestDocumentEmbeddings } from "./documentIngestionService";
import { retrieveKnowledgeForWorkspace } from "./ragService";
import { repairWhatsAppContactDuplicates } from "./contactMergeService";
import { createWorkspaceInviteService } from "./inviteService";
import { notifyPlatformOperators } from "./notificationService";
import { sendPasswordResetOtpEmail, sendTransactionalEmail } from "./mailService";
import {
  recordWorkspaceUsage,
  resolveWorkspacePlanLimit,
  syncWorkspaceSeatQuantity,
} from "./billingService";
import { revokeRemotePlatformConnectionService } from "./integrationService";

function normalizeWorkspaceStatus(status?: string) {
  const value = String(status || "active").trim().toLowerCase();
  const allowed = new Set([
    "active",
    "inactive",
    "paused",
    "locked",
    "suspended",
    "archived",
    "past_due",
    "canceled",
  ]);
  if (!allowed.has(value)) {
    throw { status: 400, message: `Unsupported workspace status '${status}'` };
  }

  return value;
}

function normalizeBillingCycle(value?: string) {
  const normalized = String(value || "monthly").trim().toLowerCase();
  if (!["monthly", "yearly"].includes(normalized)) {
    throw { status: 400, message: `Unsupported billing cycle '${value}'` };
  }

  return normalized;
}

function normalizeLimitOverride(value: unknown, label: string) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === "") {
    return null;
  }

  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0 || !Number.isInteger(next)) {
    throw { status: 400, message: `${label} must be a positive whole number or blank` };
  }

  return next;
}

function normalizeCurrency(value?: string) {
  return String(value || "INR").trim().toUpperCase() || "INR";
}

function resolveBasePlanPrice(plan: any, billingCycle: string, currency: string) {
  const normalizedCurrency = normalizeCurrency(currency);
  if (normalizedCurrency === "USD") {
    return Number(
      billingCycle === "yearly" ? plan?.yearly_price_usd || 0 : plan?.monthly_price_usd || 0
    );
  }

  return Number(
    billingCycle === "yearly" ? plan?.yearly_price_inr || 0 : plan?.monthly_price_inr || 0
  );
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function getPublicApiBaseUrl() {
  return String(env.PUBLIC_API_BASE_URL || `http://localhost:${env.PORT || 4000}`).replace(/\/$/, "");
}

function getWorkspaceExportDirectory() {
  return path.resolve(process.cwd(), "uploads", "exports");
}

function buildWorkspaceExportDownloadUrl(token: string) {
  return `${getPublicApiBaseUrl()}/api/auth/workspace-export?token=${encodeURIComponent(token)}`;
}

function stripeAuthHeaders(secretKey: string) {
  return {
    auth: {
      username: secretKey,
      password: "",
    },
  };
}

async function updateStripeSubscriptionCollectionState(
  subscriptionId: string,
  mode: "pause" | "resume" | "cancel"
) {
  const billing = await getBillingWalletCheckoutSecretsService();
  const secretKey = String(billing.stripe.secretKey || "").trim();
  if (!secretKey) {
    throw { status: 409, message: "Stripe live keys are not configured" };
  }

  const trimmedSubscriptionId = String(subscriptionId || "").trim();
  if (!trimmedSubscriptionId) {
    return { skipped: true };
  }

  const baseUrl = `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(trimmedSubscriptionId)}`;
  if (mode === "cancel") {
    await axios.delete(baseUrl, stripeAuthHeaders(secretKey));
    return { skipped: false, mode };
  }

  const body = new URLSearchParams();
  if (mode === "pause") {
    body.set("pause_collection[behavior]", "void");
  } else {
    body.set("pause_collection", "");
  }

  await axios.post(baseUrl, body.toString(), {
    ...stripeAuthHeaders(secretKey),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  return { skipped: false, mode };
}

async function assertDestructiveActionRateLimit(input: {
  userId: string;
  workspaceId: string;
  actionKey: string;
  limit: number;
  windowMinutes: number;
}) {
  const res = await query(
    `SELECT COUNT(*)::int AS total
     FROM audit_logs
     WHERE workspace_id = $1
       AND COALESCE(actor_user_id, user_id) = $2
       AND entity = 'workspace'
       AND action = $3
       AND created_at >= NOW() - ($4::text || ' minutes')::interval`,
    [input.workspaceId, input.userId, input.actionKey, String(input.windowMinutes)]
  ).catch(() => ({ rows: [{ total: 0 }] }));

  const total = Number(res.rows[0]?.total || 0);
  if (total >= input.limit) {
    throw {
      status: 429,
      message: `Too many destructive workspace actions in a short period. Try again in ${input.windowMinutes} minutes.`,
    };
  }
}

function sanitizeExportPlatformAccount(account: Record<string, any>) {
  return {
    ...account,
    token: null,
  };
}

function escapeCsvValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildCsv(rows: Record<string, any>[]) {
  if (!rows.length) {
    return "";
  }
  const headerSet = rows.reduce<Set<string>>((acc, row) => {
    Object.keys(row || {}).forEach((key) => acc.add(key));
    return acc;
  }, new Set<string>());
  const headers = [...headerSet];
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(row?.[header])).join(",")),
  ];
  return lines.join("\n");
}

function dedupeRowsByWorkspaceId(rows: any[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const id = String(row?.id || "").trim();
    if (!id) {
      return false;
    }
    if (seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
}

async function assertWorkspaceRecoveryAccess(userId: string, workspaceId: string) {
  const platformRole = await getUserPlatformRole(userId);
  if (platformRole === "super_admin" || platformRole === "developer") {
    return;
  }

  const membership = await resolveWorkspaceMembership(userId, workspaceId);
  if (!membership || String(membership.status || "").toLowerCase() !== "active") {
    throw { status: 403, message: "Forbidden" };
  }

  const role = String(membership.role || "").toLowerCase();
  if (!["workspace_admin", "workspace_owner", "admin"].includes(role)) {
    throw { status: 403, message: "Only workspace admins can restore scheduled accounts." };
  }
}

async function assertWorkspaceExportAccess(userId: string, workspaceId: string) {
  try {
    await assertWorkspacePermission(userId, workspaceId, WORKSPACE_PERMISSIONS.exportData);
    return;
  } catch {}

  await assertWorkspaceRecoveryAccess(userId, workspaceId);
}

export async function listWorkspacesService(userId: string) {
    const rows = dedupeRowsByWorkspaceId(await findWorkspacesByUser(userId));
  const platformOperator = await isPlatformInternalOperator(userId);
  const workspaceIds = rows.map((row: any) => String(row?.id || "").trim()).filter(Boolean);
  const supportAccessIds = new Set<string>();
  const openRequestIds = new Set<string>();
  if (workspaceIds.length) {
    const [supportAccessRes, openRequestRes] = await Promise.all([
      query(
        `SELECT DISTINCT workspace_id::text AS workspace_id
         FROM support_access
         WHERE user_id = $1
           AND workspace_id = ANY($2::uuid[])
           AND expires_at > NOW()`,
        [userId, workspaceIds]
      ).catch(() => ({ rows: [] })),
      query(
        `SELECT DISTINCT workspace_id::text AS workspace_id
         FROM support_requests
         WHERE workspace_id = ANY($1::uuid[])
           AND status = 'open'`,
        [workspaceIds]
      ).catch(() => ({ rows: [] })),
    ]);

    (supportAccessRes.rows || []).forEach((row: any) => {
      const workspaceId = String(row?.workspace_id || "").trim();
      if (workspaceId) {
        supportAccessIds.add(workspaceId);
      }
    });
    (openRequestRes.rows || []).forEach((row: any) => {
      const workspaceId = String(row?.workspace_id || "").trim();
      if (workspaceId) {
        openRequestIds.add(workspaceId);
      }
    });
  }

  return rows.map((row: any) => ({
    ...sanitizeWorkspaceBillingFields(row, platformOperator),
    accessGranted:
      supportAccessIds.has(String(row?.id || "").trim()) ||
      openRequestIds.has(String(row?.id || "").trim()),
    support_access_granted:
      supportAccessIds.has(String(row?.id || "").trim()) ||
      openRequestIds.has(String(row?.id || "").trim()),
  }));
}

export async function listWorkspaceHistoryService(userId: string) {
  await assertPlatformRoles(userId, ["super_admin", "developer"]);

  const res = await query(
    `SELECT
       w.*,
       owner.name AS owner_name,
       owner.email AS owner_email,
       bs.id::text AS subscription_id,
       bs.status AS subscription_status,
       bs.current_period_end AS expiry_date,
       NULL::timestamptz AS grace_period_end,
       bs.billing_cycle AS billing_cycle,
       bs.currency AS currency,
       bs.base_price_amount AS price_amount,
       (bs.canceled_at IS NULL) AS auto_renew,
       COALESCE(bs.plan_id, w.plan_id) AS effective_plan_id,
       p.name AS subscription_plan_name,
       bs.seat_quantity,
       bs.included_seat_limit,
       bs.extra_seat_quantity,
       bs.extra_seat_unit_price,
       bs.ai_reply_limit,
       bs.ai_overage_unit_price,
       bs.wallet_auto_topup_enabled,
       bs.wallet_auto_topup_amount,
       bs.wallet_low_balance_threshold,
       bs.external_customer_ref,
       bs.external_subscription_ref,
       bs.current_period_start,
       bs.current_period_end,
       bs.trial_ends_at,
       bs.canceled_at,
       bs.metadata AS billing_metadata,
       CASE
         WHEN w.deleted_at IS NOT NULL
          AND COALESCE(w.purge_after, w.deleted_at + INTERVAL '30 days') > NOW()
           THEN true
         WHEN w.deleted_at IS NULL
           THEN true
         ELSE false
       END AS restore_available,
       CASE
         WHEN w.deleted_at IS NOT NULL
          AND COALESCE(w.purge_after, w.deleted_at + INTERVAL '30 days') <= NOW()
           THEN true
         ELSE false
       END AS purge_expired,
       GREATEST(
         0,
         CEIL(
           EXTRACT(
             EPOCH FROM (
               COALESCE(w.purge_after, w.deleted_at + INTERVAL '30 days') - NOW()
             )
           ) / 86400.0
         )
       )::int AS purge_days_remaining
     FROM workspaces w
     LEFT JOIN users owner ON owner.id = w.owner_user_id
     LEFT JOIN LATERAL (
       SELECT *
       FROM billing_subscriptions bs
       WHERE bs.workspace_id = w.id
       ORDER BY bs.created_at DESC
       LIMIT 1
     ) bs ON true
     LEFT JOIN plans p ON p.id = COALESCE(bs.plan_id, w.plan_id)
     WHERE w.deleted_at IS NOT NULL
        OR LOWER(COALESCE(w.status, '')) IN ('archived', 'suspended', 'locked', 'past_due', 'canceled')
     ORDER BY COALESCE(w.deleted_at, w.archived_at, w.updated_at, w.created_at) DESC`
  );

  const workspaceIds = res.rows.map((row: any) => String(row?.id || "").trim()).filter(Boolean);
  const supportAccessIds = new Set<string>();
  const openRequestIds = new Set<string>();
  if (workspaceIds.length) {
    const [supportAccessRes, openRequestRes] = await Promise.all([
      query(
        `SELECT DISTINCT workspace_id::text AS workspace_id
         FROM support_access
         WHERE user_id = $1
           AND workspace_id = ANY($2::uuid[])
           AND expires_at > NOW()`,
        [userId, workspaceIds]
      ).catch(() => ({ rows: [] })),
      query(
        `SELECT DISTINCT workspace_id::text AS workspace_id
         FROM support_requests
         WHERE workspace_id = ANY($1::uuid[])
           AND status = 'open'`,
        [workspaceIds]
      ).catch(() => ({ rows: [] })),
    ]);

    (supportAccessRes.rows || []).forEach((row: any) => {
      const workspaceId = String(row?.workspace_id || "").trim();
      if (workspaceId) {
        supportAccessIds.add(workspaceId);
      }
    });
    (openRequestRes.rows || []).forEach((row: any) => {
      const workspaceId = String(row?.workspace_id || "").trim();
      if (workspaceId) {
        openRequestIds.add(workspaceId);
      }
    });
  }

    return dedupeRowsByWorkspaceId(res.rows).map((row: any) => ({
      ...sanitizeWorkspaceBillingFields(row, true),
      accessGranted:
        supportAccessIds.has(String(row?.id || "").trim()) ||
      openRequestIds.has(String(row?.id || "").trim()),
    support_access_granted:
      supportAccessIds.has(String(row?.id || "").trim()) ||
      openRequestIds.has(String(row?.id || "").trim()),
  }));
}

export async function getWorkspaceByIdService(workspaceId: string, userId: string) {
  const workspace = assertRecord(await findWorkspaceById(workspaceId, userId), "Workspace not found");
  return sanitizeWorkspaceFields(workspace, await isPlatformInternalOperator(userId));
}

function sanitizeWorkspaceFields<T extends Record<string, any>>(workspace: T, canViewInternal: boolean): T {
  const clone: Record<string, any> = { ...workspace };
  if (!canViewInternal) {
    clone.admin_notes = null;
  }

  return sanitizeWorkspaceBillingFields(clone as T, canViewInternal);
}

function sanitizeWorkspaceBillingFields<T extends Record<string, any>>(workspace: T, canViewBilling: boolean): T {
  if (canViewBilling) {
    return workspace;
  }

  const clone: Record<string, any> = { ...workspace };
  const sensitiveKeys = [
    "subscription_id",
    "subscription_status",
    "expiry_date",
    "grace_period_end",
    "billing_cycle",
    "currency",
    "price_amount",
    "auto_renew",
    "subscription_plan_name",
    "seat_quantity",
    "included_seat_limit",
    "extra_seat_quantity",
    "extra_seat_unit_price",
    "ai_reply_limit",
    "ai_overage_unit_price",
    "wallet_auto_topup_enabled",
    "wallet_auto_topup_amount",
    "wallet_low_balance_threshold",
    "external_customer_ref",
    "external_subscription_ref",
    "current_period_start",
    "current_period_end",
    "trial_ends_at",
    "canceled_at",
    "billing_metadata",
  ];

  for (const key of sensitiveKeys) {
    if (key in clone) {
      clone[key] = null;
    }
  }

  return clone as T;
}

export async function getWorkspaceOverviewService(workspaceId: string, userId: string) {
  const canViewBilling = await isPlatformInternalOperator(userId);
  const workspace = assertRecord(await findWorkspaceById(workspaceId, userId), "Workspace not found");
  await assertWorkspacePermission(userId, workspaceId, WORKSPACE_PERMISSIONS.viewWorkspace);

  const [countsRes, walletSummary, supportRequests, supportGrant] = await Promise.all([
    query(
      `SELECT
         (SELECT COUNT(*)::int FROM workspace_memberships WHERE workspace_id = $1 AND status = 'active') AS member_count,
         (SELECT COUNT(*)::int FROM projects WHERE workspace_id = $1 AND deleted_at IS NULL) AS project_count,
         (SELECT COUNT(*)::int FROM bots WHERE workspace_id = $1 AND deleted_at IS NULL) AS bot_count,
         (SELECT COUNT(*)::int
            FROM flows f
            JOIN bots b ON b.id = f.bot_id
           WHERE b.workspace_id = $1
             AND COALESCE(f.is_active, true) = true
             AND COALESCE(f.is_system_flow, false) = false) AS flow_count,
         (SELECT COUNT(*)::int FROM campaigns WHERE workspace_id = $1 AND deleted_at IS NULL) AS campaign_count,
         (SELECT COUNT(*)::int FROM platform_accounts WHERE workspace_id = $1) AS platform_account_count,
         (SELECT COUNT(*)::int FROM conversations WHERE workspace_id = $1 AND deleted_at IS NULL) AS conversation_count,
         (SELECT COUNT(*)::int FROM conversations WHERE workspace_id = $1 AND deleted_at IS NULL AND status IN ('active', 'agent_pending')) AS open_conversation_count,
         (SELECT COUNT(*)::int FROM leads WHERE workspace_id = $1 AND deleted_at IS NULL) AS lead_count,
         (SELECT COUNT(*)::int FROM support_requests WHERE workspace_id = $1 AND status = 'open') AS open_support_request_count,
         (SELECT COUNT(*)::int FROM support_access WHERE workspace_id = $1 AND expires_at > NOW()) AS active_support_access_count`,
      [workspaceId]
    ),
    (canViewBilling
      ? getWorkspaceWalletSummary({ workspaceId, limit: 5 })
      : Promise.resolve({
          enabled: false,
          balance: 0,
          totalCredits: 0,
          totalDebits: 0,
          recentTransactions: [],
        })
    ).catch(() => ({
      enabled: false,
      balance: 0,
      totalCredits: 0,
      totalDebits: 0,
      recentTransactions: [],
    })),
    listSupportRequestsByWorkspace(workspaceId).catch(() => []),
    findActiveSupportAccess(workspaceId, userId).catch(() => null),
  ]);

  const counts = countsRes.rows[0] || {};
  const limits = {
    users:
      resolveWorkspacePlanLimit(workspace as any, workspace as any, workspace as any, "agent_seat_limit", null) ||
      Number((workspace as any).max_users || 0) ||
      null,
    projects:
      resolveWorkspacePlanLimit(workspace as any, workspace as any, workspace as any, "project_limit", null) ||
      Number((workspace as any).max_projects || 0) ||
      null,
    campaigns:
      resolveWorkspacePlanLimit(workspace as any, workspace as any, workspace as any, "monthly_campaign_limit", null) ||
      Number((workspace as any).max_campaigns || 0) ||
      null,
    integrations:
      resolveWorkspacePlanLimit(workspace as any, workspace as any, workspace as any, "max_numbers", null) ||
      Number((workspace as any).max_integrations || 0) ||
      Number((workspace as any).max_numbers || 0) ||
      null,
    bots:
      resolveWorkspacePlanLimit(workspace as any, workspace as any, workspace as any, "active_bot_limit", null) ||
      Number((workspace as any).max_bots || 0) ||
      null,
  };

  return {
    workspace: sanitizeWorkspaceFields(workspace, canViewBilling),
    metrics: {
      members: Number(counts.member_count || 0),
      projects: Number(counts.project_count || 0),
      bots: Number(counts.bot_count || 0),
      flows: Number(counts.flow_count || 0),
      campaigns: Number(counts.campaign_count || 0),
      integrations: Number(counts.platform_account_count || 0),
      conversations: Number(counts.conversation_count || 0),
      openConversations: Number(counts.open_conversation_count || 0),
      leads: Number(counts.lead_count || 0),
      openSupportRequests: Number(counts.open_support_request_count || 0),
    },
    limits,
    wallet: walletSummary,
    support: {
      totalRequests: Array.isArray(supportRequests) ? supportRequests.length : 0,
      openRequests: Array.isArray(supportRequests)
        ? supportRequests.filter((row: any) => String(row?.status || "").toLowerCase() === "open").length
        : 0,
      activeAccess: Number(counts.active_support_access_count || 0),
      accessGranted: Boolean(supportGrant || Number(counts.open_support_request_count || 0) > 0),
      support_access_granted: Boolean(supportGrant || Number(counts.open_support_request_count || 0) > 0),
    },
  };
}

async function performWorkspaceRestore(workspaceId: string, userId: string) {
  const existing = assertRecord(await findWorkspaceById(workspaceId, userId), "Workspace not found");
  const deletedAt = existing.deleted_at ? new Date(existing.deleted_at) : null;
  const purgeAfter = existing.purge_after ? new Date(existing.purge_after) : null;
  if (deletedAt && purgeAfter && purgeAfter.getTime() <= Date.now()) {
    throw {
      status: 410,
      message:
        "This workspace has passed the 30-day retention window. Create a new workspace to continue.",
    };
  }
  const currentBilling = await findCurrentBillingSubscriptionByWorkspace(workspaceId);
  const subscriptionId = String(currentBilling?.external_subscription_ref || existing.external_subscription_ref || "").trim();
  const previousStatus = String(existing.status || "").trim().toLowerCase();
  if (subscriptionId && ["suspended", "locked", "paused"].includes(previousStatus)) {
    await updateStripeSubscriptionCollectionState(subscriptionId, "resume");
  }
  const restored = await updateWorkspace(workspaceId, userId, {
    status: "active",
    lockReason: "",
    archivedAt: null,
    deletedAt: null,
    purgeAfter: null,
  });

  await query(
    `UPDATE projects
     SET deleted_at = NULL, updated_at = NOW()
     WHERE workspace_id = $1`,
    [workspaceId]
  );
  await query(
    `UPDATE campaigns
     SET deleted_at = NULL, updated_at = NOW()
     WHERE workspace_id = $1`,
    [workspaceId]
  );
  await query(
    `UPDATE bots
     SET deleted_at = NULL, updated_at = NOW()
     WHERE workspace_id = $1`,
    [workspaceId]
  );
  await query(
    `UPDATE leads
     SET deleted_at = NULL, updated_at = NOW()
     WHERE workspace_id = $1`,
    [workspaceId]
  );
  await query(
    `UPDATE conversations
     SET deleted_at = NULL, updated_at = NOW()
     WHERE workspace_id = $1`,
    [workspaceId]
  );

  await logAuditSafe({
    userId,
    workspaceId,
    action: "restore",
    entity: "workspace",
    entityId: workspaceId,
    oldData: existing,
    newData: restored || {},
  });

  return restored;
}

export async function restoreWorkspaceService(workspaceId: string, userId: string) {
  await assertPlatformRoles(userId, ["super_admin", "developer"]);
  return performWorkspaceRestore(workspaceId, userId);
}

export async function selfRestoreWorkspaceService(workspaceId: string, userId: string) {
  assertRecord(await findWorkspaceById(workspaceId, userId), "Workspace not found");
  await assertWorkspaceRecoveryAccess(userId, workspaceId);
  return performWorkspaceRestore(workspaceId, userId);
}

export async function createWorkspaceExportRequestService(workspaceId: string, userId: string) {
  const workspace = assertRecord(await findWorkspaceById(workspaceId, userId), "Workspace not found");
  await assertWorkspaceExportAccess(userId, workspaceId);

  const existingRes = await query(
    `SELECT id, status, payload
     FROM queue_jobs
     WHERE job_type = 'workspace_export'
       AND status IN ('pending', 'processing')
       AND payload->>'workspaceId' = $1
       AND payload->>'requestedBy' = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [workspaceId, userId]
  );
  const existing = existingRes.rows[0];
  if (existing) {
    return {
      queued: true,
      jobId: existing.id,
      status: existing.status,
    };
  }

  const payload = {
    workspaceId,
    workspaceName: workspace.name,
    requestedBy: userId,
    requestedAt: new Date().toISOString(),
  };

  const inserted = await query(
    `INSERT INTO queue_jobs (job_type, status, payload, available_at, updated_at)
     VALUES ('workspace_export', 'pending', $1::jsonb, NOW(), NOW())
     RETURNING id, status, payload, created_at`,
    [JSON.stringify(payload)]
  );

  await logAuditSafe({
    userId,
    workspaceId,
    action: "request_export",
    entity: "workspace_export",
    entityId: String(inserted.rows[0]?.id || ""),
    newData: payload,
  });

  return {
    queued: true,
    jobId: inserted.rows[0]?.id,
    status: inserted.rows[0]?.status || "pending",
  };
}

export async function listWorkspaceExportRequestsService(workspaceId: string, userId: string) {
  assertRecord(await findWorkspaceById(workspaceId, userId), "Workspace not found");
  await assertWorkspaceExportAccess(userId, workspaceId);

  const res = await query(
    `SELECT id, status, payload, created_at, completed_at, updated_at
     FROM queue_jobs
     WHERE job_type = 'workspace_export'
       AND payload->>'workspaceId' = $1
     ORDER BY created_at DESC
     LIMIT 20`,
    [workspaceId]
  );

  return res.rows.map((row: any) => {
    const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
    return {
      id: row.id,
      status: row.status,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      requestedBy: payload.requestedBy || null,
      requestedAt: payload.requestedAt || row.created_at,
      fileName: payload.exportFileName || null,
      emailedTo: payload.exportEmail || null,
      previewDownloadPath:
        payload.exportFileName && env.NODE_ENV !== "production"
          ? `/api/workspaces/${workspaceId}/export-requests/${row.id}/download`
          : null,
    };
  });
}

export async function downloadWorkspaceExportForUserService(
  workspaceId: string,
  jobId: string,
  userId: string
) {
  assertRecord(await findWorkspaceById(workspaceId, userId), "Workspace not found");
  await assertWorkspaceExportAccess(userId, workspaceId);

  const res = await query(
    `SELECT id, status, payload
     FROM queue_jobs
     WHERE id = $1
       AND job_type = 'workspace_export'
       AND payload->>'workspaceId' = $2
     LIMIT 1`,
    [jobId, workspaceId]
  );
  const job = res.rows[0];
  if (!job) {
    throw { status: 404, message: "Export request not found" };
  }
  const payload = job.payload && typeof job.payload === "object" ? job.payload : {};
  const filePath = String(payload.exportFilePath || "").trim();
  if (!filePath || job.status !== "completed") {
    throw { status: 409, message: "Export is not ready yet" };
  }

  return {
    filePath,
    fileName: String(payload.exportFileName || path.basename(filePath)),
  };
}

export async function downloadWorkspaceExportByTokenService(token: string) {
  const rawToken = String(token || "").trim();
  if (!rawToken) {
    throw { status: 400, message: "token is required" };
  }

  const record = await findAuthTokenByHash(hashToken(rawToken), "workspace_export_download");
  if (!record || record.used_at || new Date(record.expires_at).getTime() < Date.now()) {
    throw { status: 404, message: "Download link is invalid or expired" };
  }

  const filePath = String(record.metadata?.filePath || "").trim();
  if (!filePath) {
    throw { status: 404, message: "Export file metadata is missing" };
  }

  await markAuthTokenUsed(record.id);

  return {
    filePath,
    fileName: String(record.metadata?.fileName || path.basename(filePath)),
  };
}

export async function getWorkspaceWalletService(workspaceId: string, userId: string) {
  await assertPlatformRoles(userId, ["super_admin", "developer"]);
  assertRecord(await findWorkspaceById(workspaceId, userId), "Workspace not found");
  return getWorkspaceWalletSummary({ workspaceId, limit: 20 });
}

export async function getWorkspaceBillingContextService(workspaceId: string, userId: string) {
  await assertPlatformRoles(userId, ["super_admin", "developer"]);
  const workspace = assertRecord(await findWorkspaceById(workspaceId, userId), "Workspace not found");
  const wallet = await getWorkspaceWalletSummary({ workspaceId, limit: 20 });
  return { workspace, wallet };
}

export async function ingestWorkspaceKnowledgeService(
  workspaceId: string,
  userId: string,
  payload: {
    projectId?: string | null;
    sourceType?: string;
    sourceRef?: string | null;
    title?: string | null;
    content?: string;
    metadata?: Record<string, unknown> | null;
    embedding?: number[] | null;
    chunkSize?: number;
    chunkOverlap?: number;
    replaceExisting?: boolean;
  }
) {
  assertRecord(await findWorkspaceById(workspaceId, userId), "Workspace not found");
  await assertWorkspacePermission(userId, workspaceId, WORKSPACE_PERMISSIONS.manageWorkspace);

  const sourceType = String(payload.sourceType || "").trim().toLowerCase();
  const content = String(payload.content || "").trim();

  if (!sourceType) {
    throw { status: 400, message: "sourceType is required" };
  }

  if (!content) {
    throw { status: 400, message: "content is required" };
  }

  if (payload.projectId) {
    const projectRes = await query(
      `SELECT id
       FROM projects
       WHERE id = $1
         AND workspace_id = $2
       LIMIT 1`,
      [payload.projectId, workspaceId]
    );

    if (!projectRes.rows[0]) {
      throw { status: 404, message: "Project not found in this workspace" };
    }
  }

  return ingestDocumentEmbeddings({
    workspaceId,
    projectId: String(payload.projectId || "").trim() || null,
    sourceType,
    sourceRef: String(payload.sourceRef || "").trim() || null,
    title: String(payload.title || "").trim() || null,
    content,
    metadata: payload.metadata || null,
    embedding: Array.isArray(payload.embedding) ? payload.embedding : null,
    replaceExisting: payload.replaceExisting !== false,
    ...(payload.chunkSize !== undefined ? { chunkSize: payload.chunkSize } : {}),
    ...(payload.chunkOverlap !== undefined ? { chunkOverlap: payload.chunkOverlap } : {}),
  });
}

export async function searchWorkspaceKnowledgeService(
  workspaceId: string,
  userId: string,
  input: {
    projectId?: string | null;
    queryText?: string;
    limit?: number;
    embedding?: number[] | null;
  }
) {
  assertRecord(await findWorkspaceById(workspaceId, userId), "Workspace not found");
  await assertWorkspacePermission(userId, workspaceId, WORKSPACE_PERMISSIONS.viewWorkspace);

  const queryText = String(input.queryText || "").trim();
  if (!queryText) {
    throw { status: 400, message: "query is required" };
  }

  if (input.projectId) {
    const projectRes = await query(
      `SELECT id
       FROM projects
       WHERE id = $1
         AND workspace_id = $2
       LIMIT 1`,
      [input.projectId, workspaceId]
    );

    if (!projectRes.rows[0]) {
      throw { status: 404, message: "Project not found in this workspace" };
    }
  }

  const chunks = await retrieveKnowledgeForWorkspace({
    workspaceId,
    projectId: String(input.projectId || "").trim() || null,
    query: queryText,
    embedding: Array.isArray(input.embedding) ? input.embedding : null,
    ...(input.limit !== undefined ? { limit: input.limit } : {}),
  });

  return {
    query: queryText,
    count: chunks.length,
    chunks,
  };
}

export async function repairWorkspaceWhatsAppContactsService(
  workspaceId: string,
  userId: string,
  payload: {
    botId?: string | null;
    projectId?: string | null;
    dryRun?: boolean;
  }
) {
  assertRecord(await findWorkspaceById(workspaceId, userId), "Workspace not found");
  await assertWorkspacePermission(userId, workspaceId, WORKSPACE_PERMISSIONS.manageWorkspace);

  return repairWhatsAppContactDuplicates({
    workspaceId,
    botId: String(payload.botId || "").trim() || null,
    projectId: String(payload.projectId || "").trim() || null,
    dryRun: payload.dryRun === true,
  });
}

export async function createWorkspaceWalletAdjustmentService(
  workspaceId: string,
  userId: string,
  payload: {
    transactionType?: string;
    amount?: number;
    note?: string;
    projectId?: string | null;
    externalRef?: string | null;
  }
) {
  assertRecord(await findWorkspaceById(workspaceId, userId), "Workspace not found");
  await assertPlatformRoles(userId, ["super_admin", "developer"]);

  const transactionType = String(payload.transactionType || "credit").trim().toLowerCase();
  if (!["credit", "debit", "adjustment"].includes(transactionType)) {
    throw { status: 400, message: "Unsupported wallet transaction type." };
  }

  return createWalletAdjustment({
    workspaceId,
    projectId: String(payload.projectId || "").trim() || null,
    actorUserId: userId,
    transactionType: transactionType as "credit" | "debit" | "adjustment",
    amount: Number(payload.amount),
    ...(payload.note !== undefined ? { note: payload.note || null } : {}),
    ...(payload.externalRef !== undefined ? { externalRef: payload.externalRef || null } : {}),
  });
}

export async function createWorkspaceService(userId: string, payload: any) {
  if (!payload?.publicCheckout) {
    await assertPlatformRoles(userId, ["super_admin", "developer"]);
  }

  const companyName = String(payload.name || payload.companyName || "").trim();
  const ownerName = String(payload.ownerName || payload.fullName || "").trim();
  const ownerEmail = String(payload.ownerEmail || payload.email || "").trim().toLowerCase();
  const ownerPhone = String(payload.ownerPhone || payload.phoneNumber || "").trim() || null;
  const billingCycle = normalizeBillingCycle(payload.billingCycle);
  const currency = normalizeCurrency(payload.currency || "INR");
  const plan = await findPlanById(payload.planId || "starter");

  if (!companyName) {
    throw { status: 400, message: "Company name is required" };
  }
  if (!plan) {
    throw { status: 404, message: "Plan not found" };
  }
  if (!payload.ownerUserId && (!ownerName || !ownerEmail)) {
    throw { status: 400, message: "Primary account owner name and email are required" };
  }

  const client = await db.connect();
  let inviteDetails:
    | { inviteLink: string; expiresAt: string; emailDelivery?: { ok: boolean; provider: string; detail: string; checkedAt: string } | null }
    | null = null;
  let committed = false;

  try {
    await client.query("BEGIN");

    const organizationSchemaReady = await isOrganizationSchemaAvailable().catch(() => false);

    let ownerUserId = String(payload.ownerUserId || "").trim() || null;
    let ownerUser: any = null;
    let createdNewOwner = false;
    let organizationId: string | null = String(payload.organizationId || payload.organization_id || "").trim() || null;

    if (ownerUserId) {
      const ownerRes = await client.query(
        `SELECT id, email, name, phone_number
         FROM users
         WHERE id = $1
         LIMIT 1`,
        [ownerUserId]
      );
      ownerUser = ownerRes.rows[0] || null;
      if (!ownerUser) {
        throw { status: 404, message: "Workspace owner not found" };
      }
    } else {
      const ownerRes = await client.query(
        `SELECT id, email, name, phone_number
         FROM users
         WHERE LOWER(email) = $1
         LIMIT 1`,
        [ownerEmail]
      );
      ownerUser = ownerRes.rows[0] || null;

      if (!ownerUser) {
        const temporaryPassword = crypto.randomBytes(12).toString("base64url");
        const passwordHash = await bcrypt.hash(temporaryPassword, 10);
        const createdUserRes = await client.query(
          `INSERT INTO users (id, email, password_hash, name, role, phone_number)
           VALUES (gen_random_uuid(), $1, $2, $3, 'user', $4)
           RETURNING id, email, name, phone_number`,
          [ownerEmail, passwordHash, ownerName, ownerPhone]
        );
        ownerUser = createdUserRes.rows[0];
        createdNewOwner = true;
      } else {
        await client.query(
          `UPDATE users
           SET
             name = COALESCE(NULLIF($1, ''), name),
             phone_number = COALESCE(NULLIF($2, ''), phone_number)
           WHERE id = $3`,
          [ownerName, ownerPhone, ownerUser.id]
        );
      }

      ownerUserId = ownerUser.id;
    }

    if (organizationSchemaReady) {
      if (organizationId) {
        await assertOrganizationAccessService(userId, organizationId, ["owner", "admin"]);
      } else {
        const orgSlugBase = String(payload.organizationSlug || companyName)
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/-{2,}/g, "-")
          .replace(/^-+|-+$/g, "");
        const orgSlug = `${orgSlugBase || "organization"}-${Date.now().toString(36).slice(-6)}`;
        const organizationRes = await client.query(
          `INSERT INTO organizations (
             name,
             slug,
             plan_tier,
             quota_ai_tokens,
             quota_messages,
             is_active
           ) VALUES ($1, $2, $3, $4, $5, true)
           RETURNING id`,
          [
            `${companyName} Organization`,
            orgSlug,
            payload.planId || "free",
            Number.isFinite(Number(payload.quotaAiTokens)) ? Number(payload.quotaAiTokens) : 50000,
            Number.isFinite(Number(payload.quotaMessages)) ? Number(payload.quotaMessages) : 1000,
          ]
        );
        organizationId = organizationRes.rows[0]?.id || null;
      }
    }

    const workspaceInsertColumns = organizationSchemaReady && organizationId
      ? `(name, owner_user_id, organization_id, plan_id, status, company_website, industry, tax_id)`
      : `(name, owner_user_id, plan_id, status, company_website, industry, tax_id)`;
    const workspaceInsertValues = organizationSchemaReady && organizationId
      ? [
          companyName,
          ownerUserId,
          organizationId,
          payload.planId || "starter",
          normalizeWorkspaceStatus(payload.status),
          String(payload.companyWebsite || "").trim() || null,
          String(payload.industry || payload.category || "").trim() || null,
          String(payload.taxId || payload.gstin || "").trim() || null,
        ]
      : [
          companyName,
          ownerUserId,
          payload.planId || "starter",
          normalizeWorkspaceStatus(payload.status),
          String(payload.companyWebsite || "").trim() || null,
          String(payload.industry || payload.category || "").trim() || null,
          String(payload.taxId || payload.gstin || "").trim() || null,
        ];
    const workspaceRes = await client.query(
      `INSERT INTO workspaces
         ${workspaceInsertColumns}
       VALUES ($1, ${organizationSchemaReady && organizationId ? "$2, $3, $4, $5, $6, $7, $8" : "$2, $3, $4, $5, $6, $7"})
       RETURNING *`,
      workspaceInsertValues
    );
    const workspace = workspaceRes.rows[0];

    if (organizationSchemaReady && organizationId) {
      await client.query(
        `INSERT INTO organization_memberships (organization_id, user_id, role)
         VALUES ($1, $2, 'owner')
         ON CONFLICT (organization_id, user_id)
         DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()`,
        [organizationId, ownerUserId]
      );
    }

    await client.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role, status, created_by)
       VALUES ($1, $2, 'admin', $3, $4)
       ON CONFLICT (workspace_id, user_id)
       DO UPDATE SET role = 'admin', status = EXCLUDED.status, updated_at = NOW()`,
      [workspace.id, ownerUserId, createdNewOwner ? "invited" : "active", userId]
    );

    await client.query(
      `UPDATE users
       SET workspace_id = COALESCE(workspace_id, $1),
           phone_number = COALESCE(phone_number, $2)
       WHERE id = $3`,
      [workspace.id, ownerPhone, ownerUserId]
    );

    const includedSeatLimit =
      resolveWorkspacePlanLimit(payload, plan, null, "agent_seat_limit", null) ||
      Number(plan.included_users || plan.max_users || 1);
    const createdBillingRes = await client.query(
      `INSERT INTO billing_subscriptions (
         workspace_id,
         plan_id,
         status,
         billing_cycle,
         currency,
         base_price_amount,
         seat_quantity,
         included_seat_limit,
         extra_seat_quantity,
         extra_seat_unit_price,
         ai_reply_limit,
         ai_overage_unit_price,
         metadata
       ) VALUES (
         $1, $2, 'active', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb
       )
       RETURNING *`,
      [
        workspace.id,
        plan.id,
        billingCycle,
        currency,
        resolveBasePlanPrice(plan, billingCycle, currency),
        1,
        includedSeatLimit,
        Math.max(0, 1 - Number(includedSeatLimit || 0)),
        Number(plan.extra_agent_seat_price_inr || 0),
        resolveWorkspacePlanLimit(payload, plan, null, "ai_reply_limit", null),
        Number(payload.aiOverageUnitPrice || 0),
        JSON.stringify({
          created_from: "workspace_create",
          ...(payload.billingMetadata && typeof payload.billingMetadata === "object"
            ? payload.billingMetadata
            : {}),
          ...(payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {}),
        }),
      ]
    );
    const createdBilling = createdBillingRes.rows[0];

    const initialWalletTopup = Number(payload.initialWalletTopup || payload.initialWalletCredit || 0);
    await client.query(
      `INSERT INTO wallet_transactions (
         workspace_id,
         billing_subscription_id,
         platform,
         transaction_type,
         entry_kind,
         pricing_category,
         unit_type,
         unit_count,
         amount,
         currency,
         balance_after,
         reference_type,
         reference_id,
         metadata,
         created_by
       ) VALUES (
         $1, $2, 'wallet', $3, 'wallet', $4, 'workspace', 1, $5, $6, $7, 'workspace', $10, $8::jsonb, $9
       )`,
      [
        workspace.id,
        createdBilling?.id || null,
        initialWalletTopup > 0 ? "credit" : "adjustment",
        initialWalletTopup > 0 ? "initial_topup" : "ledger_seed",
        Math.max(0, initialWalletTopup),
        currency,
        Math.max(0, initialWalletTopup),
        JSON.stringify({
          source: "workspace_create",
          note: initialWalletTopup > 0 ? "Initial wallet top-up" : "Ledger initialized",
        }),
        userId,
        workspace.id,
      ]
    );

    await client.query("COMMIT");
    committed = true;

    await syncWorkspaceSeatQuantity(workspace.id);
    await recordWorkspaceUsage({
      workspaceId: workspace.id,
      metricKey: "seat_changes",
      metadata: {
        action: "workspace_created",
        seatQuantity: 1,
      },
    });

    const shouldSendInvite =
      createdNewOwner ||
      String(payload.sendInvite === undefined ? "true" : payload.sendInvite)
        .trim()
        .toLowerCase() !== "false";

    if (shouldSendInvite) {
      const inviteEmail = String(ownerEmail || ownerUser?.email || "").trim().toLowerCase();
      if (!inviteEmail || !ownerUserId) {
        throw { status: 400, message: "Owner email is required to send an invite." };
      }
      try {
        inviteDetails = await createWorkspaceInviteService({
          userId: ownerUserId,
          email: inviteEmail,
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          role: "admin",
          createdBy: userId,
        });
      } catch (inviteError: any) {
        console.error(
          `[WorkspaceService] Workspace ${workspace.id} created but invite delivery failed: ${inviteError?.message || inviteError}`
        );
      }
    }

    await logAuditSafe({
      userId,
      workspaceId: workspace.id,
      action: "create",
      entity: "workspace",
      entityId: workspace.id,
      newData: {
        ...workspace,
        invite_sent: Boolean(inviteDetails),
      },
    });

    const created = assertRecord(await findWorkspaceById(workspace.id, userId), "Workspace not found");
    return {
      ...created,
      invite_link: inviteDetails?.inviteLink,
      invite_expires_at: inviteDetails?.expiresAt,
      invite_delivery: inviteDetails?.emailDelivery || null,
      invite_failed:
        !inviteDetails &&
        Boolean(
          createdNewOwner ||
            String(payload.sendInvite === undefined ? "true" : payload.sendInvite)
              .trim()
              .toLowerCase() !== "false"
        ),
    };
  } catch (error) {
    if (!committed) {
      await client.query("ROLLBACK");
    }
    throw error;
  } finally {
    client.release();
  }
}

async function sendWorkspaceOwnerInvite(
  workspaceId: string,
  actorUserId: string,
  ownerEmail?: string | null
) {
  const workspace = assertRecord(await findWorkspaceById(workspaceId, actorUserId), "Workspace not found");
  await assertPlatformRoles(actorUserId, ["super_admin", "developer"]);
  await assertDestructiveActionRateLimit({
    userId: actorUserId,
    workspaceId,
    actionKey: "workspace_invite_resend",
    limit: 5,
    windowMinutes: 1,
  });

  const ownerUserId = String(workspace.owner_user_id || "").trim();
  if (!ownerUserId) {
    throw { status: 404, message: "Workspace owner is not configured" };
  }

  const owner = await findUserById(ownerUserId);
  if (!owner) {
    throw { status: 404, message: "Workspace owner not found" };
  }

  const nextEmail = String(ownerEmail || owner.email || "").trim().toLowerCase();
  if (!nextEmail) {
    throw { status: 400, message: "Owner email is required" };
  }

  if (ownerEmail) {
    const existingEmailOwner = await findUserByEmail(nextEmail);
    if (existingEmailOwner && existingEmailOwner.id !== owner.id) {
      throw { status: 409, message: "Another user already uses that email address" };
    }

    await query(
      `UPDATE users
       SET email = $1
       WHERE id = $2`,
      [nextEmail, owner.id]
    );
  }

  const inviteDetails = await createWorkspaceInviteService({
    userId: owner.id,
    email: nextEmail,
    workspaceId,
    workspaceName: String(workspace.name || "").trim() || "Workspace",
    role: "admin",
    createdBy: actorUserId,
  });

  await logAuditSafe({
    userId: actorUserId,
    workspaceId,
    action: ownerEmail ? "update_owner_email_and_resend_invite" : "resend_invite",
    entity: "workspace_owner",
    entityId: owner.id,
    newData: {
      ownerUserId: owner.id,
      ownerEmail: nextEmail,
      inviteLink: inviteDetails.inviteLink,
      expiresAt: inviteDetails.expiresAt,
      emailDelivery: inviteDetails.emailDelivery || null,
    },
  });

  if (!inviteDetails.emailDelivery?.ok) {
    throw {
      status: 502,
      message:
        inviteDetails.emailDelivery?.detail ||
        "Invite email could not be delivered.",
    };
  }

  return {
    success: true,
    ownerUserId: owner.id,
    ownerEmail: nextEmail,
    inviteLink: inviteDetails.inviteLink,
    inviteExpiresAt: inviteDetails.expiresAt,
    emailDelivery: inviteDetails.emailDelivery || null,
  };
}

export async function updateWorkspaceService(id: string, userId: string, payload: any) {
  const existing = assertRecord(await findWorkspaceById(id, userId), "Workspace not found");
  await assertPlatformRoles(userId, ["super_admin", "developer"]);
  const updatePayload: Record<string, unknown> = {};
  let hasLimitOverrideUpdate = false;
  const requestedStatus =
    payload.status !== undefined ? normalizeWorkspaceStatus(payload.status) : null;
  const previousStatus = String(existing.status || "").trim().toLowerCase();
  const currentBilling = await findCurrentBillingSubscriptionByWorkspace(id);
  const subscriptionId = String(
    currentBilling?.external_subscription_ref || existing.external_subscription_ref || ""
  ).trim();

  if (payload.name !== undefined) updatePayload.name = payload.name;
  if (payload.planId !== undefined) {
    const plan = await findPlanById(payload.planId);
    if (!plan) {
      throw { status: 404, message: "Plan not found" };
    }
    updatePayload.planId = payload.planId;
  }
  if (payload.status !== undefined) {
    updatePayload.status = requestedStatus;
  }
  if (payload.lockReason !== undefined) {
    updatePayload.lockReason = payload.lockReason;
  }
  if (payload.adminNotes !== undefined) {
    updatePayload.adminNotes = String(payload.adminNotes || "").trim() || null;
  }
  const overrideEntries = [
    ["agentSeatLimitOverride", "Agent seat limit override"],
    ["projectLimitOverride", "Project limit override"],
    ["activeBotLimitOverride", "Active bot limit override"],
    ["monthlyCampaignLimitOverride", "Monthly campaign limit override"],
    ["maxNumbersOverride", "Integration limit override"],
    ["aiReplyLimitOverride", "AI reply limit override"],
  ] as const;
  for (const [key, label] of overrideEntries) {
    if (payload[key] !== undefined) {
      updatePayload[key] = normalizeLimitOverride(payload[key], label);
      hasLimitOverrideUpdate = true;
    }
  }

  if (subscriptionId && requestedStatus && requestedStatus !== previousStatus) {
    if (requestedStatus === "archived") {
      await updateStripeSubscriptionCollectionState(subscriptionId, "cancel");
    } else if (requestedStatus === "suspended") {
      await updateStripeSubscriptionCollectionState(subscriptionId, "pause");
    } else if (requestedStatus === "active" && ["suspended", "archived"].includes(previousStatus)) {
      await updateStripeSubscriptionCollectionState(subscriptionId, "resume");
    }
  }

  const updated = await updateWorkspace(id, userId, updatePayload);

  if (updated && (payload.planId !== undefined || hasLimitOverrideUpdate)) {
    const billing = await findCurrentBillingSubscriptionByWorkspace(id);
    const plan = await findPlanById(String(payload.planId || billing?.plan_id || updated.plan_id || ""));
    if (billing && plan) {
      await updateBillingSubscription(billing.id, {
        ...(payload.planId !== undefined ? { planId: String(payload.planId) } : {}),
        basePriceAmount: resolveBasePlanPrice(
          plan,
          String(billing.billing_cycle || "monthly"),
          String(billing.currency || "INR")
        ),
        includedSeatLimit:
          resolveWorkspacePlanLimit(updated || existing, plan, billing, "agent_seat_limit", null) ||
          Number(plan.included_users || plan.max_users || 0),
        extraSeatUnitPrice: Number(plan.extra_agent_seat_price_inr || 0),
        aiReplyLimit: resolveWorkspacePlanLimit(updated || existing, plan, billing, "ai_reply_limit", null),
      });
    }
  }

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

export async function archiveWorkspaceService(workspaceId: string, userId: string) {
  const existing = assertRecord(await findWorkspaceById(workspaceId, userId), "Workspace not found");
  await assertPlatformRoles(userId, ["super_admin", "developer"]);
  await assertDestructiveActionRateLimit({
    userId,
    workspaceId,
    actionKey: "archive",
    limit: 5,
    windowMinutes: 10,
  });

  if (String(existing.status || "").toLowerCase() === "archived") {
    return existing;
  }

  const currentBilling = await findCurrentBillingSubscriptionByWorkspace(workspaceId);
  const subscriptionId = String(
    currentBilling?.external_subscription_ref || existing.external_subscription_ref || ""
  ).trim();
  if (subscriptionId) {
    await updateStripeSubscriptionCollectionState(subscriptionId, "cancel");
  }

  const archivedAt = new Date().toISOString();
  const archived = await updateWorkspace(workspaceId, userId, {
    status: "archived",
    lockReason: "Archived by platform operator",
    archivedAt,
  });

  await logAuditSafe({
    userId,
    workspaceId,
    action: "archive",
    entity: "workspace",
    entityId: workspaceId,
    oldData: existing,
    newData: {
      ...(archived || {}),
      archived_at: archivedAt,
    },
  });

  return archived;
}

export async function emergencyResetWorkspaceOwnerPasswordService(
  workspaceId: string,
  actorUserId: string
) {
  const workspace = assertRecord(await findWorkspaceById(workspaceId, actorUserId), "Workspace not found");
  await assertPlatformRoles(actorUserId, ["super_admin", "developer"]);
  await assertDestructiveActionRateLimit({
    userId: actorUserId,
    workspaceId,
    actionKey: "emergency_password_reset",
    limit: 5,
    windowMinutes: 10,
  });

  const ownerUserId = String(workspace.owner_user_id || "").trim();
  if (!ownerUserId) {
    throw { status: 404, message: "Workspace owner is not configured" };
  }

  const owner = await findUserById(ownerUserId);
  if (!owner?.email) {
    throw { status: 404, message: "Workspace owner email is not available for reset" };
  }

  const normalizedEmail = String(owner.email).trim().toLowerCase();
  const otp = generateOtpCode();
  const tokenHash = hashToken(`${normalizedEmail}:${otp}`);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 10).toISOString();

  await revokeActiveAuthTokensForUser(owner.id, "password_reset_otp");
  await createAuthToken({
    userId: owner.id,
    workspaceId,
    email: normalizedEmail,
    tokenHash,
    purpose: "password_reset_otp",
    expiresAt,
    metadata: {
      channel: "email",
      source: "workspace_emergency_owner_reset",
      workspaceId,
    },
    createdBy: actorUserId,
  });

  const emailDelivery = await sendPasswordResetOtpEmail({
    to: normalizedEmail,
    otp,
    name: owner.name || null,
  });

  await logAuditSafe({
    userId: actorUserId,
    workspaceId,
    action: "emergency_password_reset",
    entity: "workspace_owner",
    entityId: owner.id,
    newData: {
      ownerUserId: owner.id,
      ownerEmail: normalizedEmail,
      expiresAt,
    },
  });

  return {
    success: true,
    ownerUserId: owner.id,
    ownerEmail: normalizedEmail,
    expiresAt,
    emailDelivery,
  };
}

export async function resendWorkspaceOwnerInviteService(
  workspaceId: string,
  actorUserId: string
) {
  return sendWorkspaceOwnerInvite(workspaceId, actorUserId);
}

export async function resendWorkspaceMemberInviteService(
  workspaceId: string,
  actorUserId: string,
  payload: { userId?: string | null }
) {
  const workspace = assertRecord(await findWorkspaceById(workspaceId, actorUserId), "Workspace not found");
  await assertPlatformRoles(actorUserId, ["super_admin", "developer"]);

  const targetUserId = String(payload.userId || "").trim();
  if (!targetUserId) {
    throw { status: 400, message: "userId is required" };
  }

  const membership = await findWorkspaceMembership(workspaceId, targetUserId);
  if (!membership) {
    throw { status: 404, message: "Workspace member not found" };
  }

  const membershipStatus = String(membership.status || "").trim().toLowerCase();
  if (membershipStatus === "active") {
    throw { status: 400, message: "Workspace member is already active" };
  }

  const user = await findUserById(targetUserId);
  const inviteEmail = String(user?.email || "").trim().toLowerCase();
  if (!inviteEmail) {
    throw { status: 404, message: "Workspace member email is not available for invite resend" };
  }

  const inviteDetails = await createWorkspaceInviteService({
    userId: targetUserId,
    email: inviteEmail,
    workspaceId,
    workspaceName: String(workspace.name || "").trim() || "Workspace",
    role: String(membership.role || "user"),
    createdBy: actorUserId,
  });

  await logAuditSafe({
    userId: actorUserId,
    workspaceId,
    action: "resend_invite",
    entity: "workspace_member",
    entityId: targetUserId,
    newData: {
      userId: targetUserId,
      email: inviteEmail,
      inviteLink: inviteDetails.inviteLink,
      expiresAt: inviteDetails.expiresAt,
      emailDelivery: inviteDetails.emailDelivery || null,
    },
  });

  if (!inviteDetails.emailDelivery?.ok) {
    throw {
      status: 502,
      message:
        inviteDetails.emailDelivery?.detail ||
        "Invite email could not be delivered.",
    };
  }

  return {
    success: true,
    userId: targetUserId,
    email: inviteEmail,
    inviteLink: inviteDetails.inviteLink,
    inviteExpiresAt: inviteDetails.expiresAt,
    emailDelivery: inviteDetails.emailDelivery || null,
  };
}

export async function updateWorkspaceOwnerEmailAndResendInviteService(
  workspaceId: string,
  actorUserId: string,
  payload: { ownerEmail?: string | null }
) {
  return sendWorkspaceOwnerInvite(workspaceId, actorUserId, payload.ownerEmail || null);
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

  const billingCycle = payload.billingCycle !== undefined ? normalizeBillingCycle(payload.billingCycle) : undefined;
  const currency = payload.currency !== undefined ? normalizeCurrency(payload.currency) : undefined;
  const subscriptionUpdate: Record<string, unknown> = {};
  if (payload.subscriptionStatus !== undefined) {
    subscriptionUpdate.status = normalizeSubscriptionStatus(payload.subscriptionStatus);
  }
  if (billingCycle !== undefined) {
    subscriptionUpdate.billingCycle = billingCycle;
  }
  if (currency !== undefined) {
    subscriptionUpdate.currency = currency;
  }
  if (payload.basePriceAmount !== undefined || payload.priceAmount !== undefined) {
    subscriptionUpdate.basePriceAmount = Number(payload.basePriceAmount ?? payload.priceAmount);
  }
  if (payload.expiryDate !== undefined || payload.currentPeriodEnd !== undefined) {
    subscriptionUpdate.currentPeriodEnd = payload.currentPeriodEnd || payload.expiryDate || null;
  }
  if (payload.currentPeriodStart !== undefined) {
    subscriptionUpdate.currentPeriodStart = payload.currentPeriodStart || null;
  }
  if (payload.trialEndsAt !== undefined) {
    subscriptionUpdate.trialEndsAt = payload.trialEndsAt || null;
  }
  if (payload.canceledAt !== undefined) {
    subscriptionUpdate.canceledAt = payload.canceledAt || null;
  }
  if (payload.seatQuantity !== undefined) {
    subscriptionUpdate.seatQuantity = Number(payload.seatQuantity);
  }
  if (payload.includedSeatLimit !== undefined) {
    subscriptionUpdate.includedSeatLimit = Number(payload.includedSeatLimit);
  }
  if (payload.extraSeatQuantity !== undefined) {
    subscriptionUpdate.extraSeatQuantity = Number(payload.extraSeatQuantity);
  }
  if (payload.extraSeatUnitPrice !== undefined) {
    subscriptionUpdate.extraSeatUnitPrice = Number(payload.extraSeatUnitPrice);
  }
  if (payload.aiReplyLimit !== undefined) {
    subscriptionUpdate.aiReplyLimit = payload.aiReplyLimit === null ? null : Number(payload.aiReplyLimit);
  }
  if (payload.aiOverageUnitPrice !== undefined) {
    subscriptionUpdate.aiOverageUnitPrice = Number(payload.aiOverageUnitPrice);
  }
  if (payload.walletAutoTopupEnabled !== undefined) {
    subscriptionUpdate.walletAutoTopupEnabled = Boolean(payload.walletAutoTopupEnabled);
  }
  if (payload.walletAutoTopupAmount !== undefined) {
    subscriptionUpdate.walletAutoTopupAmount = payload.walletAutoTopupAmount === null ? null : Number(payload.walletAutoTopupAmount);
  }
  if (payload.walletLowBalanceThreshold !== undefined) {
    subscriptionUpdate.walletLowBalanceThreshold = payload.walletLowBalanceThreshold === null ? null : Number(payload.walletLowBalanceThreshold);
  }
  if (payload.externalCustomerRef !== undefined) {
    subscriptionUpdate.externalCustomerRef = payload.externalCustomerRef || null;
  }
  if (payload.externalSubscriptionRef !== undefined) {
    subscriptionUpdate.externalSubscriptionRef = payload.externalSubscriptionRef || null;
  }
  if (payload.metadata !== undefined) {
    subscriptionUpdate.metadata = payload.metadata;
  }
  if (payload.planId !== undefined) {
    const plan = await findPlanById(String(payload.planId || ""));
    if (!plan) {
      throw { status: 404, message: "Plan not found" };
    }
    subscriptionUpdate.planId = String(payload.planId);
    if (subscriptionUpdate.basePriceAmount === undefined) {
      subscriptionUpdate.basePriceAmount = resolveBasePlanPrice(
        plan,
        billingCycle || "monthly",
        currency || "INR"
      );
    }
    if (subscriptionUpdate.includedSeatLimit === undefined) {
      subscriptionUpdate.includedSeatLimit =
        resolveWorkspacePlanLimit(workspace, plan, null, "agent_seat_limit", null) ||
        Number(plan.included_users || plan.max_users || 0);
    }
    if (subscriptionUpdate.extraSeatUnitPrice === undefined) {
      subscriptionUpdate.extraSeatUnitPrice = Number(plan.extra_agent_seat_price_inr || 0);
    }
    if (subscriptionUpdate.aiReplyLimit === undefined) {
      subscriptionUpdate.aiReplyLimit = resolveWorkspacePlanLimit(workspace, plan, null, "ai_reply_limit", null);
    }
  }

  let subscription = await findCurrentBillingSubscriptionByWorkspace(workspaceId);
  if (!subscription) {
    const planId = String(payload.planId || workspace.plan_id || "starter");
    const plan = await findPlanById(planId);
    if (!plan) {
      throw { status: 404, message: "Workspace plan not found" };
    }
    subscription = await createBillingSubscription({
      workspaceId,
      planId,
      status: normalizeSubscriptionStatus(payload.subscriptionStatus || "active"),
      billingCycle: billingCycle || "monthly",
      currency: currency || "INR",
      basePriceAmount:
        Number(subscriptionUpdate.basePriceAmount) ||
        resolveBasePlanPrice(plan, billingCycle || "monthly", currency || "INR"),
      seatQuantity: Number(payload.seatQuantity || 0),
      includedSeatLimit:
        Number(subscriptionUpdate.includedSeatLimit) ||
        resolveWorkspacePlanLimit(workspace, plan, null, "agent_seat_limit", null) ||
        Number(plan.included_users || plan.max_users || 0),
      extraSeatQuantity: Number(payload.extraSeatQuantity || 0),
      extraSeatUnitPrice: Number(subscriptionUpdate.extraSeatUnitPrice || plan.extra_agent_seat_price_inr || 0),
      aiReplyLimit:
        subscriptionUpdate.aiReplyLimit === null
          ? null
          : Number(
              subscriptionUpdate.aiReplyLimit ||
                resolveWorkspacePlanLimit(workspace, plan, null, "ai_reply_limit", null) ||
                0
            ),
      aiOverageUnitPrice: Number(subscriptionUpdate.aiOverageUnitPrice || 0),
      metadata: (subscriptionUpdate.metadata as Record<string, unknown>) || {},
    });
  } else {
    subscription = await updateBillingSubscription(subscription.id, subscriptionUpdate);
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
  await syncWorkspaceSeatQuantity(workspaceId);
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

  await syncWorkspaceSeatQuantity(workspaceId);
  await recordWorkspaceUsage({
    workspaceId,
    metricKey: "seat_changes",
    metadata: {
      action: "membership_removed",
      targetUserId,
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
  const workspace = assertRecord(await findWorkspaceById(workspaceId, userId), "Workspace not found");
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
  await notifyPlatformOperators({
    workspaceId,
    type: "support_request",
    message: `Support requested for ${workspace.name} by ${request.requested_by || userId}.`,
    metadata: {
      requestId: request.id,
      requestedBy: request.requested_by,
      workspaceName: workspace.name,
    },
  }).catch((err) => {
    console.warn("Failed to create support request notifications", err);
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
    grantedBy: userId,
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

export async function processWorkspaceExportJobsService() {
  const lockRes = await query(
    `WITH next_job AS (
       SELECT id
       FROM queue_jobs
       WHERE job_type = 'workspace_export'
         AND status IN ('pending', 'retry')
         AND COALESCE(available_at, NOW()) <= NOW()
       ORDER BY COALESCE(available_at, created_at) ASC, created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     UPDATE queue_jobs q
     SET status = 'processing',
         locked_at = NOW(),
         locked_by = 'backend-soft-delete-export',
         updated_at = NOW()
     FROM next_job
     WHERE q.id = next_job.id
     RETURNING q.*`
  );

  const job = lockRes.rows[0];
  if (!job) {
    return { processed: 0 };
  }

  const payload = job.payload && typeof job.payload === "object" ? job.payload : {};
  const workspaceId = String(payload.workspaceId || "").trim();
  const requestedBy = String(payload.requestedBy || "").trim();

  try {
    const workspaceRes = await query(
      `SELECT id, name, owner_user_id, deleted_at, purge_after, status, created_at, updated_at
       FROM workspaces
       WHERE id = $1
       LIMIT 1`,
      [workspaceId]
    );
    const workspace = workspaceRes.rows[0];
    if (!workspace) {
      throw new Error("Workspace not found for export");
    }

    const [
      members,
      projects,
      campaigns,
      bots,
      leads,
      conversations,
      contacts,
      messages,
      platformAccounts,
      supportRequests,
      auditLogs,
    ] = await Promise.all([
      query(
        `SELECT wm.*, u.name, u.email, u.role AS global_role
         FROM workspace_memberships wm
         LEFT JOIN users u ON u.id = wm.user_id
         WHERE wm.workspace_id = $1
         ORDER BY wm.created_at ASC`,
        [workspaceId]
      ).then((res) => res.rows),
      query(`SELECT * FROM projects WHERE workspace_id = $1 ORDER BY created_at ASC`, [workspaceId]).then((res) => res.rows),
      query(`SELECT * FROM campaigns WHERE workspace_id = $1 ORDER BY created_at ASC`, [workspaceId]).then((res) => res.rows),
      query(`SELECT * FROM bots WHERE workspace_id = $1 ORDER BY created_at ASC`, [workspaceId]).then((res) => res.rows),
      query(`SELECT * FROM leads WHERE workspace_id = $1 ORDER BY created_at ASC`, [workspaceId]).then((res) => res.rows),
      query(`SELECT * FROM conversations WHERE workspace_id = $1 ORDER BY created_at ASC`, [workspaceId]).then((res) => res.rows),
      query(`SELECT * FROM contacts WHERE workspace_id = $1 ORDER BY created_at ASC`, [workspaceId]).then((res) => res.rows),
      query(`SELECT * FROM messages WHERE workspace_id = $1 ORDER BY created_at ASC`, [workspaceId]).then((res) => res.rows),
      query(`SELECT * FROM platform_accounts WHERE workspace_id = $1 ORDER BY created_at ASC`, [workspaceId]).then((res) =>
        res.rows.map((row) => sanitizeExportPlatformAccount(row))
      ),
      query(`SELECT * FROM support_requests WHERE workspace_id = $1 ORDER BY created_at ASC`, [workspaceId]).then((res) => res.rows),
      query(`SELECT * FROM audit_logs WHERE workspace_id = $1 ORDER BY created_at ASC`, [workspaceId]).then((res) => res.rows),
    ]);

    const exportDir = getWorkspaceExportDirectory();
    await fs.mkdir(exportDir, { recursive: true });
    const safeWorkspaceName = String(workspace.name || "workspace").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
    const fileName = `${safeWorkspaceName || "workspace"}-${workspace.id}-${Date.now()}.json`;
    const filePath = path.join(exportDir, fileName);
    const artifactBaseDir = path.join(
      exportDir,
      `${safeWorkspaceName || "workspace"}-${workspace.id}-${Date.now()}`
    );
    await fs.mkdir(artifactBaseDir, { recursive: true });

    const csvArtifacts = [
      ["members.csv", members],
      ["projects.csv", projects],
      ["campaigns.csv", campaigns],
      ["bots.csv", bots],
      ["leads.csv", leads],
      ["conversations.csv", conversations],
      ["contacts.csv", contacts],
      ["messages.csv", messages],
      ["platform_accounts.csv", platformAccounts],
      ["support_requests.csv", supportRequests],
      ["audit_logs.csv", auditLogs],
    ] as const;
    const artifacts: Array<{ type: string; fileName: string; filePath: string }> = [];
    for (const [artifactName, rows] of csvArtifacts) {
      const artifactPath = path.join(artifactBaseDir, artifactName);
      await fs.writeFile(artifactPath, buildCsv(rows as Record<string, any>[]), "utf8");
      artifacts.push({
        type: "csv",
        fileName: artifactName,
        filePath: artifactPath,
      });
    }

    const exportPayload = {
      generatedAt: new Date().toISOString(),
      formatVersion: 2,
      summary: {
        members: members.length,
        projects: projects.length,
        campaigns: campaigns.length,
        bots: bots.length,
        leads: leads.length,
        conversations: conversations.length,
        contacts: contacts.length,
        messages: messages.length,
        platformAccounts: platformAccounts.length,
        supportRequests: supportRequests.length,
        auditLogs: auditLogs.length,
      },
      workspace,
      members,
      projects,
      campaigns,
      bots,
      leads,
      conversations,
      contacts,
      messages,
      platformAccounts,
      supportRequests,
      auditLogs,
      artifacts: artifacts.map((artifact) => ({
        type: artifact.type,
        fileName: artifact.fileName,
      })),
    };

    await fs.writeFile(filePath, JSON.stringify(exportPayload, null, 2), "utf8");

    const owner = workspace.owner_user_id ? await findUserById(String(workspace.owner_user_id)) : null;
    const recipientEmail =
      String(owner?.email || payload.requestedByEmail || "").trim().toLowerCase() || null;
    const downloadToken = crypto.randomBytes(24).toString("base64url");
    const downloadUrl = buildWorkspaceExportDownloadUrl(downloadToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    if (recipientEmail) {
      await createAuthToken({
        userId: owner?.id || requestedBy,
        workspaceId,
        email: recipientEmail,
        tokenHash: hashToken(downloadToken),
        purpose: "workspace_export_download",
        expiresAt,
        metadata: {
          filePath,
          fileName,
          workspaceId,
          jobId: job.id,
        },
        createdBy: requestedBy || owner?.id || null,
      });

      await sendTransactionalEmail({
        to: recipientEmail,
        subject: `Your ${workspace.name} data export is ready`,
        text: `Your workspace export is ready. Download it here: ${downloadUrl}\n\nThis link expires in 7 days.`,
        html: `<div style="font-family:Arial,sans-serif;padding:24px;max-width:560px"><p>Your workspace export for <strong>${workspace.name}</strong> is ready.</p><p><a href="${downloadUrl}">Download your export</a></p><p style="color:#64748b;font-size:13px">This link expires in 7 days.</p></div>`,
      });
    }

    await query(
      `UPDATE queue_jobs
       SET status = 'completed',
           completed_at = NOW(),
           locked_at = NULL,
           locked_by = NULL,
           updated_at = NOW(),
           payload = COALESCE(payload, '{}'::jsonb) || $2::jsonb
       WHERE id = $1`,
      [
        job.id,
        JSON.stringify({
          exportFileName: fileName,
          exportFilePath: filePath,
          artifactDirectory: artifactBaseDir,
          artifacts: artifacts.map((artifact) => ({
            type: artifact.type,
            fileName: artifact.fileName,
            filePath: artifact.filePath,
          })),
          exportEmail: recipientEmail,
          completedAt: new Date().toISOString(),
        }),
      ]
    );

    await logAuditSafe({
      userId: requestedBy || owner?.id || null,
      workspaceId,
      action: "export_ready",
      entity: "workspace_export",
      entityId: String(job.id),
      newData: {
        fileName,
        recipientEmail,
      },
    });

    return { processed: 1 };
  } catch (error: any) {
    await query(
      `UPDATE queue_jobs
       SET status = 'failed',
           locked_at = NULL,
           locked_by = NULL,
           updated_at = NOW(),
           error_message = $2
       WHERE id = $1`,
      [job.id, String(error?.message || error || "Export failed")]
    );
    throw error;
  }
}

export async function deleteWorkspaceService(workspaceId: string, userId: string) {
  const existing = assertRecord(await findWorkspaceById(workspaceId, userId), "Workspace not found");
  await assertPlatformRoles(userId, ["super_admin", "developer"]);
  await assertDestructiveActionRateLimit({
    userId,
    workspaceId,
    actionKey: "schedule_delete",
    limit: 3,
    windowMinutes: 10,
  });
  if (existing.deleted_at) {
    return existing;
  }

  const currentBilling = await findCurrentBillingSubscriptionByWorkspace(workspaceId);
  const subscriptionId = String(
    currentBilling?.external_subscription_ref || existing.external_subscription_ref || ""
  ).trim();
  if (subscriptionId) {
    await updateStripeSubscriptionCollectionState(subscriptionId, "cancel");
  }

  const deletedAt = new Date().toISOString();
  const purgeAfter = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const platformAccountRows = await client.query(
      `SELECT *
       FROM platform_accounts
       WHERE workspace_id = $1`,
      [workspaceId]
    );
    const remoteRevocations = [];
    for (const account of platformAccountRows.rows) {
      const result = await revokeRemotePlatformConnectionService({
        ...(account as any),
        bot_id: String((account as any)?.metadata?.legacyBotId || ""),
      }).catch((error: any) => ({
        attempted: true,
        ok: false,
        provider: String(account.platform_type || "unknown"),
        targets: [String(account.account_id || account.phone_number || account.id)],
        message: String(error?.message || error || "Remote revocation failed"),
      }));
      remoteRevocations.push({
        integrationId: account.id,
        ...result,
      });
    }
    await client.query(
      `UPDATE projects
       SET deleted_at = $2, updated_at = NOW()
       WHERE workspace_id = $1 AND deleted_at IS NULL`,
      [workspaceId, deletedAt]
    );
    await client.query(
      `UPDATE campaigns
       SET deleted_at = $2, updated_at = NOW()
       WHERE workspace_id = $1 AND deleted_at IS NULL`,
      [workspaceId, deletedAt]
    );
    await client.query(
      `UPDATE bots
       SET deleted_at = $2, updated_at = NOW()
       WHERE workspace_id = $1 AND deleted_at IS NULL`,
      [workspaceId, deletedAt]
    );
    await client.query(
      `UPDATE leads
       SET deleted_at = $2, updated_at = NOW()
       WHERE workspace_id = $1 AND deleted_at IS NULL`,
      [workspaceId, deletedAt]
    );
    await client.query(
      `UPDATE conversations
       SET deleted_at = $2, updated_at = NOW()
       WHERE workspace_id = $1 AND deleted_at IS NULL`,
      [workspaceId, deletedAt]
    );
    await client.query(
      `UPDATE platform_accounts
       SET
         status = 'inactive',
         token = NULL,
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
           'softDeletedAt', $2::text,
           'softDeleteRevokedBy', $3::text,
           'softDeleteRevocationReason', 'workspace_scheduled_for_deletion'
         ),
         updated_at = NOW()
       WHERE workspace_id = $1`,
      [workspaceId, deletedAt, userId]
    );
    const deleted = await client.query(
      `UPDATE workspaces
       SET deleted_at = $2,
           purge_after = $3,
           status = 'archived',
           archived_at = COALESCE(archived_at, $2),
           lock_reason = 'Scheduled for deletion',
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [workspaceId, deletedAt, purgeAfter]
    );
    await client.query("COMMIT");
    await logAuditSafe({
      userId,
      workspaceId,
      action: "schedule_delete",
      entity: "workspace",
      entityId: workspaceId,
      oldData: existing,
      newData: deleted.rows[0] || {},
      metadata: {
        deletedAt,
        purgeAfter,
        remoteRevocations,
      },
    });
    return deleted.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function purgeSoftDeletedWorkspacesService() {
  const dueRes = await query(
    `SELECT id
     FROM workspaces
     WHERE deleted_at IS NOT NULL
       AND COALESCE(purge_after, deleted_at + INTERVAL '30 days') <= NOW()`
  );

  let purged = 0;

  for (const row of dueRes.rows) {
    const workspaceId = String(row.id || "").trim();
    if (!workspaceId) {
      continue;
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM queue_jobs WHERE payload->>'workspaceId' = $1`, [workspaceId]);
      await client.query(`DELETE FROM auth_tokens WHERE workspace_id = $1`, [workspaceId]);
      await client.query(`DELETE FROM support_requests WHERE workspace_id = $1`, [workspaceId]);
      await client.query(`DELETE FROM support_access WHERE workspace_id = $1`, [workspaceId]);
      await client.query(`DELETE FROM platform_accounts WHERE workspace_id = $1`, [workspaceId]);
      await client.query(`DELETE FROM conversations WHERE workspace_id = $1`, [workspaceId]);
      await client.query(`DELETE FROM leads WHERE workspace_id = $1`, [workspaceId]);
      await client.query(`DELETE FROM bots WHERE workspace_id = $1`, [workspaceId]);
      await client.query(`DELETE FROM campaigns WHERE workspace_id = $1`, [workspaceId]);
      await client.query(`DELETE FROM project_users WHERE workspace_id = $1`, [workspaceId]);
      await client.query(`DELETE FROM user_project_access WHERE workspace_id = $1`, [workspaceId]);
      await client.query(
        `DELETE FROM project_settings
         WHERE project_id IN (SELECT id FROM projects WHERE workspace_id = $1)`,
        [workspaceId]
      );
      await client.query(`DELETE FROM projects WHERE workspace_id = $1`, [workspaceId]);
      await client.query(`DELETE FROM workspace_memberships WHERE workspace_id = $1`, [workspaceId]);
      await client.query(`DELETE FROM billing_subscriptions WHERE workspace_id = $1`, [workspaceId]);
      await client.query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]);
      await client.query("COMMIT");
      purged += 1;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    purged,
  };
}
