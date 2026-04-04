// src/routes/flowRoutes.ts

import { Router } from "express";

import {
  getFlowsByBot,
  getFlowBuilderCapabilities,
  getFlowSummariesByBot,
  getFlow,
  createFlowCtrl,
  updateFlowCtrl,
  patchFlowNodeCtrl,
  deleteFlowCtrl,
  saveFlowCtrl,
  publishFlowCtrl,
  getFlowVersionsCtrl,
  compareFlowVersionsCtrl,
  handleRollback,
} from "../controllers/flowController";

import { authMiddleware } from "../middleware/authMiddleware";
import {
  requireAuthenticatedUser,
  requireActiveWorkspaceEditAccess,
  requireBotPermission,
} from "../middleware/policyMiddleware";
import { WORKSPACE_PERMISSIONS } from "../services/workspaceAccessService";

const router = Router();

router.use(authMiddleware);
router.use(requireAuthenticatedUser);

router.get(
  "/bot/:botId",
  requireBotPermission(WORKSPACE_PERMISSIONS.viewFlows),
  getFlowsByBot
);

router.get(
  "/bot/:botId/capabilities",
  requireBotPermission(WORKSPACE_PERMISSIONS.viewFlows),
  getFlowBuilderCapabilities
);

router.get(
  "/bot/:botId/list",
  requireBotPermission(WORKSPACE_PERMISSIONS.viewFlows),
  getFlowSummariesByBot
);

router.get("/:id", getFlow);

router.post(
  "/",
  requireActiveWorkspaceEditAccess(),
  createFlowCtrl
);

router.post(
  "/save",
  requireActiveWorkspaceEditAccess(),
  saveFlowCtrl
);

router.post(
  "/:id/publish",
  requireActiveWorkspaceEditAccess(),
  publishFlowCtrl
);

router.get(
  "/:id/versions",
  requireBotPermission(WORKSPACE_PERMISSIONS.viewFlows),
  getFlowVersionsCtrl
);

router.get(
  "/:id/versions/compare",
  requireBotPermission(WORKSPACE_PERMISSIONS.viewFlows),
  compareFlowVersionsCtrl
);

router.post(
  "/:id/versions/:versionNumber/rollback",
  requireActiveWorkspaceEditAccess(),
  handleRollback
);

router.put("/:id", requireActiveWorkspaceEditAccess(), updateFlowCtrl);

router.patch("/:id/node/:nodeId", requireActiveWorkspaceEditAccess(), patchFlowNodeCtrl);

router.delete("/:id", requireActiveWorkspaceEditAccess(), deleteFlowCtrl);

export default router;
