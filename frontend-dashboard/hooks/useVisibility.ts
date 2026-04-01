import { useMemo } from "react";
import { useRouter } from "next/router";

import { useWorkspaceRuntime } from "../components/workspace/WorkspaceRuntimeProvider";
import { useAuthStore } from "../store/authStore";
import { getPermissionCandidates } from "../utils/permissionAliases";

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
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const resolvedAccess = useAuthStore((state) => state.resolvedAccess);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);
  const workspaceRuntime = useWorkspaceRuntime();
  const isPlatformRoute = [
    "/workspaces",
    "/permissions",
    "/plans",
    "/logs",
    "/tickets",
    "/support/tickets",
    "/system-settings",
    "/users-access",
    "/platform-accounts",
  ].some((route) =>
    route === "/workspaces"
      ? router.pathname === route
      : router.pathname === route || router.pathname.startsWith(`${route}/`)
  );
  const supportAccess = Boolean(resolvedAccess?.support_access) && !isPlatformRoute;
  const isGlobalSuperAdmin = user?.role === "super_admin";
  const isPlatformOperator =
    Boolean(resolvedAccess?.is_platform_operator) ||
    isGlobalSuperAdmin ||
    user?.role === "developer";

  return useMemo(() => {
    const workspaceId = activeWorkspace?.workspace_id || null;
    const workspaceRole = resolvedAccess?.workspace_role || activeWorkspace?.role || null;

    const workspacePermissions =
      resolvedAccess?.workspace_permissions ||
      activeWorkspace?.effective_permissions ||
      {};

    const platformSectionAccess = new Set<AppSection>([
      "workspaces",
      "permissions",
      "users_access",
      "tickets",
      "plans",
      "logs",
      "system_settings",
      "billing",
      "users",
    ]);

    const readSection = (section: AppSection, key: "nav" | "page") =>
      Boolean(resolvedAccess?.sections?.[section]?.[key]) ||
      (isPlatformOperator && platformSectionAccess.has(section));

    const canSeeNav = (section: AppSection) => readSection(section, "nav");
    const canViewPage = (section: AppSection) => readSection(section, "page");
    const workspaceIsReadOnly = isGlobalSuperAdmin ? false : workspaceRuntime.isReadOnly && !isPlatformOperator;
    const hasResolvedPermission = (permission: string) =>
      getPermissionCandidates(permission).some((candidate) =>
        Boolean(workspacePermissions?.[candidate]) ||
        hasWorkspacePermission(workspaceId, candidate)
      );

    return {
      workspaceId,
      isReadOnly: workspaceIsReadOnly,
      workspaceStatus: workspaceRuntime.workspace?.status || activeWorkspace?.workspace_status || null,
      subscriptionStatus: workspaceRuntime.workspace?.subscription_status || null,
      workspaceRole,
      isWorkspaceAdmin: workspaceRole === "workspace_admin",
      isPlatformOperator,
      canManageWorkspace: hasResolvedPermission("manage_workspace"),
      canManageUsers: hasResolvedPermission("manage_users"),
      canManagePermissions: hasResolvedPermission("manage_permissions"),
      canManageIntegrations: hasResolvedPermission("manage_integrations"),
      canManageProject: hasResolvedPermission("manage_project"),
      canViewProjects: canViewPage("projects"),
      canViewCampaigns: canViewPage("campaigns"),
      canViewBots: canViewPage("bots"),
      canViewFlows: canViewPage("flows"),
      canViewConversations: canViewPage("inbox"),
      canReplyConversations: hasResolvedPermission("reply_conversation"),
      canViewLeads: canViewPage("leads"),
      canViewAnalytics: canViewPage("analytics"),
      canViewSupport: canViewPage("support") || canViewPage("tickets"),
      canViewUsersAccess: canViewPage("users_access"),
      canViewBilling: canViewPage("billing"),
      activeProjectRole: resolvedAccess?.project_role || null,
      activeProjectId: resolvedAccess?.project_id || activeProject?.id || null,
      supportAccess,
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
    workspaceRuntime.isReadOnly,
    workspaceRuntime.workspace?.status,
    workspaceRuntime.workspace?.subscription_status,
    isPlatformOperator,
    supportAccess,
    isGlobalSuperAdmin,
    router.pathname,
  ]);
}
