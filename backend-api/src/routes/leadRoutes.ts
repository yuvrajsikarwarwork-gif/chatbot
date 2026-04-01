import { Router } from "express";

import { authMiddleware } from "../middleware/authMiddleware";
import {
  deleteLeadCtrl,
  getLeadCtrl,
  internalUpsertLeadCaptureCtrl,
  listLeadListsCtrl,
  listLeadsCtrl,
  updateLeadStatusCtrl,
} from "../controllers/leadController";

const router = Router();

router.post("/internal/capture", internalUpsertLeadCaptureCtrl);

router.use(authMiddleware);

router.get("/", listLeadsCtrl);
router.get("/lists", listLeadListsCtrl);
router.get("/:id", getLeadCtrl);
router.put("/:id/status", updateLeadStatusCtrl);
router.delete("/:id", deleteLeadCtrl);

export default router;
