import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getPermissionCandidates } from "../utils/permissionAliases";

interface User {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin" | "developer" | "super_admin";
  workspace_id?: string | null;
}

interface WorkspaceMembership {
  workspace_id: string;
  workspace_name?: string;
  workspace_status?: string;
  workspace_deleted_at?: string | null;
  workspace_purge_after?: string | null;
  role: "workspace_admin" | "editor" | "agent" | "viewer" | "workspace_owner" | "admin" | "user";
  status: "active" | "inactive" | "invited";
  permissions_json?: Record<string, any>;
  effective_permissions?: Record<string, boolean>;
  permission_overrides?: Record<string, boolean>;
}

export interface ProjectMembership {
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

export interface ActiveProject {
  id: string;
  workspace_id: string;
  name: string;
  status: string;
  is_default?: boolean;
}

export interface ResolvedAccessSection {
  nav: boolean;
  page: boolean;
}

export interface ResolvedAccessSnapshot {
  platform_role: string | null;
  workspace_role: string | null;
  workspace_permissions: Record<string, boolean>;
  project_role: string | null;
  user_override: Record<string, boolean>;
  agent_scope: {
    projectIds: string[];
    campaignIds: string[];
    platforms: string[];
    channelIds: string[];
  };
  support_access: boolean;
  is_platform_operator: boolean;
  workspace_id: string | null;
  project_id: string | null;
  sections: Record<string, ResolvedAccessSection>;
}

type ActiveWorkspace = WorkspaceMembership | null;

interface AuthState {
  user: User | null;
  token: string | null;
  memberships: WorkspaceMembership[];
  projectAccesses: ProjectMembership[];
  activeWorkspace: ActiveWorkspace;
  activeProject: ActiveProject | null;
  resolvedAccess: ResolvedAccessSnapshot | null;
  hasHydrated: boolean;
  setAuth: (
    user: User,
    token: string,
    memberships?: WorkspaceMembership[],
    activeWorkspace?: ActiveWorkspace,
    projectAccesses?: ProjectMembership[],
    resolvedAccess?: ResolvedAccessSnapshot | null
  ) => void;
  setPermissionSnapshot: (input: {
    user: User | null;
    memberships: WorkspaceMembership[];
    activeWorkspace: ActiveWorkspace;
    projectAccesses: ProjectMembership[];
    activeProject?: ActiveProject | null;
    resolvedAccess?: ResolvedAccessSnapshot | null;
  }) => void;
  setActiveWorkspace: (workspaceId: string) => void;
  setActiveProject: (project: ActiveProject | null) => void;
  clearSupportContext: () => void;
  setHasHydrated: (value: boolean) => void;
  clearAuth: () => void;
  isAuthenticated: () => boolean;
  hasWorkspaceRole: (
    workspaceId: string | null | undefined,
    allowedRoles: Array<WorkspaceMembership["role"]>
  ) => boolean;
  hasWorkspacePermission: (
    workspaceId: string | null | undefined,
    permission: string
  ) => boolean;
  getProjectRole: (
    projectId: string | null | undefined
  ) => "project_admin" | "editor" | "agent" | "viewer" | null;
}

function canonicalWorkspaceRole(role: WorkspaceMembership["role"]) {
  if (role === "workspace_owner" || role === "admin") {
    return "workspace_admin" as const;
  }
  if (role === "user") {
    return "editor" as const;
  }
  return role;
}

function canonicalProjectRole(role: ProjectMembership["role"]) {
  if (role === "workspace_owner" || role === "admin") {
    return "project_admin" as const;
  }
  if (role === "user") {
    return "editor" as const;
  }
  return role;
}

function isGlobalSuperAdmin(userRole?: string | null) {
  return String(userRole || "").trim().toLowerCase() === "super_admin";
}

const DEFAULT_WORKSPACE_PERMISSIONS: Record<"workspace_admin" | "editor" | "agent" | "viewer", string[]> = {
  workspace_admin: [
    "view_workspace",
    "manage_workspace",
    "manage_users",
    "manage_permissions",
    "use_ai_nodes",
    "view_projects",
    "create_projects",
    "edit_projects",
    "delete_projects",
    "view_campaigns",
    "can_create_campaign",
    "edit_campaign",
    "delete_campaign",
    "view_flows",
    "can_create_flow",
    "edit_workflow",
    "delete_flow",
    "view_bots",
    "create_bots",
    "edit_bots",
    "delete_bots",
    "view_platform_accounts",
    "can_manage_platform_accounts",
    "view_leads",
    "delete_leads",
    "export_data",
    "assign_conversation",
    "view_conversation",
  ],
  editor: [
    "view_workspace",
    "use_ai_nodes",
    "view_projects",
    "view_campaigns",
    "can_create_campaign",
    "edit_campaign",
    "can_create_flow",
    "edit_workflow",
    "create_bots",
    "edit_bots",
    "view_leads",
    "view_conversation",
  ],
  agent: [
    "view_workspace",
    "view_leads",
    "assign_conversation",
    "view_conversation",
  ],
  viewer: [
    "view_workspace",
    "view_projects",
    "view_campaigns",
    "view_flows",
    "view_bots",
    "view_platform_accounts",
    "view_leads",
    "view_conversation",
  ],
};

const ROLE_RANK: Record<"workspace_admin" | "editor" | "agent" | "viewer", number> = {
  workspace_admin: 3,
  editor: 2,
  agent: 1,
  viewer: 0,
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      memberships: [],
      projectAccesses: [],
      activeWorkspace: null,
      activeProject: null,
      resolvedAccess: null,
      hasHydrated: false,
      setAuth: (
        user,
        token,
        memberships = [],
        activeWorkspace = null,
        projectAccesses = [],
        resolvedAccess = null
      ) =>
        set({
          user,
          token,
          memberships,
          projectAccesses,
          activeWorkspace,
          activeProject: null,
          resolvedAccess,
        }),
      setPermissionSnapshot: ({
        user,
        memberships,
        activeWorkspace,
        projectAccesses,
        activeProject,
        resolvedAccess,
      }) =>
        set((state) => ({
          user: user || state.user,
          memberships,
          projectAccesses,
          activeWorkspace,
          activeProject:
            activeProject === undefined
              ? state.activeProject
              : activeProject,
          resolvedAccess: resolvedAccess || null,
        })),
      setActiveWorkspace: (workspaceId) =>
        set((state) => ({
          activeWorkspace:
            state.memberships.find((membership) => membership.workspace_id === workspaceId) ||
            null,
          activeProject: null,
          resolvedAccess: null,
        })),
      setActiveProject: (project) => set({ activeProject: project, resolvedAccess: null }),
      clearSupportContext: () =>
        set({
          activeWorkspace: null,
          activeProject: null,
          resolvedAccess: null,
        }),
      setHasHydrated: (value) => set({ hasHydrated: value }),
      clearAuth: () =>
        set(() => {
          if (typeof window !== "undefined") {
            window.localStorage.removeItem("auth-storage");
          }

          return {
            user: null,
            token: null,
            memberships: [],
            projectAccesses: [],
            activeWorkspace: null,
            activeProject: null,
            resolvedAccess: null,
            hasHydrated: true,
          };
        }),
      isAuthenticated: () => !!get().token,
      hasWorkspaceRole: (workspaceId, allowedRoles) => {
        if (!workspaceId) {
          return false;
        }

        if (isGlobalSuperAdmin(get().user?.role)) {
          return true;
        }

        const resolvedAccess = get().resolvedAccess;
        if (String(get().user?.role || "").trim().toLowerCase() === "developer" && resolvedAccess?.workspace_id === workspaceId) {
          const resolvedRole = resolvedAccess?.workspace_role;
          if (resolvedAccess?.support_access) {
            return allowedRoles.includes("workspace_admin");
          }
          if (!resolvedRole) {
            return false;
          }

          const minimumRank = Math.min(...allowedRoles.map((role) => ROLE_RANK[canonicalWorkspaceRole(role)]));
          return ROLE_RANK[canonicalWorkspaceRole(resolvedRole as WorkspaceMembership["role"])] >= minimumRank;
        }

        const membership = get().memberships.find(
          (item) => item.workspace_id === workspaceId && item.status === "active"
        );
        if (!membership) {
          return false;
        }

        const minimumRank = Math.min(...allowedRoles.map((role) => ROLE_RANK[canonicalWorkspaceRole(role)]));
        return ROLE_RANK[canonicalWorkspaceRole(membership.role)] >= minimumRank;
      },
      hasWorkspacePermission: (workspaceId, permission) => {
        if (!workspaceId) {
          return false;
        }

        if (isGlobalSuperAdmin(get().user?.role)) {
          return true;
        }

        const resolvedAccess = get().resolvedAccess;
        if (String(get().user?.role || "").trim().toLowerCase() === "developer" && resolvedAccess?.workspace_id === workspaceId) {
          const permissionMap = resolvedAccess?.workspace_permissions || {};
          return getPermissionCandidates(permission).some((candidate) =>
            Boolean(permissionMap[candidate])
          );
        }

        const membership = get().memberships.find(
          (item) => item.workspace_id === workspaceId && item.status === "active"
        );
        if (!membership) {
          return false;
        }

        if (
          membership.effective_permissions &&
          Object.keys(membership.effective_permissions).length > 0
        ) {
          return getPermissionCandidates(permission).some((candidate) =>
            Boolean(membership.effective_permissions?.[candidate])
          );
        }

        const permissions = new Set(DEFAULT_WORKSPACE_PERMISSIONS[canonicalWorkspaceRole(membership.role)] || []);
        Object.entries(membership.permission_overrides || {}).forEach(([key, value]) => {
          if (value === true) {
            permissions.add(key);
          }
          if (value === false) {
            permissions.delete(key);
          }
        });

        return getPermissionCandidates(permission).some((candidate) => permissions.has(candidate));
      },
      getProjectRole: (projectId) => {
        if (!projectId) {
          return null;
        }

        const access = get().projectAccesses.find(
          (item) => item.project_id === projectId && item.status === "active"
        );
        return access ? canonicalProjectRole(access.role) : null;
      },
    }),
    {
      name: "auth-storage",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
