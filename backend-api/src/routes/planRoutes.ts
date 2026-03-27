import { Router } from "express";

import { listPlansCtrl } from "../controllers/planController";

const router = Router();

router.get("/", listPlansCtrl);

export default router;
