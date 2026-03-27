import { Router } from "express";

import {
  receiveMessage,
  receiveTelegramMessage,
  verifyWebhook,
} from "../controllers/webhookController";
import { verifyMetaWebhookSignature } from "../middleware/metaWebhookSignatureMiddleware";

const router = Router();

router.get("/", verifyWebhook);
router.post("/", verifyMetaWebhookSignature, receiveMessage);

router.post("/telegram/:botId", receiveTelegramMessage);
router.get("/:platform/:botId", verifyWebhook);
router.post("/:platform/:botId", verifyMetaWebhookSignature, receiveMessage);

export default router;
