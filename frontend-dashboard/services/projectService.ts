import apiClient from "./apiClient";

export interface ProjectSummary {
  id: string;
  workspace_id: string;
  name: string;
  description?: string | null;
  status: string;
  is_default: boolean;
  is_internal: boolean;
  onboarding_complete: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ProjectSettings {
  project_id: string;
  auto_assign: boolean;
  assignment_mode: string;
  default_agent_id?: string | null;
  max_open_per_agent: number;
  allow_takeover: boolean;
  allow_manual_reply: boolean;
  allow_bot_resume: boolean;
  show_campaign: boolean;
  show_flow: boolean;
  show_list: boolean;
  allowed_platforms: string[];
  default_campaign_id?: string | null;
  default_list_id?: string | null;
}

export interface ProjectUserAccess {
  id: string;
  workspace_id: string;
  project_id: string;
  user_id: string;
  role: string;
  status: string;
  user_name?: string;
  user_email?: string;
  project_name?: string;
}

export interface ProjectAccessSummary {
  project: ProjectSummary;
  access: ProjectUserAccess[];
  workspaceMembers: Array<{
    workspace_id: string;
    user_id: string;
    name?: string;
    email?: string;
    role: string;
    status: string;
  }>;
}

export const projectService = {
  list: async (workspaceId?: string): Promise<ProjectSummary[]> => {
    const res = await apiClient.get("/projects", {
      params: workspaceId ? { workspaceId } : undefined,
    });
    return res.data;
  },

  get: async (id: string): Promise<ProjectSummary> => {
    const res = await apiClient.get(`/projects/${id}`);
    return res.data;
  },

  create: async (payload: Record<string, unknown>): Promise<ProjectSummary> => {
    const res = await apiClient.post("/projects", payload);
    return res.data;
  },

  update: async (id: string, payload: Record<string, unknown>): Promise<ProjectSummary> => {
    const res = await apiClient.put(`/projects/${id}`, payload);
    return res.data;
  },

  delete: async (id: string): Promise<ProjectSummary> => {
    const res = await apiClient.delete(`/projects/${id}`);
    return res.data;
  },

  archive: async (id: string): Promise<ProjectSummary> => {
    const res = await apiClient.post(`/projects/${id}/archive`);
    return res.data;
  },

  getSettings: async (id: string): Promise<ProjectSettings> => {
    const res = await apiClient.get(`/projects/${id}/settings`);
    return res.data;
  },

  updateSettings: async (id: string, payload: Record<string, unknown>): Promise<ProjectSettings> => {
    const res = await apiClient.put(`/projects/${id}/settings`, payload);
    return res.data;
  },

  getAccess: async (id: string): Promise<ProjectAccessSummary> => {
    const res = await apiClient.get(`/projects/${id}/access`);
    return res.data;
  },

  getMembers: async (id: string): Promise<ProjectAccessSummary> => {
    const res = await apiClient.get(`/projects/${id}/members`);
    return res.data;
  },

  assignUser: async (id: string, payload: Record<string, unknown>): Promise<ProjectUserAccess> => {
    const res = await apiClient.post(`/projects/${id}/access`, payload);
    return res.data;
  },

  assignMember: async (id: string, payload: Record<string, unknown>): Promise<ProjectUserAccess> => {
    const res = await apiClient.post(`/projects/${id}/members`, payload);
    return res.data;
  },

  revokeUser: async (id: string, userId: string) => {
    const res = await apiClient.delete(`/projects/${id}/access/${userId}`);
    return res.data;
  },

  revokeMember: async (id: string, userId: string) => {
    const res = await apiClient.delete(`/projects/${id}/members/${userId}`);
    return res.data;
  },

  getDefaultByWorkspace: async (workspaceId: string): Promise<ProjectSummary | null> => {
    const res = await apiClient.get(`/projects/workspace/${workspaceId}/default`);
    return res.data;
  },

  getCurrentByWorkspace: async (workspaceId: string): Promise<ProjectSummary | null> => {
    const res = await apiClient.get(`/projects/workspace/${workspaceId}/current`);
    return res.data;
  },
};
