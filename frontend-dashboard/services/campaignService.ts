import apiClient from "./apiClient";

export interface CampaignSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  workspaceId?: string | null;
  workspace_id?: string | null;
  projectId?: string | null;
  project_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  default_flow_id?: string | null;
  settings_json?: Record<string, unknown>;
  channel_count: string;
  entry_point_count: string;
  list_count: string;
  lead_count: string;
}

export interface CampaignDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  workspaceId?: string | null;
  workspace_id?: string | null;
  projectId?: string | null;
  project_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  default_flow_id?: string | null;
  settings_json?: Record<string, unknown>;
  metadata: Record<string, unknown>;
  channels: any[];
  entryPoints: any[];
  lists: any[];
}

export interface CampaignAutomationRuntime {
  campaign: {
    id: string;
    name: string;
    slug: string;
    workspaceId?: string | null;
    projectId?: string | null;
    defaultFlowId?: string | null;
  };
  rules: Array<Record<string, any>>;
  history: Array<Record<string, any>>;
  versions: Array<Record<string, any>>;
  segmentLibrary: Array<{ id: string; name: string }>;
}

export interface CampaignBroadcastAnalytics {
  campaignId: string;
  templateSummary: Array<{
    template_name: string;
    platform: string;
    launch_count: number;
    total_leads: number;
    success_count: number;
    fail_count: number;
    last_sent_at: string | null;
  }>;
  suppressionLists: Array<Record<string, unknown>>;
  totals: {
    launchCount: number;
    totalLeads: number;
    successCount: number;
    failCount: number;
  };
}

export interface CampaignChannelPayload {
  campaignId: string;
  botId: string;
  platform: string;
  platformAccountId?: string;
  name: string;
  status?: string;
  defaultFlowId?: string;
  flowId?: string;
  listId?: string;
  allowRestart?: boolean;
  allowMultipleLeads?: boolean;
  requirePhone?: boolean;
}

export interface EntryPointPayload {
  campaignId: string;
  channelId: string;
  botId?: string;
  flowId?: string;
  platform?: string;
  name: string;
  entryKey: string;
  entryType?: string;
  sourceRef?: string;
  landingUrl?: string;
  isDefault?: boolean;
  isActive?: boolean;
  listId?: string;
}

export interface CampaignListPayload {
  campaignId: string;
  botId: string;
  platform: string;
  name: string;
  listKey: string;
  sourceType?: string;
  channelId?: string;
  entryPointId?: string;
  isSystem?: boolean;
}

export const campaignService = {
  list: async (filters?: {
    workspaceId?: string;
    projectId?: string;
  }): Promise<CampaignSummary[]> => {
    const res = await apiClient.get("/campaigns", {
      params: {
        ...(filters?.workspaceId ? { workspaceId: filters.workspaceId } : {}),
        ...(filters?.projectId ? { projectId: filters.projectId } : {}),
      },
    });
    return res.data;
  },

  get: async (id: string): Promise<CampaignDetail> => {
    const res = await apiClient.get(`/campaigns/${id}`);
    return res.data;
  },

  getChannels: async (id: string): Promise<any[]> => {
    const res = await apiClient.get(`/campaigns/${id}/channels`);
    return res.data;
  },

  getEntries: async (id: string): Promise<any[]> => {
    const res = await apiClient.get(`/campaigns/${id}/entries`);
    return res.data;
  },

  getAudience: async (id: string): Promise<any[]> => {
    const res = await apiClient.get(`/campaigns/${id}/audience`);
    return res.data;
  },

  getActivity: async (id: string): Promise<any[]> => {
    const res = await apiClient.get(`/campaigns/${id}/activity`);
    return res.data;
  },

  getBroadcastAnalytics: async (id: string): Promise<CampaignBroadcastAnalytics> => {
    const res = await apiClient.get(`/campaigns/${id}/broadcast-analytics`);
    return res.data;
  },

  getAutomationRuntime: async (id: string): Promise<CampaignAutomationRuntime> => {
    const res = await apiClient.get(`/campaigns/${id}/automation/runtime`);
    return res.data;
  },

  pauseAutomationRule: async (campaignId: string, ruleId: string) => {
    const res = await apiClient.post(`/campaigns/${campaignId}/automation/${ruleId}/pause`);
    return res.data;
  },

  resumeAutomationRule: async (campaignId: string, ruleId: string) => {
    const res = await apiClient.post(`/campaigns/${campaignId}/automation/${ruleId}/resume`);
    return res.data;
  },

  replayAutomationRule: async (campaignId: string, ruleId: string, leadId?: string) => {
    const res = await apiClient.post(`/campaigns/${campaignId}/automation/${ruleId}/replay`, {
      ...(leadId ? { leadId } : {}),
    });
    return res.data;
  },

  saveAutomationVersion: async (
    campaignId: string,
    payload: { label?: string; notes?: string; status?: string; sourceRuleId?: string; sourceRuleName?: string } = {}
  ) => {
    const res = await apiClient.post(`/campaigns/${campaignId}/automation/runtime/version`, payload);
    return res.data;
  },

  setAutomationVersionStatus: async (
    campaignId: string,
    versionId: string,
    status: "draft" | "pending" | "approved" | "rejected"
  ) => {
    const res = await apiClient.post(`/campaigns/${campaignId}/automation/runtime/version/${versionId}/status`, {
      status,
    });
    return res.data;
  },

  cloneAutomationRule: async (campaignId: string, ruleId: string) => {
    const res = await apiClient.post(`/campaigns/${campaignId}/automation/${ruleId}/clone`);
    return res.data;
  },

  create: async (payload: {
    name: string;
    slug?: string;
    description?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    defaultFlowId?: string;
    workspaceId?: string;
    projectId?: string;
    allowMultiplePlatforms?: boolean;
    autoAssignAgent?: boolean;
    allowRestart?: boolean;
    trackLeads?: boolean;
    settingsJson?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }) => {
    const res = await apiClient.post("/campaigns", payload);
    return res.data;
  },

  update: async (id: string, payload: Record<string, unknown>) => {
    const res = await apiClient.put(`/campaigns/${id}`, payload);
    return res.data;
  },

  remove: async (id: string) => {
    const res = await apiClient.delete(`/campaigns/${id}`);
    return res.data;
  },

  createChannel: async (payload: CampaignChannelPayload) => {
    const res = await apiClient.post("/campaigns/channels", payload);
    return res.data;
  },

  createChannelInCampaign: async (
    campaignId: string,
    payload: Omit<CampaignChannelPayload, "campaignId">
  ) => {
    const res = await apiClient.post(`/campaigns/${campaignId}/channels`, payload);
    return res.data;
  },

  updateChannel: async (id: string, payload: Partial<CampaignChannelPayload>) => {
    const res = await apiClient.put(`/campaigns/channels/${id}`, payload);
    return res.data;
  },

  updateChannelInCampaign: async (
    campaignId: string,
    channelId: string,
    payload: Partial<CampaignChannelPayload>
  ) => {
    const res = await apiClient.put(`/campaigns/${campaignId}/channels/${channelId}`, payload);
    return res.data;
  },

  deleteChannel: async (id: string) => {
    const res = await apiClient.delete(`/campaigns/channels/${id}`);
    return res.data;
  },

  deleteChannelInCampaign: async (campaignId: string, channelId: string) => {
    const res = await apiClient.delete(`/campaigns/${campaignId}/channels/${channelId}`);
    return res.data;
  },

  createEntryPoint: async (payload: EntryPointPayload) => {
    const res = await apiClient.post("/campaigns/entries", payload);
    return res.data;
  },

  createEntryPointInCampaign: async (
    campaignId: string,
    payload: Omit<EntryPointPayload, "campaignId">
  ) => {
    const res = await apiClient.post(`/campaigns/${campaignId}/entries`, payload);
    return res.data;
  },

  updateEntryPoint: async (id: string, payload: Partial<EntryPointPayload>) => {
    const res = await apiClient.put(`/campaigns/entries/${id}`, payload);
    return res.data;
  },

  updateEntryPointInCampaign: async (
    campaignId: string,
    entryId: string,
    payload: Partial<EntryPointPayload>
  ) => {
    const res = await apiClient.put(`/campaigns/${campaignId}/entries/${entryId}`, payload);
    return res.data;
  },

  deleteEntryPoint: async (id: string) => {
    const res = await apiClient.delete(`/campaigns/entries/${id}`);
    return res.data;
  },

  deleteEntryPointInCampaign: async (campaignId: string, entryId: string) => {
    const res = await apiClient.delete(`/campaigns/${campaignId}/entries/${entryId}`);
    return res.data;
  },

  createList: async (payload: CampaignListPayload) => {
    const res = await apiClient.post("/campaigns/lists", payload);
    return res.data;
  },

  createAudienceInCampaign: async (
    campaignId: string,
    payload: Omit<CampaignListPayload, "campaignId">
  ) => {
    const res = await apiClient.post(`/campaigns/${campaignId}/audience`, payload);
    return res.data;
  },

  updateList: async (id: string, payload: Partial<CampaignListPayload>) => {
    const res = await apiClient.put(`/campaigns/lists/${id}`, payload);
    return res.data;
  },

  updateAudienceInCampaign: async (
    campaignId: string,
    listId: string,
    payload: Partial<CampaignListPayload>
  ) => {
    const res = await apiClient.put(`/campaigns/${campaignId}/audience/${listId}`, payload);
    return res.data;
  },

  deleteList: async (id: string) => {
    const res = await apiClient.delete(`/campaigns/lists/${id}`);
    return res.data;
  },

  deleteAudienceInCampaign: async (campaignId: string, listId: string) => {
    const res = await apiClient.delete(`/campaigns/${campaignId}/audience/${listId}`);
    return res.data;
  },
};
