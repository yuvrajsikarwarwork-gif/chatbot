import { Router } from "express";

import {
  getAiProvidersSettings,
  getBillingWalletSettings,
  getEmailServicesSettings,
  getGlobalIntegrationsSettings,
  listGlobalIntegrationsAuditHistory,
  regenerateGlobalVerifyToken,
  testGlobalIntegrationsSettings,
  testEmailServicesSettings,
  updateAiProvidersSettings,
  updateBillingWalletSettings,
  updateEmailServicesSettings,
  updateGlobalIntegrationsSettings,
} from "../controllers/platformSettingsController";
import { authMiddleware } from "../middleware/authMiddleware";
import { requireAuthenticatedUser, requireSuperAdmin } from "../middleware/policyMiddleware";

const router = Router();

router.use(authMiddleware, requireAuthenticatedUser, requireSuperAdmin);

router.get("/global-integrations", getGlobalIntegrationsSettings);
router.put("/global-integrations", updateGlobalIntegrationsSettings);
router.post("/global-integrations/test", testGlobalIntegrationsSettings);
router.post("/global-integrations/regenerate-verify-token", regenerateGlobalVerifyToken);
router.get("/global-integrations/history", listGlobalIntegrationsAuditHistory);
router.get("/email-services", getEmailServicesSettings);
router.put("/email-services", updateEmailServicesSettings);
router.post("/email-services/test", testEmailServicesSettings);
router.get("/ai-providers", getAiProvidersSettings);
router.put("/ai-providers", updateAiProvidersSettings);
router.get("/billing-wallet", getBillingWalletSettings);
router.put("/billing-wallet", updateBillingWalletSettings);

export default router;
