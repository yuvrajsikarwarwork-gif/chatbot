import { Router } from "express";

import { authMiddleware } from "../middleware/authMiddleware";
import {
  requireAuthenticatedUser,
  requireWorkspaceAccess,
  resolveWorkspaceContext,
} from "../middleware/policyMiddleware";
import {
  createPlatformAccountCtrl,
  deletePlatformAccountCtrl,
  listPlatformAccountsCtrl,
  updatePlatformAccountCtrl,
} from "../controllers/platformAccountController";

const router = Router();

router.use(authMiddleware);
router.use(requireAuthenticatedUser);
router.use(resolveWorkspaceContext);
router.use(requireWorkspaceAccess);

router.get("/", listPlatformAccountsCtrl);
router.post("/", createPlatformAccountCtrl);
router.put("/:id", updatePlatformAccountCtrl);
router.delete("/:id", deletePlatformAccountCtrl);

export default router;
