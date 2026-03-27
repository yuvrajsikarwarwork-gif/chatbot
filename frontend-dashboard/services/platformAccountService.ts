import apiClient from "./apiClient";

export interface PlatformAccount {
  id: string;
  workspace_id?: string | null;
  project_id?: string | null;
  platform_type: string;
  name: string;
  phone_number?: string | null;
  account_id?: string | null;
  token?: string | null;
  business_id?: string | null;
  status: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export const platformAccountService = {
  list: async (filters?: {
    platformType?: string;
    workspaceId?: string;
    projectId?: string;
  }): Promise<PlatformAccount[]> => {
    const res = await apiClient.get("/platform-accounts", {
      params: {
        ...(filters?.platformType ? { platformType: filters.platformType } : {}),
        ...(filters?.workspaceId ? { workspaceId: filters.workspaceId } : {}),
        ...(filters?.projectId ? { projectId: filters.projectId } : {}),
      },
    });
    return res.data;
  },

  create: async (payload: Record<string, unknown>): Promise<PlatformAccount> => {
    const res = await apiClient.post("/platform-accounts", payload);
    return res.data;
  },

  update: async (
    id: string,
    payload: Record<string, unknown>
  ): Promise<PlatformAccount> => {
    const res = await apiClient.put(`/platform-accounts/${id}`, payload);
    return res.data;
  },

  delete: async (id: string) => {
    const res = await apiClient.delete(`/platform-accounts/${id}`);
    return res.data;
  },
};
