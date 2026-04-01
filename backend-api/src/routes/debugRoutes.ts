import { Router } from "express";

import { authMiddleware } from "../middleware/authMiddleware";
import { requireAuthenticatedUser } from "../middleware/policyMiddleware";
import { logFlowSaveDebugCtrl } from "../controllers/debugController";

const router = Router();

router.use(authMiddleware);
router.use(requireAuthenticatedUser);

router.post("/flow-save", logFlowSaveDebugCtrl);

export default router;
