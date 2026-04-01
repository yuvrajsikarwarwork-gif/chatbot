import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import { requireAuthenticatedUser, requireSuperAdmin } from "../middleware/policyMiddleware";

import {
  createPlanCtrl,
  deletePlanCtrl,
  listPlansCtrl,
  updatePlanCtrl,
} from "../controllers/planController";

const router = Router();

router.use(authMiddleware);
router.use(requireAuthenticatedUser);
router.get("/", listPlansCtrl);
router.post("/", requireSuperAdmin, createPlanCtrl);
router.put("/:id", requireSuperAdmin, updatePlanCtrl);
router.delete("/:id", requireSuperAdmin, deletePlanCtrl);

export default router;
