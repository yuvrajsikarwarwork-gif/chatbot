import apiClient from "./apiClient";

export const botService = {
  getBots: async (filters?: { workspaceId?: string; projectId?: string }) => {
    const res = await apiClient.get("/bots", {
      params: filters,
    });
    return res.data;
  },

  createBot: async (payload: {
    name: string;
    trigger_keywords: string;
    workspaceId?: string | null;
    projectId?: string | null;
  }) => {
    const res = await apiClient.post("/bots", {
      name: payload.name,
      trigger_keywords: payload.trigger_keywords,
      workspaceId: payload.workspaceId || null,
      projectId: payload.projectId || null,
    });

    return res.data;
  },

  activateBot: async (id: string) => {
    const res = await apiClient.post(`/bots/${id}/activate`);
    return res.data;
  },

  updateBot: async (
    id: string,
    botData: {
      name?: string;
      trigger_keywords?: string;
      status?: string;
      workspaceId?: string | null;
      projectId?: string | null;
    }
  ) => {
    const res = await apiClient.put(`/bots/${id}`, botData);
    return res.data;
  },

  deleteBot: async (id: string) => {
    const res = await apiClient.delete(`/bots/${id}`);
    return res.data;
  },
};
