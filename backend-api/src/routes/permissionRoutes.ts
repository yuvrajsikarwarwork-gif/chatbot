import { Router } from "express";

import { authMiddleware } from "../middleware/authMiddleware";
import {
  requireAuthenticatedUser,
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

router.get("/me", resolveWorkspaceContext, resolveProjectContext, getMyPermissionsCtrl);
router.get("/role/:role", resolveWorkspaceContext, getRolePermissionsCtrl);
router.patch("/role", patchRolePermissionsCtrl);
router.patch("/user", resolveWorkspaceContext, patchUserPermissionsCtrl);

export default router;
