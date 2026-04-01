import { NextFunction, Request, Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import { findPlans } from "../models/planModel";

import {
  createPlanService,
  deletePlanService,
  listPlansService,
  updatePlanService,
} from "../services/planService";

function getUserId(req: AuthRequest) {
  return req.user?.id || req.user?.user_id || null;
}

export async function listPlansCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await listPlansService(userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function listPublicPlansCtrl(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = (await findPlans()).filter(
      (plan: any) => String(plan.status || "").trim().toLowerCase() === "active"
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function createPlanCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await createPlanService(userId, req.body || {});
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

export async function updatePlanCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await updatePlanService(userId, String(req.params.id || ""), req.body || {});
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function deletePlanCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await deletePlanService(userId, String(req.params.id || ""));
    res.json(data);
  } catch (err) {
    next(err);
  }
}
