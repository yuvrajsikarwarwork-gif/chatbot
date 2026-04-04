import { Router } from "express";

import { authMiddleware } from "../middleware/authMiddleware";
import { requireAuthenticatedUser } from "../middleware/policyMiddleware";
import {
  optimizeNodeCtrl,
  previewExtractionCtrl,
  suggestFieldDescriptionCtrl,
} from "../controllers/aiController";

const router = Router();

router.use(authMiddleware);
router.use(requireAuthenticatedUser);

router.post("/preview-extraction", previewExtractionCtrl);
router.post("/suggest-description", suggestFieldDescriptionCtrl);
router.post("/optimize-node", optimizeNodeCtrl);

export default router;
