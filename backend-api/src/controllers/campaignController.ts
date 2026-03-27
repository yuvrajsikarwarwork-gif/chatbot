import { NextFunction, Response } from "express";
import { query } from "../config/db";

import { AuthRequest } from "../middleware/authMiddleware";
import {
  createCampaignChannelService,
  createCampaignService,
  createEntryPointService,
  createListService,
  deleteCampaignChannelService,
  deleteCampaignService,
  deleteEntryPointService,
  deleteListService,
  getCampaignDetailService,
  listCampaignsService,
  updateCampaignChannelService,
  updateCampaignService,
  updateEntryPointService,
  updateListService,
} from "../services/campaignService";

function getUserId(req: AuthRequest) {
  return req.user?.id || req.user?.user_id || null;
}

export async function listCampaigns(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await listCampaignsService(
      userId,
      typeof req.query.workspaceId === "string"
        ? req.query.workspaceId
        : typeof req.headers["x-workspace-id"] === "string"
          ? req.headers["x-workspace-id"]
          : undefined,
      typeof req.query.projectId === "string"
        ? req.query.projectId
        : typeof req.headers["x-project-id"] === "string"
          ? req.headers["x-project-id"]
          : undefined
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getCampaign(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    const id = req.params.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!id) {
      return res.status(400).json({ error: "Campaign id is required" });
    }

    const data = await getCampaignDetailService(id, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function listCampaignChannelsCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    const id = req.params.id || req.params.campaignId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!id) {
      return res.status(400).json({ error: "Campaign id is required" });
    }

    const data = await getCampaignDetailService(id, userId);
    res.json(data.channels || []);
  } catch (err) {
    next(err);
  }
}

export async function listCampaignEntriesCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    const id = req.params.id || req.params.campaignId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!id) {
      return res.status(400).json({ error: "Campaign id is required" });
    }

    const data = await getCampaignDetailService(id, userId);
    res.json(data.entryPoints || []);
  } catch (err) {
    next(err);
  }
}

export async function listCampaignAudienceCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    const id = req.params.id || req.params.campaignId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!id) {
      return res.status(400).json({ error: "Campaign id is required" });
    }

    const data = await getCampaignDetailService(id, userId);
    res.json(data.lists || []);
  } catch (err) {
    next(err);
  }
}

export async function listCampaignActivityCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    const id = req.params.id || req.params.campaignId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!id) {
      return res.status(400).json({ error: "Campaign id is required" });
    }

    const campaign = await getCampaignDetailService(id, userId);
    let result;
    try {
      result = await query(
        `SELECT tl.*, b.workspace_id, b.project_id
         FROM template_logs tl
         JOIN bots b ON b.id = tl.bot_id
         WHERE b.workspace_id = $1
           AND COALESCE(b.project_id, '00000000-0000-0000-0000-000000000000'::uuid) =
               COALESCE($2, '00000000-0000-0000-0000-000000000000'::uuid)
           AND tl.campaign_name = $3
         ORDER BY tl.created_at DESC`,
        [campaign.workspace_id || null, campaign.project_id || null, campaign.name]
      );
    } catch (err: any) {
      if (["42P01", "42703"].includes(String(err?.code || ""))) {
        res.json([]);
        return;
      }
      throw err;
    }

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

export async function createCampaignCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await createCampaignService(userId, req.body);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

export async function updateCampaignCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    const id = req.params.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!id) {
      return res.status(400).json({ error: "Campaign id is required" });
    }

    const data = await updateCampaignService(id, userId, req.body);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function deleteCampaignCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    const id = req.params.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!id) {
      return res.status(400).json({ error: "Campaign id is required" });
    }

    await deleteCampaignService(id, userId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function createCampaignChannelCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await createCampaignChannelService(userId, req.body);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

export async function createCampaignChannelForCampaignCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  req.body = {
    ...req.body,
    campaignId: req.params.id || req.params.campaignId || req.body?.campaignId,
  };
  return createCampaignChannelCtrl(req, res, next);
}

export async function updateCampaignChannelCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    const id = req.params.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!id) {
      return res.status(400).json({ error: "Channel id is required" });
    }

    const data = await updateCampaignChannelService(id, userId, req.body);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function updateCampaignChannelForCampaignCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const channelId = req.params.channelId || req.params.id;
  if (channelId) {
    req.params.id = channelId;
  }
  req.body = {
    ...req.body,
    campaignId: req.params.campaignId || req.body?.campaignId,
  };
  return updateCampaignChannelCtrl(req, res, next);
}

export async function deleteCampaignChannelCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    const id = req.params.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!id) {
      return res.status(400).json({ error: "Channel id is required" });
    }

    await deleteCampaignChannelService(id, userId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function deleteCampaignChannelForCampaignCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const channelId = req.params.channelId || req.params.id;
  if (channelId) {
    req.params.id = channelId;
  }
  return deleteCampaignChannelCtrl(req, res, next);
}

export async function createEntryPointCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await createEntryPointService(userId, req.body);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

export async function createEntryPointForCampaignCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  req.body = {
    ...req.body,
    campaignId: req.params.id || req.params.campaignId || req.body?.campaignId,
  };
  return createEntryPointCtrl(req, res, next);
}

export async function updateEntryPointCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    const id = req.params.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!id) {
      return res.status(400).json({ error: "Entry point id is required" });
    }

    const data = await updateEntryPointService(id, userId, req.body);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function updateEntryPointForCampaignCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const entryId = req.params.entryId || req.params.id;
  if (entryId) {
    req.params.id = entryId;
  }
  req.body = {
    ...req.body,
    campaignId: req.params.campaignId || req.body?.campaignId,
  };
  return updateEntryPointCtrl(req, res, next);
}

export async function deleteEntryPointCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    const id = req.params.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!id) {
      return res.status(400).json({ error: "Entry point id is required" });
    }

    await deleteEntryPointService(id, userId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function deleteEntryPointForCampaignCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const entryId = req.params.entryId || req.params.id;
  if (entryId) {
    req.params.id = entryId;
  }
  return deleteEntryPointCtrl(req, res, next);
}

export async function createListCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await createListService(userId, req.body);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

export async function createAudienceListForCampaignCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  req.body = {
    ...req.body,
    campaignId: req.params.id || req.params.campaignId || req.body?.campaignId,
  };
  return createListCtrl(req, res, next);
}

export async function updateListCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    const id = req.params.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!id) {
      return res.status(400).json({ error: "List id is required" });
    }

    const data = await updateListService(id, userId, req.body);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function updateAudienceListForCampaignCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const listId = req.params.listId || req.params.id;
  if (listId) {
    req.params.id = listId;
  }
  req.body = {
    ...req.body,
    campaignId: req.params.campaignId || req.body?.campaignId,
  };
  return updateListCtrl(req, res, next);
}

export async function deleteListCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    const id = req.params.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!id) {
      return res.status(400).json({ error: "List id is required" });
    }

    await deleteListService(id, userId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function deleteAudienceListForCampaignCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const listId = req.params.listId || req.params.id;
  if (listId) {
    req.params.id = listId;
  }
  return deleteListCtrl(req, res, next);
}
