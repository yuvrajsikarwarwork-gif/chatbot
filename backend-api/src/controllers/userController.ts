import { Response, NextFunction } from "express";

import { AuthRequest } from "../middleware/authMiddleware";
import { query } from "../config/db";
import {
  createPlatformUserService,
  listPlatformUsersService,
  updatePlatformUserService,
} from "../services/userService";

function getUserId(req: AuthRequest) {
  return req.user?.id || req.user?.user_id || null;
}

export const inviteTeammate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { botId, email, role } = req.body;

    const botCheck = await query("SELECT id FROM bots WHERE id = $1 AND user_id = $2", [
      botId,
      req.user!.id,
    ]);
    if (!botCheck.rows.length) return res.status(403).json({ error: "Unauthorized" });

    const userRes = await query("SELECT id FROM users WHERE email = $1", [email]);
    if (!userRes.rows.length) {
      return res.status(404).json({ error: "User not found. They must sign up first." });
    }

    const targetUserId = userRes.rows[0].id;

    await query(
      `INSERT INTO bot_assignments (bot_id, user_id, assigned_role)
       VALUES ($1, $2, $3) ON CONFLICT (bot_id, user_id) DO UPDATE SET assigned_role = $3`,
      [botId, targetUserId, role || "agent"]
    );

    res.json({ success: true, message: "Teammate added successfully" });
  } catch (err) {
    next(err);
  }
};

export const updateProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name } = req.body;
    const result = await query(
      "UPDATE users SET name = $1 WHERE id = $2 RETURNING id, email, name, role",
      [name, req.user!.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
};

export const listPlatformUsersCtrl = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await listPlatformUsersService(userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

export const createPlatformUserCtrl = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await createPlatformUserService(userId, req.body || {});
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
};

export const updatePlatformUserCtrl = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = getUserId(req);
    const id = req.params.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!id) {
      return res.status(400).json({ error: "User id is required" });
    }

    const data = await updatePlatformUserService(userId, id, req.body || {});
    res.json(data);
  } catch (err) {
    next(err);
  }
};
