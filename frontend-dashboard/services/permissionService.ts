import apiClient from "./apiClient";
import type { ResolvedAccessSnapshot } from "../store/authStore";

export interface PermissionUser {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin" | "developer" | "super_admin";
  workspace_id?: string | null;
}

export interface PermissionWorkspaceMembership {
  workspace_id: string;
  workspace_name?: string;
  role: "workspace_admin" | "editor" | "agent" | "viewer" | "workspace_owner" | "admin" | "user";
  status: "active" | "inactive" | "invited";
  permissions_json?: Record<string, any>;
  effective_permissions?: Record<string, boolean>;
  permission_overrides?: Record<string, boolean>;
}

export interface PermissionProjectAccess {
  id?: string;
  workspace_id: string;
  project_id: string;
  user_id: string;
  role:
    | "project_admin"
    | "editor"
    | "agent"
    | "viewer"
    | "workspace_owner"
    | "admin"
    | "user";
  status: "active" | "inactive" | "invited";
  project_name?: string;
  is_default?: boolean;
}

export interface PermissionSnapshot {
  user: PermissionUser | null;
  userId: string;
  platformRole: string;
  memberships: PermissionWorkspaceMembership[];
  projectAccesses: PermissionProjectAccess[];
  activeWorkspace: PermissionWorkspaceMembership | null;
  activeProject: PermissionProjectAccess | null;
  effectivePermissions: Record<string, boolean>;
  permissionOverrides: Record<string, boolean>;
  resolvedAccess?: ResolvedAccessSnapshot | null;
}

export const permissionService = {
  me: async (): Promise<PermissionSnapshot> => {
    const res = await apiClient.get("/permissions/me");
    return res.data;
  },

  getRole: async (role: string, workspaceId?: string) => {
    const res = await apiClient.get(`/permissions/role/${role}`, {
      params: workspaceId ? { workspaceId } : undefined,
    });
    return res.data;
  },

  updateRole: async (role: string, permissions: Record<string, boolean>) => {
    const res = await apiClient.patch("/permissions/role", {
      role,
      permissions,
    });
    return res.data;
  },

  updateUser: async (
    workspaceId: string,
    userId: string,
    permissions: Record<string, boolean>
  ) => {
    const res = await apiClient.patch("/permissions/user", {
      workspaceId,
      userId,
      permissions,
    });
    return res.data;
  },
};
