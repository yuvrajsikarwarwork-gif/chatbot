import { Router } from "express";

import { authMiddleware } from "../middleware/authMiddleware";
import {
  requireAuthenticatedUser,
  requireWorkspaceAccess,
  requireWorkspacePermission,
  resolveWorkspaceContext,
} from "../middleware/policyMiddleware";
import {
  getConversationSettingsCtrl,
  updateConversationSettingsCtrl,
} from "../controllers/conversationSettingsController";
import { WORKSPACE_PERMISSIONS } from "../services/workspaceAccessService";

const router = Router();

router.use(authMiddleware);
router.use(requireAuthenticatedUser);

router.get("/:workspaceId", resolveWorkspaceContext, requireWorkspaceAccess, getConversationSettingsCtrl);
router.put(
  "/:workspaceId",
  resolveWorkspaceContext,
  requireWorkspacePermission(WORKSPACE_PERMISSIONS.manageWorkspace),
  updateConversationSettingsCtrl
);

export default router;
