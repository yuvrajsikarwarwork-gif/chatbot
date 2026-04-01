import { NextFunction, Response } from "express";

import { AuthRequest } from "../middleware/authMiddleware";
import {
  approveWorkspaceSupportRequestService,
  archiveWorkspaceService,
  assignUserWorkspaceService,
  createWorkspaceSupportRequestService,
  createWorkspaceExportRequestService,
  createWorkspaceService,
  deleteWorkspaceService,
  downloadWorkspaceExportForUserService,
  denyWorkspaceSupportRequestService,
  emergencyResetWorkspaceOwnerPasswordService,
  listWorkspaceHistoryService,
  resendWorkspaceOwnerInviteService,
  getWorkspaceBillingContextService,
  getWorkspaceByIdService,
  getWorkspaceOverviewService,
  getWorkspaceWalletService,
  createWorkspaceWalletAdjustmentService,
  ingestWorkspaceKnowledgeService,
  grantWorkspaceSupportAccessService,
  lockWorkspaceService,
  listWorkspaceSupportAccessService,
  listWorkspaceExportRequestsService,
  listWorkspaceSupportRequestsService,
  listWorkspaceMembersForUserService,
  removeUserWorkspaceService,
  repairWorkspaceWhatsAppContactsService,
  restoreWorkspaceService,
  selfRestoreWorkspaceService,
  resendWorkspaceMemberInviteService,
  revokeWorkspaceSupportAccessService,
  searchWorkspaceKnowledgeService,
  listWorkspacesService,
  unlockWorkspaceService,
  updateWorkspaceBillingService,
  updateWorkspaceOwnerEmailAndResendInviteService,
  updateWorkspaceService,
} from "../services/workspaceService";
import {
  getWorkspaceMailSettingsService,
  testWorkspaceMailSettingsService,
  updateWorkspaceMailSettingsService,
} from "../services/workspaceMailSettingsService";

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

export async function listWorkspaceHistoryCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await listWorkspaceHistoryService(userId);
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

export async function getWorkspaceOverviewCtrl(
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

    const data = await getWorkspaceOverviewService(id, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getWorkspaceWalletCtrl(
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

    const data = await getWorkspaceWalletService(id, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getWorkspaceBillingContextCtrl(
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

    const data = await getWorkspaceBillingContextService(id, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getWorkspaceMailSettingsCtrl(
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

    const data = await getWorkspaceMailSettingsService(id, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function createWorkspaceWalletAdjustmentCtrl(
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

    const data = await createWorkspaceWalletAdjustmentService(id, userId, req.body || {});
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

export async function updateWorkspaceMailSettingsCtrl(
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

    const data = await updateWorkspaceMailSettingsService(id, userId, req.body || {});
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function testWorkspaceMailSettingsCtrl(
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

    const data = await testWorkspaceMailSettingsService(id, userId, req.body || {});
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function ingestWorkspaceKnowledgeCtrl(
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

    const data = await ingestWorkspaceKnowledgeService(id, userId, req.body || {});
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

export async function searchWorkspaceKnowledgeCtrl(
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

    const limitValue =
      req.query.limit !== undefined || req.body?.limit !== undefined
        ? Number(req.query.limit ?? req.body?.limit)
        : null;
    const data = await searchWorkspaceKnowledgeService(id, userId, {
      projectId:
        String(req.query.projectId || req.query.project_id || req.body?.projectId || "")
          .trim() || null,
      queryText: String(req.query.query || req.body?.query || "").trim(),
      embedding: Array.isArray(req.body?.embedding) ? req.body.embedding : null,
      ...(limitValue !== null && Number.isFinite(limitValue) ? { limit: limitValue } : {}),
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function repairWorkspaceWhatsAppContactsCtrl(
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

    const data = await repairWorkspaceWhatsAppContactsService(id, userId, req.body || {});
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

export async function archiveWorkspaceCtrl(
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

    const data = await archiveWorkspaceService(id, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function restoreWorkspaceCtrl(
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

    const data = await restoreWorkspaceService(id, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function selfRestoreWorkspaceCtrl(
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

    const data = await selfRestoreWorkspaceService(id, userId);
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

export async function resendWorkspaceMemberInviteCtrl(
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

    const data = await resendWorkspaceMemberInviteService(id, userId, {
      userId: String(req.body?.userId || req.body?.targetUserId || "").trim() || null,
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function emergencyResetWorkspaceOwnerPasswordCtrl(
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

    const data = await emergencyResetWorkspaceOwnerPasswordService(id, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function resendWorkspaceOwnerInviteCtrl(
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

    const data = await resendWorkspaceOwnerInviteService(id, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function updateWorkspaceOwnerEmailAndResendInviteCtrl(
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

    const data = await updateWorkspaceOwnerEmailAndResendInviteService(id, userId, req.body || {});
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function createWorkspaceExportRequestCtrl(
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

    const data = await createWorkspaceExportRequestService(id, userId);
    res.status(202).json(data);
  } catch (err) {
    next(err);
  }
}

export async function listWorkspaceExportRequestsCtrl(
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

    const data = await listWorkspaceExportRequestsService(id, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function downloadWorkspaceExportForUserCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    const id = req.params.id;
    const jobId = req.params.jobId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!id || !jobId) {
      return res.status(400).json({ error: "Workspace id and job id are required" });
    }

    const file = await downloadWorkspaceExportForUserService(id, jobId, userId);
    return res.download(file.filePath, file.fileName);
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
    if (String(userId) === String(targetUserId)) {
      return res.status(403).json({ error: "You cannot remove your own account from the workspace." });
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
