import apiClient from "./apiClient";

export interface LeadFilters {
  workspaceId?: string;
  projectId?: string;
  campaignId?: string;
  channelId?: string;
  entryPointId?: string;
  flowId?: string;
  listId?: string;
  leadFormId?: string;
  platform?: string;
  status?: string;
  botId?: string;
  search?: string;
}

export const leadService = {
  list: async (filters: LeadFilters = {}) => {
    const res = await apiClient.get("/leads", { params: filters });
    return res.data;
  },

  listSummaries: async (campaignId?: string, workspaceId?: string, projectId?: string) => {
    const res = await apiClient.get("/leads/lists", {
      params: {
        ...(campaignId ? { campaignId } : {}),
        ...(workspaceId ? { workspaceId } : {}),
        ...(projectId ? { projectId } : {}),
      },
    });
    return res.data;
  },

  remove: async (id: string) => {
    const res = await apiClient.delete(`/leads/${id}`);
    return res.data;
  },

  updateStatus: async (id: string, status: string) => {
    const res = await apiClient.put(`/leads/${id}/status`, { status });
    return res.data;
  },
};
