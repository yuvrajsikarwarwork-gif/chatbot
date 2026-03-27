// src/routes/analyticsRoutes.ts

import { Router } from "express";

import {
  getBotStats,
  getEvents,
  getWorkspaceAgentPresence,
  getWorkspaceEvents,
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

export default router;
