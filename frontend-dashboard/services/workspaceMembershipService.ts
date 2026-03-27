import apiClient from "./apiClient";

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: string;
  status: string;
  permissions_json?: Record<string, any>;
  effective_permissions?: Record<string, boolean>;
  permission_overrides?: Record<string, boolean>;
  agent_scope?: {
    projectIds?: string[];
    campaignIds?: string[];
    platforms?: string[];
    channelIds?: string[];
  };
  agent_skills?: string[];
  name?: string;
  email?: string;
  global_role?: string;
  provisioned_user_email?: string;
  temporary_password?: string;
  invite_link?: string;
  invite_expires_at?: string;
}

export const workspaceMembershipService = {
  list: async (workspaceId: string): Promise<WorkspaceMember[]> => {
    const res = await apiClient.get(`/workspaces/${workspaceId}/members-access`);
    return res.data;
  },

  upsert: async (
    workspaceId: string,
    payload: {
      userId?: string;
      email?: string;
      role?: string;
      status?: string;
      permissionsJson?: Record<string, unknown>;
      agentScope?: {
        projectIds?: string[];
        campaignIds?: string[];
        platforms?: string[];
        channelIds?: string[];
      };
      agentSkills?: string[];
    }
  ): Promise<WorkspaceMember> => {
    const res = await apiClient.post(`/workspaces/${workspaceId}/members-access`, payload);
    return res.data;
  },

  remove: async (workspaceId: string, userId: string): Promise<WorkspaceMember> => {
    const res = await apiClient.delete(`/workspaces/${workspaceId}/members-access/${userId}`);
    return res.data;
  },
};
