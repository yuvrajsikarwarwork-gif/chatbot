import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import {
  requireAuthenticatedUser,
  requireWorkspaceAccess,
  resolveWorkspaceContext,
} from "../middleware/policyMiddleware";
import {
  getCampaignAutomationRuntimeCtrl,
  pauseCampaignAutomationRuleCtrl,
  replayCampaignAutomationRuleCtrl,
  resumeCampaignAutomationRuleCtrl,
} from "../controllers/campaignAutomationOpsController";

const router = Router();

router.use(authMiddleware);
router.use(requireAuthenticatedUser);
router.use(resolveWorkspaceContext);
router.use(requireWorkspaceAccess);

router.get("/:campaignId/runtime", getCampaignAutomationRuntimeCtrl);
router.post("/:campaignId/rules/:ruleId/pause", pauseCampaignAutomationRuleCtrl);
router.post("/:campaignId/rules/:ruleId/resume", resumeCampaignAutomationRuleCtrl);
router.post("/:campaignId/rules/:ruleId/replay", replayCampaignAutomationRuleCtrl);

export default router;
