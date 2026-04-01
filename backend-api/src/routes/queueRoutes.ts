import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import { requireAuthenticatedUser } from "../middleware/policyMiddleware";
import { listQueueOpsCtrl, retryQueueJobCtrl, retryQueueJobsCtrl } from "../controllers/queueOpsController";

const router = Router();

router.use(authMiddleware);
router.use(requireAuthenticatedUser);

router.get("/jobs", listQueueOpsCtrl);
router.post("/jobs/:id/retry", retryQueueJobCtrl);
router.post("/jobs/retry-all", retryQueueJobsCtrl);

export default router;
