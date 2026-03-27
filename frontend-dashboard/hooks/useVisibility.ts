import { useMemo } from "react";

import { useAuthStore } from "../store/authStore";

export type AppSection =
  | "dashboard"
  | "analytics"
  | "projects"
  | "campaigns"
  | "bots"
  | "flows"
  | "integrations"
  | "conversations"
  | "inbox"
  | "leads"
  | "templates"
  | "audit"
  | "permissions"
  | "users_access"
  | "workspaces"
  | "users"
  | "settings"
  | "tickets"
  | "support"
  | "billing"
  | "plans"
  | "logs"
  | "system_settings";

export function useVisibility() {
  const user = useAuthStore((state) => state.user);
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const resolvedAccess = useAuthStore((state) => state.resolvedAccess);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);

  return useMemo(() => {
    const workspaceId = activeWorkspace?.workspace_id || null;
    const workspaceRole = resolvedAccess?.workspace_role || activeWorkspace?.role || null;
    const isPlatformOperator =
      Boolean(resolvedAccess?.is_platform_operator) ||
      user?.role === "super_admin" ||
      user?.role === "developer";

    const workspacePermissions =
      resolvedAccess?.workspace_permissions ||
      activeWorkspace?.effective_permissions ||
      {};

    const readSection = (section: AppSection, key: "nav" | "page") =>
      Boolean(resolvedAccess?.sections?.[section]?.[key]);

    const canSeeNav = (section: AppSection) => readSection(section, "nav");
    const canViewPage = (section: AppSection) => readSection(section, "page");

    return {
      workspaceId,
      workspaceRole,
      isPlatformOperator,
      canManageWorkspace:
        Boolean(workspacePermissions.manage_workspace) ||
        hasWorkspacePermission(workspaceId, "manage_workspace"),
      canManageUsers:
        Boolean(workspacePermissions.manage_users) ||
        hasWorkspacePermission(workspaceId, "manage_users"),
      canManagePermissions:
        Boolean(workspacePermissions.manage_permissions) ||
        hasWorkspacePermission(workspaceId, "manage_permissions"),
      canManageIntegrations:
        Boolean(workspacePermissions.manage_integrations) ||
        hasWorkspacePermission(workspaceId, "manage_integrations"),
      canManageProject:
        Boolean(workspacePermissions.manage_project) ||
        hasWorkspacePermission(workspaceId, "manage_project"),
      canViewProjects: canViewPage("projects"),
      canViewCampaigns: canViewPage("campaigns"),
      canViewBots: canViewPage("bots"),
      canViewFlows: canViewPage("flows"),
      canViewConversations: canViewPage("inbox"),
      canReplyConversations:
        Boolean(workspacePermissions.reply_conversation) ||
        hasWorkspacePermission(workspaceId, "reply_conversation"),
      canViewLeads: canViewPage("leads"),
      canViewAnalytics: canViewPage("analytics"),
      canViewSupport: canViewPage("support") || canViewPage("tickets"),
      canViewUsersAccess: canViewPage("users_access"),
      canViewBilling: canViewPage("billing"),
      activeProjectRole: resolvedAccess?.project_role || null,
      activeProjectId: resolvedAccess?.project_id || activeProject?.id || null,
      supportAccess: Boolean(resolvedAccess?.support_access),
      agentScope:
        resolvedAccess?.agent_scope || {
          projectIds: [],
          campaignIds: [],
          platforms: [],
          channelIds: [],
        },
      canSeeNav,
      canViewPage,
    };
  }, [
    activeProject?.id,
    activeWorkspace?.effective_permissions,
    activeWorkspace?.role,
    activeWorkspace?.workspace_id,
    hasWorkspacePermission,
    resolvedAccess,
    user?.role,
  ]);
}
