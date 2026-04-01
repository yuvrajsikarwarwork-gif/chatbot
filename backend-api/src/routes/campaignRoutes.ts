import { Router } from "express";

import { authMiddleware } from "../middleware/authMiddleware";
import {
  requireAuthenticatedUser,
  requireWorkspaceAccess,
  resolveWorkspaceContext,
} from "../middleware/policyMiddleware";
import {
  createCampaignChannelCtrl,
  createCampaignChannelForCampaignCtrl,
  createCampaignCtrl,
  createAudienceListForCampaignCtrl,
  createEntryPointCtrl,
  createEntryPointForCampaignCtrl,
  createListCtrl,
  deleteCampaignChannelCtrl,
  deleteCampaignChannelForCampaignCtrl,
  deleteCampaignCtrl,
  deleteAudienceListForCampaignCtrl,
  deleteEntryPointCtrl,
  deleteEntryPointForCampaignCtrl,
  deleteListCtrl,
  getCampaign,
  getCampaignBroadcastAnalyticsCtrl,
  listCampaignActivityCtrl,
  listCampaignAudienceCtrl,
  listCampaignChannelsCtrl,
  listCampaignEntriesCtrl,
  listCampaigns,
  updateCampaignChannelCtrl,
  updateCampaignChannelForCampaignCtrl,
  updateCampaignCtrl,
  updateAudienceListForCampaignCtrl,
  updateEntryPointCtrl,
  updateEntryPointForCampaignCtrl,
  updateListCtrl,
} from "../controllers/campaignController";
import {
  cloneCampaignAutomationRuleCtrl,
  getCampaignAutomationRuntimeCtrl,
  pauseCampaignAutomationRuleCtrl,
  replayCampaignAutomationRuleCtrl,
  resumeCampaignAutomationRuleCtrl,
  saveCampaignAutomationVersionCtrl,
  setCampaignAutomationVersionStatusCtrl,
} from "../controllers/campaignAutomationOpsController";

const router = Router();

router.use(authMiddleware);
router.use(requireAuthenticatedUser);
router.use(resolveWorkspaceContext);
router.use(requireWorkspaceAccess);

router.get("/", listCampaigns);
router.get("/:id", getCampaign);
router.get("/:id/channels", listCampaignChannelsCtrl);
router.post("/:id/channels", createCampaignChannelForCampaignCtrl);
router.put("/:campaignId/channels/:channelId", updateCampaignChannelForCampaignCtrl);
router.delete("/:campaignId/channels/:channelId", deleteCampaignChannelForCampaignCtrl);
router.get("/:id/entries", listCampaignEntriesCtrl);
router.post("/:id/entries", createEntryPointForCampaignCtrl);
router.put("/:campaignId/entries/:entryId", updateEntryPointForCampaignCtrl);
router.delete("/:campaignId/entries/:entryId", deleteEntryPointForCampaignCtrl);
router.get("/:id/audience", listCampaignAudienceCtrl);
router.post("/:id/audience", createAudienceListForCampaignCtrl);
router.put("/:campaignId/audience/:listId", updateAudienceListForCampaignCtrl);
router.delete("/:campaignId/audience/:listId", deleteAudienceListForCampaignCtrl);
router.get("/:id/activity", listCampaignActivityCtrl);
router.get("/:id/broadcast-analytics", getCampaignBroadcastAnalyticsCtrl);
router.get("/:id/automation/runtime", getCampaignAutomationRuntimeCtrl);
router.post("/:id/automation/runtime/version", saveCampaignAutomationVersionCtrl);
router.post("/:id/automation/runtime/version/:versionId/status", setCampaignAutomationVersionStatusCtrl);
router.post("/:id/automation/:ruleId/clone", cloneCampaignAutomationRuleCtrl);
router.post("/:id/automation/:ruleId/pause", pauseCampaignAutomationRuleCtrl);
router.post("/:id/automation/:ruleId/resume", resumeCampaignAutomationRuleCtrl);
router.post("/:id/automation/:ruleId/replay", replayCampaignAutomationRuleCtrl);
router.post("/", createCampaignCtrl);
router.put("/:id", updateCampaignCtrl);
router.delete("/:id", deleteCampaignCtrl);

router.post("/channels", createCampaignChannelCtrl);
router.put("/channels/:id", updateCampaignChannelCtrl);
router.delete("/channels/:id", deleteCampaignChannelCtrl);

router.post("/entries", createEntryPointCtrl);
router.put("/entries/:id", updateEntryPointCtrl);
router.delete("/entries/:id", deleteEntryPointCtrl);

router.post("/lists", createListCtrl);
router.put("/lists/:id", updateListCtrl);
router.delete("/lists/:id", deleteListCtrl);

export default router;
