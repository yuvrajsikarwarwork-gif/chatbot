import { Router } from "express";

import agentRoutes from "./agentRoutes";
import auditRoutes from "./auditRoutes";
import analyticsRoutes from "./analyticsRoutes";
import authRoutes from "./authRoutes";
import botRoutes from "./botRoutes";
import campaignRoutes from "./campaignRoutes";
import conversationRoutes from "./conversationRoutes";
import conversationSettingsRoutes from "./conversationSettingsRoutes";
import flowRoutes from "./flowRoutes";
import integrationRoutes from "./integrationRoutes";
import leadRoutes from "./leadRoutes";
import planRoutes from "./planRoutes";
import platformAccountRoutes from "./platformAccountRoutes";
import permissionRoutes from "./permissionRoutes";
import projectRoutes from "./projectRoutes";
import templateRoutes from "./templateRoutes";
import uploadRoutes from "./uploadRoutes";
import userRoutes from "./userRoutes";
import workspaceRoutes from "./workspaceRoutes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/workspaces", workspaceRoutes);

router.use("/bots", botRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/audit", auditRoutes);
router.use("/campaigns", campaignRoutes);
router.use("/flows", flowRoutes);
router.use("/templates", templateRoutes);
router.use("/upload", uploadRoutes);
router.use("/leads", leadRoutes);
router.use("/plans", planRoutes);
router.use("/permissions", permissionRoutes);
router.use("/integrations", integrationRoutes);
router.use("/platform-accounts", platformAccountRoutes);
router.use("/projects", projectRoutes);

router.use("/chat", agentRoutes);
router.use("/conversations", conversationRoutes);
router.use("/conversation-settings", conversationSettingsRoutes);

export default router;
