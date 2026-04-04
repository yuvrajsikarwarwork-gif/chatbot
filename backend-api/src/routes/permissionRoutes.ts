import { Router } from "express";

import { authMiddleware } from "../middleware/authMiddleware";
import { resolveOrganizationContext } from "../middleware/organizationContextMiddleware";
import {
  requireAuthenticatedUser,
  requirePlatformRoles,
  resolveProjectContext,
  resolveWorkspaceContext,
} from "../middleware/policyMiddleware";
import {
  getMyPermissionsCtrl,
  getRolePermissionsCtrl,
  patchRolePermissionsCtrl,
  patchUserPermissionsCtrl,
} from "../controllers/permissionController";

const router = Router();

router.use(authMiddleware);
router.use(requireAuthenticatedUser);
router.use(resolveOrganizationContext);

router.get("/me", resolveWorkspaceContext, resolveOrganizationContext, resolveProjectContext, getMyPermissionsCtrl);
router.get("/role/:role", getRolePermissionsCtrl);
router.patch("/role", requirePlatformRoles(["developer", "super_admin"]), patchRolePermissionsCtrl);
router.patch("/user", resolveWorkspaceContext, resolveOrganizationContext, patchUserPermissionsCtrl);

export default router;
