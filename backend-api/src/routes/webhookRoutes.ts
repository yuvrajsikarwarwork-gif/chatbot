// backend-api/src/routes/webhookRoutes.ts

import { Router } from "express";
import { verifyWebhook, receiveMessage } from "../controllers/webhookController";

const router = Router();

// 1. Meta Webhook Verification (Universal for WA/FB/IG)
router.get("/", verifyWebhook);

// 2. Meta Message Receiver (Universal)
// In your vision, we use one webhook URL in Meta Dashboard for all bots.
// The controller will determine the BotID based on Phone ID or Page ID.
router.post("/", receiveMessage);

export default router;