// frontend-dashboard/services/flowService.ts

import apiClient from "./apiClient";

async function retryOnce<T>(operation: () => Promise<T>, shouldRetry: (error: any) => boolean) {
  try {
    return await operation();
  } catch (error) {
    if (!shouldRetry(error)) {
      throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, 400));
    return operation();
  }
}

// Group the methods into the exact object expected by pages/flows.tsx
export const flowService = {
  getCapabilities: async (botId: string) => {
    try {
      const response = await apiClient.get(`/flows/bot/${botId}/capabilities`);
      return response.data;
    } catch (error) {
      console.error("Error fetching flow capabilities:", error);
      throw error;
    }
  },

  getFlow: async (botId: string, flowId?: string) => {
    try {
      const response = await apiClient.get(`/flows/bot/${botId}`, {
        params: flowId ? { flowId } : {},
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching flow:", error);
      throw error;
    }
  },

  createFlow: async (
    botId: string,
    flowData: any,
    flowName?: string,
    isDefault = false,
    isSystemFlow = false
  ) => {
    try {
      const response = await apiClient.post(`/flows`, {
        bot_id: botId,
        flow_json: flowData,
        flow_name: flowName,
        is_default: isDefault,
        is_system_flow: isSystemFlow,
      });
      return response.data;
    } catch (error) {
      console.error("Error creating flow:", error);
      throw error;
    }
  },

  saveFlow: async (botId: string, flowData: any, flowId?: string, flowName?: string) => {
    try {
      const response = await retryOnce(
        () =>
          apiClient.post(`/flows/save`, {
            bot_id: botId,
            flow_id: flowId,
            flow_json: flowData,
            flow_name: flowName,
          }),
        (error) =>
          !error?.response &&
          String(error?.message || "").toLowerCase().includes("network error")
      );
      return response.data;
    } catch (error) {
      console.error("Error saving flow:", error);
      throw error;
    }
  },

  patchFlowNode: async (flowId: string, node: any) => {
    try {
      const nodeId = String(node?.id || "").trim();
      if (!nodeId) {
        throw new Error("Node id is required to patch a flow node.");
      }
      const response = await retryOnce(
        () => apiClient.patch(`/flows/${flowId}/node/${nodeId}`, { node }),
        (error) =>
          !error?.response &&
          String(error?.message || "").toLowerCase().includes("network error")
      );
      return response.data;
    } catch (error) {
      console.error("Error patching flow node:", error);
      throw error;
    }
  },

  deleteFlow: async (flowId: string) => {
    try {
      const response = await apiClient.delete(`/flows/${flowId}`);
      return response.data;
    } catch (error) {
      console.error("Error deleting flow:", error);
      throw error;
    }
  },

  getFlowSummaries: async (botId: string) => {
    try {
      const response = await apiClient.get(`/flows/bot/${botId}/list`);
      return response.data;
    } catch (error) {
      console.error("Error fetching flow summaries:", error);
      return [];
    }
  },

  getVersions: async (flowId: string) => {
    try {
      const response = await apiClient.get(`/flows/${flowId}/versions`);
      return response.data;
    } catch (error) {
      console.error("Error fetching flow versions:", error);
      throw error;
    }
  },

  compareVersions: async (flowId: string, leftVersion: number, rightVersion: number) => {
    try {
      const response = await apiClient.get(`/flows/${flowId}/versions/compare`, {
        params: {
          leftVersion,
          rightVersion,
        },
      });
      return response.data;
    } catch (error) {
      console.error("Error comparing flow versions:", error);
      throw error;
    }
  },

  rollbackVersion: async (flowId: string, versionNumber: number) => {
    try {
      const response = await apiClient.post(`/flows/${flowId}/versions/${versionNumber}/rollback`);
      return response.data;
    } catch (error) {
      console.error("Error rolling back flow version:", error);
      throw error;
    }
  },

  previewExtraction: async (nodeData: any, testInput: string, variables: Record<string, any> = {}) => {
    try {
      const response = await apiClient.post(`/ai/preview-extraction`, {
        nodeData,
        testInput,
        variables,
      });
      return response.data;
    } catch (error) {
      console.error("Error previewing AI extraction:", error);
      throw error;
    }
  },

  getFieldSuggestion: async (key: string, type: string) => {
    try {
      const response = await apiClient.post(`/ai/suggest-description`, {
        key,
        type,
      });
      return response.data?.suggestion || "";
    } catch (error) {
      console.error("Error getting field suggestion:", error);
      throw error;
    }
  },

  getOptimizationReport: async (
    workspaceId: string,
    options?: {
      limit?: number;
      sinceHours?: number;
      days?: number;
      startDate?: string;
    }
  ) => {
    try {
      const response = await apiClient.get(`/analytics/workspace/${workspaceId}/optimization/nodes`, {
        params: {
          ...(typeof options?.limit === "number" ? { limit: options.limit } : {}),
          ...(typeof options?.sinceHours === "number" ? { sinceHours: options.sinceHours } : {}),
          ...(typeof options?.days === "number" ? { days: options.days } : {}),
          ...(typeof options?.startDate === "string" && options.startDate.trim()
            ? { startDate: options.startDate.trim() }
            : {}),
        },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching optimization report:", error);
      throw error;
    }
  },

  getOptimizationSuggestion: async (params: {
    nodeData: any;
    sampleInputs: string[];
    reasonBucket: string;
  }) => {
    try {
      const response = await apiClient.post(`/ai/optimize-node`, params);
      return response.data;
    } catch (error) {
      console.error("Error generating optimization suggestion:", error);
      throw error;
    }
  },
};

// Also export them individually just in case other components use the named exports
export const getFlow = flowService.getFlow;
export const getFlowCapabilities = flowService.getCapabilities;
export const createFlow = flowService.createFlow;
export const saveFlow = flowService.saveFlow;
export const patchFlowNode = flowService.patchFlowNode;
export const deleteFlow = flowService.deleteFlow;
export const getVersions = flowService.getVersions;
export const compareVersions = flowService.compareVersions;
export const rollbackVersion = flowService.rollbackVersion;
export const previewExtraction = flowService.previewExtraction;
export const getFieldSuggestion = flowService.getFieldSuggestion;
export const getOptimizationReport = flowService.getOptimizationReport;
export const getOptimizationSuggestion = flowService.getOptimizationSuggestion;
