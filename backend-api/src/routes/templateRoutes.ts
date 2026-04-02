import { Router } from "express";
import { 
  getTemplates, 
  getTemplateById,
  createTemplate, 
  updateTemplate, 
  deleteTemplate, 
  approveTemplate,
  getTemplateLogs,
  launchCampaign,
  sendTemplateOnce,
  submitTemplateToMeta,
  syncTemplateFromMeta,
  previewMetaTemplates,
  importTemplatesFromMeta
} from "../controllers/templateController";
import { authMiddleware } from "../middleware/authMiddleware";
import {
  requireAuthenticatedUser,
  requireWorkspaceAccess,
  resolveProjectContext,
  resolveWorkspaceContext,
} from "../middleware/policyMiddleware";

const router = Router();
router.use(authMiddleware);
router.use(requireAuthenticatedUser);
router.use(resolveWorkspaceContext);
router.use(requireWorkspaceAccess);
router.use(resolveProjectContext);

router.post("/launch-campaign", launchCampaign);
router.post("/:id/send-once", sendTemplateOnce);
router.get("/logs", getTemplateLogs);
router.post("/import-meta/preview", previewMetaTemplates);
router.post("/import-meta", importTemplatesFromMeta);
router.post("/:id/submit-meta", submitTemplateToMeta);
router.post("/:id/sync-meta", syncTemplateFromMeta);
router.get("/", getTemplates);
router.get("/:id", getTemplateById);
router.post("/", createTemplate);
router.put("/:id", updateTemplate);
router.delete("/:id", deleteTemplate);
router.post("/approve/:id", approveTemplate);

export default router;
