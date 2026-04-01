import { query } from "../config/db";
import { findLatestSubscriptionByWorkspace } from "../models/planModel";
import {
  ensureCampaignRunWithinLimit,
  getEffectiveWorkspaceBilling,
  resolveWorkspacePlanLimit,
} from "./billingService";

const DEFAULT_MAX_CAMPAIGNS = Number(process.env.MAX_CAMPAIGNS_PER_USER || 25);
const DEFAULT_MAX_PLATFORM_ACCOUNTS = Number(
  process.env.MAX_PLATFORM_ACCOUNTS_PER_USER || 50
);
const DEFAULT_MAX_USERS = Number(process.env.MAX_USERS_PER_WORKSPACE || 25);
const DEFAULT_MAX_PROJECTS = Number(process.env.MAX_PROJECTS_PER_WORKSPACE || 10);
const DEFAULT_MAX_BOTS = Number(process.env.MAX_BOTS_PER_WORKSPACE || 25);
const PLAN_ALLOWED_PLATFORMS = (
  process.env.ALLOWED_PLATFORM_TYPES ||
  "whatsapp,website,facebook,instagram,api,telegram"
)
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

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

async function getWorkspaceSubscription(workspaceId: string) {
  const hasPlansTable = await tableExists("plans");
  if (!hasPlansTable) {
    return null;
  }

  return getEffectiveWorkspaceBilling(workspaceId);
}

async function hasActiveSupportAccessForWorkspace(workspaceId: string, userId?: string | null) {
  if (!userId) {
    return false;
  }

  const res = await query(
    `SELECT 1
     FROM support_access
     WHERE workspace_id = $1
       AND user_id = $2
       AND expires_at > NOW()
     LIMIT 1`,
    [workspaceId, userId]
  );

  return Boolean(res.rows[0]);
}

export async function getWorkspaceBillingStatus(workspaceId: string) {
  const subscription = await findLatestSubscriptionByWorkspace(workspaceId);
  if (!subscription) {
    return {
      status: "missing",
      isWriteBlocked: true,
      message: "Workspace does not have a subscription configured",
      subscription: null,
    };
  }

  const status = String(subscription.status || "").toLowerCase();
  const expiryDate = subscription.expiry_date ? new Date(subscription.expiry_date) : null;
  const gracePeriodEnd = subscription.grace_period_end
    ? new Date(subscription.grace_period_end)
    : null;
  const today = new Date();

  if (status === "locked") {
    return {
      status,
      isWriteBlocked: true,
      message: "Workspace is locked due to billing state",
      subscription,
    };
  }

  if (status === "past_due" || status === "expired" || status === "canceled") {
    return {
      status,
      isWriteBlocked: true,
      message: "Workspace subscription is no longer active",
      subscription,
    };
  }

  if (status === "overdue") {
    return {
      status,
      isWriteBlocked: false,
      message: "Workspace subscription is overdue",
      subscription,
    };
  }

  if (expiryDate && expiryDate.getTime() < today.getTime()) {
    const stillInGrace = gracePeriodEnd && gracePeriodEnd.getTime() >= today.getTime();
    return {
      status: stillInGrace ? "overdue" : "expired",
      isWriteBlocked: !stillInGrace,
      message: stillInGrace
        ? "Workspace subscription is in grace period"
        : "Workspace subscription has expired",
      subscription,
    };
  }

  return {
    status,
    isWriteBlocked: false,
    message: null,
    subscription,
  };
}

export async function validateWorkspaceContext(
  workspaceId?: string | null,
  options?: {
    allowLocked?: boolean;
    allowWriteBlocked?: boolean;
    userId?: string | null;
  }
) {
  if (!workspaceId) {
    return;
  }

  if (await hasActiveSupportAccessForWorkspace(workspaceId, options?.userId)) {
    return;
  }

  const hasWorkspacesTable = await tableExists("workspaces");
  if (!hasWorkspacesTable) {
    throw {
      status: 400,
      message:
        "Workspace selection is not available yet because the workspaces table has not been introduced in this environment",
    };
  }

  const res = await query(
    `SELECT id, status
     FROM workspaces
     WHERE id = $1
     LIMIT 1`,
    [workspaceId]
  );

  const workspace = res.rows[0];
  if (!workspace) {
    throw { status: 404, message: "Workspace not found" };
  }

  const workspaceStatus = String(workspace.status || "").toLowerCase();
  if (!["active", "paused", "locked", "suspended", "archived", "past_due", "canceled"].includes(workspaceStatus)) {
    throw { status: 400, message: "Workspace must be active" };
  }

  if (
    (workspaceStatus === "locked" ||
      workspaceStatus === "suspended" ||
      workspaceStatus === "archived" ||
      workspaceStatus === "past_due" ||
      workspaceStatus === "canceled") &&
    !options?.allowLocked
  ) {
    throw { status: 403, message: "Workspace is locked" };
  }

  const billingStatus = await getWorkspaceBillingStatus(workspaceId);
  if (billingStatus.isWriteBlocked && !options?.allowWriteBlocked) {
    throw { status: 403, message: billingStatus.message };
  }
}

export async function assertCampaignQuota(
  userId: string,
  workspaceId?: string | null,
  excludeCampaignId?: string
) {
  const params: any[] = [userId];
  let where = "WHERE user_id = $1";
  let extraWhere = "";

  if (workspaceId) {
    params.push(workspaceId);
    where += ` AND workspace_id = $${params.length}`;
  }

  if (excludeCampaignId) {
    params.push(excludeCampaignId);
    extraWhere = `AND id <> $${params.length}`;
  }

  const res = await query(
    `SELECT COUNT(*)::int AS total
     FROM campaigns
     ${where}
       ${extraWhere}`,
    params
  );

  const total = Number(res.rows[0]?.total || 0);
  const billing = workspaceId
    ? await getWorkspaceSubscription(workspaceId)
    : null;
  const limit = resolveWorkspacePlanLimit(
    billing?.workspace,
    billing?.plan,
    billing?.subscription,
    "monthly_campaign_limit",
    DEFAULT_MAX_CAMPAIGNS
  );
  if (!limit) {
    return;
  }

  if (total >= limit) {
    throw {
      status: 403,
      message: `Campaign limit reached for this plan (${limit})`,
    };
  }
}

export async function assertPlatformAllowedByPlan(
  platform: string,
  workspaceId?: string | null,
  userId?: string | null
) {
  const billing = workspaceId
    ? await getWorkspaceSubscription(workspaceId)
    : null;
  const allowedPlatforms = Array.isArray(billing?.plan?.allowed_platforms)
    ? billing?.plan.allowed_platforms.map((value: string) =>
        String(value).toLowerCase()
      )
    : PLAN_ALLOWED_PLATFORMS;

  if (!allowedPlatforms.includes(platform.toLowerCase())) {
    throw {
      status: 403,
      message: `Platform '${platform}' is not allowed by the current plan`,
    };
  }
}

export async function assertPlatformAccountQuota(
  userId: string,
  workspaceId?: string | null,
  excludeId?: string
) {
  const params: any[] = [userId];
  let where = "WHERE user_id = $1";
  let extraWhere = "";

  if (workspaceId) {
    params.push(workspaceId);
    where += ` AND workspace_id = $${params.length}`;
  }

  if (excludeId) {
    params.push(excludeId);
    extraWhere = `AND id <> $${params.length}`;
  }

  const res = await query(
    `SELECT COUNT(*)::int AS total
     FROM platform_accounts
     ${where}
       ${extraWhere}`,
    params
  );

  const total = Number(res.rows[0]?.total || 0);
  const billing = workspaceId
    ? await getWorkspaceSubscription(workspaceId)
    : null;
  const limit = resolveWorkspacePlanLimit(
    billing?.workspace,
    billing?.plan,
    billing?.subscription,
    "max_numbers",
    DEFAULT_MAX_PLATFORM_ACCOUNTS
  );
  if (!limit) {
    return;
  }

  if (total >= limit) {
    throw {
      status: 403,
      message: `Platform account limit reached for this plan (${limit})`,
    };
  }
}

export async function assertUserQuota(workspaceId?: string | null, userId?: string | null) {
  if (!workspaceId) {
    return;
  }

  const res = await query(
    `SELECT COUNT(*)::int AS total
     FROM workspace_memberships
     WHERE workspace_id = $1
       AND status IN ('active', 'invited')`,
    [workspaceId]
  );

  const total = Number(res.rows[0]?.total || 0);
  const billing = await getWorkspaceSubscription(workspaceId);
  const limit = resolveWorkspacePlanLimit(
    billing?.workspace,
    billing?.plan,
    billing?.subscription,
    "agent_seat_limit",
    resolveWorkspacePlanLimit(
      billing?.workspace,
      billing?.plan,
      billing?.subscription,
      "max_users",
      DEFAULT_MAX_USERS
    )
  );
  if (!limit) {
    return;
  }
  if (total >= limit) {
    throw { status: 403, message: `User limit reached for this plan (${limit})` };
  }
}

export async function assertProjectQuota(workspaceId?: string | null, userId?: string | null) {
  if (!workspaceId) {
    return;
  }

  const res = await query(
    `SELECT COUNT(*)::int AS total
     FROM projects
     WHERE workspace_id = $1`,
    [workspaceId]
  );

  const total = Number(res.rows[0]?.total || 0);
  const billing = await getWorkspaceSubscription(workspaceId);
  const limit = resolveWorkspacePlanLimit(
    billing?.workspace,
    billing?.plan,
    billing?.subscription,
    "project_limit",
    resolveWorkspacePlanLimit(
      billing?.workspace,
      billing?.plan,
      billing?.subscription,
      "max_projects",
      DEFAULT_MAX_PROJECTS
    )
  );
  if (!limit) {
    return;
  }
  if (total >= limit) {
    throw { status: 403, message: `Project limit reached for this plan (${limit})` };
  }
}

export async function assertBotQuota(workspaceId?: string | null, projectId?: string | null) {
  if (!workspaceId) {
    return;
  }

  const params: Array<string | null> = [workspaceId];
  let projectClause = "";
  if (projectId) {
    params.push(projectId);
    projectClause = ` AND project_id = $${params.length}`;
  }

  const res = await query(
    `SELECT COUNT(*)::int AS total
     FROM bots
     WHERE workspace_id = $1
       AND status = 'active'${projectClause}`,
    params
  );

  const total = Number(res.rows[0]?.total || 0);
  const billing = await getWorkspaceSubscription(workspaceId);
  const limit = resolveWorkspacePlanLimit(
    billing?.workspace,
    billing?.plan,
    billing?.subscription,
    "active_bot_limit",
    resolveWorkspacePlanLimit(
      billing?.workspace,
      billing?.plan,
      billing?.subscription,
      "max_bots",
      DEFAULT_MAX_BOTS
    )
  );
  if (!limit) {
    return;
  }
  if (total >= limit) {
    throw { status: 403, message: `Bot limit reached for this plan (${limit})` };
  }
}

export async function assertCampaignRunLimit(workspaceId?: string | null) {
  if (!workspaceId) {
    return;
  }

  await ensureCampaignRunWithinLimit(workspaceId);
}
