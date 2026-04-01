import { Router } from "express";

import agentRoutes from "./agentRoutes";
import auditRoutes from "./auditRoutes";
import analyticsRoutes from "./analyticsRoutes";
import adminRoutes from "./adminRoutes";
import authRoutes from "./authRoutes";
import botRoutes from "./botRoutes";
import campaignRoutes from "./campaignRoutes";
import billingRoutes from "./billingRoutes";
import conversationRoutes from "./conversationRoutes";
import conversationSettingsRoutes from "./conversationSettingsRoutes";
import debugRoutes from "./debugRoutes";
import flowRoutes from "./flowRoutes";
import integrationRoutes from "./integrationRoutes";
import leadRoutes from "./leadRoutes";
import leadFormRoutes from "./leadFormRoutes";
import planRoutes from "./planRoutes";
import notificationRoutes from "./notificationRoutes";
import platformAccountRoutes from "./platformAccountRoutes";
import permissionRoutes from "./permissionRoutes";
import platformSettingsRoutes from "./platformSettingsRoutes";
import projectRoutes from "./projectRoutes";
import queueRoutes from "./queueRoutes";
import segmentRoutes from "./segmentRoutes";
import templateRoutes from "./templateRoutes";
import { triggerFlowCtrl } from "../controllers/triggerFlowController";
import uploadRoutes from "./uploadRoutes";
import userRoutes from "./userRoutes";
import workspaceRoutes from "./workspaceRoutes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);
router.use("/users", userRoutes);
router.use("/workspaces", workspaceRoutes);
router.post("/v1/trigger-flow", triggerFlowCtrl);

router.use("/bots", botRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/audit", auditRoutes);
router.use("/campaigns", campaignRoutes);
router.use("/billing", billingRoutes);
router.use("/debug", debugRoutes);
router.use("/flows", flowRoutes);
router.use("/templates", templateRoutes);
router.use("/upload", uploadRoutes);
router.use("/leads", leadRoutes);
router.use("/lead-forms", leadFormRoutes);
router.use("/plans", planRoutes);
router.use("/notifications", notificationRoutes);
router.use("/permissions", permissionRoutes);
router.use("/platform-settings", platformSettingsRoutes);
router.use("/integrations", integrationRoutes);
router.use("/platform-accounts", platformAccountRoutes);
router.use("/projects", projectRoutes);
router.use("/queue", queueRoutes);
router.use("/segments", segmentRoutes);

router.use("/chat", agentRoutes);
router.use("/conversations", conversationRoutes);
router.use("/conversation-settings", conversationSettingsRoutes);

export default router;
