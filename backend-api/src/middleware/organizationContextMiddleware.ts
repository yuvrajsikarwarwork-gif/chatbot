import { NextFunction, RequestHandler, Response } from "express";

import { AuthRequest } from "./authMiddleware";
import {
  findOrganizationByIdService,
  findOrganizationByWorkspaceIdService,
  getUserOrganizationContextService,
  resolveOrganizationMembershipService,
  type OrganizationMembershipRecord,
  type OrganizationSummary,
} from "../services/organizationService";

export interface OrganizationRequest extends AuthRequest {
  activeOrganizationId?: string | null;
  activeOrganization?: OrganizationSummary | null;
  activeOrganizationMembership?: OrganizationMembershipRecord | null;
  organizationMembership?: OrganizationMembershipRecord | null;
  organizations?: OrganizationSummary[];
  organizationImpersonation?: {
    active: boolean;
    mode: "organization";
    impersonatorId: string | null;
    impersonatedOrganizationId: string | null;
    readOnly: boolean;
  } | null;
}

function getUserId(req: AuthRequest) {
  return req.user?.id || req.user?.user_id || null;
}

function getStringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getDirectOrganizationId(req: AuthRequest) {
  return (
    getStringValue(req.headers["x-impersonation-organization-id"]) ||
    getStringValue(req.user?.impersonated_organization_id) ||
    getStringValue(req.headers["x-organization-id"]) ||
    getStringValue(req.params.organizationId) ||
    getStringValue(req.params.id && req.baseUrl.includes("/organizations") ? req.params.id : null) ||
    getStringValue(req.body?.organizationId) ||
    getStringValue(req.body?.organization_id) ||
    getStringValue(req.query?.organizationId)
  );
}

function getDirectWorkspaceId(req: AuthRequest) {
  return (
    getStringValue(req.headers["x-workspace-id"]) ||
    getStringValue(req.params.workspaceId) ||
    getStringValue(req.params.id && req.baseUrl.includes("/workspaces") ? req.params.id : null) ||
    getStringValue(req.body?.workspaceId) ||
    getStringValue(req.body?.workspace_id) ||
    getStringValue(req.query?.workspaceId)
  );
}

function setResolvedOrganizationContext(
  req: OrganizationRequest,
  organization: OrganizationSummary | null,
  membership: OrganizationMembershipRecord | null,
  organizations: OrganizationSummary[],
  impersonation: OrganizationRequest["organizationImpersonation"] = null
) {
  req.activeOrganizationId = organization?.id || null;
  req.activeOrganization = organization;
  req.activeOrganizationMembership = membership;
  req.organizationMembership = membership;
  req.organizations = organizations;
  req.organizationImpersonation = impersonation;
  req.user = {
    ...(req.user || {}),
    organization_id: organization?.id || null,
    organization_role: membership?.role || null,
    impersonator_id: impersonation?.impersonatorId || null,
    impersonated_organization_id: impersonation?.impersonatedOrganizationId || null,
    impersonation_mode: impersonation?.mode || null,
  };
}

async function resolveFromWorkspace(
  req: AuthRequest,
  userId: string,
  workspaceId: string | null
) {
  if (!workspaceId) {
    return null;
  }

  const organization = await findOrganizationByWorkspaceIdService(workspaceId, userId).catch(() => null);
  if (!organization) {
    return null;
  }

  const membership = await resolveOrganizationMembershipService(userId, organization.id).catch(() => null);
  return { organization, membership };
}

export const resolveOrganizationContext: RequestHandler = async (req, res, next) => {
  try {
    const orgReq = req as OrganizationRequest;
    const userId = getUserId(orgReq);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const requestedOrganizationId = getDirectOrganizationId(orgReq);
    const requestedWorkspaceId = getDirectWorkspaceId(orgReq);
    const impersonationOrganizationId =
      getStringValue(orgReq.headers["x-impersonation-organization-id"]) ||
      getStringValue(orgReq.user?.impersonated_organization_id);

    const organizationContext = await getUserOrganizationContextService(
      userId,
      requestedOrganizationId || null
    ).catch(() => ({
      organizations: [],
      activeOrganization: null,
      activeMembership: null,
    }));

    let activeOrganization = organizationContext.activeOrganization || null;
    let activeMembership = organizationContext.activeMembership || null;

    const isImpersonatingOrganization = Boolean(impersonationOrganizationId);

    if (isImpersonatingOrganization) {
      activeOrganization = await findOrganizationByIdService(impersonationOrganizationId!, userId).catch(() => null);
      if (!activeOrganization) {
        res.status(403).json({ error: "Forbidden: Organization access denied" });
        return;
      }
      activeMembership = await resolveOrganizationMembershipService(userId, activeOrganization.id).catch(() => null);
    } else if (requestedOrganizationId) {
      activeOrganization = await findOrganizationByIdService(requestedOrganizationId, userId).catch(() => null);
      if (!activeOrganization) {
        res.status(403).json({ error: "Forbidden: Organization access denied" });
        return;
      }
      activeMembership = await resolveOrganizationMembershipService(userId, activeOrganization.id).catch(() => null);
    } else if (requestedWorkspaceId) {
      const resolved = await resolveFromWorkspace(orgReq, userId, requestedWorkspaceId);
      if (resolved) {
        activeOrganization = resolved.organization;
        activeMembership = resolved.membership;
      }
    }

    setResolvedOrganizationContext(
      orgReq,
      activeOrganization,
      activeMembership,
      organizationContext.organizations,
      isImpersonatingOrganization
        ? {
            active: true,
            mode: "organization",
            impersonatorId: getStringValue(orgReq.headers["x-impersonator-id"]) || userId,
            impersonatedOrganizationId: activeOrganization?.id || impersonationOrganizationId || null,
            readOnly: String(orgReq.headers["x-impersonation-readonly"] || "true").toLowerCase() !== "false",
          }
        : null
    );

    next();
  } catch (err) {
    next(err);
  }
};

export function requireOrganizationAccess(minRole: "owner" | "admin" | "member" = "member"): RequestHandler {
  return async (req, res, next) => {
    try {
      const orgReq = req as OrganizationRequest;
      const userId = getUserId(orgReq);
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const organizationId =
        orgReq.activeOrganizationId ||
        getDirectOrganizationId(orgReq) ||
        getDirectWorkspaceId(orgReq);
      if (!organizationId) {
        res.status(400).json({ error: "Organization context is required" });
        return;
      }

      const membership =
        orgReq.activeOrganizationMembership ||
        (await resolveOrganizationMembershipService(userId, organizationId).catch(() => null));

      const roleWeight = { owner: 3, admin: 2, member: 1 } as const;
      if (!membership || roleWeight[membership.role] < roleWeight[minRole]) {
        res.status(403).json({ error: "Forbidden: Insufficient organization permissions" });
        return;
      }

      orgReq.activeOrganizationMembership = membership;
      orgReq.organizationMembership = membership;
      next();
    } catch (err) {
      next(err);
    }
  };
}
