import apiClient from "./apiClient";

export const analyticsService = {
  getBotStats: async (botId: string) => {
    const res = await apiClient.get(`/analytics/bot/${botId}`);
    return res.data;
  },

  getBotEvents: async (botId: string) => {
    const res = await apiClient.get(`/analytics/events/${botId}`);
    return res.data;
  },

  getWorkspaceUsageSummary: async () => {
    const res = await apiClient.get("/analytics/workspace-usage");
    return res.data;
  },

  getWorkspaceStats: async (workspaceId: string, projectId?: string) => {
    const res = await apiClient.get(`/analytics/workspace/${workspaceId}`, {
      params: projectId ? { projectId } : undefined,
    });
    return res.data;
  },

  getWorkspaceEvents: async (workspaceId: string, projectId?: string) => {
    const res = await apiClient.get(`/analytics/workspace/${workspaceId}/events`, {
      params: projectId ? { projectId } : undefined,
    });
    return res.data;
  },

  getWorkspacePresence: async (workspaceId: string, projectId?: string) => {
    const res = await apiClient.get(`/analytics/workspace/${workspaceId}/presence`, {
      params: projectId ? { projectId } : undefined,
    });
    return res.data;
  },
};
