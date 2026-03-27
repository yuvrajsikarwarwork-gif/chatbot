import type { WorkspaceMember } from "../services/workspaceMembershipService";

export const WORKSPACE_ROLES = ["workspace_admin", "editor", "agent", "viewer"] as const;
export const PROJECT_ROLE_OPTIONS = ["project_admin", "editor", "agent", "viewer"] as const;
export const PLATFORM_OPTIONS = ["whatsapp", "website", "facebook", "instagram", "api", "telegram"] as const;

export const PERMISSION_OPTIONS = [
  { key: "view_workspace", label: "View workspace" },
  { key: "manage_workspace", label: "Manage workspace" },
  { key: "manage_users", label: "Manage users" },
  { key: "manage_permissions", label: "Manage permissions" },
  { key: "view_projects", label: "View projects" },
  { key: "create_projects", label: "Create projects" },
  { key: "edit_projects", label: "Edit projects" },
  { key: "delete_projects", label: "Delete projects" },
  { key: "view_campaigns", label: "View campaigns" },
  { key: "can_create_campaign", label: "Create campaigns" },
  { key: "edit_campaign", label: "Edit campaigns" },
  { key: "delete_campaign", label: "Delete campaigns" },
  { key: "view_flows", label: "View flows" },
  { key: "can_create_flow", label: "Create flows" },
  { key: "edit_workflow", label: "Edit workflow" },
  { key: "delete_flow", label: "Delete flows" },
  { key: "view_bots", label: "View bots" },
  { key: "create_bots", label: "Create bots" },
  { key: "edit_bots", label: "Edit bots" },
  { key: "delete_bots", label: "Delete bots" },
  { key: "view_platform_accounts", label: "View integrations" },
  { key: "can_manage_platform_accounts", label: "Manage integrations" },
  { key: "view_leads", label: "View leads" },
  { key: "delete_leads", label: "Delete leads" },
  { key: "export_data", label: "Export data" },
  { key: "assign_conversation", label: "Assign conversations" },
  { key: "view_conversation", label: "View and reply conversations" },
] as const;

export const ROLE_DESCRIPTIONS: Record<(typeof WORKSPACE_ROLES)[number], string> = {
  workspace_admin: "Full workspace control across users, settings, projects, and operational modules.",
  editor: "Operational create and edit access without workspace-level user governance.",
  agent: "Conversation and lead handling access within assigned scope.",
  viewer: "Read-only visibility with no destructive actions.",
};

export const RECOMMENDED_ROLE_BASELINES: Record<
  (typeof WORKSPACE_ROLES)[number],
  Record<string, boolean>
> = {
  workspace_admin: Object.fromEntries(PERMISSION_OPTIONS.map((option) => [option.key, true])),
  editor: {
    view_workspace: true,
    manage_workspace: false,
    manage_users: false,
    manage_permissions: false,
    view_projects: true,
    create_projects: false,
    edit_projects: false,
    delete_projects: false,
    view_campaigns: true,
    can_create_campaign: true,
    edit_campaign: true,
    delete_campaign: false,
    view_flows: true,
    can_create_flow: true,
    edit_workflow: true,
    delete_flow: false,
    view_bots: true,
    create_bots: true,
    edit_bots: true,
    delete_bots: false,
    view_platform_accounts: true,
    can_manage_platform_accounts: false,
    view_leads: true,
    delete_leads: false,
    export_data: false,
    assign_conversation: false,
    view_conversation: true,
  },
  agent: {
    view_workspace: true,
    manage_workspace: false,
    manage_users: false,
    manage_permissions: false,
    view_projects: false,
    create_projects: false,
    edit_projects: false,
    delete_projects: false,
    view_campaigns: false,
    can_create_campaign: false,
    edit_campaign: false,
    delete_campaign: false,
    view_flows: false,
    can_create_flow: false,
    edit_workflow: false,
    delete_flow: false,
    view_bots: false,
    create_bots: false,
    edit_bots: false,
    delete_bots: false,
    view_platform_accounts: false,
    can_manage_platform_accounts: false,
    view_leads: true,
    delete_leads: false,
    export_data: false,
    assign_conversation: true,
    view_conversation: true,
  },
  viewer: {
    view_workspace: true,
    manage_workspace: false,
    manage_users: false,
    manage_permissions: false,
    view_projects: true,
    create_projects: false,
    edit_projects: false,
    delete_projects: false,
    view_campaigns: true,
    can_create_campaign: false,
    edit_campaign: false,
    delete_campaign: false,
    view_flows: true,
    can_create_flow: false,
    edit_workflow: false,
    delete_flow: false,
    view_bots: true,
    create_bots: false,
    edit_bots: false,
    delete_bots: false,
    view_platform_accounts: true,
    can_manage_platform_accounts: false,
    view_leads: true,
    delete_leads: false,
    export_data: false,
    assign_conversation: false,
    view_conversation: true,
  },
};

export const EMPTY_SCOPE = {
  projectIds: [] as string[],
  campaignIds: [] as string[],
  platforms: [] as string[],
  channelIds: [] as string[],
};

export function canonicalWorkspaceRole(role?: string | null) {
  const value = String(role || "").trim().toLowerCase();
  if (value === "workspace_owner" || value === "admin") {
    return "workspace_admin";
  }
  if (value === "user") {
    return "editor";
  }
  if (WORKSPACE_ROLES.includes(value as (typeof WORKSPACE_ROLES)[number])) {
    return value as (typeof WORKSPACE_ROLES)[number];
  }
  return "viewer";
}

export function normalizeScope(value?: WorkspaceMember["agent_scope"] | null) {
  return {
    projectIds: Array.isArray(value?.projectIds) ? value.projectIds.map(String) : [],
    campaignIds: Array.isArray(value?.campaignIds) ? value.campaignIds.map(String) : [],
    platforms: Array.isArray(value?.platforms)
      ? value.platforms.map((item) => String(item).toLowerCase())
      : [],
    channelIds: Array.isArray(value?.channelIds) ? value.channelIds.map(String) : [],
  };
}

export function normalizeSkills(value?: string[] | null) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

export function toggleArrayValue(list: string[], value: string, enabled: boolean) {
  return enabled ? Array.from(new Set([...list, value])) : list.filter((item) => item !== value);
}
