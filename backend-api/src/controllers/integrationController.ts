import { NextFunction, Response } from "express";

import { AuthRequest } from "../middleware/authMiddleware";
import {
  deleteIntegrationService,
  generateConnectionDetailsService,
  getIntegrationService,
  getIntegrationsService,
  updateIntegrationService,
} from "../services/integrationService";

export async function getIntegrations(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { botId } = req.params;
    const userId = req.user?.id;

    if (!botId) {
      return res.status(400).json({ error: "botId is required" });
    }

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await getIntegrationsService(botId, userId);
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
    const { id } = req.params;
    const userId = req.user?.id;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await getIntegrationService(id, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function generateConnectionDetailsCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user?.id;
    const { botId, platform, credentials } = req.body;

    if (!botId || !platform) {
      return res
        .status(400)
        .json({ error: "botId, platform, and credentials are required" });
    }

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await generateConnectionDetailsService(
      botId,
      userId,
      platform,
      credentials ?? {}
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
    const { id } = req.params;
    const userId = req.user?.id;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await updateIntegrationService(id, userId, req.body.config ?? {});
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
    const { id } = req.params;
    const userId = req.user?.id;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    await deleteIntegrationService(id, userId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
