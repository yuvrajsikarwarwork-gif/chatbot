import apiClient from "./apiClient";

function normalizeBotList(payload: any) {
  if (Array.isArray(payload)) {
    return payload;
  }

  const candidate = payload?.data || payload?.bots || payload?.items || payload?.list;
  return Array.isArray(candidate) ? candidate : [];
}

export const botService = {
  getBots: async (filters?: { workspaceId?: string; projectId?: string }) => {
    const res = await apiClient.get("/bots", {
      params: filters,
    });
    return normalizeBotList(res.data);
  },

  list: async (filters?: { workspaceId?: string; projectId?: string }) => {
    const res = await apiClient.get("/bots", {
      params: filters,
    });
    return normalizeBotList(res.data);
  },

  getBot: async (id: string) => {
    const res = await apiClient.get(`/bots/${id}`);
    return res.data;
  },

  getSystemFlows: async (id: string) => {
    const res = await apiClient.get(`/bots/${id}/system-flows`);
    return Array.isArray(res.data) ? res.data : [];
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

  copyBot: async (
    id: string,
    payload: {
      name?: string;
      triggerKeywords?: string;
      projectId?: string | null;
    }
  ) => {
    const res = await apiClient.post(`/bots/${id}/copy`, {
      name: payload.name,
      trigger_keywords: payload.triggerKeywords,
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
      globalSettings?: Record<string, unknown>;
      settingsJson?: Record<string, unknown>;
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
