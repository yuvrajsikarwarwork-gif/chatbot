import apiClient from "./apiClient";

export interface Plan {
  id: string;
  name: string;
  description?: string | null;
  monthly_price_inr: number;
  yearly_price_inr: number;
  monthly_price_usd: number;
  yearly_price_usd: number;
  max_campaigns: number;
  max_numbers: number;
  max_users: number;
  max_projects: number;
  max_integrations: number;
  max_bots: number;
  workspace_limit?: number | null;
  project_limit?: number | null;
  agent_seat_limit?: number | null;
  active_bot_limit?: number | null;
  monthly_campaign_limit?: number | null;
  ai_reply_limit?: number | null;
  extra_agent_seat_price_inr?: number | null;
  pricing_model?: string | null;
  support_tier?: string | null;
  wallet_pricing?: Record<string, unknown>;
  included_users: number;
  allowed_platforms: string[];
  features: Record<string, unknown>;
  status: string;
}

export const planService = {
  publicList: async (): Promise<Plan[]> => {
    const res = await apiClient.get("/auth/public-plans");
    return res.data;
  },

  list: async (): Promise<Plan[]> => {
    const res = await apiClient.get("/plans");
    return res.data;
  },

  create: async (payload: Partial<Plan>): Promise<Plan> => {
    const res = await apiClient.post("/plans", payload);
    return res.data;
  },

  update: async (id: string, payload: Partial<Plan>): Promise<Plan> => {
    const res = await apiClient.put(`/plans/${id}`, payload);
    return res.data;
  },

  remove: async (id: string): Promise<Plan> => {
    const res = await apiClient.delete(`/plans/${id}`);
    return res.data;
  },
};
