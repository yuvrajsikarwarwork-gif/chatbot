import apiClient from "./apiClient";

export const auditService = {
  listWorkspaceAuditLogs: async (
    workspaceId: string,
    filters?: { projectId?: string; entity?: string; action?: string; limit?: number }
  ) => {
    const res = await apiClient.get(`/audit/workspace/${workspaceId}`, {
      params: filters,
    });
    return res.data;
  },
};
