import { Router } from "express";

import {
  createPlatformUserCtrl,
  inviteTeammate,
  listPlatformUsersCtrl,
  updatePlatformUserCtrl,
  updateProfile,
} from "../controllers/userController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

router.use(authMiddleware);

router.put("/profile", updateProfile);
router.post("/invite", inviteTeammate);
router.get("/", listPlatformUsersCtrl);
router.post("/", createPlatformUserCtrl);
router.put("/:id", updatePlatformUserCtrl);

export default router;
