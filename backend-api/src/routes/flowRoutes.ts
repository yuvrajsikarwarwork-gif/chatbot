// src/routes/flowRoutes.ts

import { Router } from "express";

import {
  getFlowsByBot,
  getFlowSummariesByBot,
  getFlow,
  createFlowCtrl,
  updateFlowCtrl,
  deleteFlowCtrl,
  saveFlowCtrl
} from "../controllers/flowController";

import { authMiddleware } from "../middleware/authMiddleware";
import {
  requireAuthenticatedUser,
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
  "/bot/:botId/list",
  requireBotPermission(WORKSPACE_PERMISSIONS.viewFlows),
  getFlowSummariesByBot
);

router.get("/:id", getFlow);

router.post(
  "/",
  createFlowCtrl
);

router.post(
  "/save",
  saveFlowCtrl
);

router.put("/:id", updateFlowCtrl);

router.delete("/:id", deleteFlowCtrl);

export default router;
