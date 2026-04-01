import { Router } from "express";

import { authMiddleware } from "../middleware/authMiddleware";
import { requireAuthenticatedUser } from "../middleware/policyMiddleware";
import {
  listNotificationsCtrl,
  markAllNotificationsReadCtrl,
  markNotificationReadCtrl,
} from "../controllers/notificationController";

const router = Router();

router.use(authMiddleware);
router.use(requireAuthenticatedUser);

router.get("/", listNotificationsCtrl);
router.post("/read-all", markAllNotificationsReadCtrl);
router.post("/:id/read", markNotificationReadCtrl);

export default router;

