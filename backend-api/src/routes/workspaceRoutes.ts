import { Router } from "express";

import { authMiddleware } from "../middleware/authMiddleware";
import {
  requireAuthenticatedUser,
  requirePlatformRoles,
  requireWorkspaceAccess,
  requireWorkspacePermission,
  requireWorkspacePermissionAny,
  resolveWorkspaceContext,
} from "../middleware/policyMiddleware";
import {
  approveWorkspaceSupportRequestCtrl,
  assignWorkspaceUserCtrl,
  createWorkspaceSupportRequestCtrl,
  createWorkspaceCtrl,
  deleteWorkspaceCtrl,
  denyWorkspaceSupportRequestCtrl,
  getWorkspaceCtrl,
  grantWorkspaceSupportAccessCtrl,
  lockWorkspaceCtrl,
  listWorkspaceMembersCtrl,
  listWorkspaceSupportAccessCtrl,
  listWorkspaceSupportRequestsCtrl,
  listWorkspacesCtrl,
  removeWorkspaceUserCtrl,
  revokeWorkspaceSupportAccessCtrl,
  unlockWorkspaceCtrl,
  updateWorkspaceBillingCtrl,
  updateWorkspaceCtrl,
} from "../controllers/workspaceController";
import { WORKSPACE_PERMISSIONS } from "../services/workspaceAccessService";

const router = Router();

router.use(authMiddleware);
router.use(requireAuthenticatedUser);

router.get("/", listWorkspacesCtrl);
router.post("/", createWorkspaceCtrl);
router.get(
  "/:id/members-access",
  resolveWorkspaceContext,
  requireWorkspacePermissionAny([
    WORKSPACE_PERMISSIONS.manageUsers,
    WORKSPACE_PERMISSIONS.managePermissions,
  ]),
  listWorkspaceMembersCtrl
);
router.post(
  "/:id/members-access",
  resolveWorkspaceContext,
  requireWorkspacePermission(WORKSPACE_PERMISSIONS.manageUsers),
  assignWorkspaceUserCtrl
);
router.delete(
  "/:id/members-access/:userId",
  resolveWorkspaceContext,
  requireWorkspacePermission(WORKSPACE_PERMISSIONS.manageUsers),
  removeWorkspaceUserCtrl
);
router.delete(
  "/:id",
  requirePlatformRoles(["super_admin", "developer"]),
  deleteWorkspaceCtrl
);
router.put(
  "/:id",
  requirePlatformRoles(["super_admin", "developer"]),
  updateWorkspaceCtrl
);
router.put(
  "/:id/billing",
  requirePlatformRoles(["super_admin", "developer"]),
  updateWorkspaceBillingCtrl
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
  resolveWorkspaceContext,
  requireWorkspacePermissionAny([
    WORKSPACE_PERMISSIONS.manageUsers,
    WORKSPACE_PERMISSIONS.managePermissions,
  ]),
  listWorkspaceMembersCtrl
);
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
  resolveWorkspaceContext,
  requireWorkspaceAccess,
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
router.get("/:id/support-requests", resolveWorkspaceContext, requireWorkspaceAccess, listWorkspaceSupportRequestsCtrl);
router.post(
  "/:id/support-requests",
  resolveWorkspaceContext,
  requireWorkspaceAccess,
  createWorkspaceSupportRequestCtrl
);
router.post("/:id/support-requests/:requestId/approve", approveWorkspaceSupportRequestCtrl);
router.post("/:id/support-requests/:requestId/deny", denyWorkspaceSupportRequestCtrl);
router.get("/:id", resolveWorkspaceContext, requireWorkspaceAccess, getWorkspaceCtrl);

export default router;
