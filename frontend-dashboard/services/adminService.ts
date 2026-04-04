import apiClient from "./apiClient";

export type OrganizationSummary = {
  id: string;
  name: string;
  slug?: string | null;
  planTier?: string;
  quotaAiTokens?: number;
  quotaMessages?: number;
  isActive?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  workspaceCount?: number;
  memberCount?: number;
};

export type OrganizationWorkspace = {
  id: string;
  name: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  member_count?: number;
  organization_id?: string | null;
};

export type OrganizationUsage = {
  messages: number;
  tokens: number;
  startOfMonth: string;
  updatedAt: string;
};

export type OrganizationQuotaUpdateInput = {
  planTier?: string | null;
  quotaMessages?: number | null;
  quotaAiTokens?: number | null;
  reason: string;
};

export type OrganizationTemplate = {
  id: string;
  name: string;
  platform_type?: string;
  status?: string;
  workspace_id?: string | null;
  workspace_name?: string | null;
  project_id?: string | null;
  project_name?: string | null;
  meta_template_id?: string | null;
  meta_template_name?: string | null;
  rejected_reason?: string | null;
  runtime_readiness?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  content?: any;
  body?: string | null;
  footer?: string | null;
  header_type?: string | null;
  header?: string | null;
};

export type OrganizationApiKey = {
  id: string;
  organization_id: string;
  workspace_id?: string | null;
  name: string;
  key_prefix: "live" | "test";
  key_last_four: string;
  scopes?: string[];
  last_used_at?: string | null;
  created_at?: string | null;
  created_by?: string | null;
  revoked_at?: string | null;
  revoked_by?: string | null;
  revoked_reason?: string | null;
  organization_name?: string | null;
  workspace_name?: string | null;
};

export type OrganizationApiKeyCreateInput = {
  name: string;
  prefix?: "live" | "test";
  workspaceId?: string | null;
  scopes?: string[];
};

export type OrganizationApiKeyCreateResponse = {
  record: OrganizationApiKey;
  secret: string;
};

export type GlobalAuditLog = {
  id: string;
  action: string;
  entity: string;
  entity_id: string;
  created_at: string;
  old_data?: Record<string, any> | null;
  new_data?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  actor_name?: string | null;
  actor_email?: string | null;
  target_org_name?: string | null;
  target_org_id?: string | null;
  target_org_slug?: string | null;
  workspace_name?: string | null;
  workspace_id?: string | null;
  project_name?: string | null;
  project_id?: string | null;
  reason?: string | null;
};

export type GlobalAuditLogResponse = {
  rows: GlobalAuditLog[];
  total: number;
  limit: number;
  offset: number;
};

export type GlobalTrafficPoint = {
  timestamp: string;
  human: number;
  machine: number;
  total: number;
};

export type TopConsumer = {
  org_id: string;
  org_name: string;
  plan_tier?: string | null;
  human_count: number;
  machine_count: number;
  total_count: number;
};

export type OrganizationUsageBreakdown = {
  workspace_id: string;
  workspace_name: string;
  source_name: string;
  auth_type: "human" | "machine";
  total_requests: number;
};

function normalizeTimeWindow(value: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "24 hours" || normalized === "24h" || normalized === "last 24h") {
    return "24 hours";
  }
  if (normalized === "7 days" || normalized === "7d" || normalized === "last 7d") {
    return "7 days";
  }
  if (normalized === "30 days" || normalized === "billing cycle" || normalized === "30d") {
    return "30 days";
  }
  return "24 hours";
}

export const adminService = {
  listOrganizations: async (): Promise<OrganizationSummary[]> => {
    const res = await apiClient.get("/admin/organizations");
    return Array.isArray(res.data?.data) ? res.data.data : [];
  },

  getOrganization: async (organizationId: string): Promise<{ organization: OrganizationSummary | null; workspaces: OrganizationWorkspace[] }> => {
    const res = await apiClient.get(`/admin/organizations/${organizationId}`);
    const data = res.data?.data || {};
    return {
      organization: data || null,
      workspaces: Array.isArray(data?.workspaces) ? data.workspaces : [],
    };
  },

  updateOrganizationQuotas: async (
    organizationId: string,
    payload: OrganizationQuotaUpdateInput
  ): Promise<OrganizationSummary> => {
    const res = await apiClient.patch(`/admin/organizations/${organizationId}`, {
      plan_tier: payload.planTier,
      quota_messages: payload.quotaMessages,
      quota_ai_tokens: payload.quotaAiTokens,
      reason: payload.reason,
    });
    const data = res.data?.data;
    if (!data) {
      throw new Error("Failed to update organization quotas");
    }
    return data;
  },

  getOrganizationUsage: async (organizationId: string): Promise<OrganizationUsage> => {
    const res = await apiClient.get(`/admin/organizations/${organizationId}/usage`);
    const data = res.data?.data || {};
    return {
      messages: Number(data.messages || 0),
      tokens: Number(data.tokens || 0),
      startOfMonth: String(data.startOfMonth || data.start_of_month || ""),
      updatedAt: String(data.updatedAt || data.updated_at || ""),
    };
  },

  listOrganizationApiKeys: async (organizationId: string): Promise<OrganizationApiKey[]> => {
    const res = await apiClient.get(`/admin/organizations/${organizationId}/api-keys`);
    return Array.isArray(res.data?.data) ? res.data.data : [];
  },

  createOrganizationApiKey: async (
    organizationId: string,
    payload: OrganizationApiKeyCreateInput
  ): Promise<OrganizationApiKeyCreateResponse> => {
    const res = await apiClient.post(`/admin/organizations/${organizationId}/api-keys`, {
      name: payload.name,
      prefix: payload.prefix,
      workspaceId: payload.workspaceId,
      scopes: payload.scopes,
    });

    return {
      record: res.data?.data,
      secret: String(res.data?.secret || ""),
    };
  },

  revokeOrganizationApiKey: async (organizationId: string, keyId: string, reason: string) => {
    const res = await apiClient.delete(`/admin/organizations/${organizationId}/api-keys/${keyId}`, {
      data: { reason },
    });
    return res.data?.data || null;
  },

  listOrganizationTemplates: async (organizationId: string, platform = "whatsapp"): Promise<OrganizationTemplate[]> => {
    const res = await apiClient.get(`/admin/organizations/${organizationId}/templates`, {
      params: platform ? { platform } : undefined,
    });
    return Array.isArray(res.data?.data) ? res.data.data : [];
  },

  syncTemplateFromMeta: async (template: OrganizationTemplate) => {
    if (!template?.id) {
      throw new Error("Template id is required");
    }

    const res = await apiClient.post(
      `/templates/${template.id}/sync-meta`,
      {},
      {
        params: {
          workspaceId: template.workspace_id || undefined,
          projectId: template.project_id || undefined,
        },
      }
    );
    return res.data;
  },

  fetchGlobalAuditLogs: async (limit = 50, offset = 0): Promise<GlobalAuditLogResponse> => {
    const res = await apiClient.get("/admin/audit-logs", {
      params: { limit, offset },
    });
    const data = res.data?.data || {};
    return {
      rows: Array.isArray(data.rows) ? data.rows : [],
      total: Number(data.total || 0),
      limit: Number(data.limit || limit),
      offset: Number(data.offset || offset),
    };
  },

  getGlobalTrafficSeries: async (timeWindow = "24 hours"): Promise<GlobalTrafficPoint[]> => {
    const res = await apiClient.get("/admin/analytics/traffic", {
      params: { timeWindow: normalizeTimeWindow(timeWindow) },
    });
    return Array.isArray(res.data?.data) ? res.data.data : [];
  },

  getTopConsumers: async (limit = 10, timeWindow = "24 hours"): Promise<TopConsumer[]> => {
    const res = await apiClient.get("/admin/analytics/top-consumers", {
      params: { limit, timeWindow: normalizeTimeWindow(timeWindow) },
    });
    return Array.isArray(res.data?.data) ? res.data.data : [];
  },

  getOrganizationUsageBreakdown: async (
    organizationId: string,
    timeWindow = "30 days"
  ): Promise<OrganizationUsageBreakdown[]> => {
    const res = await apiClient.get(`/admin/analytics/organizations/${organizationId}/breakdown`, {
      params: { timeWindow: normalizeTimeWindow(timeWindow) },
    });
    return Array.isArray(res.data?.data) ? res.data.data : [];
  },
};
