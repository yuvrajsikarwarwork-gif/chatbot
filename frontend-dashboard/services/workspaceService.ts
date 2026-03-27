import apiClient from "./apiClient";

export interface Workspace {
  id: string;
  name: string;
  owner_user_id: string;
  plan_id?: string | null;
  status: string;
  locked_at?: string | null;
  subscription_id?: string | null;
  subscription_status?: string | null;
  expiry_date?: string | null;
  grace_period_end?: string | null;
  billing_cycle?: string | null;
  currency?: string | null;
  price_amount?: number | null;
  auto_renew?: boolean | null;
  subscription_plan_name?: string | null;
  lock_reason?: string | null;
  campaign_count?: number | null;
  platform_account_count?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface SupportRequest {
  id: string;
  workspace_id: string;
  requested_by: string;
  requested_by_name?: string;
  requested_by_email?: string;
  target_user_id?: string | null;
  target_user_name?: string | null;
  target_user_email?: string | null;
  reason: string;
  requested_expires_at?: string | null;
  status: string;
  resolved_by?: string | null;
  resolved_by_name?: string | null;
  resolved_by_email?: string | null;
  resolution_notes?: string | null;
  created_at?: string;
  resolved_at?: string | null;
}

export const workspaceService = {
  list: async (): Promise<Workspace[]> => {
    const res = await apiClient.get("/workspaces");
    return res.data;
  },

  get: async (id: string): Promise<Workspace> => {
    const res = await apiClient.get(`/workspaces/${id}`);
    return res.data;
  },

  create: async (payload: Record<string, unknown>): Promise<Workspace> => {
    const res = await apiClient.post("/workspaces", payload);
    return res.data;
  },

  update: async (id: string, payload: Record<string, unknown>): Promise<Workspace> => {
    const res = await apiClient.put(`/workspaces/${id}`, payload);
    return res.data;
  },

  delete: async (id: string): Promise<Workspace> => {
    const res = await apiClient.delete(`/workspaces/${id}`);
    return res.data;
  },

  updateBilling: async (id: string, payload: Record<string, unknown>): Promise<Workspace> => {
    const res = await apiClient.put(`/workspaces/${id}/billing`, payload);
    return res.data;
  },

  lock: async (id: string, payload: Record<string, unknown>): Promise<Workspace> => {
    const res = await apiClient.post(`/workspaces/${id}/lock`, payload);
    return res.data;
  },

  unlock: async (id: string, payload: Record<string, unknown> = {}): Promise<Workspace> => {
    const res = await apiClient.post(`/workspaces/${id}/unlock`, payload);
    return res.data;
  },

  listSupportAccess: async (id: string) => {
    const res = await apiClient.get(`/workspaces/${id}/support-access`);
    return res.data;
  },

  grantSupportAccess: async (id: string, payload: Record<string, unknown>) => {
    const res = await apiClient.post(`/workspaces/${id}/support-access`, payload);
    return res.data;
  },

  revokeSupportAccess: async (id: string, userId: string) => {
    const res = await apiClient.delete(`/workspaces/${id}/support-access/${userId}`);
    return res.data;
  },

  listSupportRequests: async (id: string): Promise<SupportRequest[]> => {
    const res = await apiClient.get(`/workspaces/${id}/support-requests`);
    return res.data;
  },

  createSupportRequest: async (id: string, payload: Record<string, unknown>): Promise<SupportRequest> => {
    const res = await apiClient.post(`/workspaces/${id}/support-requests`, payload);
    return res.data;
  },

  approveSupportRequest: async (id: string, requestId: string, payload: Record<string, unknown> = {}) => {
    const res = await apiClient.post(`/workspaces/${id}/support-requests/${requestId}/approve`, payload);
    return res.data;
  },

  denySupportRequest: async (id: string, requestId: string, payload: Record<string, unknown> = {}) => {
    const res = await apiClient.post(`/workspaces/${id}/support-requests/${requestId}/deny`, payload);
    return res.data;
  },
};
