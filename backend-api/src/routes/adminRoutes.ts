import { Router } from "express";

import { authMiddleware } from "../middleware/authMiddleware";
import { requireAuthenticatedUser, requirePlatformRoles } from "../middleware/policyMiddleware";
import { exitImpersonationCtrl, impersonateWorkspaceCtrl } from "../controllers/adminAuthController";

const router = Router();

router.use(authMiddleware, requireAuthenticatedUser, requirePlatformRoles(["super_admin", "developer"]));

router.post("/impersonate/exit", exitImpersonationCtrl);
router.post("/impersonate/:workspaceId", impersonateWorkspaceCtrl);

export default router;
