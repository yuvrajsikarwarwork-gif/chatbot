import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import { requireAuthenticatedUser } from "../middleware/policyMiddleware";
import { listWorkspaceAuditLogsCtrl } from "../controllers/auditController";

const router = Router();

router.use(authMiddleware);
router.use(requireAuthenticatedUser);

router.get("/workspace/:workspaceId", listWorkspaceAuditLogsCtrl);

export default router;
