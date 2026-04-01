import { Router } from "express";
import { 
  getBots, 
  getBot, 
  getBotSystemFlows,
  createBotCtrl, 
  copyBotCtrl,
  updateBotCtrl, 
  deleteBotCtrl, 
  activateBotCtrl 
} from "../controllers/botController";
import { authMiddleware } from "../middleware/authMiddleware";
import { requireAuthenticatedUser } from "../middleware/policyMiddleware";

const router = Router();

/**
 * All bot routes are protected by authMiddleware.
 * This ensures req.user is populated for the controllers.
 */
router.use(authMiddleware);
router.use(requireAuthenticatedUser);

router.get("/", getBots);
router.get("/:id", getBot);
router.get("/:id/system-flows", getBotSystemFlows);
router.post("/", createBotCtrl);
router.post("/:id/copy", copyBotCtrl);
router.put("/:id", updateBotCtrl); // Unified update handler
router.delete("/:id", deleteBotCtrl);
router.post("/:id/activate", activateBotCtrl);

export default router;
