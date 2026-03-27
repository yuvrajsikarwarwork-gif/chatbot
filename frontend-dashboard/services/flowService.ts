// frontend-dashboard/services/flowService.ts

import apiClient from "./apiClient";

// Group the methods into the exact object expected by pages/flows.tsx
export const flowService = {
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

  createFlow: async (botId: string, flowData: any, flowName?: string, isDefault = false) => {
    try {
      const response = await apiClient.post(`/flows`, {
        bot_id: botId,
        flow_json: flowData,
        flow_name: flowName,
        is_default: isDefault,
      });
      return response.data;
    } catch (error) {
      console.error("Error creating flow:", error);
      throw error;
    }
  },

  saveFlow: async (botId: string, flowData: any, flowId?: string) => {
    try {
      const response = await apiClient.post(`/flows/save`, {
        bot_id: botId, 
        flow_id: flowId,
        flow_json: flowData 
      });
      return response.data;
    } catch (error) {
      console.error("Error saving flow:", error);
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
export const createFlow = flowService.createFlow;
export const saveFlow = flowService.saveFlow;
export const deleteFlow = flowService.deleteFlow;
