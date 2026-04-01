import { Router } from "express";

import {
  receiveMessage,
  receiveTelegramMessage,
  verifyWebhook,
} from "../controllers/webhookController";
import { executeCampaignAutomationWebhookCtrl } from "../controllers/campaignAutomationController";
import { verifyMetaWebhookSignature } from "../middleware/metaWebhookSignatureMiddleware";

const router = Router();

router.get("/", verifyWebhook);
router.post("/", verifyMetaWebhookSignature, receiveMessage);
router.get("/global", verifyWebhook);
router.post("/global", verifyMetaWebhookSignature, receiveMessage);
router.post("/automation/:campaignId/:ruleId", executeCampaignAutomationWebhookCtrl);

router.post("/telegram/:botId", receiveTelegramMessage);
router.get("/:platform/:botId", verifyWebhook);
router.post("/:platform/:botId", verifyMetaWebhookSignature, receiveMessage);

export default router;
