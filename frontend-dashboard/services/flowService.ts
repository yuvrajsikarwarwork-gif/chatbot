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
  }
};

// Also export them individually just in case other components use the named exports
export const getFlow = flowService.getFlow;
export const getFlowCapabilities = flowService.getCapabilities;
export const createFlow = flowService.createFlow;
export const saveFlow = flowService.saveFlow;
export const patchFlowNode = flowService.patchFlowNode;
export const deleteFlow = flowService.deleteFlow;
