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
  included_users: number;
  allowed_platforms: string[];
  features: Record<string, unknown>;
  status: string;
}

export const planService = {
  list: async (): Promise<Plan[]> => {
    const res = await apiClient.get("/plans");
    return res.data;
  },
};
