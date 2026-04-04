// src/routes/analyticsRoutes.ts

import { Router } from "express";

import {
  getBotStats,
  getEvents,
  getWorkspaceAgentPresence,
  getWorkspaceEvents,
  getWorkspaceOptimizationNodes,
  getWorkspaceOptimizationPerformance,
  getWorkspaceOptimizationAlerts,
  evaluateWorkspaceOptimizationAlerts,
  updateWorkspaceOptimizationAlertStatus,
  getWorkspaceRegistryDropoffReport,
  getWorkspaceRegistryLegacyFallbackInspector,
  getWorkspaceRegistryKeywordPopularity,
  getWorkspaceRegistryUnpublishedFlowSummary,
  getWorkspaceStats,
  getWorkspaceUsageSummary,
} from "../controllers/analyticsController";

import { authMiddleware } from "../middleware/authMiddleware";
import { requireAuthenticatedUser } from "../middleware/policyMiddleware";

const router = Router();

router.use(authMiddleware);
router.use(requireAuthenticatedUser);

router.get("/bot/:botId", getBotStats);

router.get("/events/:botId", getEvents);
router.get("/workspace-usage", getWorkspaceUsageSummary);
router.get("/workspace/:workspaceId", getWorkspaceStats);
router.get("/workspace/:workspaceId/events", getWorkspaceEvents);
router.get("/workspace/:workspaceId/presence", getWorkspaceAgentPresence);
router.get("/workspace/:workspaceId/registry/dropoff", getWorkspaceRegistryDropoffReport);
router.get("/workspace/:workspaceId/registry/keywords", getWorkspaceRegistryKeywordPopularity);
router.get("/workspace/:workspaceId/registry/fallbacks", getWorkspaceRegistryLegacyFallbackInspector);
router.get("/workspace/:workspaceId/registry/unpublished", getWorkspaceRegistryUnpublishedFlowSummary);
router.get("/optimization/nodes", getWorkspaceOptimizationNodes);
router.get("/workspace/:workspaceId/optimization/performance", getWorkspaceOptimizationPerformance);
router.get("/workspace/:workspaceId/optimization/nodes", getWorkspaceOptimizationNodes);
router.get("/workspace/:workspaceId/optimization/alerts", getWorkspaceOptimizationAlerts);
router.post("/workspace/:workspaceId/optimization/alerts/evaluate", evaluateWorkspaceOptimizationAlerts);
router.patch("/alerts/:id", updateWorkspaceOptimizationAlertStatus);
router.patch("/workspace/:workspaceId/alerts/:id", updateWorkspaceOptimizationAlertStatus);

export default router;
