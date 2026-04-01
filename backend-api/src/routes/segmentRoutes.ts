import { Router } from "express";

import { authMiddleware } from "../middleware/authMiddleware";
import {
  requireAuthenticatedUser,
  requireWorkspaceAccess,
  resolveWorkspaceContext,
} from "../middleware/policyMiddleware";
import { listSegmentLibraryCtrl } from "../controllers/segmentController";

const router = Router();

router.use(authMiddleware);
router.use(requireAuthenticatedUser);
router.use(resolveWorkspaceContext);
router.use(requireWorkspaceAccess);

router.get("/", listSegmentLibraryCtrl);

export default router;
