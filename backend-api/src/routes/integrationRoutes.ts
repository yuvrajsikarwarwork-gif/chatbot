// backend-api/src/routes/integrationRoutes.ts

import { Router } from "express";
import {
  getIntegrations,
  saveIntegrationConfig, // ✅ New controller method
  deleteIntegrationCtrl,
} from "../controllers/integrationController";
import { authMiddleware, botAccessGuard } from "../middleware/authMiddleware";

const router = Router();

router.use(authMiddleware);

// ✅ Standardized endpoint for the "Copy-Paste" Integration Form
router.post("/config", botAccessGuard, saveIntegrationConfig);

// List all integrations for a bot
router.get("/bot/:botId", botAccessGuard, getIntegrations);

router.delete("/:id", deleteIntegrationCtrl);

export default router;