import { Router } from "express";

import {
  deleteIntegrationCtrl,
  generateConnectionDetailsCtrl,
  getIntegrations,
  updateIntegrationCtrl,
} from "../controllers/integrationController";
import { authMiddleware, botAccessGuard } from "../middleware/authMiddleware";

const router = Router();

router.use(authMiddleware);

router.post(
  "/generate-connection-details",
  botAccessGuard,
  generateConnectionDetailsCtrl
);
router.get("/bot/:botId", botAccessGuard, getIntegrations);
router.put("/:id", updateIntegrationCtrl);
router.delete("/:id", deleteIntegrationCtrl);

export default router;
