import { NextFunction, Response } from "express";

import { AuthRequest } from "../middleware/authMiddleware";
import {
  approveWorkspaceSupportRequestService,
  assignUserWorkspaceService,
  createWorkspaceSupportRequestService,
  createWorkspaceService,
  deleteWorkspaceService,
  denyWorkspaceSupportRequestService,
  getWorkspaceByIdService,
  grantWorkspaceSupportAccessService,
  lockWorkspaceService,
  listWorkspaceSupportAccessService,
  listWorkspaceSupportRequestsService,
  listWorkspaceMembersForUserService,
  removeUserWorkspaceService,
  revokeWorkspaceSupportAccessService,
  listWorkspacesService,
  unlockWorkspaceService,
  updateWorkspaceBillingService,
  updateWorkspaceService,
} from "../services/workspaceService";

function getUserId(req: AuthRequest) {
  return req.user?.id || req.user?.user_id || null;
}

export async function listWorkspacesCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await listWorkspacesService(userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function createWorkspaceCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await createWorkspaceService(userId, req.body);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

export async function getWorkspaceCtrl(
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
      return res.status(400).json({ error: "Workspace id is required" });
    }

    const data = await getWorkspaceByIdService(id, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function updateWorkspaceCtrl(
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
      return res.status(400).json({ error: "Workspace id is required" });
    }

    const data = await updateWorkspaceService(id, userId, req.body);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function assignWorkspaceUserCtrl(
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
      return res.status(400).json({ error: "Workspace id is required" });
    }

    const data = await assignUserWorkspaceService(
      id,
      userId,
      req.body
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function listWorkspaceMembersCtrl(
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
      return res.status(400).json({ error: "Workspace id is required" });
    }

    const data = await listWorkspaceMembersForUserService(id, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function removeWorkspaceUserCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    const id = req.params.id;
    const targetUserId = req.params.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!id) {
      return res.status(400).json({ error: "Workspace id is required" });
    }
    if (!targetUserId) {
      return res.status(400).json({ error: "User id is required" });
    }

    const data = await removeUserWorkspaceService(id, userId, targetUserId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function updateWorkspaceBillingCtrl(
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
      return res.status(400).json({ error: "Workspace id is required" });
    }

    const data = await updateWorkspaceBillingService(id, userId, req.body);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function lockWorkspaceCtrl(
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
      return res.status(400).json({ error: "Workspace id is required" });
    }

    const data = await lockWorkspaceService(id, userId, req.body || {});
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function unlockWorkspaceCtrl(
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
      return res.status(400).json({ error: "Workspace id is required" });
    }

    const data = await unlockWorkspaceService(id, userId, req.body || {});
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function deleteWorkspaceCtrl(
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
      return res.status(400).json({ error: "Workspace id is required" });
    }

    const data = await deleteWorkspaceService(id, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function listWorkspaceSupportAccessCtrl(
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
      return res.status(400).json({ error: "Workspace id is required" });
    }

    const data = await listWorkspaceSupportAccessService(id, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function grantWorkspaceSupportAccessCtrl(
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
      return res.status(400).json({ error: "Workspace id is required" });
    }

    const data = await grantWorkspaceSupportAccessService(id, userId, req.body || {});
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function revokeWorkspaceSupportAccessCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    const id = req.params.id;
    const targetUserId = req.params.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!id || !targetUserId) {
      return res.status(400).json({ error: "Workspace id and target user id are required" });
    }

    const data = await revokeWorkspaceSupportAccessService(id, userId, targetUserId);
    res.json(data || { success: true });
  } catch (err) {
    next(err);
  }
}

export async function listWorkspaceSupportRequestsCtrl(
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
      return res.status(400).json({ error: "Workspace id is required" });
    }

    const data = await listWorkspaceSupportRequestsService(id, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function createWorkspaceSupportRequestCtrl(
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
      return res.status(400).json({ error: "Workspace id is required" });
    }

    const data = await createWorkspaceSupportRequestService(id, userId, req.body || {});
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

export async function approveWorkspaceSupportRequestCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    const id = req.params.id;
    const requestId = req.params.requestId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!id || !requestId) {
      return res.status(400).json({ error: "Workspace id and request id are required" });
    }

    const data = await approveWorkspaceSupportRequestService(id, requestId, userId, req.body || {});
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function denyWorkspaceSupportRequestCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    const id = req.params.id;
    const requestId = req.params.requestId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!id || !requestId) {
      return res.status(400).json({ error: "Workspace id and request id are required" });
    }

    const data = await denyWorkspaceSupportRequestService(id, requestId, userId, req.body || {});
    res.json(data);
  } catch (err) {
    next(err);
  }
}
