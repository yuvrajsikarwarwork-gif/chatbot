import { Router } from "express";

import { handleBillingWebhook } from "../controllers/billingWebhookController";

const router = Router();

router.post("/webhook", handleBillingWebhook);

export default router;
