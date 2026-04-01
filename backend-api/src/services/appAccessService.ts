import { normalizeProjectRole } from "./projectAccessService";
import {
  getMembershipAgentScope,
  normalizeWorkspaceRole,
} from "./workspaceAccessService";
import { hasAliasedPermission } from "./permissionAliasService";

type AppSection =
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

type SectionVisibility = {
  nav: boolean;
  page: boolean;
};

export type ResolvedAccessSnapshot = {
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
  sections: Record<AppSection, SectionVisibility>;
};

type BuildResolvedAccessInput = {
  platformRole?: string | null;
  activeWorkspace?: any;
  activeProject?: any;
  projectAccesses?: any[];
};

function hasPermission(permissionMap: Record<string, boolean>, permission: string) {
  return hasAliasedPermission(permissionMap, permission);
}

function emptySectionMap(): Record<AppSection, SectionVisibility> {
  return {
    dashboard: { nav: false, page: false },
    analytics: { nav: false, page: false },
    projects: { nav: false, page: false },
    campaigns: { nav: false, page: false },
    bots: { nav: false, page: false },
    flows: { nav: false, page: false },
    integrations: { nav: false, page: false },
    conversations: { nav: false, page: false },
    inbox: { nav: false, page: false },
    leads: { nav: false, page: false },
    templates: { nav: false, page: false },
    audit: { nav: false, page: false },
    permissions: { nav: false, page: false },
    users_access: { nav: false, page: false },
    workspaces: { nav: false, page: false },
    users: { nav: false, page: false },
    settings: { nav: false, page: false },
    tickets: { nav: false, page: false },
    support: { nav: false, page: false },
    billing: { nav: false, page: false },
    plans: { nav: false, page: false },
    logs: { nav: false, page: false },
    system_settings: { nav: false, page: false },
  };
}

export function buildResolvedAccessSnapshot(
  input: BuildResolvedAccessInput
): ResolvedAccessSnapshot {
  const platformRole = String(input.platformRole || "").trim().toLowerCase() || null;
  const isPlatformOperator = platformRole === "super_admin" || platformRole === "developer";
  const activeWorkspace = input.activeWorkspace || null;
  const activeProject = input.activeProject || null;
  const workspaceId = String(activeWorkspace?.workspace_id || "").trim() || null;
  const projectId = String(activeProject?.project_id || activeProject?.id || "").trim() || null;
  const workspaceRole = activeWorkspace?.role
    ? normalizeWorkspaceRole(activeWorkspace.role)
    : null;
  const workspacePermissions =
    activeWorkspace?.effective_permissions &&
    typeof activeWorkspace.effective_permissions === "object"
      ? activeWorkspace.effective_permissions
      : {};
  const userOverride =
    activeWorkspace?.permission_overrides &&
    typeof activeWorkspace.permission_overrides === "object"
      ? activeWorkspace.permission_overrides
      : {};
  const agentScope = getMembershipAgentScope(activeWorkspace);
  const supportAccess =
    Boolean(workspacePermissions.support_access) ||
    Boolean(activeWorkspace?.permissions_json?.support_mode);
  const platformAdminSurface = isPlatformOperator;

  const scopedProjectAccesses = Array.isArray(input.projectAccesses)
    ? input.projectAccesses.filter(
        (item) =>
          String(item?.status || "").toLowerCase() === "active" &&
          (!workspaceId || String(item?.workspace_id || "") === workspaceId)
      )
    : [];
  const activeProjectAccess =
    (projectId
      ? scopedProjectAccesses.find((item) => String(item?.project_id || "") === projectId)
      : null) || activeProject;
  const projectRole = activeProjectAccess?.role
    ? normalizeProjectRole(activeProjectAccess.role)
    : null;
  const projectRoles = scopedProjectAccesses
    .map((item) => {
      try {
        return normalizeProjectRole(item.role);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const hasAnyProjectAdmin =
    projectRole === "project_admin" || projectRoles.includes("project_admin");
  const hasAnyProjectOperator =
    hasAnyProjectAdmin ||
    projectRole === "editor" ||
    projectRoles.includes("editor");
  const hasAnyProjectViewer =
    projectRole === "viewer" || projectRoles.includes("viewer");
  const hasAnyProjectAgent = projectRole === "agent" || projectRoles.includes("agent");

  const canManageWorkspace = hasPermission(workspacePermissions, "manage_workspace");
  const canManageUsers = hasPermission(workspacePermissions, "manage_users");
  const canManagePermissions = hasPermission(workspacePermissions, "manage_permissions");
  const canViewProjects =
    hasPermission(workspacePermissions, "view_projects") ||
    hasPermission(workspacePermissions, "manage_project");
  const canViewCampaigns =
    hasPermission(workspacePermissions, "view_campaigns") ||
    hasPermission(workspacePermissions, "create_campaign");
  const canViewBots =
    hasPermission(workspacePermissions, "view_bots") ||
    hasPermission(workspacePermissions, "edit_bot");
  const canViewFlows =
    hasPermission(workspacePermissions, "view_flows") ||
    hasPermission(workspacePermissions, "edit_workflow");
  const canViewConversations = hasPermission(workspacePermissions, "view_conversations");
  const canReplyConversations = hasPermission(workspacePermissions, "reply_conversation");
  const canViewLeads = hasPermission(workspacePermissions, "view_leads");
  const canViewAnalytics = hasPermission(workspacePermissions, "view_analytics");
  const canManageIntegrations =
    hasPermission(workspacePermissions, "manage_integrations") ||
    hasPermission(workspacePermissions, "view_platform_accounts") ||
    hasAnyProjectAdmin;
  const canViewSupport =
    platformAdminSurface || canManageWorkspace || canManageUsers || canManagePermissions;
  const canViewUsersAccess = canManageUsers || canManagePermissions;
  const canViewBilling = platformAdminSurface;

  const sections = emptySectionMap();

  if (platformAdminSurface) {
    sections.workspaces = { nav: true, page: true };
    sections.permissions = { nav: true, page: true };
    sections.users_access = { nav: true, page: true };
    sections.tickets = { nav: true, page: true };
    sections.support = { nav: false, page: true };
    sections.billing = { nav: true, page: true };
    sections.plans = { nav: true, page: true };
    sections.logs = { nav: true, page: true };
    sections.system_settings = { nav: true, page: true };
  }

  if (!isPlatformOperator || supportAccess) {
    sections.dashboard = {
      nav: Boolean(workspaceRole || hasAnyProjectOperator || hasAnyProjectViewer || hasAnyProjectAgent),
      page: Boolean(workspaceRole || hasAnyProjectOperator || hasAnyProjectViewer || hasAnyProjectAgent),
    };
    sections.analytics = {
      nav: canViewAnalytics || hasAnyProjectOperator || hasAnyProjectViewer,
      page: canViewAnalytics || hasAnyProjectOperator || hasAnyProjectViewer,
    };
    sections.projects = {
      nav: canViewProjects || hasAnyProjectOperator || hasAnyProjectViewer,
      page: canViewProjects || hasAnyProjectOperator || hasAnyProjectViewer,
    };
    sections.campaigns = {
      nav: canViewCampaigns || hasAnyProjectOperator || hasAnyProjectAgent || hasAnyProjectViewer,
      page: canViewCampaigns || hasAnyProjectOperator || hasAnyProjectAgent || hasAnyProjectViewer,
    };
    sections.bots = {
      nav: canViewBots || hasAnyProjectOperator,
      page: canViewBots || hasAnyProjectOperator,
    };
    sections.flows = {
      nav: canViewFlows || hasAnyProjectOperator,
      page: canViewFlows || hasAnyProjectOperator,
    };
    sections.integrations = {
      nav: canManageIntegrations || hasAnyProjectAdmin,
      page: canManageIntegrations || hasAnyProjectAdmin,
    };
    const inboxVisible =
      canViewConversations || canReplyConversations || hasAnyProjectOperator || hasAnyProjectAgent;
    sections.conversations = { nav: inboxVisible, page: inboxVisible };
    sections.inbox = { nav: inboxVisible, page: inboxVisible };
    sections.leads = {
      nav: canViewLeads || hasAnyProjectOperator || hasAnyProjectAgent || hasAnyProjectViewer,
      page: canViewLeads || hasAnyProjectOperator || hasAnyProjectAgent || hasAnyProjectViewer,
    };
    sections.templates = {
      nav: canViewCampaigns || canManageIntegrations || hasAnyProjectOperator,
      page: canViewCampaigns || canManageIntegrations || hasAnyProjectOperator,
    };
    sections.audit = {
      nav: canManageWorkspace || canManageUsers || canManagePermissions,
      page: canManageWorkspace || canManageUsers || canManagePermissions,
    };
    sections.permissions = {
      nav: sections.permissions.nav || canManagePermissions,
      page: sections.permissions.page || canManagePermissions,
    };
    sections.users_access = {
      nav: sections.users_access.nav || canViewUsersAccess,
      page: sections.users_access.page || canViewUsersAccess,
    };
    sections.settings = {
      nav: canManageWorkspace,
      page: canManageWorkspace,
    };
    sections.support = {
      nav: sections.support.nav || canViewSupport,
      page: sections.support.page || canViewSupport,
    };
    sections.tickets = {
      nav: sections.tickets.nav || canViewSupport,
      page: sections.tickets.page || canViewSupport,
    };
    sections.billing = {
      nav: canViewBilling,
      page: canViewBilling,
    };
  }

  return {
    platform_role: platformRole,
    workspace_role: workspaceRole,
    workspace_permissions: workspacePermissions,
    project_role: projectRole,
    user_override: userOverride,
    agent_scope: agentScope,
    support_access: supportAccess,
    is_platform_operator: isPlatformOperator,
    workspace_id: workspaceId,
    project_id: projectId,
    sections,
  };
}
