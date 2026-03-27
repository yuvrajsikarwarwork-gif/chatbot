import apiClient from "./apiClient";

export interface ConversationSettings {
  workspace_id: string;
  auto_assign: boolean;
  default_agent: string | null;
  allow_manual_reply: boolean;
  allow_agent_takeover: boolean;
  allow_bot_resume: boolean;
  show_campaign: boolean;
  show_flow: boolean;
  show_list: boolean;
  max_open_chats: number;
  allowed_platforms: string[];
  default_campaign_id: string | null;
  default_list_id: string | null;
}

export const conversationSettingsService = {
  get: async (workspaceId: string): Promise<ConversationSettings> => {
    const res = await apiClient.get(`/conversation-settings/${workspaceId}`);
    return res.data;
  },

  update: async (
    workspaceId: string,
    payload: Record<string, unknown>
  ): Promise<ConversationSettings> => {
    const res = await apiClient.put(`/conversation-settings/${workspaceId}`, payload);
    return res.data;
  },
};
