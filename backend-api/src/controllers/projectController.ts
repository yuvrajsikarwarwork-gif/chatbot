import { NextFunction, Response } from "express";

import { AuthRequest } from "../middleware/authMiddleware";
import { findWorkspaceMembers } from "../models/workspaceMembershipModel";
import { findWorkspaceProjectAccesses } from "../models/projectAccessModel";
import { findProjectById } from "../models/projectModel";
import { listWorkspaceMembersForUserService } from "../services/workspaceService";
import {
  getDefaultProjectByWorkspaceService,
  getProjectByIdService,
  getProjectSettingsService,
  listProjectsByUserService,
  listProjectsByWorkspaceService,
  createProjectService,
  createInboundQuarantineService,
  resolveWorkspaceProjectService,
  updateProjectService,
  updateProjectSettingsService,
  archiveProjectService,
  deleteProjectService,
} from "../services/projectService";
import {
  assignProjectUserService,
  assertProjectScopedUserManagementAccess,
  listWorkspaceProjectAccessService,
  revokeProjectUserService,
} from "../services/projectAccessService";
import { assertRecord } from "../utils/assertRecord";

function getUserId(req: AuthRequest) {
  return req.user?.id || req.user?.user_id || null;
}

export async function listProjectsCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const workspaceId =
      (typeof req.query.workspaceId === "string" && req.query.workspaceId) ||
      (typeof req.query.workspace_id === "string" && req.query.workspace_id) ||
      null;

    const data = workspaceId
      ? await listProjectsByWorkspaceService(workspaceId, userId)
      : await listProjectsByUserService(userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getProjectCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    const id = req.params.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!id) {
      return res.status(400).json({ error: "Project id is required" });
    }

    const data = await getProjectByIdService(id, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function createProjectCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await createProjectService(userId, req.body);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

export async function updateProjectCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    const id = req.params.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!id) {
      return res.status(400).json({ error: "Project id is required" });
    }

    const data = await updateProjectService(id, userId, req.body);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function archiveProjectCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    const id = req.params.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!id) {
      return res.status(400).json({ error: "Project id is required" });
    }

    const data = await archiveProjectService(id, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function deleteProjectCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    const id = req.params.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!id) {
      return res.status(400).json({ error: "Project id is required" });
    }

    const data = await deleteProjectService(id, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getProjectSettingsCtrl(
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
      return res.status(400).json({ error: "Project id is required" });
    }

    const data = await getProjectSettingsService(id, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function updateProjectSettingsCtrl(
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
      return res.status(400).json({ error: "Project id is required" });
    }

    const data = await updateProjectSettingsService(id, userId, req.body);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function listProjectAccessCtrl(
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
      return res.status(400).json({ error: "Project id is required" });
    }

    const project = assertRecord(await findProjectById(id), "Project not found");
    const access = await assertProjectScopedUserManagementAccess(userId, id, project.workspace_id);
    const [accessRows, workspaceMembers] = await Promise.all([
      access.scope === "workspace"
        ? listWorkspaceProjectAccessService(project.workspace_id, userId)
        : findWorkspaceProjectAccesses(project.workspace_id),
      access.scope === "workspace"
        ? listWorkspaceMembersForUserService(project.workspace_id, userId)
        : findWorkspaceMembers(project.workspace_id).then((rows) =>
            rows.map((row: any) => ({
              workspace_id: row.workspace_id,
              user_id: row.user_id,
              name: row.name,
              email: row.email,
              role: row.role,
              status: row.status,
            }))
          ),
    ]);

    res.json({
      project,
      access: accessRows.filter((row: any) => row.project_id === id || row.is_all_projects),
      workspaceMembers,
    });
  } catch (err) {
    next(err);
  }
}

export async function assignProjectUserCtrl(
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
      return res.status(400).json({ error: "Project id is required" });
    }

    const data = await assignProjectUserService(id, userId, req.body || {});
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function revokeProjectUserCtrl(
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
      return res.status(400).json({ error: "Project id and user id are required" });
    }

    const data = await revokeProjectUserService(id, userId, targetUserId);
    res.json(data || { success: true });
  } catch (err) {
    next(err);
  }
}

export async function getWorkspaceDefaultProjectCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    const workspaceId = req.params.workspaceId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!workspaceId) {
      return res.status(400).json({ error: "Workspace id is required" });
    }

    const data = await getDefaultProjectByWorkspaceService(workspaceId, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getCurrentWorkspaceProjectCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    const workspaceId = req.params.workspaceId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!workspaceId) {
      return res.status(400).json({ error: "Workspace id is required" });
    }

    const data = await resolveWorkspaceProjectService(workspaceId, userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function createInboundQuarantineCtrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await createInboundQuarantineService(userId, req.body);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}
