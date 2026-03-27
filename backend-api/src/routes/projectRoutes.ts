import { Router } from "express";

import { authMiddleware } from "../middleware/authMiddleware";
import { requireAuthenticatedUser } from "../middleware/policyMiddleware";
import {
  archiveProjectCtrl,
  assignProjectUserCtrl,
  createProjectCtrl,
  deleteProjectCtrl,
  getCurrentWorkspaceProjectCtrl,
  getProjectCtrl,
  getProjectSettingsCtrl,
  getWorkspaceDefaultProjectCtrl,
  listProjectAccessCtrl,
  listProjectsCtrl,
  revokeProjectUserCtrl,
  updateProjectCtrl,
  updateProjectSettingsCtrl,
} from "../controllers/projectController";

const router = Router();

router.use(authMiddleware);
router.use(requireAuthenticatedUser);

router.get("/", listProjectsCtrl);
router.post("/", createProjectCtrl);
router.get("/workspace/:workspaceId/default", getWorkspaceDefaultProjectCtrl);
router.get("/workspace/:workspaceId/current", getCurrentWorkspaceProjectCtrl);
router.get("/:id", getProjectCtrl);
router.put("/:id", updateProjectCtrl);
router.delete("/:id", deleteProjectCtrl);
router.post("/:id/archive", archiveProjectCtrl);
router.get("/:id/settings", getProjectSettingsCtrl);
router.put("/:id/settings", updateProjectSettingsCtrl);
router.get("/:id/members", listProjectAccessCtrl);
router.post("/:id/members", assignProjectUserCtrl);
router.delete("/:id/members/:userId", revokeProjectUserCtrl);
router.get("/:id/access", listProjectAccessCtrl);
router.post("/:id/access", assignProjectUserCtrl);
router.delete("/:id/access/:userId", revokeProjectUserCtrl);

export default router;
