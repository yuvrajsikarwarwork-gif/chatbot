import { Router } from "express";

import { authMiddleware } from "../middleware/authMiddleware";
import { requireAuthenticatedUser, requirePlatformRoles, requireSuperAdmin } from "../middleware/policyMiddleware";
import { exitImpersonationCtrl, impersonateWorkspaceCtrl } from "../controllers/adminAuthController";
import {
  getGlobalTrafficSeriesCtrl,
  getOrganizationUsageBreakdownCtrl,
  getTopConsumersCtrl,
} from "../controllers/adminAnalyticsController";
import {
  createOrganizationApiKeyCtrl,
  listOrganizationApiKeysCtrl,
  revokeOrganizationApiKeyCtrl,
} from "../controllers/adminApiKeyController";
import { getGlobalAuditLogsCtrl } from "../controllers/adminAuditController";
import {
  getOrganizationCtrl,
  getOrganizationUsageCtrl,
  listOrganizationTemplatesCtrl,
  listOrganizationsCtrl,
  updateOrganizationCtrl,
} from "../controllers/adminOrganizationController";
import {
  enterOrganizationImpersonationCtrl,
  exitOrganizationImpersonationCtrl,
} from "../controllers/adminImpersonationController";

const router = Router();

router.use(authMiddleware, requireAuthenticatedUser, requirePlatformRoles(["super_admin", "developer"]));

router.post("/impersonate/organization/exit", requireSuperAdmin, exitOrganizationImpersonationCtrl);
router.post("/impersonate/organization/:organizationId", requireSuperAdmin, enterOrganizationImpersonationCtrl);
router.post("/impersonate/exit", exitImpersonationCtrl);
router.post("/impersonate/:workspaceId", impersonateWorkspaceCtrl);
router.get("/analytics/traffic", requireSuperAdmin, getGlobalTrafficSeriesCtrl);
router.get("/audit-logs", requireSuperAdmin, getGlobalAuditLogsCtrl);
router.get("/analytics/top-consumers", requireSuperAdmin, getTopConsumersCtrl);
router.get("/analytics/organizations/:organizationId/breakdown", requireSuperAdmin, getOrganizationUsageBreakdownCtrl);
router.get("/organizations", requireSuperAdmin, listOrganizationsCtrl);
router.patch("/organizations/:organizationId", requireSuperAdmin, updateOrganizationCtrl);
router.get("/organizations/:organizationId", requireSuperAdmin, getOrganizationCtrl);
router.get("/organizations/:organizationId/usage", requireSuperAdmin, getOrganizationUsageCtrl);
router.get("/organizations/:organizationId/api-keys", requireSuperAdmin, listOrganizationApiKeysCtrl);
router.post("/organizations/:organizationId/api-keys", requireSuperAdmin, createOrganizationApiKeyCtrl);
router.delete("/organizations/:organizationId/api-keys/:keyId", requireSuperAdmin, revokeOrganizationApiKeyCtrl);
router.get("/organizations/:organizationId/templates", requireSuperAdmin, listOrganizationTemplatesCtrl);

export default router;
