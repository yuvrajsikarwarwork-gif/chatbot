import apiClient from "./apiClient";

export interface OptimizationAlertItem {
  id: string;
  workspaceId: string;
  flowId?: string | null;
  nodeId: string;
  nodeType?: string | null;
  alertType: string;
  windowStart: string;
  windowEnd: string;
  totalAttempts: number;
  failureCount: number;
  failureRate: number;
  avgConfidence?: number | null;
  sampleInputs: string[];
  cooldownUntil?: string | null;
  notifiedChannels: string[];
  status: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
  acknowledgedBy?: string | null;
  resolvedBy?: string | null;
  statusUpdatedAt?: string | null;
  resolutionNote?: string | null;
}

export interface OptimizationPerformanceResolution {
  nodeId: string;
  note: string | null;
}

export interface OptimizationPerformancePoint {
  date: string;
  failureRate: number;
  avgConfidence?: number | null;
  totalAttempts: number;
  failureCount: number;
  confidenceScore: number;
  resolutions: OptimizationPerformanceResolution[];
}

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

  getWorkspaceStats: async (workspaceId: string, projectId?: string, sinceHours?: number) => {
    const res = await apiClient.get(`/analytics/workspace/${workspaceId}`, {
      params: {
        ...(projectId ? { projectId } : {}),
        ...(typeof sinceHours === "number" ? { sinceHours } : {}),
      },
    });
    return res.data;
  },

  getWorkspaceEvents: async (workspaceId: string, projectId?: string, sinceHours?: number) => {
    const res = await apiClient.get(`/analytics/workspace/${workspaceId}/events`, {
      params: {
        ...(projectId ? { projectId } : {}),
        ...(typeof sinceHours === "number" ? { sinceHours } : {}),
      },
    });
    return res.data;
  },

  getWorkspacePresence: async (workspaceId: string, projectId?: string) => {
    const res = await apiClient.get(`/analytics/workspace/${workspaceId}/presence`, {
      params: projectId ? { projectId } : undefined,
    });
    return res.data;
  },

  getRegistryDropoffReport: async (
    workspaceId: string,
    options?: { eventType?: string; limit?: number; sinceHours?: number }
  ) => {
    const res = await apiClient.get(`/analytics/workspace/${workspaceId}/registry/dropoff`, {
      params: {
        ...(options?.eventType ? { eventType: options.eventType } : {}),
        ...(typeof options?.limit === "number" ? { limit: options.limit } : {}),
        ...(typeof options?.sinceHours === "number" ? { sinceHours: options.sinceHours } : {}),
      },
    });
    return res.data;
  },

  getRegistryKeywordPopularity: async (
    workspaceId: string,
    options?: { limit?: number; sinceHours?: number }
  ) => {
    const res = await apiClient.get(`/analytics/workspace/${workspaceId}/registry/keywords`, {
      params: {
        ...(typeof options?.limit === "number" ? { limit: options.limit } : {}),
        ...(typeof options?.sinceHours === "number" ? { sinceHours: options.sinceHours } : {}),
      },
    });
    return res.data;
  },

  getRegistryLegacyFallbackInspector: async (
    workspaceId: string,
    options?: { limit?: number; sinceHours?: number }
  ) => {
    const res = await apiClient.get(`/analytics/workspace/${workspaceId}/registry/fallbacks`, {
      params: {
        ...(typeof options?.limit === "number" ? { limit: options.limit } : {}),
        ...(typeof options?.sinceHours === "number" ? { sinceHours: options.sinceHours } : {}),
      },
    });
    return res.data;
  },

  getRegistryUnpublishedFlowSummary: async (workspaceId: string, options?: { limit?: number }) => {
    const res = await apiClient.get(`/analytics/workspace/${workspaceId}/registry/unpublished`, {
      params: {
        ...(typeof options?.limit === "number" ? { limit: options.limit } : {}),
      },
    });
    return res.data;
  },

  getWorkspaceAlerts: async (workspaceId: string, status?: string) => {
    const res = await apiClient.get(`/analytics/workspace/${workspaceId}/optimization/alerts`, {
      params: {
        ...(status ? { status } : {}),
      },
    });
    return res.data;
  },

  updateAlertStatus: async (
    workspaceId: string,
    alertId: string,
    status: "acknowledged" | "resolved",
    note?: string
  ) => {
    const res = await apiClient.patch(`/analytics/workspace/${workspaceId}/alerts/${alertId}`, {
      status,
      ...(note ? { note } : {}),
    });
    return res.data;
  },

  getWorkspaceOptimizationPerformance: async (
    workspaceId: string,
    days = 30
  ): Promise<OptimizationPerformancePoint[]> => {
    const res = await apiClient.get(`/analytics/workspace/${workspaceId}/optimization/performance`, {
      params: { days },
    });
    return Array.isArray(res.data?.data) ? res.data.data : [];
  },
};
