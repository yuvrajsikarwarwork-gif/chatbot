import { Router } from "express";

import { authMiddleware } from "../middleware/authMiddleware";
import {
  deleteLeadCtrl,
  getLeadCtrl,
  listLeadListsCtrl,
  listLeadsCtrl,
} from "../controllers/leadController";

const router = Router();

router.use(authMiddleware);

router.get("/", listLeadsCtrl);
router.get("/lists", listLeadListsCtrl);
router.get("/:id", getLeadCtrl);
router.delete("/:id", deleteLeadCtrl);

export default router;
