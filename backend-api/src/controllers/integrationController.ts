// src/controllers/integrationController.ts

import { Response, NextFunction } from "express";
import { AuthRequest } from "../middleware/authMiddleware";

import {
  getIntegrationsService,
  getIntegrationService,
  createIntegrationService,
  updateIntegrationService,
  deleteIntegrationService,
} from "../services/integrationService";

export async function saveIntegrationConfig(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { botId, platform, config } = req.body;

    // 1. Verify user is assigned as 'admin' to this bot
    const assignmentCheck = await query(
      "SELECT role FROM bot_assignments WHERE bot_id = $1 AND user_id = $2",
      [botId, req.user!.id]
    );

    const isOwner = await query("SELECT id FROM bots WHERE id = $1 AND user_id = $2", [botId, req.user!.id]);

    if (!isOwner.rows.length && assignmentCheck.rows[0]?.role !== 'admin') {
      return res.status(403).json({ error: "Insufficient permissions to manage integrations" });
    }

    // 2. Insert or Update configuration
    const result = await query(
      `INSERT INTO integrations (id, bot_id, platform, config, status)
       VALUES (gen_random_uuid(), $1, $2, $3, 'connected')
       ON CONFLICT (bot_id, platform) 
       DO UPDATE SET config = $3, status = 'connected', updated_at = NOW()
       RETURNING id, platform, status, updated_at`,
      [botId, platform, JSON.stringify(config)]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

// Keep existing methods for listing/deleting below...

export async function getIntegrations(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await getIntegrationsService(
      req.params.botId,
      req.user!.id // Fixed: user_id -> id
    );

    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getIntegration(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await getIntegrationService(
      req.params.id,
      req.user!.id // Fixed: user_id -> id
    );

    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function createIntegrationCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await createIntegrationService(
      req.body.bot_id,
      req.user!.id, // Fixed: user_id -> id
      req.body.type,
      req.body.config_json
    );

    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function updateIntegrationCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await updateIntegrationService(
      req.params.id,
      req.user!.id, // Fixed: user_id -> id
      req.body.config_json
    );

    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function deleteIntegrationCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    await deleteIntegrationService(
      req.params.id,
      req.user!.id // Fixed: user_id -> id
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}