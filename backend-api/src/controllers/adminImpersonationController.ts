import { NextFunction, Response } from "express";

import { AuthRequest } from "../middleware/authMiddleware";
import { createAuditLog } from "../models/auditLogModel";
import {
  getOrganizationDetailsService,
  getUserOrganizationContextService,
} from "../services/organizationService";

function getUserId(req: AuthRequest) {
  return req.user?.id || req.user?.user_id || null;
}

export async function enterOrganizationImpersonationCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const actorUserId = getUserId(req);
    if (!actorUserId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const organizationId = String(req.params.organizationId || req.params.id || "").trim();
    if (!organizationId) {
      return res.status(400).json({ error: "Organization id is required" });
    }

    const organization = await getOrganizationDetailsService(organizationId, actorUserId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    const context = await getUserOrganizationContextService(actorUserId, organizationId);

    await createAuditLog({
      userId: actorUserId,
      action: "org_impersonation_start",
      entity: "organization",
      entityId: organization.id,
      newData: {
        organizationId: organization.id,
        organizationName: organization.name,
        mode: "organization",
      },
      metadata: {
        impersonation_mode: "organization",
        target_organization_id: organization.id,
        target_organization_name: organization.name,
      },
    });

    return res.json({
      success: true,
      data: {
        organizations: context.organizations,
        activeOrganization: context.activeOrganization,
        activeOrganizationMembership: context.activeMembership,
        organizationImpersonation: {
          active: true,
          mode: "organization" as const,
          organizationId: organization.id,
          organizationName: organization.name,
          impersonatorId: actorUserId,
          readOnly: true,
          startedAt: new Date().toISOString(),
          expiresAt: null,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function exitOrganizationImpersonationCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const actorUserId = getUserId(req);
    if (!actorUserId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const organizationId = String(
      req.body?.organizationId ||
        req.query?.organizationId ||
        req.headers["x-impersonation-organization-id"] ||
        ""
    ).trim();

    if (organizationId) {
      const organization = await getOrganizationDetailsService(organizationId, actorUserId).catch(() => null);
      if (organization) {
        await createAuditLog({
          userId: actorUserId,
          action: "org_impersonation_end",
          entity: "organization",
          entityId: organization.id,
          metadata: {
            impersonation_mode: "organization",
            target_organization_id: organization.id,
            target_organization_name: organization.name,
          },
        });
      }
    }

    const context = await getUserOrganizationContextService(actorUserId, null);

    return res.json({
      success: true,
      data: {
        organizations: context.organizations,
        activeOrganization: null,
        activeOrganizationMembership: null,
        organizationImpersonation: null,
      },
    });
  } catch (err) {
    next(err);
  }
}
