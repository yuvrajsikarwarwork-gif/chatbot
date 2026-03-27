import { NextFunction, Request, Response } from "express";

import { listPlansService } from "../services/planService";

export async function listPlansCtrl(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await listPlansService();
    res.json(data);
  } catch (err) {
    next(err);
  }
}
