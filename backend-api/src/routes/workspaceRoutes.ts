import { Router } from "express";

import { authMiddleware } from "../middleware/authMiddleware";
import {
  requireAuthenticatedUser,
  requirePlatformRoles,
  requireWorkspaceAccess,
  requireWorkspacePermission,
  requireWorkspacePermissionAny,
  resolveWorkspaceContext,
  resolveWorkspaceOversightContext,
} from "../middleware/policyMiddleware";
import { resolveOrganizationContext } from "../middleware/organizationContextMiddleware";
import {
  approveWorkspaceSupportRequestCtrl,
  archiveWorkspaceCtrl,
  assignWorkspaceUserCtrl,
  createWorkspaceExportRequestCtrl,
  createWorkspaceSupportRequestCtrl,
  createWorkspaceCtrl,
  deleteWorkspaceCtrl,
  downloadWorkspaceExportForUserCtrl,
  denyWorkspaceSupportRequestCtrl,
  emergencyResetWorkspaceOwnerPasswordCtrl,
  getWorkspaceBillingContextCtrl,
  getWorkspaceMailSettingsCtrl,
  getWorkspaceCtrl,
  getWorkspaceOverviewCtrl,
  getWorkspaceWalletCtrl,
  createWorkspaceWalletAdjustmentCtrl,
  ingestWorkspaceKnowledgeCtrl,
  grantWorkspaceSupportAccessCtrl,
  lockWorkspaceCtrl,
  listWorkspaceMembersCtrl,
  listWorkspaceExportRequestsCtrl,
  listWorkspaceHistoryCtrl,
  listWorkspaceSupportAccessCtrl,
  listWorkspaceSupportRequestsCtrl,
  listWorkspacesCtrl,
  removeWorkspaceUserCtrl,
  repairWorkspaceWhatsAppContactsCtrl,
  restoreWorkspaceCtrl,
  selfRestoreWorkspaceCtrl,
  resendWorkspaceMemberInviteCtrl,
  revokeWorkspaceSupportAccessCtrl,
  searchWorkspaceKnowledgeCtrl,
  unlockWorkspaceCtrl,
  updateWorkspaceBillingCtrl,
  resendWorkspaceOwnerInviteCtrl,
  updateWorkspaceMailSettingsCtrl,
  testWorkspaceMailSettingsCtrl,
  updateWorkspaceOwnerEmailAndResendInviteCtrl,
  updateWorkspaceCtrl,
} from "../controllers/workspaceController";
import { WORKSPACE_PERMISSIONS } from "../services/workspaceAccessService";

const router = Router();

router.use(authMiddleware);
router.use(requireAuthenticatedUser);
router.use(resolveOrganizationContext);

router.get("/", listWorkspacesCtrl);
router.get("/history", requirePlatformRoles(["super_admin", "developer"]), listWorkspaceHistoryCtrl);
router.post("/", requirePlatformRoles(["super_admin", "developer"]), createWorkspaceCtrl);
router.get(
  "/:id/members-access",
  resolveWorkspaceContext,
  resolveOrganizationContext,
  requireWorkspacePermissionAny([
    WORKSPACE_PERMISSIONS.manageUsers,
    WORKSPACE_PERMISSIONS.managePermissions,
  ]),
  listWorkspaceMembersCtrl
);
router.post(
  "/:id/members-access",
  resolveWorkspaceContext,
  resolveOrganizationContext,
  requireWorkspacePermission(WORKSPACE_PERMISSIONS.manageUsers),
  assignWorkspaceUserCtrl
);
router.delete(
  "/:id/members-access/:userId",
  resolveWorkspaceContext,
  resolveOrganizationContext,
  requireWorkspacePermission(WORKSPACE_PERMISSIONS.manageUsers),
  removeWorkspaceUserCtrl
);
router.delete(
  "/:id",
  requirePlatformRoles(["super_admin", "developer"]),
  deleteWorkspaceCtrl
);
router.post(
  "/:id/archive",
  requirePlatformRoles(["super_admin", "developer"]),
  resolveOrganizationContext,
  archiveWorkspaceCtrl
);
router.post(
  "/:id/restore",
  requirePlatformRoles(["super_admin", "developer"]),
  resolveOrganizationContext,
  restoreWorkspaceCtrl
);
router.post("/:id/self-restore", selfRestoreWorkspaceCtrl);
router.put(
  "/:id",
  requirePlatformRoles(["super_admin", "developer"]),
  resolveOrganizationContext,
  updateWorkspaceCtrl
);
router.put(
  "/:id/billing",
  requirePlatformRoles(["super_admin", "developer"]),
  resolveOrganizationContext,
  updateWorkspaceBillingCtrl
);
router.get(
  "/:id/mail-settings",
  resolveWorkspaceContext,
  resolveOrganizationContext,
  requireWorkspacePermission(WORKSPACE_PERMISSIONS.manageWorkspace),
  getWorkspaceMailSettingsCtrl
);
router.put(
  "/:id/mail-settings",
  resolveWorkspaceContext,
  resolveOrganizationContext,
  requireWorkspacePermission(WORKSPACE_PERMISSIONS.manageWorkspace),
  updateWorkspaceMailSettingsCtrl
);
router.post(
  "/:id/mail-settings/test",
  resolveWorkspaceContext,
  resolveOrganizationContext,
  requireWorkspacePermission(WORKSPACE_PERMISSIONS.manageWorkspace),
  testWorkspaceMailSettingsCtrl
);
router.post(
  "/:id/lock",
  requirePlatformRoles(["super_admin", "developer"]),
  lockWorkspaceCtrl
);
router.post(
  "/:id/unlock",
  requirePlatformRoles(["super_admin", "developer"]),
  unlockWorkspaceCtrl
);
router.get(
  "/:id/members",
  resolveWorkspaceOversightContext,
  resolveOrganizationContext,
  requirePlatformRoles(["super_admin", "developer"]),
  listWorkspaceMembersCtrl
);
router.post(
  "/:id/members/emergency-owner-reset",
  requirePlatformRoles(["super_admin", "developer"]),
  emergencyResetWorkspaceOwnerPasswordCtrl
);
router.post(
  "/:id/invites/resend",
  resolveWorkspaceOversightContext,
  resolveOrganizationContext,
  requirePlatformRoles(["super_admin", "developer"]),
  resendWorkspaceMemberInviteCtrl
);
router.post(
  "/:id/members/resend-owner-invite",
  requirePlatformRoles(["super_admin", "developer"]),
  resendWorkspaceOwnerInviteCtrl
);
router.post(
  "/:id/members/update-owner-email",
  requirePlatformRoles(["super_admin", "developer"]),
  updateWorkspaceOwnerEmailAndResendInviteCtrl
);
router.get("/:id/export-requests", listWorkspaceExportRequestsCtrl);
router.post("/:id/export-requests", createWorkspaceExportRequestCtrl);
router.get("/:id/export-requests/:jobId/download", downloadWorkspaceExportForUserCtrl);
router.post(
  "/:id/members",
  resolveWorkspaceContext,
  requireWorkspacePermission(WORKSPACE_PERMISSIONS.manageUsers),
  assignWorkspaceUserCtrl
);
router.delete(
  "/:id/members/:userId",
  resolveWorkspaceContext,
  requireWorkspacePermission(WORKSPACE_PERMISSIONS.manageUsers),
  removeWorkspaceUserCtrl
);
router.post(
  "/:id/users",
  resolveWorkspaceContext,
  requireWorkspacePermission(WORKSPACE_PERMISSIONS.manageUsers),
  assignWorkspaceUserCtrl
);
router.get(
  "/:id/support-access",
  resolveWorkspaceOversightContext,
  listWorkspaceSupportAccessCtrl
);
router.post(
  "/:id/support-access",
  requirePlatformRoles(["super_admin", "developer"]),
  grantWorkspaceSupportAccessCtrl
);
router.delete(
  "/:id/support-access/:userId",
  requirePlatformRoles(["super_admin", "developer"]),
  revokeWorkspaceSupportAccessCtrl
);
router.get("/:id/support-requests", resolveWorkspaceOversightContext, resolveOrganizationContext, listWorkspaceSupportRequestsCtrl);
router.get("/:id/overview", resolveWorkspaceOversightContext, resolveOrganizationContext, getWorkspaceOverviewCtrl);
router.get("/:id/wallet", resolveWorkspaceOversightContext, resolveOrganizationContext, getWorkspaceWalletCtrl);
router.get("/:id/billing-context", requirePlatformRoles(["super_admin", "developer"]), getWorkspaceBillingContextCtrl);
router.post(
  "/:id/wallet",
  requirePlatformRoles(["super_admin", "developer"]),
  createWorkspaceWalletAdjustmentCtrl
);
router.get("/:id/knowledge/search", resolveWorkspaceContext, requireWorkspaceAccess, searchWorkspaceKnowledgeCtrl);
router.post(
  "/:id/knowledge/documents",
  resolveWorkspaceContext,
  requireWorkspacePermission(WORKSPACE_PERMISSIONS.manageWorkspace),
  ingestWorkspaceKnowledgeCtrl
);
router.post(
  "/:id/repair/whatsapp-contacts",
  resolveWorkspaceContext,
  requireWorkspacePermission(WORKSPACE_PERMISSIONS.manageWorkspace),
  repairWorkspaceWhatsAppContactsCtrl
);
router.post(
  "/:id/support-requests",
  resolveWorkspaceContext,
  requireWorkspaceAccess,
  createWorkspaceSupportRequestCtrl
);
router.post(
  "/:id/support-requests/:requestId/approve",
  requirePlatformRoles(["super_admin", "developer"]),
  approveWorkspaceSupportRequestCtrl
);
router.post(
  "/:id/support-requests/:requestId/deny",
  requirePlatformRoles(["super_admin", "developer"]),
  denyWorkspaceSupportRequestCtrl
);
router.get("/:id", resolveWorkspaceOversightContext, getWorkspaceCtrl);

export default router;
