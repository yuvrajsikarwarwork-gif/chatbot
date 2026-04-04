import { query } from "../config/db";
import { createAuditLog } from "../models/auditLogModel";
import { findWorkspaceById, findWorkspacesByUser } from "../models/workspaceModel";
import { findWorkspaceMembershipsByUser } from "../models/workspaceMembershipModel";
import { getUserPlatformRole } from "./workspaceAccessService";

export type OrganizationRole = "owner" | "admin" | "member";

export type OrganizationSummary = {
  id: string;
  name: string;
  slug: string | null;
  planTier: string;
  quotaAiTokens: number;
  quotaMessages: number;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  workspaceCount?: number;
  memberCount?: number;
};

export type CreateOrganizationInput = {
  name: string;
  slug?: string | null;
  planTier?: string | null;
  quotaAiTokens?: number | null;
  quotaMessages?: number | null;
  isActive?: boolean;
};

export type UpdateOrganizationQuotaInput = {
  planTier?: string | null;
  quotaAiTokens?: number | null;
  quotaMessages?: number | null;
  reason: string;
};

const PLAN_TIER_DEFAULTS: Record<string, { quotaMessages: number; quotaAiTokens: number }> = {
  free: { quotaMessages: 1000, quotaAiTokens: 50000 },
  pro: { quotaMessages: 50000, quotaAiTokens: 1000000 },
  enterprise: { quotaMessages: 500000, quotaAiTokens: 10000000 },
};

export type OrganizationMembershipRecord = {
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  createdAt: string | null;
  updatedAt: string | null;
  source: "organization_membership" | "workspace_membership" | "workspace_owner" | "platform_operator";
};

function isRecoverableOrganizationQueryError(err: any) {
  return ["42P01", "42703", "42704"].includes(String(err?.code || ""));
}

function normalizeOrganizationRole(role?: string): OrganizationRole {
  const normalized = String(role || "member").trim().toLowerCase();
  if (normalized === "owner" || normalized === "admin" || normalized === "member") {
    return normalized;
  }
  return "member";
}

function toOrganizationSummary(row: any): OrganizationSummary {
  return {
    id: String(row?.id || "").trim(),
    name: String(row?.name || "").trim(),
    slug: row?.slug ? String(row.slug).trim() : null,
    planTier: String(row?.plan_tier || "free").trim(),
    quotaAiTokens: Number(row?.quota_ai_tokens || 0),
    quotaMessages: Number(row?.quota_messages || 0),
    isActive: Boolean(row?.is_active ?? true),
    createdAt: row?.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
    workspaceCount: Number(row?.workspace_count || 0),
    memberCount: Number(row?.member_count || 0),
  };
}

function toSyntheticOrganizationFromWorkspace(workspace: any): OrganizationSummary | null {
  if (!workspace?.id) {
    return null;
  }

  return {
    id: String(workspace.id).trim(),
    name: String(workspace.name || "Workspace").trim() || "Workspace",
    slug: `workspace-${String(workspace.id).trim().slice(0, 8)}`,
    planTier: String(workspace.plan_id || "free").trim() || "free",
    quotaAiTokens: Number(workspace.quota_ai_tokens || 50000),
    quotaMessages: Number(workspace.quota_messages || 1000),
    isActive: String(workspace.status || "active").toLowerCase() === "active",
    createdAt: workspace.created_at ? new Date(workspace.created_at).toISOString() : null,
    updatedAt: workspace.updated_at ? new Date(workspace.updated_at).toISOString() : null,
    workspaceCount: 1,
    memberCount: 1,
  };
}

function normalizeOrganizationSlug(value: string) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "organization";
}

async function queryOrganizationsWithFallback<T>(
  sql: string,
  params: any[],
  fallback: () => Promise<T>
): Promise<T> {
  try {
    const res = await query(sql, params);
    return res.rows as T;
  } catch (err: any) {
    if (!isRecoverableOrganizationQueryError(err)) {
      throw err;
    }
    return fallback();
  }
}

export async function listUserOrganizationsService(userId: string): Promise<OrganizationSummary[]> {
  const platformRole = await getUserPlatformRole(userId);
  const isPlatformOperator = platformRole === "super_admin" || platformRole === "developer";

  return queryOrganizationsWithFallback<OrganizationSummary[]>(
    `
      WITH organization_ids AS (
        SELECT DISTINCT om.organization_id AS id
        FROM organization_memberships om
        WHERE om.user_id = $1

        UNION

        SELECT DISTINCT w.organization_id AS id
        FROM workspaces w
        LEFT JOIN workspace_memberships wm
          ON wm.workspace_id = w.id
         AND wm.user_id = $1
         AND wm.status = 'active'
        WHERE w.organization_id IS NOT NULL
          AND (
            w.owner_user_id = $1
            OR wm.user_id IS NOT NULL
          )
      )
      SELECT
        o.id,
        o.name,
        o.slug,
        o.plan_tier,
        o.quota_ai_tokens,
        o.quota_messages,
        o.is_active,
        o.created_at,
        o.updated_at,
        COUNT(DISTINCT w.id)::int AS workspace_count,
        COUNT(DISTINCT om.user_id)::int AS member_count
      FROM organizations o
      LEFT JOIN workspaces w
        ON w.organization_id = o.id
      LEFT JOIN organization_memberships om
        ON om.organization_id = o.id
      WHERE (
        $2::boolean = true
        OR o.id IN (SELECT id FROM organization_ids)
      )
      GROUP BY o.id
      ORDER BY o.created_at DESC, o.name ASC
    `,
    [userId, isPlatformOperator],
    async () => {
      const workspaces = await findWorkspacesByUser(userId);
      const mapped = workspaces
        .map((workspace: any) => toSyntheticOrganizationFromWorkspace(workspace))
        .filter(Boolean) as OrganizationSummary[];
      return mapped;
    }
  );
}

export async function listAllOrganizationsService(): Promise<OrganizationSummary[]> {
  const res = await query(
    `
      SELECT
        o.id,
        o.name,
        o.slug,
        o.plan_tier,
        o.quota_ai_tokens,
        o.quota_messages,
        o.is_active,
        o.created_at,
        o.updated_at,
        COUNT(DISTINCT w.id)::int AS workspace_count,
        COUNT(DISTINCT om.user_id)::int AS member_count
      FROM organizations o
      LEFT JOIN workspaces w
        ON w.organization_id = o.id
      LEFT JOIN organization_memberships om
        ON om.organization_id = o.id
      GROUP BY o.id
      ORDER BY o.created_at DESC, o.name ASC
    `
  ).catch((err) => {
    if (isRecoverableOrganizationQueryError(err)) {
      return { rows: [] };
    }
    throw err;
  });

  return (res.rows || []).map(toOrganizationSummary);
}

export async function getOrganizationDetailsService(
  organizationId: string,
  userId?: string | null
) {
  return findOrganizationByIdService(organizationId, userId || null);
}

export async function createOrganizationService(input: CreateOrganizationInput): Promise<OrganizationSummary> {
  const name = String(input.name || "").trim();
  if (!name) {
    throw { status: 400, message: "Organization name is required" };
  }

  const slugSeed = String(input.slug || name);
  const slug = `${normalizeOrganizationSlug(slugSeed)}-${cryptoRandomSuffix(name)}`;

  const res = await query(
    `
      INSERT INTO organizations (
        name,
        slug,
        plan_tier,
        quota_ai_tokens,
        quota_messages,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, slug, plan_tier, quota_ai_tokens, quota_messages, is_active, created_at, updated_at
    `,
    [
      name,
      slug,
      String(input.planTier || "free").trim() || "free",
      Number.isFinite(Number(input.quotaAiTokens)) ? Number(input.quotaAiTokens) : 50000,
      Number.isFinite(Number(input.quotaMessages)) ? Number(input.quotaMessages) : 1000,
      input.isActive ?? true,
    ]
  ).catch((err) => {
    if (isRecoverableOrganizationQueryError(err)) {
      return { rows: [] };
    }
    throw err;
  });

  const row = res.rows[0];
  if (!row) {
    throw { status: 500, message: "Failed to create organization" };
  }

  return toOrganizationSummary(row);
}

export async function updateOrganizationQuotasService(
  organizationId: string,
  input: UpdateOrganizationQuotaInput,
  actorUserId?: string | null
): Promise<OrganizationSummary> {
  const targetOrganizationId = String(organizationId || "").trim();
  if (!targetOrganizationId) {
    throw { status: 400, message: "Organization id is required" };
  }

  const reason = String(input.reason || "").trim();
  if (!reason) {
    throw { status: 400, message: "reason is required" };
  }

  const hasMessages = Number.isFinite(Number(input.quotaMessages));
  const hasTokens = Number.isFinite(Number(input.quotaAiTokens));
  const nextPlanTier = String(input.planTier || "").trim().toLowerCase() || null;
  const hasPlanTier = Boolean(nextPlanTier);
  if (!hasMessages && !hasTokens) {
    if (!hasPlanTier) {
      throw { status: 400, message: "At least one quota or plan tier must be provided" };
    }
  }

  const currentRes = await query(
    `
      SELECT
        id,
        name,
        slug,
        plan_tier,
        quota_ai_tokens,
        quota_messages,
        is_active,
        created_at,
        updated_at
      FROM organizations
      WHERE id = $1
      LIMIT 1
    `,
    [targetOrganizationId]
  ).catch((err) => {
    if (isRecoverableOrganizationQueryError(err)) {
      return { rows: [] };
    }
    throw err;
  });

  const currentRow = currentRes.rows[0];
  if (!currentRow) {
    throw { status: 404, message: "Organization not found" };
  }

  const normalizedPlanTier = (hasPlanTier ? nextPlanTier : String(currentRow.plan_tier || "free").trim().toLowerCase()) || "free";
  const defaultsForPlan = (
    normalizedPlanTier === "pro"
      ? PLAN_TIER_DEFAULTS.pro
      : normalizedPlanTier === "enterprise"
        ? PLAN_TIER_DEFAULTS.enterprise
        : PLAN_TIER_DEFAULTS.free
  ) as { quotaMessages: number; quotaAiTokens: number };
  const nextQuotaMessages = hasMessages
    ? Number(input.quotaMessages)
    : hasPlanTier
      ? defaultsForPlan.quotaMessages
      : Number(currentRow.quota_messages || 0);
  const nextQuotaAiTokens = hasTokens
    ? Number(input.quotaAiTokens)
    : hasPlanTier
      ? defaultsForPlan.quotaAiTokens
      : Number(currentRow.quota_ai_tokens || 0);

  const updateRes = await query(
    `
      UPDATE organizations
      SET
        plan_tier = COALESCE($1, plan_tier),
        quota_ai_tokens = COALESCE($2, quota_ai_tokens),
        quota_messages = COALESCE($3, quota_messages),
        updated_at = NOW()
      WHERE id = $4
      RETURNING
        id,
        name,
        slug,
        plan_tier,
        quota_ai_tokens,
        quota_messages,
        is_active,
        created_at,
        updated_at
    `,
    [hasPlanTier ? normalizedPlanTier : null, hasTokens ? nextQuotaAiTokens : null, hasMessages ? nextQuotaMessages : null, targetOrganizationId]
  );

  const updatedRow = updateRes.rows[0];
  if (!updatedRow) {
    throw { status: 500, message: "Failed to update organization quotas" };
  }

  await createAuditLog({
    userId: actorUserId || null,
    actorUserId: actorUserId || null,
    workspaceId: null,
    action: "ORGANIZATION_QUOTA_UPDATED",
    entity: "organization",
    entityId: targetOrganizationId,
    oldData: {
      plan_tier: String(currentRow.plan_tier || "free").trim().toLowerCase(),
      quota_ai_tokens: Number(currentRow.quota_ai_tokens || 0),
      quota_messages: Number(currentRow.quota_messages || 0),
    },
    newData: {
      plan_tier: String(updatedRow.plan_tier || currentRow.plan_tier || "free").trim().toLowerCase(),
      quota_ai_tokens: Number(updatedRow.quota_ai_tokens || 0),
      quota_messages: Number(updatedRow.quota_messages || 0),
    },
    metadata: {
      reason,
      organizationId: targetOrganizationId,
      plan_tier: hasPlanTier ? normalizedPlanTier : null,
    },
  }).catch(() => null);

  return toOrganizationSummary(updatedRow);
}

export async function isOrganizationSchemaAvailable() {
  try {
    await query(`SELECT 1 FROM organizations LIMIT 1`);
    return true;
  } catch (err: any) {
    if (isRecoverableOrganizationQueryError(err)) {
      return false;
    }
    throw err;
  }
}

export async function upsertOrganizationMembershipService(input: {
  organizationId: string;
  userId: string;
  role: OrganizationRole;
}) {
  const organizationId = String(input.organizationId || "").trim();
  const userId = String(input.userId || "").trim();
  if (!organizationId || !userId) {
    throw { status: 400, message: "Organization and user are required" };
  }

  const res = await query(
    `
      INSERT INTO organization_memberships (
        organization_id,
        user_id,
        role
      ) VALUES ($1, $2, $3)
      ON CONFLICT (organization_id, user_id)
      DO UPDATE SET
        role = EXCLUDED.role,
        updated_at = NOW()
      RETURNING organization_id, user_id, role, created_at, updated_at
    `,
    [organizationId, userId, input.role]
  ).catch((err) => {
    if (isRecoverableOrganizationQueryError(err)) {
      return { rows: [] };
    }
    throw err;
  });

  return res.rows[0] || null;
}

export async function findOrganizationByIdService(
  organizationId: string,
  userId?: string | null
): Promise<OrganizationSummary | null> {
  const targetOrganizationId = String(organizationId || "").trim();
  if (!targetOrganizationId) {
    return null;
  }

  const platformRole = userId ? await getUserPlatformRole(userId) : null;
  const isPlatformOperator = platformRole === "super_admin" || platformRole === "developer";

  return queryOrganizationsWithFallback<OrganizationSummary | null>(
    `
      SELECT
        o.id,
        o.name,
        o.slug,
        o.plan_tier,
        o.quota_ai_tokens,
        o.quota_messages,
        o.is_active,
        o.created_at,
        o.updated_at,
        COUNT(DISTINCT w.id)::int AS workspace_count,
        COUNT(DISTINCT om.user_id)::int AS member_count
      FROM organizations o
      LEFT JOIN workspaces w
        ON w.organization_id = o.id
      LEFT JOIN organization_memberships om
        ON om.organization_id = o.id
      WHERE o.id = $1
        AND (
          $2::boolean = true
          OR EXISTS (
            SELECT 1
            FROM organization_memberships check_membership
            WHERE check_membership.organization_id = o.id
              AND check_membership.user_id = $3
          )
          OR EXISTS (
            SELECT 1
            FROM workspaces access_workspace
            LEFT JOIN workspace_memberships workspace_membership
              ON workspace_membership.workspace_id = access_workspace.id
             AND workspace_membership.user_id = $3
             AND workspace_membership.status = 'active'
            WHERE access_workspace.organization_id = o.id
              AND (
                access_workspace.owner_user_id = $3
                OR workspace_membership.user_id IS NOT NULL
              )
          )
        )
      GROUP BY o.id
      LIMIT 1
    `,
    [targetOrganizationId, isPlatformOperator, userId || null],
    async () => {
      if (userId) {
        const workspaces = await findWorkspacesByUser(userId);
        const match = workspaces.find((workspace: any) => String(workspace.id || "") === targetOrganizationId);
        return toSyntheticOrganizationFromWorkspace(match || null);
      }
      return null;
    }
  );
}

export async function findOrganizationByWorkspaceIdService(
  workspaceId: string,
  userId?: string | null
): Promise<OrganizationSummary | null> {
  const targetWorkspaceId = String(workspaceId || "").trim();
  if (!targetWorkspaceId) {
    return null;
  }

  const workspace = userId
    ? await findWorkspaceById(targetWorkspaceId, userId).catch(() => null)
    : await query(
        `SELECT id, name, plan_id, status, created_at, updated_at, organization_id
         FROM workspaces
         WHERE id = $1
         LIMIT 1`,
        [targetWorkspaceId]
      )
        .then((res) => res.rows[0] || null)
        .catch(() => null);
  if (!workspace) {
    return null;
  }

  if (workspace.organization_id) {
    const org = await findOrganizationByIdService(String(workspace.organization_id), userId || null);
    if (org) {
      return org;
    }
  }

  return toSyntheticOrganizationFromWorkspace(workspace);
}

export async function listOrganizationWorkspacesService(
  organizationId: string,
  userId?: string | null
) {
  const targetOrganizationId = String(organizationId || "").trim();
  if (!targetOrganizationId) {
    return [];
  }

  const platformRole = userId ? await getUserPlatformRole(userId) : null;
  const isPlatformOperator = platformRole === "super_admin" || platformRole === "developer";

  return queryOrganizationsWithFallback<any[]>(
    `
      SELECT
        w.*,
        COALESCE(member_counts.member_count, 0)::int AS member_count
      FROM workspaces w
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS member_count
        FROM workspace_memberships wm
        WHERE wm.workspace_id = w.id
          AND wm.status = 'active'
      ) member_counts ON true
      WHERE w.organization_id = $1
        AND (
          $2::boolean = true
          OR EXISTS (
            SELECT 1
            FROM organization_memberships om
            WHERE om.organization_id = $1
              AND om.user_id = $3
          )
          OR EXISTS (
            SELECT 1
            FROM workspace_memberships wm
            WHERE wm.workspace_id = w.id
              AND wm.user_id = $3
              AND wm.status = 'active'
          )
          OR w.owner_user_id = $3
        )
      ORDER BY w.created_at DESC
    `,
    [targetOrganizationId, isPlatformOperator, userId || null],
    async () => {
      const workspaces = await findWorkspacesByUser(userId || "");
      return workspaces.filter((workspace: any) => String(workspace.organization_id || "") === targetOrganizationId);
    }
  );
}

export async function resolveOrganizationMembershipService(
  userId: string,
  organizationId: string
): Promise<OrganizationMembershipRecord | null> {
  const targetOrganizationId = String(organizationId || "").trim();
  if (!targetOrganizationId) {
    return null;
  }

  const platformRole = await getUserPlatformRole(userId);
  if (platformRole === "super_admin" || platformRole === "developer") {
    return {
      organizationId: targetOrganizationId,
      userId,
      role: "owner",
      createdAt: null,
      updatedAt: null,
      source: "platform_operator",
    };
  }

  const directMembershipRes = await query(
    `
      SELECT organization_id, user_id, role, created_at, updated_at
      FROM organization_memberships
      WHERE organization_id = $1
        AND user_id = $2
      LIMIT 1
    `,
    [targetOrganizationId, userId]
  ).catch((err) => {
    if (isRecoverableOrganizationQueryError(err)) {
      return { rows: [] };
    }
    throw err;
  });

  const directMembership = directMembershipRes.rows[0];
  if (directMembership) {
    return {
      organizationId: String(directMembership.organization_id),
      userId: String(directMembership.user_id),
      role: normalizeOrganizationRole(directMembership.role),
      createdAt: directMembership.created_at ? new Date(directMembership.created_at).toISOString() : null,
      updatedAt: directMembership.updated_at ? new Date(directMembership.updated_at).toISOString() : null,
      source: "organization_membership",
    };
  }

  const workspaceMemberships = await findWorkspaceMembershipsByUser(userId).catch(() => []);
  const workspaceIds = new Set(
    (Array.isArray(workspaceMemberships) ? workspaceMemberships : [])
      .map((membership: any) => String(membership.workspace_id || "").trim())
      .filter(Boolean)
  );

  if (workspaceIds.size > 0) {
    const linkedWorkspaces = await query(
      `SELECT id, organization_id, owner_user_id
       FROM workspaces
       WHERE organization_id = $1
          OR id = ANY($2::uuid[])`,
      [targetOrganizationId, [...workspaceIds]]
    ).catch((err) => {
      if (isRecoverableOrganizationQueryError(err)) {
        return { rows: [] };
      }
      throw err;
    });

    const matchedWorkspace = linkedWorkspaces.rows.find((row: any) => String(row.organization_id || "") === targetOrganizationId);
    if (matchedWorkspace) {
      return {
        organizationId: targetOrganizationId,
        userId,
        role: String(matchedWorkspace.owner_user_id || "") === userId ? "owner" : "member",
        createdAt: null,
        updatedAt: null,
        source: String(matchedWorkspace.owner_user_id || "") === userId ? "workspace_owner" : "workspace_membership",
      };
    }
  }

  return null;
}

function cryptoRandomSuffix(seed: string) {
  const text = String(seed || "").trim() || "organization";
  return Buffer.from(`${text}:${Date.now()}`)
    .toString("base64url")
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 8)
    .toLowerCase() || "org";
}

export async function assertOrganizationAccessService(
  userId: string,
  organizationId: string,
  allowedRoles: OrganizationRole[] = ["owner", "admin", "member"]
) {
  const membership = await resolveOrganizationMembershipService(userId, organizationId);
  if (!membership || !allowedRoles.includes(membership.role)) {
    throw { status: 403, message: "Forbidden: Insufficient organization permissions" };
  }

  return membership;
}

export async function getUserOrganizationContextService(userId: string, preferredOrganizationId?: string | null) {
  const organizations = await listUserOrganizationsService(userId);
  const activeOrganization =
    (preferredOrganizationId
      ? organizations.find((organization) => organization.id === String(preferredOrganizationId || "").trim())
      : null) ||
    organizations[0] ||
    null;

  const activeMembership = activeOrganization
    ? await resolveOrganizationMembershipService(userId, activeOrganization.id)
    : null;

  return {
    organizations,
    activeOrganization,
    activeMembership,
  };
}
